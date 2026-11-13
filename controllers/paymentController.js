const { amountInXofExpr } = require('../utils/currency');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const Payment = require('../models/Payment');
const Donation = require('../models/Donation');
const User = require('../models/User');
const paymentService = require('../services/paymentService');
const fusionPayService = require('../services/fusionPayService');
const moneyFusionService = require('../services/moneyFusionService');
const paydunyaService = require('../services/paydunyaService');
const geniusPayService = require('../services/geniusPayService');
const {
  completePayment,
  failPayment,
  reserveRefund,
  cancelRefundReservation,
  finalizeRefund
} = require('../services/paymentCompletionService');

const PAYMENT_STAFF_ROLES = ['admin', 'moderator', 'treasurer'];
const PROVIDER_KEYS = ['cinetpay', 'stripe', 'paypal', 'paydunya', 'fusionpay', 'moneyfusion', 'geniuspay', 'mobileMoney'];
// Données brutes des fournisseurs : utiles au diagnostic, inutiles (et lourdes) pour l'application
const RAW_PROVIDER_FIELDS = ['apiResponse', 'rawResponse', 'metadata', 'customData', 'designVars', 'facilitatorAccessToken'];

/**
 * Version d'un paiement renvoyée au client.
 * - listes : jamais les payloads de webhooks ni les réponses brutes ;
 * - donateur : pas non plus l'historique technique, les tentatives ni les infos de sécurité.
 * Les champs dont les applications se servent (token, référence, URL de paiement,
 * statut, montants) sont conservés.
 */
const toClientPayment = (payment, user, { list = false } = {}) => {
  const data = typeof payment.toObject === 'function' ? payment.toObject() : { ...payment };
  const isStaff = PAYMENT_STAFF_ROLES.includes(user.role);

  if (!isStaff || list) {
    delete data.webhooks;
    PROVIDER_KEYS.forEach(provider => {
      if (data[provider]) RAW_PROVIDER_FIELDS.forEach(field => delete data[provider][field]);
    });
  }

  if (!isStaff) {
    delete data.attempts;
    delete data.security;
    data.history = (data.history || []).map(({ action, description, performedAt }) => ({ action, description, performedAt }));
  }

  return data;
};

// Fonction utilitaire pour générer l'URL de callback mobile
const generateMobileCallbackUrl = (transactionId, donationId, status = 'completed') => {
  return `partenaireMagb://payment/return?transactionId=${transactionId}&donationId=${donationId}&status=${status}`;
};

// Fonction pour générer l'URL de callback après initialisation
const generateCallbackUrlAfterInit = (initializationResult, donationId, provider) => {
  const transactionId = initializationResult.transactionId || 
                       initializationResult.paymentIntentId || 
                       initializationResult.orderId || 
                       initializationResult.token ||
                       `${provider.toUpperCase()}_${Date.now()}`;
  
  return generateMobileCallbackUrl(transactionId, donationId);
};

// Fonction utilitaire pour générer l'URL de callback web (fallback)
const generateWebCallbackUrl = (transactionId, donationId, status = 'completed') => {
  const baseUrl = process.env.FRONTEND_URL || 'https://partenairemagb.com';
  return `${baseUrl}/payment/callback?transactionId=${transactionId}&donationId=${donationId}&status=${status}`;
};

// @desc    Initialiser un paiement
// @route   POST /api/payments/initialize
// @access  Private
const initializePayment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Données invalides',
        details: errors.array()
      });
    }

    const { donationId, provider, paymentMethod, customerPhone, existingPaymentId } = req.body;

    // Vérifier que la donation existe et appartient à l'utilisateur
    const donation = await Donation.findById(donationId);
    if (!donation) {
      return res.status(404).json({
        success: false,
        error: 'Donation non trouvée'
      });
    }

    if (donation.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Accès non autorisé à cette donation'
      });
    }

    // Un don déjà réglé ou annulé ne doit pas pouvoir être payé une seconde fois.
    // Les échéances d'un don récurrent sont des dons distincts (voir recurringDonationService).
    if (['completed', 'refunded', 'cancelled'].includes(donation.status)) {
      return res.status(409).json({
        success: false,
        error: donation.status === 'completed'
          ? 'Ce don a déjà été payé'
          : 'Ce don ne peut plus être payé',
        code: 'DONATION_NOT_PAYABLE'
      });
    }

    let payment;

    // Vérifier si on doit mettre à jour un paiement existant ou en créer un nouveau
    if (existingPaymentId) {
      // Mode mise à jour : utiliser le paiement existant
      console.log(`💡 Backend: Mode mise à jour, paiement existant: ${existingPaymentId}`);
      
      payment = await Payment.findById(existingPaymentId);
      if (!payment) {
        return res.status(404).json({
          success: false,
          error: 'Paiement existant non trouvé'
        });
      }

      if (payment.user.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'Accès non autorisé à ce paiement'
        });
      }

      if (payment.donation.toString() !== donation._id.toString()) {
        return res.status(400).json({
          success: false,
          error: 'Ce paiement ne correspond pas à cette donation'
        });
      }

      // Ne jamais réinitialiser un paiement encaissé ou remboursé
      if (['completed', 'refunded', 'partially_refunded'].includes(payment.status)) {
        return res.status(409).json({
          success: false,
          error: 'Ce paiement est déjà finalisé',
          code: 'PAYMENT_ALREADY_FINALIZED'
        });
      }

      // Mettre à jour les champs nécessaires
      payment.paymentMethod = paymentMethod;
      payment.provider = provider;
      payment.status = 'pending'; // Réinitialiser le statut
      
      console.log(`🔄 Backend: Mise à jour paiement ${existingPaymentId} avec ${provider}`);
    } else {
      // Mode création : créer un nouveau paiement
      console.log(`✨ Backend: Création nouveau paiement pour donation ${donationId}`);
      
      payment = await Payment.create({
        user: req.user.id,
        donation: donationId,
        amount: donation.amount,
        currency: donation.currency,
        paymentMethod,
        provider,
        status: 'pending'
      });
    }

    // Calculer les frais
    const fees = paymentService.calculateFees(donation.amount, provider, donation.currency);
    payment.fees = {
      processingFee: fees.totalFee,
      platformFee: 0, // Peut être configuré
      currency: donation.currency
    };

    // Préparer les données client
    const customerInfo = {
      userId: req.user.id,
      name: req.user.fullName, // Utiliser le nom complet au lieu de séparer firstName/lastName
      surname: '', // Vide car nous utilisons le nom complet dans name
      email: req.user.email,
      phone: customerPhone || req.user.phone,
      address: '',
      city: req.user.city,
      country: req.user.country
    };



    let initializationResult;

    try {
      // Initialiser le paiement selon le fournisseur
      switch (provider) {
        case 'cinetpay':
          initializationResult = await paymentService.initializeCinetPayPayment({
            amount: donation.amount,
            currency: donation.currency,
            customerInfo,
            donationId,
            callbackUrl: generateMobileCallbackUrl('CINETPAY_' + Date.now(), donationId)
          });

          payment.cinetpay = {
            transactionId: initializationResult.transactionId,
            paymentUrl: initializationResult.paymentUrl,
            paymentToken: initializationResult.paymentToken
          };
          break;

        case 'stripe':
          initializationResult = await paymentService.initializeStripePayment({
            amount: donation.amount,
            currency: donation.currency,
            customerInfo,
            donationId,
            paymentMethod: 'card'
          });

          payment.stripe = {
            paymentIntentId: initializationResult.paymentIntentId,
            clientSecret: initializationResult.clientSecret,
            customerId: initializationResult.customerId
          };
          break;

        case 'paypal':
          initializationResult = await paymentService.initializePayPalPayment({
            amount: donation.amount,
            currency: donation.currency,
            donationId,
            callbackUrl: `${process.env.FRONTEND_URL || process.env.FRONTEND_URL_PROD}/callback?donationId=${donationId}&provider=paypal`
          });

          payment.paypal = {
            orderId: initializationResult.orderId,
            approvalUrl: initializationResult.approvalUrl
          };
          break;

        case 'fusionpay':
          initializationResult = await fusionPayService.initializePayment({
            amount: donation.amount,
            currency: donation.currency,
            customerInfo,
            donationId,
            callbackUrl: generateMobileCallbackUrl('FUSIONPAY_' + Date.now(), donationId),
            paymentMethod,
            description: 'DON PARTENAIRE MAGB'
          });

          payment.fusionpay = {
            transactionId: initializationResult.transactionId,
            reference: initializationResult.reference,
            paymentUrl: initializationResult.paymentUrl,
            status: initializationResult.status,
            paymentMethod: paymentMethod,
            customerInfo,
            expiresAt: initializationResult.expiresAt,
            fees: fusionPayService.calculateFees(donation.amount, donation.currency, paymentMethod)
          };
          break;

        case 'moneyfusion':
          // Déterminer la plateforme (web ou mobile) via le header ou le body
          const platform = req.body.platform || (req.headers['user-agent']?.match(/Mobile|Android|iPhone/i) ? 'mobile' : 'web');
          
          initializationResult = await moneyFusionService.initializePayment({
            amount: donation.amount,
            currency: donation.currency,
            customerInfo,
            donationId,
            callbackUrl: platform,
            description: 'DON PARTENAIRE MAGB'
          });

          payment.moneyfusion = {
            token: initializationResult.transactionId,
            paymentUrl: initializationResult.paymentUrl,
            status: 'pending',
            customerInfo: {
              name: `${customerInfo.name} ${customerInfo.surname}`,
              phone: customerInfo.phone
            },
            fees: moneyFusionService.calculateFees(donation.amount, donation.currency),
            metadata: {
              donation_id: donationId,
              customer_email: customerInfo.email,
              currency: donation.currency,
              platform: 'partenaire-magb',
              type: 'donation'
            }
          };
          break;

        case 'geniuspay':
          initializationResult = await geniusPayService.initializePayment({
            amount: donation.amount,
            currency: donation.currency,
            customerInfo,
            donationId,
            description: 'DON PARTENAIRE MAGB'
          });

          payment.geniuspay = {
            reference: initializationResult.reference,
            paymentUrl: initializationResult.paymentUrl,
            status: 'pending',
            customerInfo: {
              name: `${customerInfo.name} ${customerInfo.surname || ''}`.trim(),
              phone: customerInfo.phone,
              email: customerInfo.email,
              country: customerInfo.country
            },
            fees: initializationResult.fees,
            netAmount: initializationResult.netAmount,
            metadata: {
              donation_id: donationId,
              customer_email: customerInfo.email,
              currency: donation.currency,
              platform: 'partenaire-magb',
              type: 'donation'
            }
          };
          break;

        case 'paydunya':
          // Initialiser le paiement PayDunya
          console.log('🔄 Initialisation paiement PayDunya:', {
            amount: donation.amount,
            currency: donation.currency,
            donationId,
            paymentMethod
          });
          
          const paydunyaCallbackUrl = generateMobileCallbackUrl('PAYDUNYA_' + Date.now(), donationId);
          
          try {
            initializationResult = await paydunyaService.initializePayment({
              amount: donation.amount,
              currency: donation.currency,
              customerInfo,
              donationId,
              callbackUrl: paydunyaCallbackUrl,
              paymentMethod,
              description: 'DON PARTENAIRE MAGB'
            });
            
            console.log('✅ Paiement PayDunya initialisé:', {
              transactionId: initializationResult.transactionId,
              paydunyaToken: initializationResult.paydunyaToken
            });
          } catch (paydunyaError) {
            console.error('❌ Erreur initialisation PayDunya:', paydunyaError);
            return res.status(500).json({
              success: false,
              error: `Erreur lors de l'initialisation PayDunya: ${paydunyaError.message}`
            });
          }

          payment.paydunya = {
            token: initializationResult.paydunyaToken,
            transactionId: initializationResult.transactionId,
            paymentUrl: initializationResult.paymentUrl,
            invoiceUrl: initializationResult.invoice_url,
            status: 'pending',
            responseCode: null,
            responseText: null,
            paymentMethod: paymentMethod,
            customerInfo: {
              name: `${customerInfo.name} ${customerInfo.surname || ''}`.trim(),
              email: customerInfo.email,
              phone: customerInfo.phone
            },
            fees: paydunyaService.calculateFees(donation.amount, donation.currency, paymentMethod),
            expiresAt: initializationResult.expiresAt,
            
            // Données de la facture PayDunya
            invoice: {
              totalAmount: donation.amount,
              description: 'DON PARTENAIRE MAGB',
              currency: donation.currency
            },
            
            // Données personnalisées
            customData: {
              donationId: donationId,
              customerId: req.user.id,
              platform: 'partenaire-magb',
              transactionId: initializationResult.transactionId
            },
            
            // Réponse API complète pour debug
            rawResponse: initializationResult.rawResponse,
            
            metadata: {
              donation_id: donationId,
              customer_email: customerInfo.email,
              currency: donation.currency,
              platform: 'partenaire-magb',
              type: 'donation',
              payment_method: paymentMethod
            }
          };
          break;

        case 'orange_money':
        case 'mtn_mobile_money':
        case 'moov_money':
          initializationResult = await paymentService.initializeMobileMoneyPayment({
            provider: provider.replace('_mobile_money', '').replace('_money', ''),
            amount: donation.amount,
            currency: donation.currency,
            customerPhone: customerPhone,
            donationId
          });

          payment.mobileMoney = {
            provider: provider.replace('_mobile_money', '').replace('_money', ''),
            transactionId: initializationResult.transactionId,
            customerPhone: customerPhone
          };
          break;

        default:
          return res.status(400).json({
            success: false,
            error: 'Fournisseur de paiement non supporté'
          });
      }

      // Mettre à jour le statut
      payment.status = 'processing';
      payment.transaction.externalId = initializationResult.transactionId || initializationResult.paymentIntentId || initializationResult.orderId;
      
      // Ajouter à l'historique
      payment.addToHistory('initiated', `Paiement initié avec ${provider}`, null, initializationResult);
      
      await payment.save();

      // Lier le paiement à la donation si pas encore fait
      if (!donation.payment) {
        donation.payment = payment._id;
        await donation.save();
      }

      res.json({
        success: true,
        message: 'Paiement initialisé avec succès',
        data: {
          paymentId: payment._id,
          paymentUrl: initializationResult.paymentUrl || initializationResult.approvalUrl,
          clientSecret: initializationResult.clientSecret,
          transactionId: payment.transaction.externalId,
          provider,
          status: payment.status,
          fees: fees
        }
      });

    } catch (paymentError) {
      console.error(`Erreur initialisation paiement ${provider}:`, paymentError);
      
      // Marquer le paiement comme échoué (sans faire échouer la réponse si la sauvegarde échoue)
      try {
        await payment.markFailed(paymentError.message);
      } catch (saveError) {
        console.error('Erreur sauvegarde échec paiement:', saveError.message);
      }
      
      res.status(400).json({
        success: false,
        error: `Erreur lors de l'initialisation du paiement: ${paymentError.message}`
      });
    }

  } catch (error) {
    console.error('Erreur initializePayment:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'initialisation du paiement'
    });
  }
};

// @desc    Callback de paiement - redirige vers l'app mobile
// @route   GET /api/payments/callback
// @access  Public
const paymentCallback = async (req, res) => {
  try {
    const { transactionId, donationId, status, paymentId, provider, token, statut, platform } = req.query;
    
    let mappedStatus = 'pending';
    let resolvedDonationId = donationId;
    let resolvedPaymentId = paymentId;
    
    // Traitement MoneyFusion
    if (provider === 'moneyfusion' || token) {
      try {
        let payment;
        if (token) {
          payment = await Payment.findOne({ 'moneyfusion.token': token }).populate('donation');
        } else if (donationId) {
          payment = await Payment.findOne({ donation: donationId, provider: 'moneyfusion' }).sort({ createdAt: -1 }).populate('donation');
        }
        
        if (payment) {
          resolvedDonationId = payment.donation?._id?.toString() || donationId;
          resolvedPaymentId = payment._id.toString();
          
          const mfStatus = statut || status;
          if (mfStatus === 'success' || mfStatus === 'completed' || mfStatus === 'paid') {
            mappedStatus = 'completed';
          } else if (mfStatus === 'failed' || mfStatus === 'error' || mfStatus === 'failure' || mfStatus === 'no paid') {
            mappedStatus = 'failed';
          } else if (mfStatus === 'cancelled') {
            mappedStatus = 'cancelled';
          }
          
          console.log('✅ Paiement trouvé:', { paymentId: payment._id, status: mappedStatus });
        } else {
          mappedStatus = 'failed';
          console.error('❌ Paiement MoneyFusion non trouvé:', { token, donationId });
        }
      } catch (error) {
        console.error('❌ Erreur traitement callback MoneyFusion:', error);
        mappedStatus = 'failed';
      }
    } else {
      mappedStatus = status || 'pending';
    }
    
    // Déterminer la destination: web frontend ou deep link mobile
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const callbackParams = `status=${mappedStatus}&donationId=${resolvedDonationId || ''}&paymentId=${resolvedPaymentId || ''}&transactionId=${token || transactionId || ''}`;
    
    // Si platform=web ou si le User-Agent est un navigateur desktop, rediriger vers le frontend web
    const isWeb = platform === 'web' || (!platform && !req.headers['user-agent']?.match(/Mobile|Android|iPhone/i));
    
    let redirectUrl;
    if (isWeb) {
      redirectUrl = `${frontendUrl}/paiements/callback?${callbackParams}`;
    } else {
      redirectUrl = generateMobileCallbackUrl(
        token || transactionId || 'UNKNOWN',
        resolvedDonationId || 'UNKNOWN',
        mappedStatus
      );
      if (resolvedPaymentId) redirectUrl += `&paymentId=${resolvedPaymentId}`;
    }
    
    console.log('🔗 Redirection vers:', redirectUrl);
    res.redirect(redirectUrl);
    
  } catch (error) {
    console.error('Erreur paymentCallback:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/paiements/callback?status=failed&error=callback_error`);
  }
};

// @desc    Obtenir les détails d'un paiement
// @route   GET /api/payments/:id
// @access  Private
const getPayment = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'ID de paiement invalide'
      });
    }

    const payment = await Payment.findById(id)
      .populate('user', 'firstName lastName email')
      .populate('donation', 'amount currency category type');

    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Paiement non trouvé'
      });
    }

    // Vérifier les permissions
    if (payment.user._id.toString() !== req.user.id && !['admin', 'moderator', 'treasurer'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Accès non autorisé à ce paiement'
      });
    }

    res.json({
      success: true,
      data: {
        payment: toClientPayment(payment, req.user)
      }
    });
  } catch (error) {
    console.error('Erreur getPayment:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération du paiement'
    });
  }
};

// @desc    Vérifier un paiement
// @route   POST /api/payments/:id/verify
// @access  Private
const verifyPayment = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'ID de paiement invalide'
      });
    }

    const payment = await Payment.findById(id)
      .populate('user', 'firstName lastName email')
      .populate('donation');

    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Paiement non trouvé'
      });
    }

    // Vérifier les permissions
    if (payment.user._id.toString() !== req.user.id && !['admin', 'moderator', 'treasurer'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Accès non autorisé à ce paiement'
      });
    }

    // Paiement déjà finalisé : ne pas ré-interroger le fournisseur ni recompter le don.
    // MoneyFusion est exclu car le client attend la réponse brute du fournisseur
    // (la mise à jour reste idempotente dans ce cas).
    if (payment.provider !== 'moneyfusion' && ['completed', 'refunded', 'partially_refunded'].includes(payment.status)) {
      return res.json({
        success: true,
        message: payment.status === 'completed' ? 'Paiement déjà confirmé' : 'Paiement remboursé',
        data: {
          status: payment.status,
          verifiedAt: payment.transaction?.completedAt
        }
      });
    }

    let verificationResult;

    try {
      // Vérifier selon le fournisseur
      switch (payment.provider) {
        case 'cinetpay':
          verificationResult = await paymentService.verifyCinetPayPayment(
            payment.cinetpay.transactionId
          );
          break;

        case 'stripe':
          verificationResult = await paymentService.confirmStripePayment(
            payment.stripe.paymentIntentId
          );
          break;

        case 'paypal':
          verificationResult = await paymentService.capturePayPalPayment(
            payment.paypal.orderId
          );
          break;

        case 'fusionpay':
          verificationResult = await fusionPayService.verifyPayment(
            payment.fusionpay.transactionId
          );
          break;

        case 'moneyfusion':
          verificationResult = await moneyFusionService.verifyPayment(
            payment.moneyfusion.token,
            payment
          );
          break;

        case 'geniuspay':
          verificationResult = await geniusPayService.verifyPayment(
            payment.geniuspay.reference,
            payment
          );
          break;

        case 'paydunya':
          if (!payment.paydunya?.token) {
            return res.status(400).json({
              success: false,
              error: 'Token PayDunya manquant pour ce paiement'
            });
          }
          verificationResult = await paydunyaService.checkPaymentStatus(payment.paydunya.token);
          break;

        default:
          return res.status(400).json({
            success: false,
            error: 'Vérification non supportée pour ce fournisseur'
          });
              }

        // Traitement spécial pour MoneyFusion avec la structure de réponse demandée
      if (payment.provider === 'moneyfusion') {
        // MoneyFusion retourne la structure complète avec originalResponse
        const originalResponse = verificationResult.metadata?.originalResponse;
        
        if (originalResponse && originalResponse.statut && originalResponse.data) {
          const moneyFusionData = originalResponse.data;
          
          // Note: La mise à jour des statuts de paiement et donation est déjà gérée 
          // automatiquement dans moneyFusionService.verifyPayment()

          // Retourner la structure exacte demandée par l'utilisateur
          return res.json({
            statut: originalResponse.statut,
            message: originalResponse.message || 'Vérification effectuée',
            data: {
              _id: moneyFusionData._id || payment._id,
              tokenPay: moneyFusionData.tokenPay,
              numeroSend: moneyFusionData.numeroSend,
              nomclient: moneyFusionData.nomclient,
              personal_Info: moneyFusionData.personal_Info || [],
              numeroTransaction: moneyFusionData.numeroTransaction,
              Montant: moneyFusionData.Montant,
              frais: moneyFusionData.frais,
              statut: moneyFusionData.statut,
              moyen: moneyFusionData.moyen,
              return_url: moneyFusionData.return_url || '',
              createdAt: moneyFusionData.createdAt
            }
          });
        } else {
          // Pas de réponse valide de MoneyFusion
          return res.status(400).json({
            statut: false,
            message: verificationResult.message || 'Impossible de vérifier le paiement',
            data: null
          });
        }
      } else if (payment.provider === 'geniuspay') {
        // Note: La mise à jour des statuts de paiement et donation est déjà gérée
        // automatiquement dans geniusPayService.verifyPayment()
        const status = verificationResult?.status || 'pending';

        return res.json({
          success: true,
          message: verificationResult.message || 'Vérification effectuée',
          data: {
            status,
            reference: verificationResult.reference,
            amount: verificationResult.amount,
            fees: verificationResult.fees,
            netAmount: verificationResult.netAmount,
            paymentMethod: verificationResult.paymentMethod,
            completedAt: verificationResult.completedAt
          }
        });
      } else if (payment.provider === 'paydunya') {
        const status = verificationResult?.status || 'pending';

        if (status === 'completed') {
          await completePayment(payment, {
            transactionId: payment.paydunya?.transactionId || payment.paydunya?.token,
            source: 'verify_paydunya',
            providerData: {
              paydunya: {
                status: 'completed',
                completedAt: new Date(),
                rawResponse: verificationResult.rawResponse
              }
            }
          });

          return res.json({
            success: true,
            message: 'Paiement PayDunya confirmé',
            data: {
              status: 'completed',
              verifiedAt: payment.transaction.completedAt || new Date()
            }
          });
        }

        // PayDunya ne distingue pas « en attente » de « non payé » sur cet endpoint :
        // on ne clôt pas le paiement, le client peut revérifier.
        return res.json({
          success: true,
          message: status === 'not_found'
            ? 'Transaction non encore visible côté fournisseur'
            : 'Paiement en attente de confirmation',
          data: {
            status: 'pending'
          }
        });
      } else {
        // Logique pour autres fournisseurs (CinetPay, Stripe, PayPal, FusionPay)
        if (verificationResult.success) {
          // Conserver les identifiants nécessaires à un futur remboursement
          const providerResponse = verificationResult.data || {};
          const providerData = {};
          if (payment.provider === 'paypal') {
            providerData.paypal = {
              captureId: providerResponse.purchase_units?.[0]?.payments?.captures?.[0]?.id,
              payerId: providerResponse.payer?.payer_id
            };
          } else if (payment.provider === 'stripe') {
            providerData.stripe = {
              chargeId: typeof providerResponse.latest_charge === 'string'
                ? providerResponse.latest_charge
                : providerResponse.latest_charge?.id
            };
          }

          await completePayment(payment, {
            transactionId: payment.transaction?.externalId,
            source: `verify_${payment.provider}`,
            providerData
          });

          res.json({
            success: true,
            message: 'Paiement vérifié et complété avec succès',
            data: {
              status: payment.status,
              verifiedAt: payment.transaction.completedAt
            }
          });
        } else {
          // Seuls les statuts explicitement terminaux clôturent le paiement. Un paiement
          // encore en cours chez le fournisseur (ou un fournisseur injoignable) reste en
          // attente : le marquer « échoué » ici faisait perdre des dons réellement payés.
          const providerStatus = String(verificationResult.status || '').toLowerCase();
          const TERMINAL_FAILURES = ['failed', 'refused', 'cancelled', 'canceled', 'voided', 'expired', 'declined'];

          if (!verificationResult.verificationError && TERMINAL_FAILURES.includes(providerStatus)) {
            await failPayment(payment, verificationResult.message || 'Paiement refusé par le fournisseur', {
              source: `verify_${payment.provider}`
            });

            return res.status(400).json({
              success: false,
              error: 'Paiement non confirmé',
              details: verificationResult.message
            });
          }

          res.json({
            success: true,
            message: 'Paiement en attente de confirmation',
            data: {
              status: 'pending',
              providerStatus: verificationResult.status
            }
          });
        }
      }

    } catch (verificationError) {
      // Une erreur technique (réseau, fournisseur indisponible) ne dit rien du paiement :
      // on ne le marque pas en échec.
      console.error('Erreur vérification paiement:', verificationError);

      res.status(500).json({
        success: false,
        error: 'Erreur lors de la vérification du paiement'
      });
    }

  } catch (error) {
    console.error('Erreur verifyPayment:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la vérification du paiement'
    });
  }
};

// @desc    Rembourser un paiement
// @route   POST /api/payments/:id/refund
// @access  Private (Admin/Treasurer)
const refundPayment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Données invalides',
        details: errors.array()
      });
    }

    const { id } = req.params;
    const { amount, reason, reference } = req.body;
    // manual : le donateur a été remboursé hors plateforme (mobile money, espèces…),
    // il s'agit seulement d'enregistrer le remboursement.
    const manual = req.body.manual === true || req.body.manual === 'true';

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'ID de paiement invalide'
      });
    }

    const payment = await Payment.findById(id);

    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Paiement non trouvé'
      });
    }

    if (!['completed', 'partially_refunded'].includes(payment.status)) {
      return res.status(400).json({
        success: false,
        error: 'Seuls les paiements complétés peuvent être remboursés'
      });
    }

    const alreadyRefunded = payment.refund?.amount || 0;
    const remaining = payment.amount - alreadyRefunded;
    const refundAmount = amount !== undefined && amount !== null && amount !== '' ? Number(amount) : remaining;

    if (!Number.isFinite(refundAmount) || refundAmount <= 0 || refundAmount > remaining) {
      return res.status(400).json({
        success: false,
        error: `Montant de remboursement invalide (reste remboursable : ${remaining} ${payment.currency})`
      });
    }

    // Réserver le montant avant d'appeler le fournisseur : deux demandes simultanées
    // ne peuvent pas rembourser plus que le paiement.
    const reserved = await reserveRefund(payment, refundAmount, reason);
    if (!reserved) {
      return res.status(409).json({
        success: false,
        error: 'Un remboursement est déjà en cours ou le montant dépasse le reste remboursable'
      });
    }

    let refundResult;
    try {
      if (manual) {
        refundResult = { success: true, refundId: reference || `MANUAL-${Date.now()}`, status: 'completed' };
      } else {
        const isFullRefund = alreadyRefunded === 0 && refundAmount === payment.amount;
        // Remboursement total : laisser le fournisseur rembourser exactement ce qu'il a débité
        refundResult = await paymentService.processRefund(payment, isFullRefund ? undefined : refundAmount, reason);
      }
    } catch (refundError) {
      await cancelRefundReservation(payment, refundAmount);
      console.error('Erreur remboursement:', refundError);
      return res.status(400).json({
        success: false,
        error: `Erreur lors du remboursement: ${refundError.message}`
      });
    }

    if (!refundResult?.success) {
      await cancelRefundReservation(payment, refundAmount);
      return res.status(400).json({
        success: false,
        error: 'Erreur lors du remboursement'
      });
    }

    const outcome = await finalizeRefund(reserved, refundAmount, {
      reason,
      refundId: refundResult.refundId,
      performedBy: req.user._id,
      manual
    });

    res.json({
      success: true,
      message: manual ? 'Remboursement manuel enregistré' : 'Remboursement effectué avec succès',
      data: {
        refundId: refundResult.refundId,
        amount: refundAmount,
        currency: payment.currency,
        status: refundResult.status,
        paymentStatus: outcome.paymentStatus,
        donationStatus: outcome.donationStatus,
        totalRefunded: outcome.totalRefunded
      }
    });

  } catch (error) {
    console.error('Erreur refundPayment:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du remboursement'
    });
  }
};

// @desc    Obtenir les statistiques des paiements
// @route   GET /api/payments/stats
// @access  Private (Tous les utilisateurs authentifiés)
const getPaymentStats = async (req, res) => {
  try {
    // Vérifier les erreurs de validation
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Données invalides',
        details: errors.array()
      });
    }

    const { period = 'month', provider } = req.query;
    const isAdmin = ['admin', 'treasurer'].includes(req.user.role);

    // Construire le filtre de date
    let dateFilter = {};
    const now = new Date();
    
    switch (period) {
      case 'week':
        dateFilter = { 
          createdAt: { 
            $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7) 
          } 
        };
        break;
      case 'month':
        dateFilter = { 
          createdAt: { 
            $gte: new Date(now.getFullYear(), now.getMonth(), 1) 
          } 
        };
        break;
      case 'year':
        dateFilter = { 
          createdAt: { 
            $gte: new Date(now.getFullYear(), 0, 1) 
          } 
        };
        break;
    }

    // Filtrer selon le rôle de l'utilisateur
    const baseFilter = { ...dateFilter };
    if (!isAdmin) {
      // Utilisateur normal : seulement ses propres paiements.
      // aggregate() ne convertit pas les chaînes en ObjectId : passer l'ObjectId directement.
      baseFilter.user = req.user._id;
    }
    if (provider) baseFilter.provider = provider;

    // Statistiques générales
    const [generalStats] = await Payment.aggregate([
      { $match: baseFilter },
      {
        $group: {
          _id: null,
          totalVolume: { $sum: amountInXofExpr() },
          totalTransactions: { $sum: 1 },
          completedTransactions: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          failedTransactions: {
            $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
          },
          totalFees: { $sum: '$fees.processingFee' }
        }
      }
    ]);

    // Répartition par fournisseur
    const providerStats = await Payment.aggregate([
      { $match: baseFilter },
      {
        $group: {
          _id: '$provider',
          count: { $sum: 1 },
          totalAmount: { $sum: amountInXofExpr() },
          successCount: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          }
        }
      },
      {
        $addFields: {
          successRate: {
            $multiply: [
              { $divide: ['$successCount', '$count'] },
              100
            ]
          }
        }
      }
    ]);

    // Transactions récentes (limitées selon le rôle)
    const recentTransactionsQuery = Payment.find(baseFilter)
      .populate('user', 'firstName lastName email')
      .populate('donation', 'category amount currency')
      .sort({ createdAt: -1 })
      .limit(isAdmin ? 10 : 5) // Admins voient plus de transactions
      .select('amount currency status provider createdAt transaction.reference');

    const recentTransactions = await recentTransactionsQuery;

    const successRate = generalStats?.totalTransactions > 0 
      ? (generalStats.completedTransactions / generalStats.totalTransactions) * 100 
      : 0;

    res.json({
      success: true,
      data: {
        stats: {
          totalVolume: generalStats?.totalVolume || 0,
          totalTransactions: generalStats?.totalTransactions || 0,
          successRate: Math.round(successRate * 100) / 100,
          totalFees: generalStats?.totalFees || 0,
          providerBreakdown: providerStats,
          recentTransactions,
          isPersonalStats: !isAdmin // Indiquer si ce sont des stats personnelles
        }
      }
    });
  } catch (error) {
    console.error('Erreur getPaymentStats:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des statistiques'
    });
  }
};

// @desc    Obtenir la liste des paiements
// @route   GET /api/payments
// @access  Private
const getPayments = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, provider } = req.query;
    const isAdmin = ['admin', 'moderator', 'treasurer'].includes(req.user.role);

    // Les utilisateurs normaux ne voient que leurs paiements
    const filter = isAdmin ? {} : { user: req.user.id };
    
    if (status) filter.status = status;
    if (provider) filter.provider = provider;

    const options = {
      page: Math.max(parseInt(page, 10) || 1, 1),
      limit: Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50),
      sort: { createdAt: -1 },
      populate: [
        { path: 'user', select: 'firstName lastName email' },
        { path: 'donation', select: 'amount currency category type' }
      ]
    };

    const payments = await Payment.paginate(filter, options);

    res.json({
      success: true,
      data: {
        payments: payments.docs.map(payment => toClientPayment(payment, req.user, { list: true })),
        pagination: {
          current: payments.page,
          total: payments.totalPages,
          pages: payments.totalPages,
          limit: payments.limit,
          totalDocs: payments.totalDocs
        }
      }
    });
  } catch (error) {
    console.error('Erreur getPayments:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des paiements'
    });
  }
};

// @desc    Obtenir les détails d'un paiement par donationId
// @route   GET /api/payments/donation/:donationId
// @access  Private
const getPaymentByDonationId = async (req, res) => {
  try {
    const { donationId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(donationId)) {
      return res.status(400).json({
        success: false,
        error: 'ID de donation invalide'
      });
    }

    // Le paiement le plus récent de la donation
    const payment = await Payment.findOne({ donation: donationId })
      .sort({ createdAt: -1 })
      .populate('donation', 'amount currency category type status')
      .populate('user', 'firstName lastName email');
    
    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found for this donation'
      });
    }

    // Vérifier que l'utilisateur a accès à ce paiement
    const ownerId = payment.user?._id?.toString();
    if (ownerId !== req.user.id && !['admin', 'moderator', 'treasurer'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Accès non autorisé à ce paiement'
      });
    }
    
    res.json({
      success: true,
      data: { payment: toClientPayment(payment, req.user) }
    });
  } catch (error) {
    console.error('Erreur getPaymentByDonationId:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération du paiement'
    });
  }
};

// @desc    Obtenir TOUS les paiements d'une donation (pour gestion des doublons)
// @route   GET /api/payments/donation/:donationId/all
// @access  Private
const getAllPaymentsByDonationId = async (req, res) => {
  try {
    const { donationId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(donationId)) {
      return res.status(400).json({
        success: false,
        error: 'ID de donation invalide'
      });
    }

    // Récupérer TOUS les paiements pour cette donation
    const payments = await Payment.find({ 
      donation: donationId 
    })
      .populate('donation', 'amount currency category type')
      .populate('user', 'firstName lastName email')
      .sort({ createdAt: -1 }); // Plus récent en premier

    // Vérifier que l'utilisateur a accès à ces paiements
    if (payments.length > 0) {
      const firstPayment = payments[0];
      if (firstPayment.user._id.toString() !== req.user.id && !['admin', 'moderator', 'treasurer'].includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          error: 'Accès non autorisé à ces paiements'
        });
      }
    }

    console.log(`🔍 getAllPaymentsByDonationId - Donation: ${donationId}, Paiements trouvés: ${payments.length}`);
    
    if (payments.length > 1) {
      console.warn(`⚠️ Backend: ${payments.length} paiements trouvés pour la donation ${donationId}`);
    }

    res.json({
      success: true,
      data: { 
        payments: payments.map(payment => toClientPayment(payment, req.user, { list: true })),
        count: payments.length,
        donationId 
      }
    });
  } catch (error) {
    console.error('Erreur getAllPaymentsByDonationId:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des paiements'
    });
  }
};

// @desc    Rapport de rapprochement paiements / dons / totaux des donateurs
// @route   GET /api/payments/reconciliation?days=1
// @access  Private (Admin/Treasurer)
const getReconciliationReport = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: 'Données invalides', details: errors.array() });
    }

    const report = await require('../services/reconciliationService').buildReport({ days: req.query.days });

    res.json({ success: true, data: report });
  } catch (error) {
    console.error('Erreur getReconciliationReport:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la génération du rapport de rapprochement'
    });
  }
};

module.exports = {
  getReconciliationReport,
  initializePayment,
  paymentCallback,
  getPayment,
  verifyPayment,
  refundPayment,
  getPaymentStats,
  getPayments,
  getPaymentByDonationId,
  getAllPaymentsByDonationId
}; 