const axios = require('axios');
const crypto = require('crypto');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

class PaymentService {
  constructor() {
    this.cinetpayConfig = {
      apiKey: process.env.CINETPAY_API_KEY,
      siteId: process.env.CINETPAY_SITE_ID,
      secretKey: process.env.CINETPAY_SECRET_KEY,
      environment: process.env.CINETPAY_ENVIRONMENT || 'sandbox',
      baseUrl: process.env.CINETPAY_ENVIRONMENT === 'production' 
        ? 'https://api-checkout.cinetpay.com/v2' 
        : 'https://api-checkout.cinetpay.com/v2'
    };
  }

  // ================================
  // CINETPAY INTEGRATION
  // ================================

  async initializeCinetPayPayment(paymentData) {
    try {
      const { amount, currency, customerInfo, donationId, callbackUrl } = paymentData;
      
      const transactionId = this.generateTransactionId();
      
      // Validation selon la documentation CinetPay
      if (amount % 5 !== 0 && currency !== 'USD') {
        throw new Error('Le montant doit être un multiple de 5 (sauf pour USD)');
      }

      const payload = {
        apikey: this.cinetpayConfig.apiKey,
        site_id: this.cinetpayConfig.siteId,
        transaction_id: transactionId,
        amount: parseInt(amount), // Convertir en entier
        currency: currency || 'XOF',
        description: 'DON PARTENAIRE MAGB',
        return_url: callbackUrl,
        notify_url: `${process.env.BACKEND_URL || process.env.FRONTEND_URL}/api/webhooks/cinetpay`,
        channels: 'ALL', // ALL, MOBILE_MONEY, CREDIT_CARD, WALLET
        lang: 'FR',
        
        // Informations client obligatoires pour les cartes bancaires
        customer_name: customerInfo.name, // Utiliser directement le nom complet
        customer_surname: '', // Vide car nous utilisons le nom complet dans customer_name
        customer_email: customerInfo.email,
        customer_phone_number: customerInfo.phone,
        customer_address: customerInfo.address || 'Abidjan',
        customer_city: customerInfo.city || 'Abidjan',
        customer_country: customerInfo.country || 'CI', // Code ISO 2 caractères
        customer_state: customerInfo.state || 'CI',
        customer_zip_code: customerInfo.zipCode || '00000',
        
        // Métadonnées
        metadata: JSON.stringify({
          donationId,
          userId: customerInfo.userId,
          platform: 'partenaire-magb'
        })
      };

      console.log('🔄 Envoi requête CinetPay:', {
        url: `${this.cinetpayConfig.baseUrl}/payment`,
        transaction_id: transactionId,
        amount: payload.amount,
        currency: payload.currency
      });

      const response = await axios.post(
        `${this.cinetpayConfig.baseUrl}/payment`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'PARTENAIRE-MAGB/1.0'
          },
          timeout: 30000
        }
      );

      console.log('✅ Réponse CinetPay:', {
        code: response.data?.code,
        message: response.data?.message,
        status: response.status
      });

      // Selon la documentation, le code de succès est '201'
      if (response.data && response.data.code === '201') {
        return {
          success: true,
          paymentUrl: response.data.data.payment_url,
          transactionId: transactionId,
          paymentToken: response.data.data.payment_token || response.data.data.token,
          cinetpayData: response.data.data
        };
      } else {
        // Gestion des codes d'erreur selon la documentation
        const errorCode = response.data?.code;
        const errorMessage = response.data?.message || response.data?.description;
        
        let userFriendlyMessage = errorMessage;
        
        switch (errorCode) {
          case '608':
            userFriendlyMessage = 'Paramètres manquants ou invalides';
            break;
          case '609':
            userFriendlyMessage = 'Clé API incorrecte';
            break;
          case '613':
            userFriendlyMessage = 'Site ID incorrect';
            break;
          case '624':
            userFriendlyMessage = 'Erreur de traitement - vérifiez vos paramètres';
            break;
          case '429':
            userFriendlyMessage = 'Trop de requêtes - veuillez patienter';
            break;
          default:
            userFriendlyMessage = errorMessage || 'Erreur lors de l\'initialisation du paiement';
        }
        
        throw new Error(userFriendlyMessage);
      }
    } catch (error) {
      console.error('❌ Erreur CinetPay initialization:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      
      if (error.response?.status === 403) {
        throw new Error('Accès refusé - vérifiez vos identifiants CinetPay');
      } else if (error.response?.status === 400) {
        throw new Error('Requête invalide - vérifiez les paramètres');
      } else if (error.code === 'ECONNREFUSED') {
        throw new Error('Impossible de se connecter à CinetPay');
      }
      
      throw new Error(`CinetPay Error: ${error.message}`);
    }
  }

  async verifyCinetPayPayment(transactionId) {
    try {
      const payload = {
        apikey: this.cinetpayConfig.apiKey,
        site_id: this.cinetpayConfig.siteId,
        transaction_id: transactionId
      };

      console.log('🔍 Vérification paiement CinetPay:', transactionId);

      const response = await axios.post(
        `${this.cinetpayConfig.baseUrl}/payment/check`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'PARTENAIRE-MAGB/1.0'
          },
          timeout: 15000
        }
      );

      console.log('📋 Réponse vérification CinetPay:', {
        code: response.data?.code,
        status: response.data?.data?.status,
        amount: response.data?.data?.amount
      });

      // Code '00' indique un succès selon la documentation
      if (response.data && response.data.code === '00') {
        const paymentStatus = response.data.data.status;
        const isCompleted = paymentStatus === 'ACCEPTED' || paymentStatus === 'COMPLETED';
        
        return {
          success: isCompleted,
          status: isCompleted ? 'completed' : 'pending',
          data: response.data.data,
          amount: response.data.data.amount,
          currency: response.data.data.currency,
          operator: response.data.data.operator_id,
          operatorTransactionId: response.data.data.operator_transaction_id,
          paymentMethod: response.data.data.payment_method,
          completedAt: response.data.data.payment_date
        };
      } else {
        return {
          success: false,
          status: 'failed',
          message: response.data?.message || 'Paiement non trouvé ou échoué'
        };
      }
    } catch (error) {
      console.error('❌ Erreur CinetPay verification:', error.message);
      return {
        success: false,
        status: 'failed',
        message: error.message
      };
    }
  }

  verifyCinetPayWebhook(payload, signature) {
    try {
      if (!this.cinetpayConfig.secretKey) {
        console.warn('⚠️ CINETPAY_SECRET_KEY non configuré, validation signature ignorée');
        return true; // En développement, on peut ignorer la validation
      }

      const expectedSignature = crypto
        .createHmac('sha256', this.cinetpayConfig.secretKey)
        .update(JSON.stringify(payload))
        .digest('hex');

      const isValid = signature === expectedSignature;
      
      console.log('🔐 Validation signature CinetPay:', {
        isValid,
        providedSignature: signature?.substring(0, 10) + '...',
        expectedSignature: expectedSignature.substring(0, 10) + '...'
      });

      return isValid;
    } catch (error) {
      console.error('❌ Erreur vérification webhook CinetPay:', error);
      return false;
    }
  }

  /**
   * Obtenir les méthodes de paiement disponibles pour CinetPay
   */
  getCinetPayPaymentMethods() {
    return {
      ALL: 'Tous les canaux',
      MOBILE_MONEY: 'Mobile Money uniquement',
      CREDIT_CARD: 'Cartes bancaires uniquement', 
      WALLET: 'Portefeuilles électroniques'
    };
  }

  /**
   * Valider la configuration CinetPay
   */
  validateCinetPayConfig() {
    const requiredFields = ['apiKey', 'siteId'];
    const missing = requiredFields.filter(field => !this.cinetpayConfig[field]);
    
    if (missing.length > 0) {
      throw new Error(`Configuration CinetPay incomplète: ${missing.join(', ')}`);
    }
    
    return true;
  }

  // ================================
  // STRIPE INTEGRATION
  // ================================

  async initializeStripePayment(paymentData) {
    try {
      const { amount, currency, customerInfo, donationId, paymentMethod } = paymentData;

      // Créer ou récupérer le client Stripe
      let customer;
      try {
        const customers = await stripe.customers.list({
          email: customerInfo.email,
          limit: 1
        });
        
        if (customers.data.length > 0) {
          customer = customers.data[0];
        } else {
          customer = await stripe.customers.create({
            email: customerInfo.email,
            name: customerInfo.name,
            phone: customerInfo.phone,
            metadata: {
              userId: customerInfo.userId.toString()
            }
          });
        }
      } catch (customerError) {
        console.error('Erreur création client Stripe:', customerError);
        throw new Error('Erreur lors de la création du client');
      }

      // Créer le Payment Intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Stripe utilise les centimes
        currency: currency.toLowerCase(),
        customer: customer.id,
        payment_method_types: [paymentMethod || 'card'],
        metadata: {
          donationId: donationId.toString(),
          userId: customerInfo.userId.toString()
        },
        description: 'DON PARTENAIRE MAGB',
        receipt_email: customerInfo.email
      });

      return {
        success: true,
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        customerId: customer.id
      };
    } catch (error) {
      console.error('Erreur Stripe initialization:', error);
      throw new Error(`Stripe Error: ${error.message}`);
    }
  }

  async confirmStripePayment(paymentIntentId) {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      
      return {
        success: paymentIntent.status === 'succeeded',
        status: paymentIntent.status,
        data: paymentIntent
      };
    } catch (error) {
      console.error('Erreur Stripe confirmation:', error);
      throw new Error(`Stripe Confirmation Error: ${error.message}`);
    }
  }

  verifyStripeWebhook(payload, signature) {
    try {
      const event = stripe.webhooks.constructEvent(
        payload,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
      return { success: true, event };
    } catch (error) {
      console.error('Erreur vérification webhook Stripe:', error);
      return { success: false, error: error.message };
    }
  }

  // ================================
  // PAYPAL INTEGRATION
  // ================================

  async initializePayPalPayment(paymentData) {
    try {
      const { amount, currency, donationId, callbackUrl } = paymentData;

      // Obtenir le token d'accès PayPal
      const accessToken = await this.getPayPalAccessToken();

      const orderData = {
        intent: 'CAPTURE',
        purchase_units: [{
          amount: {
            currency_code: currency,
            value: amount.toString()
          },
          description: 'DON PARTENAIRE MAGB',
          custom_id: donationId.toString()
        }],
        application_context: {
          return_url: callbackUrl,
          cancel_url: `${callbackUrl}?cancelled=true`,
          brand_name: 'PARTENAIRE MAGB',
          landing_page: 'BILLING',
          user_action: 'PAY_NOW'
        }
      };

      const response = await axios.post(
        `${this.getPayPalBaseUrl()}/v2/checkout/orders`,
        orderData,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      if (response.data && response.data.id) {
        const approvalUrl = response.data.links.find(
          link => link.rel === 'approve'
        )?.href;

        return {
          success: true,
          orderId: response.data.id,
          approvalUrl,
          paypalData: response.data
        };
      } else {
        throw new Error('Erreur lors de la création de la commande PayPal');
      }
    } catch (error) {
      console.error('Erreur PayPal initialization:', error);
      throw new Error(`PayPal Error: ${error.message}`);
    }
  }

  async capturePayPalPayment(orderId) {
    try {
      const accessToken = await this.getPayPalAccessToken();

      const response = await axios.post(
        `${this.getPayPalBaseUrl()}/v2/checkout/orders/${orderId}/capture`,
        {},
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      return {
        success: response.data.status === 'COMPLETED',
        status: response.data.status,
        data: response.data
      };
    } catch (error) {
      console.error('Erreur PayPal capture:', error);
      throw new Error(`PayPal Capture Error: ${error.message}`);
    }
  }

  async getPayPalAccessToken() {
    try {
      const auth = Buffer.from(
        `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
      ).toString('base64');

      const response = await axios.post(
        `${this.getPayPalBaseUrl()}/v1/oauth2/token`,
        'grant_type=client_credentials',
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      return response.data.access_token;
    } catch (error) {
      console.error('Erreur obtention token PayPal:', error);
      throw new Error('Impossible d\'obtenir le token PayPal');
    }
  }

  getPayPalBaseUrl() {
    return process.env.PAYPAL_ENVIRONMENT === 'production'
      ? 'https://api.paypal.com'
      : 'https://api.sandbox.paypal.com';
  }

  // ================================
  // MOBILE MONEY INTEGRATION
  // ================================

  async initializeMobileMoneyPayment(paymentData) {
    try {
      const { provider, amount, currency, customerPhone, donationId } = paymentData;

      switch (provider) {
        case 'orange':
          return await this.initializeOrangeMoneyPayment(paymentData);
        case 'mtn':
          return await this.initializeMTNMobileMoneyPayment(paymentData);
        case 'moov':
          return await this.initializeMoovMoneyPayment(paymentData);
        default:
          throw new Error(`Fournisseur Mobile Money non supporté: ${provider}`);
      }
    } catch (error) {
      console.error('Erreur Mobile Money initialization:', error);
      throw new Error(`Mobile Money Error: ${error.message}`);
    }
  }

  async initializeOrangeMoneyPayment(paymentData) {
    // Implémentation Orange Money API
    // Note: Cette implémentation dépend de l'API Orange Money disponible
    const { amount, currency, customerPhone, donationId } = paymentData;
    
    try {
      // Exemple d'implémentation - à adapter selon l'API réelle
      const payload = {
        amount: amount,
        currency: currency,
        customer_phone: customerPhone,
        transaction_id: this.generateTransactionId(),
        description: 'DON PARTENAIRE MAGB'
      };

      // API Orange Money (à implémenter selon la documentation)
      const response = await axios.post(
        'https://api.orange.com/mobile-money/payment',
        payload,
        {
          headers: {
            'Authorization': `Bearer ${process.env.ORANGE_MONEY_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        success: true,
        transactionId: payload.transaction_id,
        status: 'pending',
        data: response.data
      };
    } catch (error) {
      throw new Error(`Orange Money Error: ${error.message}`);
    }
  }

  async initializeMTNMobileMoneyPayment(paymentData) {
    // Implémentation MTN Mobile Money API
    const { amount, currency, customerPhone, donationId } = paymentData;
    
    try {
      const payload = {
        amount: amount,
        currency: currency,
        externalId: this.generateTransactionId(),
        payer: {
          partyIdType: 'MSISDN',
          partyId: customerPhone
        },
        payerMessage: 'DON PARTENAIRE MAGB',
        payeeNote: 'DON PARTENAIRE MAGB'
      };

      // API MTN Mobile Money (à implémenter selon la documentation)
      const response = await axios.post(
        'https://sandbox.momodeveloper.mtn.com/collection/v1_0/requesttopay',
        payload,
        {
          headers: {
            'Authorization': `Bearer ${process.env.MTN_API_KEY}`,
            'X-Reference-Id': payload.externalId,
            'X-Target-Environment': process.env.MTN_ENVIRONMENT,
            'Content-Type': 'application/json',
            'Ocp-Apim-Subscription-Key': process.env.MTN_SUBSCRIPTION_KEY
          }
        }
      );

      return {
        success: true,
        transactionId: payload.externalId,
        status: 'pending',
        data: response.data
      };
    } catch (error) {
      throw new Error(`MTN Mobile Money Error: ${error.message}`);
    }
  }

  async initializeMoovMoneyPayment(paymentData) {
    // Implémentation Moov Money API
    // À implémenter selon la documentation Moov Money
    throw new Error('Moov Money non encore implémenté');
  }

  // ================================
  // UTILITY METHODS
  // ================================

  generateTransactionId() {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(8).toString('hex');
    return `TXN-${timestamp}-${random}`.toUpperCase();
  }

  async processRefund(payment, amount, reason) {
    try {
      switch (payment.provider) {
        case 'stripe':
          return await this.processStripeRefund(payment, amount, reason);
        case 'paypal':
          return await this.processPayPalRefund(payment, amount, reason);
        case 'cinetpay':
          return await this.processCinetPayRefund(payment, amount, reason);
        default:
          throw new Error(`Remboursement non supporté pour ${payment.provider}`);
      }
    } catch (error) {
      console.error('Erreur remboursement:', error);
      throw error;
    }
  }

  async processStripeRefund(payment, amount, reason) {
    try {
      const refund = await stripe.refunds.create({
        payment_intent: payment.stripe.paymentIntentId,
        amount: amount ? Math.round(amount * 100) : undefined,
        reason: 'requested_by_customer',
        metadata: {
          reason: reason,
          originalPaymentId: payment._id.toString()
        }
      });

      return {
        success: true,
        refundId: refund.id,
        status: refund.status,
        amount: refund.amount / 100
      };
    } catch (error) {
      throw new Error(`Stripe Refund Error: ${error.message}`);
    }
  }

  async processPayPalRefund(payment, amount, reason) {
    try {
      const accessToken = await this.getPayPalAccessToken();
      const captureId = payment.paypal.captureId;

      const refundData = {
        amount: amount ? {
          value: amount.toString(),
          currency_code: payment.currency
        } : undefined,
        note_to_payer: reason
      };

      const response = await axios.post(
        `${this.getPayPalBaseUrl()}/v2/payments/captures/${captureId}/refund`,
        refundData,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      return {
        success: true,
        refundId: response.data.id,
        status: response.data.status,
        amount: parseFloat(response.data.amount.value)
      };
    } catch (error) {
      throw new Error(`PayPal Refund Error: ${error.message}`);
    }
  }

  async processCinetPayRefund(payment, amount, reason) {
    // Note: CinetPay peut avoir des limitations sur les remboursements automatiques
    // Cette méthode pourrait nécessiter un processus manuel
    throw new Error('Remboursement CinetPay nécessite un traitement manuel');
  }

  calculateFees(amount, provider, currency = 'XOF') {
    const feeStructures = {
      cinetpay: {
        percentage: 2.5,
        fixed: 100
      },
      moneyfusion: {
        percentage: 2.5,
        fixed: 100
      },
      fusionpay: {
        percentage: 2.5,
        fixed: 100
      },
      paydunya: {
        percentage: 3.0,
        fixed: 50
      },
      stripe: {
        percentage: 2.9,
        fixed: currency === 'XOF' ? 30 : 0.30
      },
      paypal: {
        percentage: 3.4,
        fixed: 0
      },
      orange_money: {
        percentage: 1.0,
        fixed: 50
      },
      mtn_mobile_money: {
        percentage: 1.0,
        fixed: 50
      }
    };

    const structure = feeStructures[provider];
    if (!structure) {
      throw new Error(`Structure de frais non définie pour ${provider}`);
    }

    const percentageFee = (amount * structure.percentage) / 100;
    const totalFee = percentageFee + structure.fixed;

    return {
      percentageFee: Math.round(percentageFee),
      fixedFee: structure.fixed,
      totalFee: Math.round(totalFee),
      netAmount: Math.round(amount - totalFee)
    };
  }
}

module.exports = new PaymentService(); 