const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const Payment = require('../models/Payment');
const Donation = require('../models/Donation');
const User = require('../models/User');
const paymentService = require('../services/paymentService');
const fusionPayService = require('../services/fusionPayService');
const moneyFusionService = require('../services/moneyFusionService');
const emailService = require('../services/emailService');

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

    const { donationId, provider, paymentMethod, customerPhone } = req.body;

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

    // Créer l'entrée de paiement
    const payment = await Payment.create({
      user: req.user.id,
      donation: donationId,
      amount: donation.amount,
      currency: donation.currency,
      paymentMethod,
      provider,
      status: 'pending'
    });

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
      name: req.user.firstName,
      surname: req.user.lastName,
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
            callbackUrl: `${process.env.FRONTEND_URL}/payment/callback`
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
            callbackUrl: `${process.env.FRONTEND_URL}/payment/callback`
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
            callbackUrl: `${process.env.FRONTEND_URL}/payment/callback`,
            paymentMethod,
            description: `Don ${donation.category} - PARTENAIRE MAGB`
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
          initializationResult = await moneyFusionService.initializePayment({
            amount: donation.amount,
            currency: donation.currency,
            customerInfo,
            donationId,
            callbackUrl: `${process.env.FRONTEND_URL}/payment/callback`,
            description: `Don ${donation.category} - PARTENAIRE MAGB`
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
      
      // Marquer le paiement comme échoué
      payment.markFailed(paymentError.message);
      
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
        payment
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
            payment.moneyfusion.token
          );
          break;

        default:
          return res.status(400).json({
            success: false,
            error: 'Vérification non supportée pour ce fournisseur'
          });
      }

      if (verificationResult.success) {
        // Marquer le paiement comme complété
        await payment.markCompleted({
          [payment.provider]: verificationResult.data
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

        res.json({
          success: true,
          message: 'Paiement vérifié et complété avec succès',
          data: {
            status: payment.status,
            verifiedAt: payment.transaction.completedAt
          }
        });
      } else {
        // Marquer comme échoué
        await payment.markFailed(verificationResult.message || 'Vérification échouée');

        res.status(400).json({
          success: false,
          error: 'Paiement non confirmé',
          details: verificationResult.message
        });
      }

    } catch (verificationError) {
      console.error('Erreur vérification paiement:', verificationError);
      await payment.markFailed(verificationError.message);

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
    const { id } = req.params;
    const { amount, reason } = req.body;

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

    if (payment.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Seuls les paiements complétés peuvent être remboursés'
      });
    }

    try {
      const refundResult = await paymentService.processRefund(payment, amount, reason);

      if (refundResult.success) {
        // Initier le remboursement
        await payment.initiateRefund(amount || payment.amount, reason);

        res.json({
          success: true,
          message: 'Remboursement initié avec succès',
          data: {
            refundId: refundResult.refundId,
            amount: refundResult.amount,
            status: refundResult.status
          }
        });
      } else {
        res.status(400).json({
          success: false,
          error: 'Erreur lors du remboursement'
        });
      }

    } catch (refundError) {
      console.error('Erreur remboursement:', refundError);
      res.status(500).json({
        success: false,
        error: `Erreur lors du remboursement: ${refundError.message}`
      });
    }

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
      // Utilisateur normal : seulement ses propres paiements
      baseFilter.user = req.user.id;
    }
    if (provider) baseFilter.provider = provider;

    // Statistiques générales
    const [generalStats] = await Payment.aggregate([
      { $match: baseFilter },
      {
        $group: {
          _id: null,
          totalVolume: { $sum: '$amount' },
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
          totalAmount: { $sum: '$amount' },
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
      page: parseInt(page),
      limit: parseInt(limit),
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
        payments: payments.docs,
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

module.exports = {
  initializePayment,
  getPayment,
  verifyPayment,
  refundPayment,
  getPaymentStats,
  getPayments
}; 