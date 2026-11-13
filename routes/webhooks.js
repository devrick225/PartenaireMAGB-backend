const express = require('express');
const paymentService = require('../services/paymentService');
const Payment = require('../models/Payment');
const Donation = require('../models/Donation');
const User = require('../models/User');
const fusionPayService = require('../services/fusionPayService');
const moneyFusionService = require('../services/moneyFusionService');
const paydunyaService = require('../services/paydunyaService');
const geniusPayService = require('../services/geniusPayService');
const websocketService = require('../services/websocketService');
const { completePayment, failPayment } = require('../services/paymentCompletionService');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const router = express.Router();

// Middleware fournissant le body brut (Buffer) aux webhooks signés.
// Le parser JSON global de server.js a déjà consommé le flux : express.raw() ne
// verrait plus rien et req.body serait un objet (la vérification de signature
// échouait donc systématiquement). server.js conserve le body brut dans req.rawBody.
const rawJsonParser = express.raw({ type: 'application/json' });
const rawBodyParser = (req, res, next) => {
  if (Buffer.isBuffer(req.rawBody)) {
    req.body = req.rawBody;
    return next();
  }
  return rawJsonParser(req, res, next);
};

// Statuts à partir desquels un paiement peut encore passer « en traitement »
const canMoveToProcessing = (payment) => payment.status === 'pending';

// @desc    Webhook CinetPay
// @route   POST /api/webhooks/cinetpay
// @access  Public (webhook de CinetPay)
router.post('/cinetpay', express.json(), async (req, res) => {
  try {
    const payload = req.body;
    const signature = req.headers['x-cinetpay-signature'];

    console.log('🔔 CinetPay webhook reçu:', {
      cpm_trans_id: payload.cpm_trans_id,
      cpm_trans_status: payload.cpm_trans_status,
      signature: signature?.substring(0, 10) + '...'
    });

    // Vérifier la signature du webhook (optionnel en développement)
    if (signature) {
      const isValid = paymentService.verifyCinetPayWebhook(payload, signature);
      
      if (!isValid) {
        console.error('❌ Signature CinetPay webhook invalide');
        return res.status(400).json({
          success: false,
          error: 'Invalid signature'
        });
      }
    } else {
      console.warn('⚠️ Webhook CinetPay sans signature (mode développement)');
    }

    // Extraire les données du webhook selon la documentation CinetPay
    const {
      cpm_site_id,           // Site ID
      cpm_trans_id,          // Transaction ID
      cpm_trans_status,      // Statut: ACCEPTED, REFUSED, PENDING
      cpm_amount,            // Montant
      cpm_currency,          // Devise
      cpm_payid,             // ID de paiement CinetPay
      cpm_payment_config,    // Configuration de paiement
      cpm_payment_date,      // Date de paiement
      cpm_payment_time,      // Heure de paiement
      cpm_error_message,     // Message d'erreur si échec
      signature: cpmSignature,
      cpm_custom,            // Métadonnées custom
      cpm_designvars,        // Variables de design
      cpm_result,            // Résultat
      cpm_trans_status_label // Label du statut
    } = payload;

    // Validation des données essentielles
    if (!cpm_trans_id || !cpm_trans_status) {
      console.error('❌ Données webhook CinetPay incomplètes:', payload);
      return res.status(400).json({
        success: false,
        error: 'Données webhook incomplètes'
      });
    }

    // Trouver le paiement correspondant
    const payment = await Payment.findOne({
      'cinetpay.transactionId': cpm_trans_id
    }).populate('user donation');

    if (!payment) {
      console.error('❌ Paiement non trouvé pour transaction CinetPay:', cpm_trans_id);
      // Retourner 200 pour éviter les retries infinis de CinetPay
      return res.status(200).json({
        success: false,
        error: 'Paiement non trouvé'
      });
    }

    // Ajouter le webhook à l'historique du paiement
    payment.addWebhook('cinetpay', `payment_${cpm_trans_status.toLowerCase()}`, cpm_payid, payload, signature);

    // Traiter selon le statut
    let statusUpdated = false;

    switch (cpm_trans_status.toUpperCase()) {
      case 'ACCEPTED':
      case 'COMPLETED': {
        // La notification n'est qu'un signal : le statut réel est relu auprès de CinetPay
        // (la signature est optionnelle et l'identifiant de transaction est connu du payeur).
        const check = await paymentService.verifyCinetPayPayment(cpm_trans_id);
        if (!check.success) {
          console.warn('⚠️ Paiement CinetPay non confirmé par l\'API de vérification:', cpm_trans_id, check.message || check.status);
          return res.status(200).json({
            success: false,
            error: 'Paiement non confirmé par CinetPay'
          });
        }

        console.log('✅ Paiement CinetPay accepté:', cpm_trans_id);

        const paidAt = new Date(`${cpm_payment_date} ${cpm_payment_time}`);
        const result = await completePayment(payment, {
          transactionId: cpm_trans_id,
          source: 'webhook_cinetpay',
          providerData: {
            cinetpay: {
              paymentId: cpm_payid,
              status: 'accepted',
              paymentDate: cpm_payment_date,
              paymentTime: cpm_payment_time,
              amount: Number.isFinite(parseFloat(cpm_amount)) ? parseFloat(cpm_amount) : undefined,
              currency: cpm_currency,
              paymentConfig: cpm_payment_config,
              completedAt: isNaN(paidAt.getTime()) ? new Date() : paidAt,
              apiResponse: payload
            }
          }
        });
        statusUpdated = !result.alreadyCompleted;
        break;
      }

      case 'REFUSED':
      case 'CANCELLED':
      case 'FAILED': {
        console.log('❌ Paiement CinetPay refusé:', cpm_trans_id);

        payment.set('cinetpay.paymentId', cpm_payid);
        payment.set('cinetpay.status', 'refused');
        payment.set('cinetpay.errorMessage', cpm_error_message);
        payment.set('cinetpay.failedAt', new Date());
        payment.set('cinetpay.apiResponse', payload);

        const result = await failPayment(
          payment,
          cpm_error_message || cpm_trans_status_label || 'Paiement refusé par CinetPay',
          { code: cpm_result || 'REFUSED', source: 'webhook_cinetpay' }
        );
        statusUpdated = result.changed;
        break;
      }

      case 'PENDING':
      case 'WAITING':
        if (canMoveToProcessing(payment)) {
          console.log('⏳ Paiement CinetPay en attente:', cpm_trans_id);
          
          payment.status = 'processing';
          payment.set('cinetpay.paymentId', cpm_payid);
          payment.set('cinetpay.status', 'pending');
          payment.set('cinetpay.pendingAt', new Date());
          payment.set('cinetpay.apiResponse', payload);
          
          payment.addToHistory('processing', 'Paiement en cours de traitement via CinetPay');
          await payment.save();
          statusUpdated = true;
        }
        break;

      default:
        console.warn('⚠️ Statut CinetPay non géré:', cpm_trans_status);
        
        // Sauvegarder quand même les données pour debug
        payment.set('cinetpay.paymentId', cpm_payid);
        payment.set('cinetpay.status', cpm_trans_status.toLowerCase());
        payment.set('cinetpay.apiResponse', payload);
        await payment.save();
    }

    // Log du résultat
    if (statusUpdated) {
      console.log(`📊 Paiement CinetPay mis à jour: ${payment._id} -> ${payment.status}`);
    }

    // Répondre rapidement à CinetPay (obligatoire selon leur documentation)
    res.status(200).json({
      success: true,
      message: 'Webhook traité avec succès',
      transaction_id: cpm_trans_id,
      status: payment.status
    });

  } catch (error) {
    console.error('❌ Erreur traitement webhook CinetPay:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du traitement du webhook'
    });
  }
});

// @desc    Test de connexion CinetPay
// @route   GET /api/webhooks/cinetpay/test
// @access  Private (Admin only)
router.get('/cinetpay/test', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    // Valider la configuration CinetPay
    paymentService.validateCinetPayConfig();
    
    // Test simple avec les informations de configuration
    const testData = {
      apikey: paymentService.cinetpayConfig.apiKey?.substring(0, 8) + '...',
      site_id: paymentService.cinetpayConfig.siteId,
      environment: paymentService.cinetpayConfig.environment,
      baseUrl: paymentService.cinetpayConfig.baseUrl
    };
    
    res.json({
      success: true,
      message: 'Configuration CinetPay valide',
      data: testData,
      timestamp: new Date().toISOString(),
      provider: 'CinetPay'
    });
  } catch (error) {
    console.error('❌ Erreur test CinetPay:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erreur lors du test de connexion CinetPay'
    });
  }
});

// @desc    Obtenir les méthodes de paiement CinetPay disponibles
// @route   GET /api/webhooks/cinetpay/payment-methods
// @access  Private (Admin only)
router.get('/cinetpay/payment-methods', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const methods = paymentService.getCinetPayPaymentMethods();
    
    res.json({
      success: true,
      data: {
        methods,
        provider: 'CinetPay',
        supportedCurrencies: ['XOF', 'XAF', 'CDF', 'GNF', 'USD'],
        note: 'Le montant doit être un multiple de 5 (sauf pour USD)'
      }
    });
  } catch (error) {
    console.error('❌ Erreur récupération méthodes CinetPay:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des méthodes de paiement CinetPay'
    });
  }
});

// POST /api/webhooks/stripe - Webhook Stripe
router.post('/stripe', rawBodyParser, async (req, res) => {
  try {
    const payload = req.body;
    const signature = req.headers['stripe-signature'];

    // Vérifier la signature du webhook Stripe
    const verification = paymentService.verifyStripeWebhook(payload, signature);
    
    if (!verification.success) {
      console.error('Invalid Stripe webhook signature:', verification.error);
      return res.status(400).json({
        success: false,
        error: 'Invalid signature'
      });
    }

    const event = verification.event;
    console.log('Stripe webhook received:', event.type);

    const object = event.data.object;
    const findStripePayment = (paymentIntentId) => paymentIntentId
      ? Payment.findOne({ 'stripe.paymentIntentId': paymentIntentId, provider: 'stripe' }).populate('user donation')
      : null;

    // Traiter selon le type d'événement (la signature a été vérifiée : l'événement vient bien de Stripe)
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const payment = await findStripePayment(object.id);
        if (!payment) {
          console.error('Paiement non trouvé pour PaymentIntent Stripe:', object.id);
          break;
        }
        payment.addWebhook('stripe', event.type, event.id, { id: object.id, status: object.status }, signature);
        await completePayment(payment, {
          transactionId: object.id,
          source: 'webhook_stripe',
          providerData: {
            stripe: {
              chargeId: typeof object.latest_charge === 'string' ? object.latest_charge : object.latest_charge?.id,
              paymentMethodId: typeof object.payment_method === 'string' ? object.payment_method : object.payment_method?.id
            }
          }
        });
        console.log('Paiement Stripe complété:', object.id);
        break;
      }

      case 'payment_intent.payment_failed':
      case 'payment_intent.canceled': {
        const payment = await findStripePayment(object.id);
        if (!payment) break;
        payment.addWebhook('stripe', event.type, event.id, { id: object.id, status: object.status }, signature);
        await failPayment(
          payment,
          object.last_payment_error?.message || (event.type === 'payment_intent.canceled' ? 'Paiement annulé' : 'Paiement refusé par Stripe'),
          {
            status: event.type === 'payment_intent.canceled' ? 'cancelled' : 'failed',
            code: object.last_payment_error?.code,
            source: 'webhook_stripe'
          }
        );
        console.log('Paiement Stripe échoué:', object.id);
        break;
      }

      case 'charge.dispute.created': {
        // Contestation bancaire : à traiter manuellement par la trésorerie
        const payment = await findStripePayment(
          typeof object.payment_intent === 'string' ? object.payment_intent : object.payment_intent?.id
        );
        console.warn('⚠️ Contestation Stripe ouverte:', object.id, 'paiement:', payment?._id);
        if (payment) {
          payment.addToHistory('info', 'Contestation Stripe ouverte', null, {
            disputeId: object.id,
            reason: object.reason,
            amount: object.amount
          });
          await payment.save();
        }
        break;
      }
      
      default:
        console.log('Unhandled Stripe event type:', event.type);
    }

    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully'
    });

  } catch (error) {
    console.error('Error processing Stripe webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// POST /api/webhooks/paypal - Webhook PayPal
router.post('/paypal', express.json(), async (req, res) => {
  try {
    const payload = req.body || {};
    const resource = payload.resource || {};

    console.log('PayPal webhook received:', payload.event_type);

    // Signature vérifiée auprès de PayPal quand PAYPAL_WEBHOOK_ID est configuré
    const verified = await paymentService.verifyPayPalWebhook(req.headers, payload);
    if (verified === false) {
      console.error('❌ Signature webhook PayPal invalide');
      return res.status(401).json({ success: false, error: 'Invalid signature' });
    }

    // Identifiant de la commande selon le type d'événement
    const orderId = payload.event_type?.startsWith('CHECKOUT.ORDER')
      ? resource.id
      : resource.supplementary_data?.related_ids?.order_id;

    const payment = orderId
      ? await Payment.findOne({ 'paypal.orderId': orderId, provider: 'paypal' }).populate('user donation')
      : null;

    if (!payment) {
      console.warn('Paiement non trouvé pour webhook PayPal:', payload.event_type, orderId);
      return res.status(200).json({ success: false, message: 'Paiement non trouvé, ignoré' });
    }

    payment.addWebhook('paypal', payload.event_type, payload.id, { resourceId: resource.id, status: resource.status });

    switch (payload.event_type) {
      case 'CHECKOUT.ORDER.APPROVED':
      case 'PAYMENT.CAPTURE.COMPLETED': {
        // Dans tous les cas on relit la commande chez PayPal avant de valider le don
        // (et on la capture si le payeur vient seulement de l'approuver).
        let order = await paymentService.getPayPalOrder(orderId);
        if (order.status === 'APPROVED') {
          const capture = await paymentService.capturePayPalPayment(orderId);
          order = capture.data || order;
        }

        if (order.status !== 'COMPLETED') {
          console.warn('⚠️ Commande PayPal non finalisée:', orderId, order.status);
          await payment.save();
          break;
        }

        await completePayment(payment, {
          transactionId: orderId,
          source: 'webhook_paypal',
          providerData: {
            paypal: {
              captureId: order.purchase_units?.[0]?.payments?.captures?.[0]?.id,
              payerId: order.payer?.payer_id
            }
          }
        });
        console.log('Paiement PayPal complété:', orderId);
        break;
      }

      case 'PAYMENT.CAPTURE.DENIED':
        await failPayment(payment, 'Paiement refusé par PayPal', { code: 'CAPTURE_DENIED', source: 'webhook_paypal' });
        break;

      default:
        console.log('Unhandled PayPal event type:', payload.event_type);
        await payment.save();
    }

    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully'
    });

  } catch (error) {
    console.error('Error processing PayPal webhook:', error.message);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// POST /api/webhooks/moneyfusion - Webhook MoneyFusion
router.post('/moneyfusion', express.json(), async (req, res) => {
  try {
    const payload = req.body;

    console.log('🔔 MoneyFusion webhook reçu:', payload);

    // Traiter le webhook via le service
    const webhookResult = await moneyFusionService.processWebhook(payload);

    // Chercher le paiement par moneyfusion.token (champ tokenPay selon la doc)
    const payment = await Payment.findOne({
      'moneyfusion.token': webhookResult.transactionId,
      provider: 'moneyfusion'
    }).populate('user donation');

    if (!payment) {
      console.error('❌ Paiement non trouvé pour webhook MoneyFusion token:', webhookResult.transactionId);
      // Répondre 200 quand même pour éviter les retries MoneyFusion
      return res.status(200).json({
        success: false,
        message: 'Paiement non trouvé, ignoré'
      });
    }

    // Déduplication: ignorer si le statut n'a pas changé
    const incomingStatus = webhookResult.status;
    const currentStatus = payment.status;

    if (
      (incomingStatus === 'completed' && currentStatus === 'completed') ||
      (incomingStatus === 'failed' && currentStatus === 'failed') ||
      (incomingStatus === 'cancelled' && currentStatus === 'cancelled')
    ) {
      console.log(`⏭️ Webhook MoneyFusion ignoré (statut déjà ${currentStatus}):`, webhookResult.transactionId);
      return res.status(200).json({ success: true, message: 'Notification redondante ignorée' });
    }

    // Ajouter le webhook à l'historique
    payment.addWebhook('moneyfusion', webhookResult.type, webhookResult.data?.reference || payload.tokenPay, payload);

    switch (webhookResult.type) {
      case 'payment_completed': {
        // Le webhook MoneyFusion n'est pas signé et le token figure dans l'URL de paiement :
        // n'importe qui pourrait poster un faux « completed ». On relit donc le statut
        // auprès de MoneyFusion avant de valider le don.
        const confirmation = await moneyFusionService.confirmPaid(webhookResult.transactionId);

        if (!confirmation.confirmed) {
          console.warn(
            '⚠️ Webhook MoneyFusion "completed" non confirmé par l\'API MoneyFusion:',
            webhookResult.transactionId,
            confirmation.statut || confirmation.error
          );
          // 200 pour éviter les retries ; le paiement reste en attente et sera
          // rattrapé par /payments/:id/verify ou par la tâche cron.
          return res.status(200).json({
            success: false,
            message: 'Paiement non confirmé par MoneyFusion'
          });
        }

        console.log('✅ Paiement MoneyFusion complété:', webhookResult.transactionId);

        await completePayment(payment, {
          transactionId: webhookResult.transactionId,
          source: 'webhook_moneyfusion',
          providerData: {
            moneyfusion: {
              status: 'paid',
              transactionReference: webhookResult.data?.reference || confirmation.data?.numeroTransaction,
              completedAt: new Date(),
              fees: { amount: webhookResult.data?.fees || 0, currency: payment.currency },
              paymentMethod: webhookResult.data?.paymentMethod || confirmation.data?.moyen,
              apiResponse: payload
            }
          }
        });
        break;
      }

      case 'payment_failed':
        console.log('❌ Paiement MoneyFusion échoué:', webhookResult.transactionId);

        await failPayment(
          payment,
          webhookResult.data?.originalStatus || 'Paiement refusé par MoneyFusion',
          { code: 'PAYMENT_FAILED', source: 'webhook_moneyfusion' }
        );
        break;

      case 'payment_pending':
        if (canMoveToProcessing(payment)) {
          console.log('⏳ Paiement MoneyFusion en attente:', webhookResult.transactionId);

          payment.status = 'processing';
          payment.set('moneyfusion.status', 'pending');
          payment.set('moneyfusion.metadata', webhookResult.data);
          payment.addToHistory('processing', 'Paiement en cours de traitement via MoneyFusion');
          await payment.save();

          try {
            websocketService.notifyPaymentStatusUpdate(payment, 'pending', 'processing');
          } catch (wsErr) {
            console.warn('⚠️ WebSocket notifyPaymentStatusUpdate:', wsErr.message);
          }
        }
        break;

      case 'payment_cancelled':
        await failPayment(payment, 'Paiement annulé via MoneyFusion', {
          status: 'cancelled',
          code: 'PAYMENT_CANCELLED',
          source: 'webhook_moneyfusion'
        });
        break;

      default:
        console.warn('⚠️ Type d\'événement MoneyFusion non géré:', webhookResult.type);
    }

    console.log(`📢 Webhook MoneyFusion traité: ${payment._id} -> ${payment.status}`);

    res.status(200).json({
      success: true,
      message: 'Webhook traité avec succès',
      transaction_id: webhookResult.transactionId,
      status: payment.status
    });

  } catch (error) {
    console.error('❌ Erreur traitement webhook MoneyFusion:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du traitement du webhook'
    });
  }
});

// @desc    Webhook FusionPay
// @route   POST /api/webhooks/fusionpay
// @access  Public (mais avec signature)
router.post('/fusionpay', rawBodyParser, async (req, res) => {
  try {
    const signature = req.headers['x-signature'];
    const timestamp = req.headers['x-timestamp'];
    
    if (!signature || !timestamp) {
      return res.status(400).json({
        success: false,
        error: 'Headers de signature manquants'
      });
    }

    let webhookData;
    try {
      webhookData = JSON.parse(req.body.toString());
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        error: 'Format JSON invalide'
      });
    }

    // Traiter le webhook
    const webhookResult = await fusionPayService.processWebhook(
      webhookData,
      signature,
      timestamp
    );

    // Trouver le paiement correspondant
    const payment = await Payment.findOne({
      'fusionpay.transactionId': webhookResult.transactionId
    }).populate('user donation');

    if (!payment) {
      console.error('Paiement non trouvé pour webhook FusionPay:', webhookResult.transactionId);
      // Retourner 200 pour éviter les retries infinis de FusionPay
      return res.status(200).json({
        success: false,
        error: 'Paiement non trouvé'
      });
    }

    // Ajouter le webhook à l'historique
    payment.addWebhook('fusionpay', webhookResult.type, webhookData.event_id, webhookData, signature);

    // Traiter selon le type d'événement
    switch (webhookResult.type) {
      case 'payment_completed':
        await completePayment(payment, {
          transactionId: webhookResult.transactionId,
          source: 'webhook_fusionpay',
          providerData: {
            fusionpay: {
              status: 'completed',
              completedAt: new Date(),
              metadata: webhookResult.data
            }
          }
        });
        console.log(`Paiement FusionPay complété: ${payment._id}`);
        break;

      case 'payment_failed':
        await failPayment(
          payment,
          webhookResult.data?.failure_reason || 'Paiement échoué',
          { code: webhookResult.data?.error_code, source: 'webhook_fusionpay' }
        );
        console.log(`Paiement FusionPay échoué: ${payment._id}`);
        break;

      case 'payment_pending':
        if (canMoveToProcessing(payment)) {
          payment.status = 'processing';
          payment.addToHistory('processing', 'Paiement en cours de traitement');
          await payment.save();
        }
        break;

      case 'refund_completed':
        payment.refund = {
          amount: webhookResult.data.amount,
          reason: webhookResult.data.reason,
          refundedAt: new Date(),
          refundId: webhookResult.refundId,
          status: 'completed'
        };
        
        if (webhookResult.data.amount >= payment.amount) {
          payment.status = 'refunded';
        } else {
          payment.status = 'partially_refunded';
        }
        
        payment.addToHistory('refunded', `Remboursement complété: ${webhookResult.data.amount}`);
        await payment.save();
        break;

      default:
        console.log('Type de webhook FusionPay non géré:', webhookResult.type);
    }

    res.status(200).json({
      success: true,
      message: 'Webhook traité avec succès'
    });

  } catch (error) {
    console.error('Erreur traitement webhook FusionPay:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du traitement du webhook'
    });
  }
});

// @desc    Test de connexion FusionPay
// @route   GET /api/webhooks/fusionpay/test
// @access  Private (Admin only)
router.get('/fusionpay/test', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const testResult = await fusionPayService.testConnection();
    
    res.json({
      success: testResult.success,
      message: testResult.message,
      timestamp: testResult.timestamp,
      provider: 'FusionPay'
    });
  } catch (error) {
    console.error('Erreur test FusionPay:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du test de connexion FusionPay'
    });
  }
});

// @desc    Obtenir les méthodes de paiement FusionPay disponibles
// @route   GET /api/webhooks/fusionpay/payment-methods
// @access  Private (Admin only)
router.get('/fusionpay/payment-methods', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { currency = 'XOF', country = 'CI' } = req.query;
    
    const methodsResult = await fusionPayService.getPaymentMethods(currency, country);
    
    if (methodsResult.success) {
      res.json({
        success: true,
        data: {
          methods: methodsResult.methods,
          currency,
          country
        }
      });
    } else {
      res.status(400).json({
        success: false,
        error: methodsResult.message
      });
    }
  } catch (error) {
    console.error('Erreur récupération méthodes FusionPay:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des méthodes de paiement'
    });
  }
});

// @desc    Obtenir les taux de change FusionPay
// @route   GET /api/webhooks/fusionpay/exchange-rates
// @access  Private (Admin only)
router.get('/fusionpay/exchange-rates', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { base = 'XOF' } = req.query;
    
    const ratesResult = await fusionPayService.getExchangeRates(base);
    
    if (ratesResult.success) {
      res.json({
        success: true,
        data: {
          rates: ratesResult.rates,
          baseCurrency: ratesResult.baseCurrency,
          timestamp: ratesResult.timestamp
        }
      });
    } else {
      res.status(400).json({
        success: false,
        error: ratesResult.message
      });
    }
  } catch (error) {
    console.error('Erreur récupération taux FusionPay:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des taux de change'
    });
  }
});

// @desc    Test de connexion MoneyFusion
// @route   GET /api/webhooks/moneyfusion/test
// @access  Private (Admin only)
router.get('/moneyfusion/test', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const testResult = await moneyFusionService.testConnection();
    
    res.json({
      success: testResult.success,
      message: testResult.message,
      timestamp: testResult.timestamp,
      provider: 'MoneyFusion',
      apiUrl: testResult.apiUrl
    });
  } catch (error) {
    console.error('Erreur test MoneyFusion:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du test de connexion MoneyFusion'
    });
  }
});

// GET /api/webhooks/test - Endpoint de test (développement seulement)
if (process.env.NODE_ENV === 'development') {
  router.get('/test', (req, res) => {
    res.json({
      success: true,
      message: 'Webhooks endpoint is working',
      timestamp: new Date(),
      environment: process.env.NODE_ENV
    });
  });
}

// @desc    Webhook PayDunya
// @route   POST /api/webhooks/paydunya
// @access  Public (webhook de PayDunya)
router.post('/paydunya', express.json(), async (req, res) => {
  try {
    // L'IPN PayDunya arrive en formulaire (data[token], data[response_code]…) :
    // accepter les deux formes, enveloppée dans "data" ou à plat.
    const webhookData = (req.body && typeof req.body.data === 'object' && req.body.data) || req.body;
    
    console.log('🔔 PayDunya webhook reçu:', webhookData);

    if (!webhookData || !webhookData.token) {
      return res.status(400).json({
        success: false,
        error: 'Token PayDunya manquant'
      });
    }

    // Traiter le webhook PayDunya
    const webhookResult = await paydunyaService.processWebhook(webhookData);

    // Trouver le paiement correspondant via le token PayDunya
    const payment = await Payment.findOne({
      'paydunya.token': webhookData.token,
      provider: 'paydunya'
    }).populate('user donation');

    if (!payment) {
      console.error('❌ Paiement non trouvé pour webhook PayDunya. Token:', webhookData.token);
      // Retourner 200 pour éviter les retries infinis de PayDunya
      return res.status(200).json({
        success: false,
        error: 'Paiement non trouvé'
      });
    }

    // Ajouter le webhook à l'historique
    payment.addWebhook('paydunya', 'payment_status_update', webhookData.token, webhookData);
    payment.set('paydunya.responseCode', webhookData.response_code);
    payment.set('paydunya.responseText', webhookData.response_text);

    if (webhookResult.status === 'completed') {
      // Le webhook n'est pas authentifié : confirmer la facture auprès de PayDunya
      const confirmation = await paydunyaService.checkPaymentStatus(webhookData.token);

      if (confirmation.status !== 'completed') {
        console.warn('⚠️ PayDunya: paiement non confirmé par l\'API pour token:', webhookData.token, confirmation.status);
        return res.status(200).json({
          success: false,
          error: 'Paiement non confirmé par PayDunya'
        });
      }

      console.log('✅ PayDunya: Paiement confirmé pour token:', webhookData.token);

      await completePayment(payment, {
        transactionId: payment.paydunya?.transactionId || webhookData.token,
        source: 'webhook_paydunya',
        providerData: {
          paydunya: {
            status: 'completed',
            responseText: webhookData.response_text || 'Paiement PayDunya confirmé',
            completedAt: new Date()
          }
        }
      });
    } else {
      // PayDunya n'envoie '00' que pour un succès : tout autre code est un état
      // intermédiaire ou un échec. On journalise sans clore le paiement, la
      // vérification (/payments/:id/verify) reste la source de vérité.
      console.log('ℹ️ PayDunya: notification non concluante pour token:', webhookData.token, 'Code:', webhookData.response_code);

      payment.addToHistory('info', `Webhook PayDunya: code ${webhookData.response_code || 'inconnu'}`, null, {
        provider: 'paydunya',
        responseCode: webhookData.response_code,
        responseText: webhookData.response_text
      });
      await payment.save();
    }

    console.log('✅ PayDunya: Webhook traité avec succès pour paiement:', payment._id);

    res.status(200).json({
      success: true,
      message: 'Webhook PayDunya traité avec succès',
      paymentId: payment._id,
      status: payment.status
    });

  } catch (error) {
    console.error('❌ PayDunya: Erreur lors du traitement du webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du traitement du webhook PayDunya'
    });
  }
});

// @desc    Webhook GeniusPay
// @route   POST /api/webhooks/geniuspay
// @access  Public (mais avec signature HMAC-SHA256)
router.post('/geniuspay', rawBodyParser, async (req, res) => {
  try {
    const signature = req.headers['x-webhook-signature'];
    const timestamp = req.headers['x-webhook-timestamp'];

    if (!signature || !timestamp) {
      return res.status(400).json({
        success: false,
        error: 'Headers de signature manquants'
      });
    }

    const rawBody = req.body.toString();

    let webhookResult;
    let webhookPayload;
    try {
      webhookPayload = JSON.parse(rawBody);
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        error: 'Format JSON invalide'
      });
    }

    try {
      webhookResult = await geniusPayService.processWebhook(rawBody, signature, timestamp);
    } catch (verificationError) {
      console.error('❌ GeniusPay: Signature webhook invalide:', verificationError.message);
      return res.status(401).json({
        success: false,
        error: 'Signature webhook invalide'
      });
    }

    console.log('🔔 GeniusPay webhook reçu:', webhookResult);

    const payment = await Payment.findOne({
      'geniuspay.reference': webhookResult.transactionId,
      provider: 'geniuspay'
    }).populate('user donation');

    if (!payment) {
      console.error('❌ Paiement non trouvé pour webhook GeniusPay reference:', webhookResult.transactionId);
      // Répondre 200 quand même pour éviter les retries GeniusPay
      return res.status(200).json({
        success: false,
        message: 'Paiement non trouvé, ignoré'
      });
    }

    // Déduplication: ignorer si le statut n'a pas changé
    const incomingStatus = webhookResult.status;
    const currentStatus = payment.status;

    if (
      (incomingStatus === 'completed' && currentStatus === 'completed') ||
      (incomingStatus === 'failed' && currentStatus === 'failed') ||
      (incomingStatus === 'cancelled' && currentStatus === 'cancelled') ||
      (incomingStatus === 'refunded' && currentStatus === 'refunded')
    ) {
      console.log(`⏭️ Webhook GeniusPay ignoré (statut déjà ${currentStatus}):`, webhookResult.transactionId);
      return res.status(200).json({ success: true, message: 'Notification redondante ignorée' });
    }

    payment.addWebhook('geniuspay', webhookResult.type, webhookResult.data?.reference, webhookPayload);

    switch (webhookResult.type) {
      case 'payment_completed':
        console.log('✅ Paiement GeniusPay complété:', webhookResult.transactionId);

        await completePayment(payment, {
          transactionId: webhookResult.transactionId,
          source: 'webhook_geniuspay',
          providerData: {
            geniuspay: {
              status: 'completed',
              completedAt: new Date(),
              fees: webhookResult.data?.fees,
              netAmount: webhookResult.data?.netAmount,
              apiResponse: webhookPayload
            }
          }
        });
        break;

      case 'payment_failed':
        console.log('❌ Paiement GeniusPay échoué:', webhookResult.transactionId);

        await failPayment(
          payment,
          webhookResult.data?.originalStatus || 'Paiement refusé par GeniusPay',
          { code: 'PAYMENT_FAILED', source: 'webhook_geniuspay' }
        );
        break;

      case 'payment_cancelled':
        await failPayment(payment, 'Paiement annulé via GeniusPay', {
          status: 'cancelled',
          code: 'PAYMENT_CANCELLED',
          source: 'webhook_geniuspay'
        });
        break;

      case 'payment_refunded':
        if (payment.status !== 'refunded') {
          payment.status = 'refunded';
          payment.set('geniuspay.status', 'refunded');
          payment.set('geniuspay.apiResponse', webhookPayload);
          payment.addToHistory('refunded', 'Paiement remboursé via GeniusPay');
          await payment.save();
        }
        break;

      case 'payment_pending':
        if (canMoveToProcessing(payment)) {
          console.log('⏳ Paiement GeniusPay en attente:', webhookResult.transactionId);

          payment.status = 'processing';
          payment.set('geniuspay.status', 'pending');
          payment.set('geniuspay.metadata', webhookResult.data);
          payment.addToHistory('processing', 'Paiement en cours de traitement via GeniusPay');
          await payment.save();

          try {
            websocketService.notifyPaymentStatusUpdate(payment, 'pending', 'processing');
          } catch (wsErr) {
            console.warn('⚠️ WebSocket notifyPaymentStatusUpdate:', wsErr.message);
          }
        }
        break;

      default:
        console.warn('⚠️ Type d\'événement GeniusPay non géré:', webhookResult.type);
    }

    console.log(`📢 Webhook GeniusPay traité: ${payment._id} -> ${payment.status}`);

    res.status(200).json({
      success: true,
      message: 'Webhook traité avec succès',
      transaction_id: webhookResult.transactionId,
      status: payment.status
    });

  } catch (error) {
    console.error('❌ Erreur traitement webhook GeniusPay:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du traitement du webhook'
    });
  }
});

module.exports = router; 