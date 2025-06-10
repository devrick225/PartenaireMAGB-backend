const axios = require('axios');
const crypto = require('crypto');

class FusionPayService {
  constructor() {
    this.baseURL = process.env.FUSIONPAY_API_URL || 'https://api.fusionpay.io/v1';
    this.publicKey = process.env.FUSIONPAY_PUBLIC_KEY;
    this.secretKey = process.env.FUSIONPAY_SECRET_KEY;
    this.webhookSecret = process.env.FUSIONPAY_WEBHOOK_SECRET;
  }

  /**
   * Générer la signature pour les requêtes API
   */
  generateSignature(payload, timestamp) {
    const message = timestamp + JSON.stringify(payload);
    return crypto
      .createHmac('sha256', this.secretKey)
      .update(message)
      .digest('hex');
  }

  /**
   * Vérifier la signature des webhooks
   */
  verifyWebhookSignature(payload, signature, timestamp) {
    const expectedSignature = this.generateSignature(payload, timestamp);
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  /**
   * Headers d'authentification pour les requêtes API
   */
  getAuthHeaders(payload = {}) {
    const timestamp = Date.now().toString();
    const signature = this.generateSignature(payload, timestamp);
    
    return {
      'Content-Type': 'application/json',
      'X-API-Key': this.publicKey,
      'X-Timestamp': timestamp,
      'X-Signature': signature,
      'User-Agent': 'PARTENAIRE-MAGB/1.0'
    };
  }

  /**
   * Initialiser un paiement FusionPay
   */
  async initializePayment({
    amount,
    currency,
    customerInfo,
    donationId,
    callbackUrl,
    paymentMethod = 'card',
    description = 'Don PARTENAIRE MAGB'
  }) {
    try {
      const payload = {
        amount: parseFloat(amount),
        currency: currency.toUpperCase(),
        payment_method: paymentMethod,
        description,
        customer: {
          name: `${customerInfo.name} ${customerInfo.surname}`,
          email: customerInfo.email,
          phone: customerInfo.phone,
          address: customerInfo.address || '',
          city: customerInfo.city || '',
          country: customerInfo.country || 'CI'
        },
        metadata: {
          donation_id: donationId,
          platform: 'partenaire-magb',
          type: 'donation'
        },
        callback_url: callbackUrl,
        return_url: `${process.env.FRONTEND_URL}/payment/success`,
        cancel_url: `${process.env.FRONTEND_URL}/payment/cancel`,
        webhook_url: `${process.env.BACKEND_URL || process.env.FRONTEND_URL}/api/webhooks/fusionpay`
      };

      const response = await axios.post(
        `${this.baseURL}/payments/initialize`,
        payload,
        { headers: this.getAuthHeaders(payload) }
      );

      if (response.data.status === 'success') {
        return {
          success: true,
          transactionId: response.data.data.transaction_id,
          paymentUrl: response.data.data.payment_url,
          reference: response.data.data.reference,
          status: response.data.data.status,
          expiresAt: response.data.data.expires_at
        };
      } else {
        throw new Error(response.data.message || 'Erreur lors de l\'initialisation du paiement');
      }
    } catch (error) {
      console.error('Erreur FusionPay initializePayment:', error.response?.data || error.message);
      throw new Error(`Erreur FusionPay: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Vérifier le statut d'un paiement
   */
  async verifyPayment(transactionId) {
    try {
      const response = await axios.get(
        `${this.baseURL}/payments/${transactionId}/verify`,
        { headers: this.getAuthHeaders() }
      );

      if (response.data.status === 'success') {
        const paymentData = response.data.data;
        return {
          success: paymentData.status === 'completed' || paymentData.status === 'success',
          status: paymentData.status,
          transactionId: paymentData.transaction_id,
          reference: paymentData.reference,
          amount: paymentData.amount,
          currency: paymentData.currency,
          paymentMethod: paymentData.payment_method,
          customerInfo: paymentData.customer,
          completedAt: paymentData.completed_at,
          fees: paymentData.fees,
          metadata: paymentData.metadata,
          message: paymentData.message || 'Paiement vérifié'
        };
      } else {
        return {
          success: false,
          status: response.data.data?.status || 'failed',
          message: response.data.message || 'Paiement non trouvé ou échoué'
        };
      }
    } catch (error) {
      console.error('Erreur FusionPay verifyPayment:', error.response?.data || error.message);
      return {
        success: false,
        status: 'failed',
        message: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Traiter un remboursement
   */
  async processRefund(transactionId, amount = null, reason = 'Demande de remboursement') {
    try {
      const payload = {
        transaction_id: transactionId,
        amount: amount, // null pour remboursement complet
        reason
      };

      const response = await axios.post(
        `${this.baseURL}/payments/${transactionId}/refund`,
        payload,
        { headers: this.getAuthHeaders(payload) }
      );

      if (response.data.status === 'success') {
        return {
          success: true,
          refundId: response.data.data.refund_id,
          amount: response.data.data.amount,
          status: response.data.data.status,
          refundedAt: response.data.data.refunded_at,
          message: 'Remboursement initié avec succès'
        };
      } else {
        throw new Error(response.data.message || 'Erreur lors du remboursement');
      }
    } catch (error) {
      console.error('Erreur FusionPay refund:', error.response?.data || error.message);
      throw new Error(`Erreur remboursement FusionPay: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Obtenir les méthodes de paiement disponibles
   */
  async getPaymentMethods(currency = 'XOF', country = 'CI') {
    try {
      const response = await axios.get(
        `${this.baseURL}/payment-methods`,
        {
          params: { currency, country },
          headers: this.getAuthHeaders()
        }
      );

      if (response.data.status === 'success') {
        return {
          success: true,
          methods: response.data.data.methods || []
        };
      } else {
        throw new Error(response.data.message || 'Erreur lors de la récupération des méthodes');
      }
    } catch (error) {
      console.error('Erreur FusionPay getPaymentMethods:', error.response?.data || error.message);
      return {
        success: false,
        methods: [],
        message: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Traiter les notifications webhook
   */
  async processWebhook(webhookData, signature, timestamp) {
    try {
      // Vérifier la signature
      if (!this.verifyWebhookSignature(webhookData, signature, timestamp)) {
        throw new Error('Signature webhook invalide');
      }

      const { event_type, data } = webhookData;

      switch (event_type) {
        case 'payment.completed':
          return {
            type: 'payment_completed',
            transactionId: data.transaction_id,
            status: 'completed',
            data: data
          };

        case 'payment.failed':
          return {
            type: 'payment_failed',
            transactionId: data.transaction_id,
            status: 'failed',
            data: data
          };

        case 'payment.pending':
          return {
            type: 'payment_pending',
            transactionId: data.transaction_id,
            status: 'pending',
            data: data
          };

        case 'refund.completed':
          return {
            type: 'refund_completed',
            transactionId: data.transaction_id,
            refundId: data.refund_id,
            status: 'refunded',
            data: data
          };

        default:
          console.log('Type de webhook non géré:', event_type);
          return {
            type: 'unknown',
            eventType: event_type,
            data: data
          };
      }
    } catch (error) {
      console.error('Erreur traitement webhook FusionPay:', error);
      throw error;
    }
  }

  /**
   * Calculer les frais FusionPay
   */
  calculateFees(amount, currency = 'XOF', paymentMethod = 'card') {
    let feePercentage = 0;
    let fixedFee = 0;

    // Frais selon la méthode de paiement
    switch (paymentMethod) {
      case 'card':
        feePercentage = 2.9; // 2.9%
        fixedFee = currency === 'XOF' ? 150 : 0.5; // 150 XOF ou 0.5 EUR/USD
        break;
      case 'mobile_money':
        feePercentage = 2.5; // 2.5%
        fixedFee = currency === 'XOF' ? 100 : 0.3;
        break;
      case 'bank_transfer':
        feePercentage = 1.5; // 1.5%
        fixedFee = currency === 'XOF' ? 200 : 0.7;
        break;
      case 'crypto':
        feePercentage = 1.0; // 1.0%
        fixedFee = 0;
        break;
      default:
        feePercentage = 2.9;
        fixedFee = currency === 'XOF' ? 150 : 0.5;
    }

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
   * Obtenir les taux de change
   */
  async getExchangeRates(baseCurrency = 'XOF') {
    try {
      const response = await axios.get(
        `${this.baseURL}/exchange-rates`,
        {
          params: { base: baseCurrency },
          headers: this.getAuthHeaders()
        }
      );

      if (response.data.status === 'success') {
        return {
          success: true,
          rates: response.data.data.rates,
          baseCurrency: response.data.data.base,
          timestamp: response.data.data.timestamp
        };
      } else {
        throw new Error(response.data.message || 'Erreur lors de la récupération des taux');
      }
    } catch (error) {
      console.error('Erreur FusionPay getExchangeRates:', error.response?.data || error.message);
      return {
        success: false,
        rates: {},
        message: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Tester la connexion API
   */
  async testConnection() {
    try {
      const response = await axios.get(
        `${this.baseURL}/health`,
        { headers: this.getAuthHeaders() }
      );

      return {
        success: response.data.status === 'success',
        message: response.data.message || 'Connexion réussie',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Erreur test connexion FusionPay:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.message || error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = new FusionPayService(); 