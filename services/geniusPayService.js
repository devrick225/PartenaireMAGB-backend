const axios = require('axios');
const crypto = require('crypto');
const websocketService = require('./websocketService');

class GeniusPayService {
  constructor() {
    this.apiUrl = process.env.GENIUSPAY_API_URL || 'https://pay.genius.ci/api/v1/merchant';
    this.apiKey = process.env.GENIUSPAY_API_KEY;
    this.apiSecret = process.env.GENIUSPAY_API_SECRET;
    this.webhookSecret = process.env.GENIUSPAY_WEBHOOK_SECRET;
    this.retryAttempts = 3;
    this.retryDelay = 5000;
  }

  /**
   * Headers d'authentification requis par GeniusPay (X-API-Key + X-API-Secret)
   */
  getAuthHeaders() {
    return {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
      'X-API-Secret': this.apiSecret
    };
  }

  /**
   * Générer l'URL de callback mobile pour GeniusPay
   */
  generateMobileCallbackUrl(transactionId, donationId, status = 'completed') {
    return `partenaireMagb://payment/return?transactionId=${transactionId}&donationId=${donationId}&status=${status}`;
  }

  /**
   * Initialiser un paiement GeniusPay (checkout unifié : payment_method omis
   * pour laisser GeniusPay afficher sa propre page de sélection Wave/Orange/MTN/Carte)
   */
  async initializePayment({
    amount,
    currency,
    customerInfo,
    donationId,
    description = 'DON PARTENAIRE MAGB'
  }) {
    try {
      const rawBackendUrl = process.env.BACKEND_URL
        || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
        || process.env.FRONTEND_URL;

      const publicBackendUrl = rawBackendUrl
        ? rawBackendUrl.replace(/^http:\/\/localhost(:\d+)?/, '').replace(/^http:\/\//, 'https://')
        : null;

      if (!publicBackendUrl || publicBackendUrl.includes('localhost')) {
        console.error('❌ BACKEND_URL non configuré ou pointe vers localhost. GeniusPay ne peut pas accéder à cette URL.');
        throw new Error('BACKEND_URL doit être une URL HTTPS publique pour GeniusPay');
      }

      const successUrl = `${publicBackendUrl}/api/payments/mobile-callback?donationId=${donationId}&provider=geniuspay&status=completed`;
      const errorUrl = `${publicBackendUrl}/api/payments/mobile-callback?donationId=${donationId}&provider=geniuspay&status=failed`;

      const payload = {
        amount: parseFloat(amount),
        currency: currency || 'XOF',
        customer: {
          phone: customerInfo.phone,
          name: customerInfo.name,
          email: customerInfo.email,
          country: customerInfo.country
        },
        metadata: {
          donation_id: donationId,
          customer_email: customerInfo.email,
          platform: 'partenaire-magb',
          type: 'donation',
          description
        },
        success_url: successUrl,
        error_url: errorUrl
        // payment_method volontairement omis : checkout unifié recommandé par GeniusPay
      };

      const response = await axios.post(`${this.apiUrl}/payments`, payload, {
        headers: this.getAuthHeaders()
      });

      const data = response.data?.data;

      if (!response.data?.success || !data) {
        throw new Error(response.data?.error?.message || 'Réponse invalide de GeniusPay');
      }

      return {
        success: true,
        transactionId: data.reference,
        reference: data.reference,
        token: data.reference,
        paymentUrl: data.checkout_url,
        status: this.mapStatus(data.status),
        fees: data.fees,
        netAmount: data.net_amount,
        message: 'Paiement GeniusPay initialisé avec succès',
        rawResponse: data
      };
    } catch (error) {
      const apiError = error.response?.data?.error;
      console.error('❌ Erreur GeniusPay initializePayment:', apiError || error.message);
      throw new Error(`Erreur GeniusPay: ${apiError?.message || error.message}`);
    }
  }

  /**
   * Vérifier le statut d'un paiement GeniusPay via GET /payments/{reference}
   */
  async verifyPayment(reference, paymentRecord = null) {
    let lastError = null;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const response = await axios.get(`${this.apiUrl}/payments/${reference}`, {
          headers: this.getAuthHeaders()
        });

        const data = response.data?.data;

        if (!response.data?.success || !data) {
          lastError = new Error(response.data?.error?.message || 'Réponse invalide de GeniusPay');
          continue;
        }

        const newStatus = this.mapStatus(data.status);
        const isSuccess = newStatus === 'completed';

        if (paymentRecord) {
          await this.updatePaymentAndDonationStatus(paymentRecord, data);

          if (paymentRecord.status !== newStatus) {
            try {
              websocketService.notifyPaymentStatusUpdate(paymentRecord, paymentRecord.status, newStatus);
            } catch (wsError) {
              console.warn('⚠️ Erreur notification WebSocket:', wsError.message);
            }
          }
        }

        return {
          success: isSuccess,
          status: newStatus,
          transactionId: reference,
          reference: data.reference,
          amount: data.amount,
          fees: data.fees || 0,
          netAmount: data.net_amount,
          customerInfo: data.customer,
          completedAt: data.completed_at,
          paymentMethod: data.payment_method || 'unknown',
          message: isSuccess ? 'Paiement vérifié avec succès' : 'Paiement non confirmé',
          metadata: {
            provider: 'geniuspay',
            verificationAttempt: attempt,
            originalResponse: data
          }
        };
      } catch (error) {
        lastError = error;
        console.error(`❌ GeniusPay - Erreur tentative ${attempt}:`, error.response?.data?.error || error.message);

        if (attempt < this.retryAttempts) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        }
      }
    }

    if (paymentRecord) {
      try {
        websocketService.notifyPaymentFailed(paymentRecord, paymentRecord.donation, {
          message: `Échec vérification GeniusPay après ${this.retryAttempts} tentatives`,
          code: 'VERIFICATION_FAILED',
          originalError: lastError?.message
        });
      } catch (wsError) {
        console.warn('⚠️ Erreur notification WebSocket échec:', wsError.message);
      }
    }

    return {
      success: false,
      status: 'failed',
      message: `Échec de vérification après ${this.retryAttempts} tentatives: ${lastError?.message || 'Erreur inconnue'}`,
      metadata: {
        provider: 'geniuspay',
        totalAttempts: this.retryAttempts,
        lastError: lastError?.message
      }
    };
  }

  /**
   * Mettre à jour le statut du paiement et de la donation selon la réponse GeniusPay
   */
  async updatePaymentAndDonationStatus(paymentRecord, geniusPayData) {
    try {
      const oldPaymentStatus = paymentRecord.status;
      const emailService = require('./emailService');
      const newStatus = this.mapStatus(geniusPayData.status);

      if (newStatus === 'completed') {
        await paymentRecord.markCompleted({
          geniuspay: {
            ...paymentRecord.geniuspay,
            status: geniusPayData.status,
            completedAt: new Date(),
            apiResponse: geniusPayData
          }
        });

        if (paymentRecord.donation) {
          paymentRecord.donation.status = 'completed';
          paymentRecord.donation.addToHistory(
            'updated',
            `Statut mis à jour automatiquement via vérification GeniusPay (${paymentRecord.donation.status} -> completed)`,
            null,
            { paymentProvider: 'geniuspay', paymentStatus: geniusPayData.status, verificationSource: 'verify_payment_api' }
          );
          await paymentRecord.donation.save();
        }

        if (paymentRecord.user) {
          await paymentRecord.user.updateDonationStats(paymentRecord.amount);
        }

        if (paymentRecord.user && paymentRecord.donation) {
          try {
            await emailService.sendDonationReceiptEmail(
              paymentRecord.user.email,
              paymentRecord.user.firstName,
              {
                receiptNumber: paymentRecord.donation.receipt.number,
                donorName: `${paymentRecord.user.firstName} ${paymentRecord.user.lastName}`,
                formattedAmount: paymentRecord.formattedAmount,
                donationDate: paymentRecord.donation.createdAt,
                paymentMethod: paymentRecord.paymentMethod,
                category: paymentRecord.donation.category
              }
            );
          } catch (emailError) {
            console.error('Erreur envoi reçu par email:', emailError);
          }
        }

        console.log(`💰 Statut paiement mis à jour: ${oldPaymentStatus} -> completed (GeniusPay: ${geniusPayData.status})`);
      } else if (newStatus === 'failed') {
        await paymentRecord.markFailed(`Paiement GeniusPay ${geniusPayData.status}`);

        if (paymentRecord.donation) {
          paymentRecord.donation.status = 'failed';
          paymentRecord.donation.addToHistory(
            'updated',
            `Statut mis à jour automatiquement via vérification GeniusPay (${paymentRecord.donation.status} -> failed)`,
            null,
            { paymentProvider: 'geniuspay', paymentStatus: geniusPayData.status, verificationSource: 'verify_payment_api' }
          );
          await paymentRecord.donation.save();
        }

        console.log(`❌ Statut paiement mis à jour: ${oldPaymentStatus} -> failed (GeniusPay: ${geniusPayData.status})`);
      } else if (newStatus === 'pending' && paymentRecord.status !== 'pending') {
        paymentRecord.status = 'pending';
        paymentRecord.geniuspay = {
          ...paymentRecord.geniuspay,
          status: geniusPayData.status,
          apiResponse: geniusPayData
        };
        paymentRecord.addToHistory(
          'updated',
          `Statut mis à jour via vérification GeniusPay: ${oldPaymentStatus} -> pending`,
          null,
          { geniusPayStatus: geniusPayData.status }
        );
        await paymentRecord.save();
      }
    } catch (error) {
      console.error('❌ Erreur mise à jour statuts GeniusPay:', error);
      throw error;
    }
  }

  /**
   * Mapper les statuts GeniusPay vers nos statuts internes
   * Selon la doc: pending, processing, completed, failed, cancelled, refunded, expired
   */
  mapStatus(geniusPayStatus) {
    const statusMap = {
      'pending': 'pending',
      'processing': 'pending',
      'completed': 'completed',
      'failed': 'failed',
      'cancelled': 'cancelled',
      'expired': 'failed',
      'refunded': 'refunded'
    };

    return statusMap[geniusPayStatus] || 'pending';
  }

  /**
   * Vérifier la signature d'un webhook GeniusPay
   * Formule officielle: HMAC-SHA256(timestamp + "." + raw_json_payload, webhookSecret)
   * Protection anti-rejeu: rejeter si le timestamp a plus de 5 minutes
   */
  verifyWebhookSignature(rawBody, signature, timestamp) {
    if (!signature || !timestamp) {
      return false;
    }

    const timestampMs = parseInt(timestamp, 10) * 1000;
    if (!timestampMs || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) {
      console.warn('⚠️ GeniusPay - Timestamp webhook hors de la fenêtre de 5 minutes');
      return false;
    }

    const message = `${timestamp}.${rawBody}`;
    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(message)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch (error) {
      // Buffers de tailles différentes -> signature invalide
      return false;
    }
  }

  /**
   * Traiter les notifications webhook GeniusPay
   * Structure: { id, event, timestamp, data: { reference, amount, currency, fees, net_amount, status, metadata }, environment }
   */
  async processWebhook(rawBody, signature, timestamp) {
    try {
      if (!this.verifyWebhookSignature(rawBody, signature, timestamp)) {
        throw new Error('Signature webhook GeniusPay invalide');
      }

      const webhookData = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
      const { event, data } = webhookData;

      if (!data || !data.reference) {
        throw new Error('reference manquante dans le webhook GeniusPay');
      }

      const mappedStatus = this.mapStatus(data.status);
      const eventType = this.mapEventToType(event);

      console.log(`📨 GeniusPay - Webhook event: ${event}, statut: ${data.status} -> ${mappedStatus}, reference: ${data.reference}`);

      const result = {
        type: eventType,
        transactionId: data.reference,
        status: mappedStatus,
        data: {
          reference: data.reference,
          amount: parseFloat(data.amount) || 0,
          fees: parseFloat(data.fees) || 0,
          netAmount: parseFloat(data.net_amount) || 0,
          currency: data.currency,
          metadata: data.metadata || {},
          originalStatus: data.status,
          originalEvent: event,
          provider: 'geniuspay',
          webhookTimestamp: new Date().toISOString()
        }
      };

      try {
        websocketService.notifyWebhookReceived(data.reference, 'geniuspay', mappedStatus, webhookData);
      } catch (wsError) {
        console.warn('⚠️ Erreur notification WebSocket webhook:', wsError.message);
      }

      return result;
    } catch (error) {
      console.error('❌ Erreur traitement webhook GeniusPay:', error);
      throw error;
    }
  }

  /**
   * Mapper les événements webhook GeniusPay vers nos types internes
   */
  mapEventToType(event) {
    const eventMap = {
      'payment.success': 'payment_completed',
      'payment.failed': 'payment_failed',
      'payment.cancelled': 'payment_cancelled',
      'payment.refunded': 'payment_refunded',
      'payment.expired': 'payment_failed',
      'payment.initiated': 'payment_pending'
    };

    return eventMap[event] || 'payment_updated';
  }

  /**
   * Calculer les frais GeniusPay (estimation, ~3% d'après la doc)
   * Note: à la création d'un paiement, préférer les frais réels retournés par l'API
   */
  calculateFees(amount, currency = 'XOF') {
    const feePercentage = 3;
    const totalFee = Math.round((amount * feePercentage) / 100);

    return {
      percentageFee: totalFee,
      fixedFee: 0,
      totalFee,
      feePercentage,
      netAmount: Math.round(amount - totalFee)
    };
  }

  /**
   * Vérifier automatiquement les paiements GeniusPay en attente
   */
  async checkPendingPayments(maxAge = 24) {
    try {
      const Payment = require('../models/Payment');

      const cutoffDate = new Date(Date.now() - (maxAge * 60 * 60 * 1000));

      const pendingPayments = await Payment.find({
        provider: 'geniuspay',
        status: { $in: ['pending', 'processing'] },
        createdAt: { $lt: cutoffDate }
      }).populate('donation user');

      console.log(`🔍 GeniusPay - Vérification de ${pendingPayments.length} paiements en attente`);

      const results = { checked: 0, completed: 0, failed: 0, errors: 0 };

      for (const payment of pendingPayments) {
        try {
          results.checked++;

          const reference = payment.geniuspay?.reference;
          if (!reference) {
            console.warn(`⚠️ Paiement ${payment._id} sans référence GeniusPay, ignoré`);
            results.errors++;
            continue;
          }

          const verificationResult = await this.verifyPayment(reference, payment);

          if (verificationResult.success && verificationResult.status === 'completed') {
            results.completed++;
          } else if (verificationResult.status === 'failed') {
            results.failed++;
          }
        } catch (error) {
          results.errors++;
          console.error(`❌ Erreur vérification paiement ${payment._id}:`, error.message);
        }
      }

      console.log('🔍 GeniusPay - Vérification terminée:', results);
      return results;
    } catch (error) {
      console.error('❌ Erreur vérification paiements GeniusPay en attente:', error);
      throw error;
    }
  }

  /**
   * Valider la configuration du service
   */
  validateConfiguration() {
    if (!this.apiKey || !this.apiSecret) {
      throw new Error('GENIUSPAY_API_KEY / GENIUSPAY_API_SECRET manquants dans la configuration');
    }

    return {
      valid: true,
      apiUrl: this.apiUrl
    };
  }
}

module.exports = new GeniusPayService();
