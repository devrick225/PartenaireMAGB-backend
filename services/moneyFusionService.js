const { FusionPay } = require('fusionpay');
const websocketService = require('./websocketService');

class MoneyFusionService {
  constructor() {
    this.apiUrl = process.env.MONEYFUSION_API_URL || 'https://www.pay.moneyfusion.net/PartenaireMAGB/f8a52ddfb11ee657/pay/';
    this.webhookCheckUrl = 'https://www.pay.moneyfusion.net/paiementNotif';
    this.retryAttempts = 3;
    this.retryDelay = 5000; // 5 secondes
  }

  /**
   * Initialiser un paiement MoneyFusion
   */
  async initializePayment({
    amount,
    currency,
    customerInfo,
    donationId,
    callbackUrl,
    description = 'Don PARTENAIRE MAGB'
  }) {
    try {
      // Créer une instance FusionPay
      const payment = new FusionPay(this.apiUrl);

      console.log('customerInfo', customerInfo);

      // Configurer le paiement avec l'API fluide
      payment
        .totalPrice(parseFloat(amount))
        .addArticle(description, parseFloat(amount))
        .clientName(`${customerInfo.name} ${customerInfo.surname}`)
        .clientNumber(customerInfo.phone)
        .addInfo({
          donation_id: donationId,
          customer_email: customerInfo.email,
          currency: currency,
          platform: 'partenaire-magb',
          type: 'donation'
        })
        .returnUrl(`${process.env.FRONTEND_URL}/payment/success?provider=moneyfusion`)
        //.webhookUrl(`${process.env.BACKEND_URL || process.env.FRONTEND_URL}/api/webhooks/moneyfusion`);

      // Effectuer le paiement
      const response = await payment.makePayment();

      if (response.statut) {
        return {
          success: true,
          transactionId: response.token,
          paymentUrl: response.url,
          token: response.token,
          message: response.message || 'Paiement initialisé avec succès'
        };
      } else {
        console.log('response', response);
        throw new Error(response.message || 'Erreur lors de l\'initialisation du paiement');
      }
    } catch (error) {
      console.log('error', error);
      console.error('Erreur MoneyFusion initializePayment:', error.message);
      throw new Error(`Erreur MoneyFusion: ${error.message}`);
    }
  }

  /**
   * Vérifier le statut d'un paiement avec retry automatique
   */
  async verifyPayment(token, paymentRecord = null) {
    let lastError = null;
    
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        console.log(`🔍 MoneyFusion - Tentative de vérification ${attempt}/${this.retryAttempts} pour token: ${token}`);
        
        const payment = new FusionPay(this.apiUrl);
        const response = await payment.checkPaymentStatus(token);

        if (response.statut && response.data) {
          const paymentData = response.data;
          const isSuccess = paymentData.statut === 'paid';
          const isFailed = ['failed', 'no paid', 'cancelled'].includes(paymentData.statut);
          const newStatus = this.mapStatus(paymentData.statut);

          // Notifier via WebSocket si le statut a changé
          if (paymentRecord && paymentRecord.status !== newStatus) {
            try {
              websocketService.notifyPaymentStatusUpdate(paymentRecord, paymentRecord.status, newStatus);
            } catch (wsError) {
              console.warn('⚠️ Erreur notification WebSocket:', wsError.message);
            }
          }

          const result = {
            success: isSuccess,
            status: newStatus,
            transactionId: token,
            reference: paymentData.numeroTransaction,
            amount: paymentData.Montant,
            fees: paymentData.frais || 0,
            customerInfo: {
              name: paymentData.nomclient,
              phone: paymentData.numeroSend
            },
            completedAt: paymentData.createdAt,
            paymentMethod: paymentData.moyen || 'unknown',
            customData: paymentData.personal_Info || [],
            message: response.message || (isSuccess ? 'Paiement vérifié avec succès' : 'Paiement non confirmé'),
            metadata: {
              provider: 'moneyfusion',
              verificationAttempt: attempt,
              originalResponse: response
            }
          };

          console.log(`✅ MoneyFusion - Vérification réussie: ${newStatus} (tentative ${attempt})`);
          return result;
        } else {
          lastError = new Error(response.message || 'Réponse invalide de MoneyFusion');
          console.warn(`⚠️ MoneyFusion - Tentative ${attempt} échouée:`, lastError.message);
        }
      } catch (error) {
        lastError = error;
        console.error(`❌ MoneyFusion - Erreur tentative ${attempt}:`, error.message);
        
        // Attendre avant le retry (sauf dernière tentative)
        if (attempt < this.retryAttempts) {
          console.log(`⏳ Attente ${this.retryDelay}ms avant retry...`);
          await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        }
      }
    }

    // Toutes les tentatives ont échoué
    console.error(`❌ MoneyFusion - Échec définitif après ${this.retryAttempts} tentatives pour token: ${token}`);
    
    // Notifier l'échec via WebSocket
    if (paymentRecord) {
      try {
        websocketService.notifyPaymentFailed(
          paymentRecord, 
          paymentRecord.donation,
          { 
            message: `Échec vérification MoneyFusion après ${this.retryAttempts} tentatives`,
            code: 'VERIFICATION_FAILED',
            originalError: lastError?.message
          }
        );
      } catch (wsError) {
        console.warn('⚠️ Erreur notification WebSocket échec:', wsError.message);
      }
    }

    return {
      success: false,
      status: 'failed',
      message: `Échec de vérification après ${this.retryAttempts} tentatives: ${lastError?.message || 'Erreur inconnue'}`,
      metadata: {
        provider: 'moneyfusion',
        totalAttempts: this.retryAttempts,
        lastError: lastError?.message
      }
    };
  }

  /**
   * Mapper les statuts MoneyFusion vers nos statuts internes
   */
  mapStatus(moneyFusionStatus) {
    const statusMap = {
      'paid': 'completed',
      'pending': 'pending',
      'failed': 'failed',
      'no paid': 'failed',
      'cancelled': 'cancelled'
    };

    return statusMap[moneyFusionStatus] || 'pending';
  }

  /**
   * Traiter les notifications webhook MoneyFusion
   */
  async processWebhook(webhookData, signature = null, timestamp = null) {
    try {
      console.log('🔔 MoneyFusion - Traitement webhook:', webhookData);

      // Validation de base des données webhook
      if (!webhookData || typeof webhookData !== 'object') {
        throw new Error('Données webhook invalides');
      }

      // MoneyFusion envoie les données directement dans le webhook
      const { 
        tokenPay, 
        statut, 
        numeroTransaction, 
        Montant, 
        frais,
        nomclient,
        numeroSend,
        personal_Info,
        moyen,
        createdAt 
      } = webhookData;

      // Validation des champs requis
      if (!tokenPay || !statut) {
        throw new Error('Champs requis manquants dans le webhook MoneyFusion');
      }

      const eventType = this.getWebhookEventType(statut);
      const mappedStatus = this.mapStatus(statut);

      console.log(`📨 MoneyFusion - Webhook ${eventType} pour transaction ${tokenPay} (statut: ${statut} -> ${mappedStatus})`);

      const result = {
        type: eventType,
        transactionId: tokenPay,
        status: mappedStatus,
        data: {
          reference: numeroTransaction,
          amount: parseFloat(Montant) || 0,
          fees: parseFloat(frais) || 0,
          customerName: nomclient,
          customerPhone: numeroSend,
          paymentMethod: moyen,
          customData: personal_Info || [],
          completedAt: createdAt,
          originalStatus: statut,
          provider: 'moneyfusion',
          webhookTimestamp: new Date().toISOString()
        }
      };

      // Notifier via WebSocket selon le type d'événement
      try {
        websocketService.notifyWebhookReceived(tokenPay, 'moneyfusion', mappedStatus, webhookData);
      } catch (wsError) {
        console.warn('⚠️ Erreur notification WebSocket webhook:', wsError.message);
      }

      return result;
    } catch (error) {
      console.error('❌ Erreur traitement webhook MoneyFusion:', error);
      throw error;
    }
  }

  /**
   * Déterminer le type d'événement webhook selon le statut
   */
  getWebhookEventType(statut) {
    switch (statut) {
      case 'paid':
        return 'payment_completed';
      case 'failed':
      case 'no paid':
        return 'payment_failed';
      case 'pending':
        return 'payment_pending';
      case 'cancelled':
        return 'payment_cancelled';
      default:
        return 'payment_updated';
    }
  }

  /**
   * Calculer les frais MoneyFusion (estimation)
   */
  calculateFees(amount, currency = 'XOF') {
    // Frais estimés MoneyFusion (à ajuster selon la documentation officielle)
    const feePercentage = 2.5; // 2.5%
    const fixedFee = currency === 'XOF' ? 125 : 0.4;

    const percentageFee = (amount * feePercentage) / 100;
    const totalFee = percentageFee + fixedFee;

    return {
      percentageFee: Math.round(percentageFee),
      fixedFee: Math.round(fixedFee),
      totalFee: Math.round(totalFee),
      feePercentage,
      netAmount: Math.round(amount - totalFee)
    };
  }

  /**
   * Valider la configuration du service
   */
  validateConfiguration() {
    if (!this.apiUrl) {
      throw new Error('MONEYFUSION_API_URL manquant dans la configuration');
    }

    return {
      valid: true,
      apiUrl: this.apiUrl,
      webhookCheckUrl: this.webhookCheckUrl
    };
  }

  /**
   * Vérifier automatiquement les paiements en attente et marquer comme échoués si nécessaire
   */
  async checkPendingPayments(maxAge = 24) { // 24 heures par défaut
    try {
      const Payment = require('../models/Payment');
      const Donation = require('../models/Donation');
      
      // Trouver les paiements MoneyFusion en attente depuis plus de maxAge heures
      const cutoffDate = new Date(Date.now() - (maxAge * 60 * 60 * 1000));
      
      const pendingPayments = await Payment.find({
        provider: 'moneyfusion',
        status: { $in: ['pending', 'processing'] },
        createdAt: { $lt: cutoffDate }
      }).populate('donation user');

      console.log(`🔍 MoneyFusion - Vérification de ${pendingPayments.length} paiements en attente`);

      const results = {
        checked: 0,
        completed: 0,
        failed: 0,
        errors: 0
      };

      for (const payment of pendingPayments) {
        try {
          results.checked++;
          
          // Vérifier le statut auprès de MoneyFusion
          const verificationResult = await this.verifyPayment(payment.transactionId, payment);
          
          if (verificationResult.success && verificationResult.status === 'completed') {
            // Marquer comme complété
            await payment.markCompleted({
              moneyfusion: {
                ...payment.moneyfusion,
                status: 'completed',
                completedAt: new Date(),
                verificationData: verificationResult
              }
            });

            // Mettre à jour la donation
            if (payment.donation) {
              payment.donation.status = 'completed';
              await payment.donation.save();

              // Mettre à jour les stats utilisateur
              if (payment.user) {
                await payment.user.updateDonationStats(payment.amount);
              }

              // Notifier via WebSocket
              websocketService.notifyPaymentCompleted(payment, payment.donation);
            }

            results.completed++;
            console.log(`✅ Paiement ${payment._id} marqué comme complété`);
            
          } else if (verificationResult.status === 'failed') {
            // Marquer comme échoué
            await payment.markFailed(
              verificationResult.message || 'Paiement échoué selon MoneyFusion',
              'PAYMENT_FAILED'
            );

            // Mettre à jour la donation
            if (payment.donation) {
              payment.donation.status = 'failed';
              await payment.donation.save();

              // Notifier via WebSocket
              websocketService.notifyPaymentFailed(
                payment, 
                payment.donation,
                { 
                  message: verificationResult.message,
                  code: 'PAYMENT_VERIFICATION_FAILED'
                }
              );
            }

            results.failed++;
            console.log(`❌ Paiement ${payment._id} marqué comme échoué`);
          }
          
        } catch (error) {
          results.errors++;
          console.error(`❌ Erreur vérification paiement ${payment._id}:`, error.message);
        }
      }

      console.log(`🔍 MoneyFusion - Vérification terminée:`, results);
      return results;

    } catch (error) {
      console.error('❌ Erreur vérification paiements en attente:', error);
      throw error;
    }
  }

  /**
   * Tester la connexion (simple validation)
   */
  async testConnection() {
    try {
      // Test basique - MoneyFusion n'a pas d'endpoint de health check
      const testPayment = new FusionPay(this.apiUrl);
      
      return {
        success: true,
        message: 'Configuration MoneyFusion valide',
        timestamp: new Date().toISOString(),
        apiUrl: this.apiUrl
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = new MoneyFusionService(); 