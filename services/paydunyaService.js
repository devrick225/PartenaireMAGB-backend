const axios = require('axios');
const crypto = require('crypto');

class PayDunyaService {
  constructor() {
    this.config = {
      // Clés d'API PayDunya depuis les variables d'environnement
      masterKey: process.env.PAYDUNYA_MASTER_KEY,
      privateKey: process.env.PAYDUNYA_PRIVATE_KEY,
      publicKey: process.env.PAYDUNYA_PUBLIC_KEY,
      token: process.env.PAYDUNYA_TOKEN,
      mode: process.env.PAYDUNYA_MODE || 'test', // 'test' ou 'live'
      
      // URLs API PayDunya
      baseUrl: process.env.PAYDUNYA_MODE === 'live' 
        ? 'https://app.paydunya.com/api/v1' 
        : 'https://app.paydunya.com/sandbox-api/v1'
    };

    // Configuration des opérateurs Mobile Money supportés par PayDunya
    this.supportedOperators = [
      'card',
      'orange-money-senegal',
      'wave-senegal', 
      'free-money-senegal',
      'expresso-sn',
      'wizall-senegal',
      'mtn-benin',
      'moov-benin',
      'orange-money-ci',
      'wave-ci',
      'mtn-ci',
      'moov-ci',
      't-money-togo',
      'moov-togo',
      'orange-money-mali',
      'moov-ml',
      'orange-money-burkina',
      'moov-burkina-faso'
    ];

    this.retryAttempts = 3;
    this.retryDelay = 5000; // 5 secondes
  }

  /**
   * Générer l'URL de callback mobile pour PayDunya
   */
  generateMobileCallbackUrl(transactionId, donationId, status = 'completed') {
    return `partenaireMagb://payment/return?transactionId=${transactionId}&donationId=${donationId}&status=${status}&provider=paydunya`;
  }

  /**
   * Générer l'URL de callback web (fallback)
   */
  generateWebCallbackUrl(transactionId, donationId, status = 'completed') {
    const baseUrl = process.env.BACKEND_URL || process.env.FRONTEND_URL || 'https://partenairemagb.com';
    return `${baseUrl}/api/payments/callback?transactionId=${transactionId}&donationId=${donationId}&status=${status}&provider=paydunya`;
  }

  /**
   * Valider la configuration PayDunya
   */
  validateConfig() {
    const requiredFields = ['masterKey', 'privateKey', 'publicKey', 'token'];
    
    for (const field of requiredFields) {
      if (!this.config[field]) {
        console.error(`❌ Configuration PayDunya manquante: ${field}`);
        console.error('Configuration actuelle:', {
          masterKey: this.config.masterKey ? '✓' : '✗',
          privateKey: this.config.privateKey ? '✓' : '✗',
          publicKey: this.config.publicKey ? '✓' : '✗',
          token: this.config.token ? '✓' : '✗',
          mode: this.config.mode
        });
        throw new Error(`Configuration PayDunya manquante: ${field}. Veuillez configurer les variables d'environnement PAYDUNYA_*`);
      }
    }
    
    console.log('✅ Configuration PayDunya validée');
    return true;
  }

  /**
   * Générer les en-têtes d'authentification PayDunya
   */
  getAuthHeaders() {
    return {
      'PAYDUNYA-MASTER-KEY': this.config.masterKey,
      'PAYDUNYA-PRIVATE-KEY': this.config.privateKey,
      'PAYDUNYA-PUBLIC-KEY': this.config.publicKey,
      'PAYDUNYA-TOKEN': this.config.token,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Générer un ID de transaction unique
   */
  generateTransactionId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `PAYDUNYA_${timestamp}_${random}`.toUpperCase();
  }

  /**
   * Initialiser un paiement PayDunya
   */
  async initializePayment({
    amount,
    currency,
    customerInfo,
    donationId,
    callbackUrl,
    paymentMethod = 'card',
    description = 'DON PARTENAIRE MAGB'
  }) {
    try {
      // Valider la configuration
      this.validateConfig();

      // Valider l'opérateur de paiement
      // Si paymentMethod est 'paydunya', on accepte (l'opérateur spécifique sera choisi plus tard)
      if (paymentMethod !== 'paydunya' && !this.supportedOperators.includes(paymentMethod)) {
        throw new Error(`Opérateur de paiement non supporté: ${paymentMethod}. Opérateurs supportés: ${this.supportedOperators.join(', ')}`);
      }

      const transactionId = this.generateTransactionId();
      const mobileCallbackUrl = this.generateMobileCallbackUrl(transactionId, donationId);
      const webCallbackUrl = this.generateWebCallbackUrl(transactionId, donationId);

      // Préparer les données de la facture selon l'API PayDunya
      const invoiceData = {
        // Informations de la facture
        invoice: {
          total_amount: parseFloat(amount),
          description: description,
          currency: currency || 'XOF'
        },
        
        // Informations du magasin/organisation
        store: {
          name: 'Partenaire MAGB',
          tagline: 'Plateforme de dons pour MAGB',
          postal_address: 'Abidjan, Côte d\'Ivoire',
          phone: process.env.ORGANIZATION_PHONE || '+225XXXXXXXX',
          logo_url: process.env.ORGANIZATION_LOGO_URL || '',
          website_url: process.env.FRONTEND_URL || 'https://partenairemagb.com'
        },

        // Actions après paiement
        actions: {
          cancel_url: webCallbackUrl + '&status=cancelled',
          return_url: mobileCallbackUrl,
          callback_url: `${process.env.BACKEND_URL}/api/webhooks/paydunya`
        },

        // Données personnalisées
        custom_data: {
          donation_id: donationId,
          customer_id: customerInfo.userId,
          transaction_id: transactionId,
          platform: 'partenaire-magb',
          payment_method: paymentMethod,
          customer_email: customerInfo.email,
          customer_phone: customerInfo.phone
        }
      };

      console.log('🔄 PayDunya: Initialisation du paiement:', {
        transactionId,
        amount,
        currency,
        paymentMethod,
        donationId
      });

      // Appel à l'API PayDunya pour créer la facture
      const response = await axios.post(
        `${this.config.baseUrl}/checkout-invoice/create`,
        invoiceData,
        {
          headers: this.getAuthHeaders(),
          timeout: 30000
        }
      );

      if (response.data && response.data.response_code === '00') {
        // Succès de création de facture
        const result = {
          success: true,
          transactionId: transactionId,
          paydunyaToken: response.data.token,
          paymentUrl: response.data.response_text, // URL de paiement PayDunya
          invoice_url: response.data.invoice_url,
          status: 'pending',
          expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
          callbackUrl: mobileCallbackUrl,
          paymentMethod: paymentMethod,
          rawResponse: response.data
        };

        console.log('✅ PayDunya: Paiement initialisé avec succès:', {
          transactionId: result.transactionId,
          paydunyaToken: result.paydunyaToken,
          paymentUrl: result.paymentUrl
        });

        return result;
      } else {
        // Erreur de l'API PayDunya
        const errorMessage = response.data?.response_text || 'Erreur PayDunya inconnue';
        console.error('❌ PayDunya: Erreur de l\'API:', response.data);
        throw new Error(`Erreur PayDunya: ${errorMessage}`);
      }

    } catch (error) {
      console.error('❌ PayDunya: Erreur lors de l\'initialisation:', error);
      
      if (error.response) {
        // Erreur de réponse HTTP
        const errorData = error.response.data;
        const errorMessage = errorData?.response_text || errorData?.message || 'Erreur PayDunya API';
        throw new Error(`PayDunya API Error: ${errorMessage}`);
      } else if (error.request) {
        // Erreur de réseau
        throw new Error('PayDunya: Erreur de connexion à l\'API');
      } else {
        // Autre erreur
        throw new Error(`PayDunya: ${error.message}`);
      }
    }
  }

  /**
   * Vérifier le statut d'un paiement PayDunya
   */
  async checkPaymentStatus(paydunyaToken) {
    try {
      this.validateConfig();

      console.log('🔍 PayDunya: Vérification du statut pour token:', paydunyaToken);

      const response = await axios.get(
        `${this.config.baseUrl}/checkout-invoice/confirm/${paydunyaToken}`,
        {
          headers: this.getAuthHeaders(),
          timeout: 15000
        }
      );

      if (response.data) {
        const status = response.data.response_code === '00' ? 'completed' : 'pending';
        
        console.log('✅ PayDunya: Statut récupéré:', {
          token: paydunyaToken,
          status: status,
          responseCode: response.data.response_code
        });

        return {
          success: true,
          status: status,
          transactionId: response.data.custom_data?.transaction_id,
          donationId: response.data.custom_data?.donation_id,
          amount: response.data.invoice?.total_amount,
          currency: response.data.invoice?.currency,
          rawResponse: response.data
        };
      } else {
        throw new Error('Réponse invalide de PayDunya');
      }

    } catch (error) {
      console.error('❌ PayDunya: Erreur lors de la vérification du statut:', error);
      
      if (error.response?.status === 404) {
        // Transaction non trouvée
        return {
          success: false,
          status: 'not_found',
          error: 'Transaction non trouvée'
        };
      }
      
      throw new Error(`PayDunya Status Check Error: ${error.message}`);
    }
  }

  /**
   * Calculer les frais PayDunya
   */
  calculateFees(amount, currency = 'XOF', paymentMethod = 'card') {
    // Structure des frais PayDunya (à ajuster selon les tarifs réels)
    const feeStructures = {
      'card': {
        percentage: 3.5,
        fixed: 0
      },
      'orange-money-senegal': {
        percentage: 2.0,
        fixed: 50
      },
      'wave-senegal': {
        percentage: 1.5,
        fixed: 25
      },
      'mtn-benin': {
        percentage: 2.5,
        fixed: 50
      },
      'moov-benin': {
        percentage: 2.5,
        fixed: 50
      },
      'orange-money-ci': {
        percentage: 2.0,
        fixed: 50
      },
      'wave-ci': {
        percentage: 1.5,
        fixed: 25
      },
      'mtn-ci': {
        percentage: 2.5,
        fixed: 50
      },
      'moov-ci': {
        percentage: 2.5,
        fixed: 50
      },
      default: {
        percentage: 3.0,
        fixed: 50
      }
    };

    const structure = feeStructures[paymentMethod] || feeStructures.default;
    const percentageFee = (amount * structure.percentage) / 100;
    const totalFee = percentageFee + structure.fixed;

    return {
      percentageFee: Math.round(percentageFee),
      fixedFee: structure.fixed,
      totalFee: Math.round(totalFee),
      netAmount: Math.round(amount - totalFee),
      paymentMethod: paymentMethod
    };
  }

  /**
   * Traiter un webhook PayDunya
   */
  async processWebhook(webhookData) {
    try {
      console.log('🔄 PayDunya: Traitement webhook:', webhookData);

      // PayDunya envoie les données dans le body du webhook
      const {
        response_code,
        token,
        invoice,
        custom_data
      } = webhookData;

      if (response_code === '00') {
        // Paiement confirmé
        return {
          success: true,
          status: 'completed',
          transactionId: custom_data?.transaction_id,
          donationId: custom_data?.donation_id,
          paydunyaToken: token,
          amount: invoice?.total_amount,
          currency: invoice?.currency,
          customerInfo: {
            email: custom_data?.customer_email,
            phone: custom_data?.customer_phone
          },
          metadata: custom_data
        };
      } else {
        // Paiement échoué ou en attente
        return {
          success: false,
          status: 'failed',
          transactionId: custom_data?.transaction_id,
          donationId: custom_data?.donation_id,
          error: 'Paiement PayDunya échoué ou en attente'
        };
      }

    } catch (error) {
      console.error('❌ PayDunya: Erreur traitement webhook:', error);
      throw new Error(`PayDunya Webhook Error: ${error.message}`);
    }
  }
}

module.exports = new PayDunyaService();