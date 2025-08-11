const express = require('express');
const paymentService = require('../services/paymentService');
const Payment = require('../models/Payment');
const Donation = require('../models/Donation');
const User = require('../models/User');
const fusionPayService = require('../services/fusionPayService');
const moneyFusionService = require('../services/moneyFusionService');
const paydunyaService = require('../services/paydunyaService');
const emailService = require('../services/emailService');
const websocketService = require('../services/websocketService');

const router = express.Router();

// Middleware pour parser le body en raw pour les webhooks
const rawBodyParser = express.raw({ type: 'application/json' });

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
      return res.status(404).json({
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
      case 'COMPLETED':
        if (payment.status !== 'completed') {
          console.log('✅ Paiement CinetPay accepté:', cpm_trans_id);
          
          // Marquer le paiement comme complété
          await payment.markCompleted({
            cinetpay: {
              ...payment.cinetpay,
              paymentId: cpm_payid,
              status: 'accepted',
              paymentDate: cpm_payment_date,
              paymentTime: cpm_payment_time,
              amount: parseFloat(cpm_amount),
              currency: cpm_currency,
              paymentConfig: cpm_payment_config,
              completedAt: new Date(`${cpm_payment_date} ${cpm_payment_time}`),
              apiResponse: payload
            }
          });

          // Mettre à jour la donation
          payment.donation.status = 'completed';
          await payment.donation.save();

          // Mettre à jour les statistiques utilisateur
          await payment.user.updateDonationStats(payment.amount);

          // Envoyer le reçu par email
          try {
            await emailService.sendDonationReceiptEmail(
              payment.user.email,
              payment.user.firstName,
              {
                receiptNumber: payment.donation.receipt.number,
                donorName: `${payment.user.firstName} ${payment.user.lastName}`,
                formattedAmount: payment.formattedAmount,
                donationDate: payment.donation.createdAt,
                paymentMethod: 'CinetPay',
                category: payment.donation.category,
                transactionId: cpm_trans_id,
                paymentId: cpm_payid
              }
            );
          } catch (emailError) {
            console.error('❌ Erreur envoi reçu CinetPay:', emailError);
          }

          statusUpdated = true;
        }
        break;

      case 'REFUSED':
      case 'CANCELLED':
      case 'FAILED':
        if (payment.status !== 'failed') {
          console.log('❌ Paiement CinetPay refusé:', cpm_trans_id);
          
          await payment.markFailed(
            cpm_error_message || cpm_trans_status_label || 'Paiement refusé par CinetPay',
            cpm_result || 'REFUSED'
          );

          // Mettre à jour les données CinetPay
          payment.cinetpay = {
            ...payment.cinetpay,
            paymentId: cpm_payid,
            status: 'refused',
            errorMessage: cpm_error_message,
            failedAt: new Date(),
            apiResponse: payload
          };
          
          await payment.save();
          statusUpdated = true;
        }
        break;

      case 'PENDING':
      case 'WAITING':
        if (payment.status !== 'processing') {
          console.log('⏳ Paiement CinetPay en attente:', cpm_trans_id);
          
          payment.status = 'processing';
          payment.cinetpay = {
            ...payment.cinetpay,
            paymentId: cpm_payid,
            status: 'pending',
            pendingAt: new Date(),
            apiResponse: payload
          };
          
          payment.addToHistory('processing', 'Paiement en cours de traitement via CinetPay');
          await payment.save();
          statusUpdated = true;
        }
        break;

      default:
        console.warn('⚠️ Statut CinetPay non géré:', cpm_trans_status);
        
        // Sauvegarder quand même les données pour debug
        payment.cinetpay = {
          ...payment.cinetpay,
          paymentId: cpm_payid,
          status: cpm_trans_status.toLowerCase(),
          unknownStatusAt: new Date(),
          apiResponse: payload
        };
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
router.get('/cinetpay/test', async (req, res) => {
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
// @access  Private
router.get('/cinetpay/payment-methods', async (req, res) => {
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

    // Traiter selon le type d'événement
    switch (event.type) {
      case 'payment_intent.succeeded':
        // TODO: Marquer le paiement comme réussi
        console.log('Payment succeeded:', event.data.object.id);
        break;
      
      case 'payment_intent.payment_failed':
        // TODO: Marquer le paiement comme échoué
        console.log('Payment failed:', event.data.object.id);
        break;
      
      case 'charge.dispute.created':
        // TODO: Gérer la contestation
        console.log('Dispute created:', event.data.object.id);
        break;
      
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
    const payload = req.body;
    const headers = req.headers;

    console.log('PayPal webhook received:', payload.event_type);

    // TODO: Vérifier la signature PayPal si nécessaire
    // PayPal utilise un système de vérification différent

    // Traiter selon le type d'événement
    switch (payload.event_type) {
      case 'CHECKOUT.ORDER.APPROVED':
        // TODO: Capturer le paiement
        console.log('PayPal order approved:', payload.resource.id);
        break;
      
      case 'PAYMENT.CAPTURE.COMPLETED':
        // TODO: Marquer le paiement comme complété
        console.log('PayPal payment completed:', payload.resource.id);
        break;
      
      case 'PAYMENT.CAPTURE.DENIED':
        // TODO: Marquer le paiement comme refusé
        console.log('PayPal payment denied:', payload.resource.id);
        break;
      
      default:
        console.log('Unhandled PayPal event type:', payload.event_type);
    }

    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully'
    });

  } catch (error) {
    console.error('Error processing PayPal webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// POST /api/webhooks/orange-money - Webhook Orange Money
router.post('/orange-money', express.json(), async (req, res) => {
  try {
    const payload = req.body;
    
    console.log('Orange Money webhook received:', payload);

    // TODO: Implémenter la vérification et le traitement Orange Money
    
    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully'
    });

  } catch (error) {
    console.error('Error processing Orange Money webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// POST /api/webhooks/mtn-mobile-money - Webhook MTN Mobile Money
router.post('/mtn-mobile-money', express.json(), async (req, res) => {
  try {
    const payload = req.body;
    
    console.log('MTN Mobile Money webhook received:', payload);

    // TODO: Implémenter la vérification et le traitement MTN Mobile Money
    
    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully'
    });

  } catch (error) {
    console.error('Error processing MTN Mobile Money webhook:', error);
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
    const signature = req.headers['x-signature'];
    const timestamp = req.headers['x-timestamp'];

    console.log('🔔 MoneyFusion webhook reçu:', payload);

    // Traiter le webhook
    const webhookResult = await moneyFusionService.processWebhook(payload, signature, timestamp);

    // Trouver le paiement correspondant
    const payment = await Payment.findOne({
      'moneyfusion.transactionId': webhookResult.transactionId,
      provider: 'moneyfusion'
    }).populate('user donation');

    if (!payment) {
      console.error('❌ Paiement non trouvé pour webhook MoneyFusion:', webhookResult.transactionId);
      return res.status(404).json({
        success: false,
        error: 'Paiement non trouvé'
      });
    }

    // Ajouter le webhook à l'historique
    payment.addWebhook('moneyfusion', webhookResult.type, webhookResult.data?.reference, payload, signature);

    // Traiter selon le type d'événement
    switch (webhookResult.type) {
      case 'payment_completed':
        if (payment.status !== 'completed') {
          console.log('✅ Paiement MoneyFusion complété:', webhookResult.transactionId);
          
          // Marquer le paiement comme complété
          await payment.markCompleted({
            moneyfusion: {
              ...payment.moneyfusion,
              status: 'completed',
              completedAt: new Date(),
              metadata: webhookResult.data
            }
          });

          // Mettre à jour la donation
          payment.donation.status = 'completed';
          await payment.donation.save();

          // Mettre à jour les statistiques utilisateur
          await payment.user.updateDonationStats(payment.amount);

          // Notifier via WebSocket
          websocketService.notifyPaymentCompleted(payment, payment.donation);

          // Envoyer le reçu par email
          try {
            await emailService.sendDonationReceiptEmail(
              payment.user.email,
              payment.user.firstName,
              {
                receiptNumber: payment.donation.receipt.number,
                donorName: `${payment.user.firstName} ${payment.user.lastName}`,
                formattedAmount: payment.formattedAmount,
                donationDate: payment.donation.createdAt,
                paymentMethod: 'MoneyFusion',
                category: payment.donation.category,
                transactionId: webhookResult.transactionId,
                paymentId: webhookResult.data?.reference
              }
            );
          } catch (emailError) {
            console.error('❌ Erreur envoi reçu MoneyFusion:', emailError);
          }
        }
        break;

      case 'payment_failed':
        if (payment.status !== 'failed') {
          console.log('❌ Paiement MoneyFusion échoué:', webhookResult.transactionId);
          
          await payment.markFailed(
            webhookResult.data?.errorMessage || 'Paiement refusé par MoneyFusion',
            'PAYMENT_FAILED'
          );

          // Mettre à jour les données MoneyFusion
          payment.moneyfusion = {
            ...payment.moneyfusion,
            status: 'failed',
            errorMessage: webhookResult.data?.errorMessage,
            failedAt: new Date(),
            metadata: webhookResult.data
          };
          
          await payment.save();

          // Notifier via WebSocket
          websocketService.notifyPaymentFailed(
            payment, 
            payment.donation,
            { 
              message: webhookResult.data?.errorMessage || 'Paiement échoué',
              code: 'PAYMENT_FAILED'
            }
          );
        }
        break;

      case 'payment_pending':
        if (payment.status !== 'processing') {
          console.log('⏳ Paiement MoneyFusion en attente:', webhookResult.transactionId);
          
          payment.status = 'processing';
          payment.moneyfusion = {
            ...payment.moneyfusion,
            status: 'pending',
            pendingAt: new Date(),
            metadata: webhookResult.data
          };
          
          payment.addToHistory('processing', 'Paiement en cours de traitement via MoneyFusion');
          await payment.save();

          // Notifier via WebSocket
          websocketService.notifyPaymentStatusUpdate(payment, 'pending', 'processing');
        }
        break;

      default:
        console.warn('⚠️ Type d\'événement MoneyFusion non géré:', webhookResult.type);
    }

    console.log(`📢 Webhook MoneyFusion traité: ${payment._id} -> ${payment.status}`);

    // Répondre rapidement à MoneyFusion
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
      return res.status(404).json({
        success: false,
        error: 'Paiement non trouvé'
      });
    }

    // Ajouter le webhook à l'historique
    payment.addWebhook('fusionpay', webhookResult.type, webhookData.event_id, webhookData, signature);

    // Traiter selon le type d'événement
    switch (webhookResult.type) {
      case 'payment_completed':
        if (payment.status !== 'completed') {
          // Marquer le paiement comme complété
          await payment.markCompleted({
            fusionpay: {
              ...payment.fusionpay,
              status: 'completed',
              completedAt: new Date(),
              metadata: webhookResult.data
            }
          });

          // Mettre à jour la donation
          payment.donation.status = 'completed';
          await payment.donation.save();

          // Mettre à jour les statistiques utilisateur
          await payment.user.updateDonationStats(payment.amount);

          // Envoyer le reçu par email
          try {
            await emailService.sendDonationReceiptEmail(
              payment.user.email,
              payment.user.firstName,
              {
                receiptNumber: payment.donation.receipt.number,
                donorName: `${payment.user.firstName} ${payment.user.lastName}`,
                formattedAmount: payment.formattedAmount,
                donationDate: payment.donation.createdAt,
                paymentMethod: payment.paymentMethod,
                category: payment.donation.category
              }
            );
          } catch (emailError) {
            console.error('Erreur envoi reçu par email:', emailError);
          }

          console.log(`Paiement FusionPay complété: ${payment._id}`);
        }
        break;

      case 'payment_failed':
        if (payment.status !== 'failed') {
          await payment.markFailed(
            webhookResult.data.failure_reason || 'Paiement échoué',
            webhookResult.data.error_code
          );
          console.log(`Paiement FusionPay échoué: ${payment._id}`);
        }
        break;

      case 'payment_pending':
        if (payment.status !== 'processing') {
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
router.get('/fusionpay/test', async (req, res) => {
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
// @access  Private
router.get('/fusionpay/payment-methods', async (req, res) => {
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
// @access  Private
router.get('/fusionpay/exchange-rates', async (req, res) => {
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

// @desc    Webhook MoneyFusion
// @route   POST /api/webhooks/moneyfusion
// @access  Public (webhook de MoneyFusion)
router.post('/moneyfusion', express.json(), async (req, res) => {
  try {
    const webhookData = req.body;
    
    console.log('MoneyFusion webhook reçu:', webhookData);

    // Traiter le webhook MoneyFusion
    const webhookResult = await moneyFusionService.processWebhook(webhookData);

    // Trouver le paiement correspondant
    const payment = await Payment.findOne({
      'moneyfusion.token': webhookResult.transactionId
    }).populate('user donation');

    if (!payment) {
      console.error('Paiement non trouvé pour webhook MoneyFusion:', webhookResult.transactionId);
      return res.status(404).json({
        success: false,
        error: 'Paiement non trouvé'
      });
    }

    // Ajouter le webhook à l'historique
    payment.addWebhook('moneyfusion', webhookResult.type, webhookData.tokenPay || 'unknown', webhookData);

    // Traiter selon le type d'événement
    switch (webhookResult.type) {
      case 'payment_completed':
        if (payment.status !== 'completed') {
          // Marquer le paiement comme complété
          await payment.markCompleted({
            moneyfusion: {
              ...payment.moneyfusion,
              status: 'paid',
              transactionReference: webhookResult.data.reference,
              completedAt: new Date(),
              fees: {
                amount: webhookResult.data.fees,
                currency: payment.currency
              },
              paymentMethod: webhookResult.data.paymentMethod,
              apiResponse: webhookData
            }
          });

          // Mettre à jour la donation
          payment.donation.status = 'completed';
          await payment.donation.save();

          // Mettre à jour les statistiques utilisateur
          await payment.user.updateDonationStats(payment.amount);

          // Envoyer le reçu par email
          try {
            await emailService.sendDonationReceiptEmail(
              payment.user.email,
              payment.user.firstName,
              {
                receiptNumber: payment.donation.receipt.number,
                donorName: `${payment.user.firstName} ${payment.user.lastName}`,
                formattedAmount: payment.formattedAmount,
                donationDate: payment.donation.createdAt,
                paymentMethod: 'MoneyFusion',
                category: payment.donation.category
              }
            );
          } catch (emailError) {
            console.error('Erreur envoi reçu par email:', emailError);
          }

          console.log(`Paiement MoneyFusion complété: ${payment._id}`);
        }
        break;

      case 'payment_failed':
        if (payment.status !== 'failed') {
          await payment.markFailed(
            webhookResult.data.originalStatus || 'Paiement échoué via MoneyFusion'
          );
          console.log(`Paiement MoneyFusion échoué: ${payment._id}`);
        }
        break;

      case 'payment_pending':
        if (payment.status !== 'processing') {
          payment.status = 'processing';
          payment.addToHistory('processing', 'Paiement en cours de traitement via MoneyFusion');
          await payment.save();
        }
        break;

      case 'payment_cancelled':
        if (payment.status !== 'cancelled') {
          payment.status = 'cancelled';
          payment.addToHistory('cancelled', 'Paiement annulé via MoneyFusion');
          await payment.save();
        }
        break;

      default:
        console.log('Type de webhook MoneyFusion non géré:', webhookResult.type);
    }

    res.status(200).json({
      success: true,
      message: 'Webhook MoneyFusion traité avec succès'
    });

  } catch (error) {
    console.error('Erreur traitement webhook MoneyFusion:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du traitement du webhook MoneyFusion'
    });
  }
});

// @desc    Test de connexion MoneyFusion
// @route   GET /api/webhooks/moneyfusion/test
// @access  Private (Admin only)
router.get('/moneyfusion/test', async (req, res) => {
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

// Fonction utilitaire pour traitement asynchrone des webhooks
async function processWebhookAsync(provider, payload) {
  try {
    // TODO: Implémenter le traitement asynchrone
    // - Mettre à jour le statut du paiement en base
    // - Envoyer des notifications
    // - Mettre à jour les statistiques de gamification
    // - Générer les reçus
    
    console.log(`Processing ${provider} webhook asynchronously:`, payload);
    
  } catch (error) {
    console.error(`Error in async webhook processing for ${provider}:`, error);
  }
}

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
    const webhookData = req.body;
    
    console.log('🔔 PayDunya webhook reçu:', webhookData);

    // Traiter le webhook PayDunya
    const webhookResult = await paydunyaService.processWebhook(webhookData);

    if (!webhookResult.success) {
      console.error('❌ Erreur lors du traitement du webhook PayDunya:', webhookResult.error);
      return res.status(400).json({
        success: false,
        error: webhookResult.error
      });
    }

    // Trouver le paiement correspondant via le token PayDunya
    const payment = await Payment.findOne({
      'paydunya.token': webhookData.token,
      provider: 'paydunya'
    }).populate('user donation');

    if (!payment) {
      console.error('❌ Paiement non trouvé pour webhook PayDunya. Token:', webhookData.token);
      return res.status(404).json({
        success: false,
        error: 'Paiement non trouvé'
      });
    }

    // Ajouter le webhook à l'historique
    payment.addWebhook('paydunya', 'payment_status_update', webhookData.token, webhookData);

    // Traiter selon le statut du paiement
    if (webhookResult.status === 'completed') {
      console.log('✅ PayDunya: Paiement confirmé pour token:', webhookData.token);

      // Mettre à jour le paiement
      payment.status = 'completed';
      payment.paydunya.status = 'completed';
      payment.paydunya.responseCode = webhookData.response_code;
      payment.paydunya.responseText = webhookData.response_text || 'Paiement PayDunya confirmé';
      payment.paydunya.completedAt = new Date();
      
      // Ajouter à l'historique
      payment.addToHistory('completed', 'Paiement PayDunya confirmé via webhook', webhookData.token, {
        provider: 'paydunya',
        paymentMethod: payment.paydunya.paymentMethod,
        amount: payment.amount,
        currency: payment.currency,
        responseCode: webhookData.response_code
      });

      // Marquer la donation comme complétée si nécessaire
      if (payment.donation && payment.donation.status !== 'completed') {
        payment.donation.status = 'completed';
        payment.donation.completedAt = new Date();
        await payment.donation.save();
        
        console.log('✅ PayDunya: Donation marquée comme complétée:', payment.donation._id);
      }

      // Envoyer email de confirmation
      try {
        if (payment.user && payment.user.email && payment.donation) {
          await emailService.sendDonationConfirmation(
            payment.user.email,
            {
              donorName: payment.user.name,
              amount: payment.amount,
              currency: payment.currency,
              donationTitle: payment.donation.title,
              transactionId: payment.paydunya.transactionId,
              paymentMethod: 'PayDunya - ' + payment.paydunya.paymentMethod
            }
          );
          console.log('📧 PayDunya: Email de confirmation envoyé à:', payment.user.email);
        }
      } catch (emailError) {
        console.error('❌ PayDunya: Erreur envoi email:', emailError);
        // Ne pas faire échouer le webhook à cause de l'email
      }

      // Notification WebSocket si disponible
      try {
        if (websocketService && payment.user) {
          await websocketService.sendPaymentUpdate(payment.user._id, {
            paymentId: payment._id,
            status: 'completed',
            provider: 'paydunya',
            amount: payment.amount,
            currency: payment.currency
          });
          console.log('📡 PayDunya: Notification WebSocket envoyée pour:', payment.user._id);
        }
      } catch (wsError) {
        console.error('❌ PayDunya: Erreur WebSocket:', wsError);
        // Ne pas faire échouer le webhook à cause de WebSocket
      }

    } else if (webhookResult.status === 'failed') {
      console.log('❌ PayDunya: Paiement échoué pour token:', webhookData.token);

      // Mettre à jour le paiement
      payment.status = 'failed';
      payment.paydunya.status = 'failed';
      payment.paydunya.responseCode = webhookData.response_code;
      payment.paydunya.responseText = webhookData.response_text || 'Paiement PayDunya échoué';
      payment.paydunya.failedAt = new Date();
      
      // Ajouter à l'historique
      payment.addToHistory('failed', 'Paiement PayDunya échoué via webhook', webhookData.token, {
        provider: 'paydunya',
        paymentMethod: payment.paydunya.paymentMethod,
        responseCode: webhookData.response_code,
        responseText: webhookData.response_text
      });

      // Marquer la donation comme échouée si nécessaire
      if (payment.donation && payment.donation.status !== 'failed') {
        payment.donation.status = 'pending'; // Garder en pending pour permettre un autre essai
        await payment.donation.save();
      }

    } else {
      console.log('ℹ️ PayDunya: Statut intermédiaire pour token:', webhookData.token, 'Statut:', webhookResult.status);
      
      // Mettre à jour uniquement le statut PayDunya interne
      payment.paydunya.responseCode = webhookData.response_code;
      payment.paydunya.responseText = webhookData.response_text;
      
      // Ajouter à l'historique sans changer le statut principal
      payment.addToHistory('info', `Webhook PayDunya: ${webhookResult.status}`, webhookData.token, {
        provider: 'paydunya',
        responseCode: webhookData.response_code,
        responseText: webhookData.response_text
      });
    }

    // Sauvegarder le paiement
    await payment.save();

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

module.exports = router; 