const { FusionPay } = require('fusionpay');
const websocketService = require('./websocketService');
const { completePayment, failPayment } = require('./paymentCompletionService');

class MoneyFusionService {
  constructor() {
    this.apiUrl = process.env.MONEYFUSION_API_URL || 'https://pay.moneyfusion.net/PartenaireMAGB/549726019fa8e8e6/pay/';
    this.webhookCheckUrl = 'https://pay.moneyfusion.net/paiementNotif';
    this.retryAttempts = 3;
    this.retryDelay = 5000; // 5 secondes
  }

  /**
   * Générer l'URL de callback mobile pour MoneyFusion
   */
  generateMobileCallbackUrl(transactionId, donationId, status = 'completed') {
    return `partenaireMagb://payment/return?transactionId=${transactionId}&donationId=${donationId}&status=${status}`;
  }

  /**
   * Générer l'URL de callback web (fallback)
   */
  generateWebCallbackUrl(transactionId, donationId, status = 'completed') {
    const baseUrl = process.env.BACKEND_URL || process.env.FRONTEND_URL || 'https://partenairemagb.com';
    return `${baseUrl}/api/payments/callback?transactionId=${transactionId}&donationId=${donationId}&status=${status}&provider=moneyfusion`;
  }

  /**
   * Enrichir l'URL de paiement avec les informations du don
   */
  enrichPaymentUrl(baseUrl, donationData) {
    try {
      const { donationId, amount, currency, description, customerInfo } = donationData;
      
      // Vérifier si l'URL contient déjà des paramètres
      const hasParams = baseUrl.includes('?');
      const separator = hasParams ? '&' : '?';
      
      // Construire les paramètres enrichis
      const enrichedParams = [
        `donationId=${donationId}`,
        `amount=${amount}`,
        `currency=${currency}`,
        `description=${encodeURIComponent(description)}`,
        `customerName=${encodeURIComponent(customerInfo.name)}`,
        `customerEmail=${encodeURIComponent(customerInfo.email)}`,
        `platform=partenaire-magb`,
        `timestamp=${Date.now()}`
      ];
      
      const enrichedUrl = `${baseUrl}${separator}${enrichedParams.join('&')}`;
      
      return enrichedUrl;
    } catch (error) {
      console.error('❌ Erreur lors de l\'enrichissement de l\'URL:', error);
      return baseUrl; // Retourner l'URL originale en cas d'erreur
    }
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
    description = 'DON PARTENAIRE MAGB'
  }) {
    try {
      const payment = new FusionPay(this.apiUrl);

      // Résoudre l'URL publique du backend
      // Priorité: BACKEND_URL (prod) > VERCEL_URL (auto Vercel) > FRONTEND_URL > fallback
      const rawBackendUrl = process.env.BACKEND_URL 
        || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
        || process.env.FRONTEND_URL;

      // S'assurer que l'URL est bien HTTPS (requis par MoneyFusion)
      const publicBackendUrl = rawBackendUrl
        ? rawBackendUrl.replace(/^http:\/\/localhost(:\d+)?/, '').replace(/^http:\/\//, 'https://')
        : null;

      if (!publicBackendUrl || publicBackendUrl.includes('localhost')) {
        console.error('❌ BACKEND_URL non configuré ou pointe vers localhost. MoneyFusion ne peut pas accéder à cette URL.');
        console.error('   Configurez BACKEND_URL avec votre URL de production (ex: https://votre-api.vercel.app)');
        throw new Error('BACKEND_URL doit être une URL HTTPS publique pour MoneyFusion');
      }

      // return_url: MoneyFusion redirige l'utilisateur ici après le paiement.
      // On utilise une route backend intermédiaire qui redirige ensuite vers
      // le deep link de l'app mobile (partenaireMagb:// ou exp:// en dev).
      // Le deep link est passé en paramètre pour supporter Expo Go.
      // callbackUrl contient le deep link fourni par le mobile.
      const deepLinkParam = callbackUrl && callbackUrl.includes('://') 
        ? `&deepLink=${encodeURIComponent(callbackUrl)}`
        : '';
      const backendReturnUrl = `${publicBackendUrl}/api/payments/mobile-callback?donationId=${donationId}&provider=moneyfusion${deepLinkParam}`;
      const webhookUrl = `${publicBackendUrl}/api/webhooks/moneyfusion`;

      const cleanClientName = customerInfo.name.trim().replace(/\s+/g, ' ');
      
      payment
        .totalPrice(parseFloat(amount))
        .addArticle(description, parseFloat(amount))
        .clientName(cleanClientName)
        .clientNumber(customerInfo.phone)
        .addInfo({
          donation_id: donationId,
          customer_email: customerInfo.email,
          currency: currency,
          platform: 'partenaire-magb',
          type: 'donation'
        })
        .returnUrl(backendReturnUrl)
        .webhookUrl(webhookUrl);

      // Effectuer le paiement
      const response = await payment.makePayment();

      if (response.statut) {
        // Vérifier si l'URL contient le nom et essayer de le corriger
        let paymentUrl = response.url;
        
        // Remplacer le nom du client par "DON PARTENAIRE MAGB" dans l'URL
        if (paymentUrl) {
          // Pattern pour trouver le nom dans l'URL (après le montant et avant les paramètres)
          const urlPattern = /\/payment\/[^\/]+\/\d+\/([^?]+)/;
          const match = paymentUrl.match(urlPattern);
          
          if (match) {
            const currentName = match[1];
            // Remplacer le nom par "DON PARTENAIRE MAGB"
            paymentUrl = paymentUrl.replace(currentName, 'DON PARTENAIRE MAGB');
          }
        }
        
        // Enrichir l'URL avec toutes les informations du don
        if (paymentUrl) {
          const donationData = {
            donationId,
            amount,
            currency,
            description,
            customerInfo
          };
          
          paymentUrl = this.enrichPaymentUrl(paymentUrl, donationData);
        }
        
        // Vérifier aussi s'il y a d'autres noms fixes dans l'URL
        if (paymentUrl && !paymentUrl.includes(customerInfo.name.trim()) && !paymentUrl.includes(cleanClientName)) {
          console.log('⚠️ WARNING - URL ne contient pas le nom du client actuel');
          console.log('🔍 URL actuelle:', paymentUrl);
        }

        return {
          success: true,
          transactionId: response.token,
          paymentUrl: paymentUrl,
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
   * Vérifier le statut d'un paiement avec retry automatique et mise à jour des statuts
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
          const newStatus = this.mapStatus(paymentData.statut);

          // Mettre à jour les statuts si un enregistrement de paiement est fourni
          if (paymentRecord) {
            const previousStatus = paymentRecord.status;
            await this.updatePaymentAndDonationStatus(paymentRecord, paymentData, response);

            // Notifier via WebSocket si le statut a changé
            if (previousStatus !== paymentRecord.status) {
              try {
                websocketService.notifyPaymentStatusUpdate(paymentRecord, previousStatus, paymentRecord.status);
              } catch (wsError) {
                console.warn('⚠️ Erreur notification WebSocket:', wsError.message);
              }
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
    
    // Impossible de joindre MoneyFusion : on ne sait pas si le paiement a abouti.
    // Le statut reste « pending » (verificationError) pour ne pas marquer en échec
    // un paiement qui a peut-être été encaissé.
    return {
      success: false,
      status: 'pending',
      verificationError: true,
      message: `Échec de vérification après ${this.retryAttempts} tentatives: ${lastError?.message || 'Erreur inconnue'}`,
      metadata: {
        provider: 'moneyfusion',
        totalAttempts: this.retryAttempts,
        lastError: lastError?.message
      }
    };
  }

  /**
   * Interroger MoneyFusion pour savoir si un paiement est réellement payé.
   * Utilisé pour valider un webhook « completed » avant de l'appliquer.
   */
  async confirmPaid(token, attempts = 2) {
    let lastError = null;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const response = await new FusionPay(this.apiUrl).checkPaymentStatus(token);

        if (response?.statut && response.data) {
          return {
            confirmed: response.data.statut === 'paid',
            statut: response.data.statut,
            data: response.data
          };
        }
        lastError = new Error(response?.message || 'Réponse invalide de MoneyFusion');
      } catch (error) {
        lastError = error;
      }

      if (attempt < attempts) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    return { confirmed: false, error: lastError?.message || 'Vérification impossible' };
  }

  /**
   * Mettre à jour le statut du paiement et de la donation selon la réponse MoneyFusion.
   * La finalisation est déléguée à paymentCompletionService (idempotent) : appeler
   * cette méthode plusieurs fois pour un même paiement ne recompte pas le don.
   */
  async updatePaymentAndDonationStatus(paymentRecord, moneyFusionData, originalResponse = {}) {
    try {
      const oldPaymentStatus = paymentRecord.status;
      const statut = moneyFusionData.statut;

      if (statut === 'paid') {
        const result = await completePayment(paymentRecord, {
          transactionId: paymentRecord.moneyfusion?.token,
          source: 'verify_moneyfusion',
          providerData: {
            moneyfusion: {
              status: 'paid',
              completedAt: new Date(),
              transactionReference: moneyFusionData.numeroTransaction,
              paymentMethod: moneyFusionData.moyen,
              apiResponse: moneyFusionData
            }
          }
        });

        if (!result.alreadyCompleted) {
          console.log(`💰 Statut paiement mis à jour: ${oldPaymentStatus} -> completed (MoneyFusion: paid)`);
        }
      } else if (statut === 'failure' || statut === 'failed' || statut === 'no paid') {
        const result = await failPayment(
          paymentRecord,
          originalResponse.message || 'Paiement échoué',
          { code: 'PAYMENT_FAILED', source: 'verify_moneyfusion' }
        );

        if (result.changed) {
          console.log(`❌ Statut paiement mis à jour: ${oldPaymentStatus} -> failed (MoneyFusion: ${statut})`);
        }
      } else if (statut === 'pending' && paymentRecord.status === 'pending') {
        // Paiement encore en attente côté MoneyFusion : on trace seulement la dernière
        // vérification, sans toucher au statut du paiement ni à celui du don.
        paymentRecord.set('moneyfusion.status', 'pending');
        await paymentRecord.save();
      }
    } catch (error) {
      console.error('❌ Erreur mise à jour statuts MoneyFusion:', error);
      throw error;
    }
  }

  /**
   * Mapper les statuts MoneyFusion vers nos statuts internes
   * Selon la doc: paid, pending, failure, no paid
   */
  mapStatus(moneyFusionStatus) {
    const statusMap = {
      'paid': 'completed',
      'pending': 'pending',
      'failure': 'failed',   // Statut officiel doc MoneyFusion
      'failed': 'failed',    // Alias de sécurité
      'no paid': 'failed',
      'cancelled': 'cancelled'
    };

    return statusMap[moneyFusionStatus] || 'pending';
  }

  /**
   * Traiter les notifications webhook MoneyFusion
   * 
   * Selon la doc, la structure reçue est:
   * { event, personal_Info, tokenPay, numeroSend, nomclient, numeroTransaction, Montant, frais, return_url, webhook_url, createdAt }
   * 
   * IMPORTANT: MoneyFusion peut envoyer plusieurs notifications pour une même transaction:
   * - Répétition de payin.session.pending pendant le traitement
   * - payin.session.completed après confirmation
   * - payin.session.cancelled en cas d'échec
   */
  async processWebhook(webhookData, signature = null, timestamp = null) {
    try {
      console.log('🔔 MoneyFusion - Traitement webhook:', webhookData);

      if (!webhookData || typeof webhookData !== 'object') {
        throw new Error('Données webhook invalides');
      }

      // Structure exacte selon la doc MoneyFusion
      const { 
        event,            // payin.session.pending | payin.session.completed | payin.session.cancelled
        tokenPay,         // Token unique de la transaction
        statut,           // Présent dans certaines réponses (paid, pending, failure, no paid)
        numeroTransaction, 
        Montant, 
        frais,
        nomclient,
        numeroSend,
        personal_Info,
        moyen,
        createdAt 
      } = webhookData;

      if (!tokenPay) {
        throw new Error('tokenPay manquant dans le webhook MoneyFusion');
      }

      // Déterminer le type d'événement et le statut mappé
      // Priorité au champ 'event' (source de vérité selon la doc)
      const eventType = event 
        ? this.mapEventToType(event)
        : this.getWebhookEventType(statut);

      // Dériver le statut depuis l'event si 'statut' absent
      let resolvedStatut = statut;
      if (!resolvedStatut && event) {
        if (event === 'payin.session.completed') resolvedStatut = 'paid';
        else if (event === 'payin.session.cancelled') resolvedStatut = 'failure';
        else if (event === 'payin.session.pending') resolvedStatut = 'pending';
      }
      
      const mappedStatus = this.mapStatus(resolvedStatut || 'pending');

      console.log(`📨 MoneyFusion - Webhook event: ${event || 'N/A'}, statut: ${resolvedStatut} -> ${mappedStatus}, token: ${tokenPay}`);

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
          originalStatus: resolvedStatut,
          originalEvent: event,
          provider: 'moneyfusion',
          webhookTimestamp: new Date().toISOString()
        }
      };

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
   * Mapper les événements webhook MoneyFusion vers nos types internes
   * Selon la doc: payin.session.pending, payin.session.completed, payin.session.cancelled
   */
  mapEventToType(event) {
    const eventMap = {
      'payin.session.pending': 'payment_pending',
      'payin.session.completed': 'payment_completed',
      'payin.session.cancelled': 'payment_failed'
    };
    
    return eventMap[event] || 'payment_updated';
  }

  /**
   * Déterminer le type d'événement webhook selon le statut (fallback)
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
      
      // Trouver les paiements MoneyFusion en attente depuis plus de maxAge heures
      const cutoffDate = new Date(Date.now() - (maxAge * 60 * 60 * 1000));
      // Au-delà de ce délai, un paiement toujours en attente chez le fournisseur est considéré expiré
      const expiryHours = Math.max(parseInt(process.env.PAYMENT_EXPIRY_HOURS, 10) || 24, maxAge);
      const expiryCutoff = new Date(Date.now() - (expiryHours * 60 * 60 * 1000));
      
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
          // Le token est stocké dans payment.moneyfusion.token selon la doc
          const token = payment.moneyfusion?.token || payment.transaction?.externalId;
          if (!token) {
            console.warn(`⚠️ Paiement ${payment._id} sans token MoneyFusion, ignoré`);
            results.errors++;
            continue;
          }
          
          // verifyPayment met déjà à jour le paiement, le don et les statistiques
          // (via paymentCompletionService) : ne rien refaire ici, seulement compter.
          const verificationResult = await this.verifyPayment(token, payment);

          if (verificationResult.verificationError) {
            results.errors++;
            console.warn(`⚠️ Paiement ${payment._id}: MoneyFusion injoignable, statut inchangé`);
          } else if (verificationResult.status === 'completed') {
            results.completed++;
            console.log(`✅ Paiement ${payment._id} marqué comme complété`);
          } else if (verificationResult.status === 'failed') {
            results.failed++;
            console.log(`❌ Paiement ${payment._id} marqué comme échoué`);
          } else if (payment.createdAt < expiryCutoff) {
            // Le fournisseur a répondu mais le paiement n'a jamais été finalisé :
            // on le clôt pour qu'il ne soit pas revérifié indéfiniment.
            await failPayment(payment, 'Paiement expiré (non finalisé dans le délai imparti)', {
              status: 'expired',
              code: 'PAYMENT_EXPIRED',
              source: 'cron_moneyfusion'
            });
            results.failed++;
            console.log(`⌛ Paiement ${payment._id} expiré`);
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
   * Traiter un callback de paiement MoneyFusion et rediriger vers l'app mobile
   * Selon la doc, MoneyFusion redirige vers return_url après le paiement
   */
  async processCallback(callbackData) {
    try {
      const { token, statut, donation_id, transaction_id, numeroTransaction, Montant } = callbackData;
      
      console.log('📱 Callback MoneyFusion reçu:', { token, statut, donation_id, transaction_id });
      
      // Mapper le statut MoneyFusion (paid, pending, failure, no paid)
      let status = 'pending';
      if (statut === 'paid') {
        status = 'completed';
      } else if (statut === 'failure' || statut === 'no paid' || statut === 'cancelled' || statut === 'failed') {
        status = 'failed';
      } else if (statut === 'pending') {
        status = 'pending';
      }
      
      const transactionId = transaction_id || token || numeroTransaction || `MF_${Date.now()}`;
      const donationId = donation_id || 'UNKNOWN';
      
      const mobileCallbackUrl = this.generateMobileCallbackUrl(transactionId, donationId, status);
      
      console.log('🔗 Redirection MoneyFusion vers:', mobileCallbackUrl);
      
      try {
        const Payment = require('../models/Payment');
        const payment = await Payment.findOne({ 
          'moneyfusion.token': token,
          provider: 'moneyfusion'
        });
        
        if (payment) {
          payment.addToHistory(
            'callback_received',
            `Callback MoneyFusion reçu: ${statut}`,
            null,
            { callbackData, mobileRedirectUrl: mobileCallbackUrl, status }
          );
          await payment.save();
        }
      } catch (auditError) {
        console.warn('⚠️ Erreur audit callback:', auditError.message);
      }
      
      return {
        success: true,
        redirectUrl: mobileCallbackUrl,
        status,
        transactionId,
        donationId,
        originalStatus: statut,
        amount: Montant
      };
      
    } catch (error) {
      console.error('Erreur processCallback MoneyFusion:', error);
      const fallbackUrl = this.generateMobileCallbackUrl('ERROR', 'UNKNOWN', 'failed');
      return {
        success: false,
        redirectUrl: fallbackUrl,
        error: error.message
      };
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