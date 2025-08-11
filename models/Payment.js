const mongoose = require('mongoose');
const crypto = require('crypto');
const mongoosePaginate = require('mongoose-paginate-v2');

const paymentSchema = new mongoose.Schema({
  // Référence utilisateur et donation
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'L\'utilisateur est requis']
  },
  donation: {
    type: mongoose.Schema.ObjectId,
    ref: 'Donation',
    required: [true, 'La donation est requise']
  },
  
  // Informations de base du paiement
  amount: {
    type: Number,
    required: [true, 'Le montant est requis'],
    min: [0, 'Le montant ne peut pas être négatif'],
    validate: {
      validator: function(value) {
        return !isNaN(value) && isFinite(value) && value >= 0;
      },
      message: 'Le montant doit être un nombre valide et positif'
    }
  },
  currency: {
    type: String,
    enum: ['XOF', 'EUR', 'USD'],
    required: [true, 'La devise est requise'],
    default: 'XOF'
  },
  
  // Méthode de paiement
  paymentMethod: {
    type: String,
    enum: [
      'card',                    // Carte bancaire
      'mobile_money',            // Mobile Money générique
      'bank_transfer',           // Virement bancaire
      'cash',                   // Espèces
      'paypal',                 // PayPal
      'apple_pay',              // Apple Pay
      'google_pay',             // Google Pay
      'crypto',                 // Cryptomonnaie
      'moneyfusion',            // MoneyFusion
      // PayDunya - Opérateurs Mobile Money spécifiques
      'orange-money-senegal',   // Orange Money Sénégal
      'wave-senegal',           // Wave Sénégal
      'free-money-senegal',     // Free Money Sénégal
      'expresso-sn',            // Expresso Sénégal
      'wizall-senegal',         // Wizall Sénégal
      'mtn-benin',              // MTN Bénin
      'moov-benin',             // Moov Bénin
      'orange-money-ci',        // Orange Money Côte d'Ivoire
      'wave-ci',                // Wave Côte d'Ivoire
      'mtn-ci',                 // MTN Côte d'Ivoire
      'moov-ci',                // Moov Côte d'Ivoire
      't-money-togo',           // T-Money Togo
      'moov-togo',              // Moov Togo
      'orange-money-mali',      // Orange Money Mali
      'moov-ml',                // Moov Mali
      'orange-money-burkina',   // Orange Money Burkina Faso
      'moov-burkina-faso'       // Moov Burkina Faso
    ],
    required: [true, 'La méthode de paiement est requise']
  },
  
  // Fournisseur de paiement
  provider: {
    type: String,
    enum: [
      'cinetpay',          // CinetPay
      'stripe',            // Stripe
      'paypal',            // PayPal
      'fusionpay',         // FusionPay
      'moneyfusion',       // MoneyFusion (moneyfusion.net)
      'paydunya',          // PayDunya (paydunya.com)
      'orange_money',      // Orange Money
      'mtn_mobile_money',  // MTN Mobile Money
      'moov_money',        // Moov Money
      'wave',              // Wave
      'manual'             // Paiement manuel (cash)
    ],
    required: [true, 'Le fournisseur de paiement est requis']
  },
  
  // Statut du paiement
  status: {
    type: String,
    enum: [
      'pending',           // En attente
      'processing',        // En traitement
      'completed',         // Complété
      'failed',           // Échoué
      'cancelled',        // Annulé
      'refunded',         // Remboursé
      'partially_refunded', // Partiellement remboursé
      'expired'           // Expiré
    ],
    default: 'pending'
  },
  
  // Informations spécifiques à CinetPay
  cinetpay: {
    transactionId: String,          // cpm_trans_id - ID de transaction CinetPay
    paymentId: String,              // cpm_payid - ID de paiement CinetPay
    siteId: String,                 // cpm_site_id - Site ID
    paymentUrl: String,             // URL de paiement générée
    paymentToken: String,           // Token de paiement
    
    // Statut et résultat
    status: String,                 // cpm_trans_status: ACCEPTED, REFUSED, PENDING
    statusLabel: String,            // cpm_trans_status_label
    result: String,                 // cpm_result - Code résultat
    errorMessage: String,           // cpm_error_message - Message d'erreur
    
    // Détails du paiement
    amount: Number,                 // cpm_amount - Montant traité
    currency: String,               // cpm_currency - Devise
    paymentConfig: String,          // cpm_payment_config - Configuration de paiement
    paymentDate: String,            // cpm_payment_date - Date du paiement
    paymentTime: String,            // cpm_payment_time - Heure du paiement
    
    // Informations client
    customerPhone: String,          // Numéro du client
    customerName: String,           // Nom du client
    customerEmail: String,          // Email du client
    
    // Métadonnées et configuration
    customData: mongoose.Schema.Types.Mixed, // cpm_custom - Données personnalisées
    designVars: mongoose.Schema.Types.Mixed, // cpm_designvars - Variables de design
    
    // Timestamps
    initiatedAt: Date,              // Date d'initiation
    completedAt: Date,              // Date de completion
    failedAt: Date,                 // Date d'échec
    pendingAt: Date,                // Date de mise en attente
    
    // Réponse API complète pour debug
    apiResponse: mongoose.Schema.Types.Mixed, // Réponse complète du webhook
    
    // Informations additionnelles
    operatorId: String,             // ID de l'opérateur (si mobile money)
    operatorName: String,           // Nom de l'opérateur
    operatorTransactionId: String,  // ID de transaction de l'opérateur
    
    metadata: mongoose.Schema.Types.Mixed // Métadonnées additionnelles
  },
  
  // Informations spécifiques à Stripe
  stripe: {
    paymentIntentId: String,      // Payment Intent ID
    chargeId: String,             // Charge ID
    customerId: String,           // Customer ID
    paymentMethodId: String,      // Payment Method ID
    setupIntentId: String,        // Setup Intent ID (pour les paiements récurrents)
    subscriptionId: String,       // Subscription ID
    invoiceId: String,            // Invoice ID
    clientSecret: String,         // Client secret
    receiptUrl: String,           // URL du reçu Stripe
    networkStatus: String,        // Statut réseau de la carte
    riskLevel: String,            // Niveau de risque
    metadata: mongoose.Schema.Types.Mixed
  },
  
  // Informations spécifiques à PayPal
  paypal: {
    orderId: String,              // Order ID PayPal
    paymentId: String,            // Payment ID
    payerId: String,              // Payer ID
    captureId: String,            // Capture ID
    authorizationId: String,      // Authorization ID
    subscriptionId: String,       // Subscription ID
    planId: String,               // Plan ID
    facilitatorAccessToken: String, // Token d'accès
    debugId: String,              // Debug ID
    metadata: mongoose.Schema.Types.Mixed
  },
  
  // Informations spécifiques à PayDunya
  paydunya: {
    token: String,                // Token PayDunya de la facture
    transactionId: String,        // ID de transaction généré par nous
    paymentUrl: String,           // URL de paiement PayDunya
    invoiceUrl: String,           // URL de la facture PayDunya
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'cancelled', 'expired'],
      default: 'pending'
    },
    responseCode: String,         // Code de réponse PayDunya (00 = succès)
    responseText: String,         // Texte de réponse PayDunya
    paymentMethod: String,        // Opérateur utilisé (orange-money-ci, wave-senegal, etc.)
    customerInfo: {
      name: String,
      email: String,
      phone: String
    },
    fees: {
      percentageFee: Number,
      fixedFee: Number,
      totalFee: Number,
      netAmount: Number
    },
    expiresAt: Date,              // Date d'expiration de la facture
    completedAt: Date,            // Date de completion du paiement
    failedAt: Date,               // Date d'échec du paiement
    
    // Données de la facture PayDunya
    invoice: {
      totalAmount: Number,
      description: String,
      currency: String
    },
    
    // Données personnalisées envoyées à PayDunya
    customData: {
      donationId: String,
      customerId: String,
      platform: String,
      transactionId: String
    },
    
    // Réponse API complète de PayDunya
    rawResponse: mongoose.Schema.Types.Mixed,
    
    // Métadonnées additionnelles
    metadata: mongoose.Schema.Types.Mixed
  },
  
  // Informations Mobile Money (Orange, MTN, Moov)
  mobileMoney: {
    provider: {
      type: String,
      enum: ['orange', 'mtn', 'moov', 'wave']
    },
    transactionId: String,        // ID de transaction
    operatorTransactionId: String, // ID opérateur
    customerPhone: String,        // Numéro du client
    operatorResponseCode: String, // Code de réponse opérateur
    operatorResponseMessage: String, // Message de réponse
    fees: Number,                 // Frais de transaction
    metadata: mongoose.Schema.Types.Mixed
  },
  
  // Informations génériques de transaction
  transaction: {
    externalId: String,           // ID externe du fournisseur
    reference: String,            // Référence unique générée
    description: String,          // Description de la transaction
    failureReason: String,        // Raison de l'échec
    processedAt: Date,            // Date de traitement
    completedAt: Date,            // Date de completion
    expiresAt: Date              // Date d'expiration
  },
  
  // Informations de remboursement
  refund: {
    amount: Number,               // Montant remboursé
    reason: String,               // Raison du remboursement
    refundedAt: Date,             // Date du remboursement
    refundId: String,             // ID du remboursement
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed']
    }
  },
  
  // Frais de transaction
  fees: {
    processingFee: {
      type: Number,
      default: 0
    },
    platformFee: {
      type: Number,
      default: 0
    },
    currency: {
      type: String,
      default: 'XOF'
    }
  },
  
  // Informations de sécurité
  security: {
    ipAddress: String,            // Adresse IP du paiement
    userAgent: String,            // User agent
    fingerprint: String,          // Empreinte du navigateur
    riskScore: Number,            // Score de risque (0-100)
    fraudCheck: {
      status: {
        type: String,
        enum: ['passed', 'failed', 'pending', 'skipped']
      },
      details: mongoose.Schema.Types.Mixed
    }
  },
  
  // Webhooks et notifications
  webhooks: [{
    provider: String,             // Fournisseur du webhook
    eventType: String,            // Type d'événement
    eventId: String,              // ID de l'événement
    payload: mongoose.Schema.Types.Mixed, // Payload du webhook
    signature: String,            // Signature de vérification
    verified: {
      type: Boolean,
      default: false
    },
    processedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Tentatives de paiement
  attempts: [{
    attemptNumber: Number,
    status: String,
    errorCode: String,
    errorMessage: String,
    attemptedAt: {
      type: Date,
      default: Date.now
    },
    processingTime: Number,       // Temps de traitement en ms
    metadata: mongoose.Schema.Types.Mixed
  }],
  
  // Audit trail
  history: [{
    action: {
      type: String,
      enum: [
        'created', 'initiated', 'processing', 'completed', 
        'failed', 'cancelled', 'refunded', 'webhook_received', 'updated'
      ]
    },
    description: String,
    performedBy: {
      type: mongoose.Schema.ObjectId,
      ref: 'User'
    },
    performedAt: {
      type: Date,
      default: Date.now
    },
    metadata: mongoose.Schema.Types.Mixed
  }],
  
  // Informations spécifiques à FusionPay
  fusionpay: {
    transactionId: String,        // ID de transaction FusionPay
    reference: String,            // Référence unique FusionPay
    paymentUrl: String,           // URL de paiement
    status: String,               // Statut FusionPay
    paymentMethod: String,        // Méthode spécifique FusionPay
    customerInfo: mongoose.Schema.Types.Mixed, // Infos client
    fees: {
      percentageFee: Number,      // Frais en pourcentage
      fixedFee: Number,           // Frais fixes
      totalFee: Number,           // Total des frais
      currency: String            // Devise des frais
    },
    expiresAt: Date,             // Date d'expiration
    completedAt: Date,           // Date de completion
    exchangeRate: Number,        // Taux de change (si applicable)
    cryptoDetails: {             // Détails crypto si applicable
      wallet: String,
      blockchain: String,
      txHash: String,
      confirmations: Number
    },
    metadata: mongoose.Schema.Types.Mixed // Métadonnées additionnelles
  },
  
  // Informations spécifiques à MoneyFusion
  moneyfusion: {
    token: String,                // Token de paiement MoneyFusion
    paymentUrl: String,           // URL de redirection
    transactionReference: String, // Référence de transaction
    status: String,               // Statut MoneyFusion (paid, pending, failed, etc.)
    customerInfo: {
      name: String,               // Nom du client
      phone: String               // Téléphone du client
    },
    fees: {
      amount: Number,             // Montant des frais
      currency: String            // Devise des frais
    },
    paymentMethod: String,        // Méthode utilisée (selon MoneyFusion)
    customData: mongoose.Schema.Types.Mixed, // Données personnalisées stockées
    completedAt: Date,            // Date de completion
    apiResponse: mongoose.Schema.Types.Mixed, // Réponse complète de l'API
    metadata: mongoose.Schema.Types.Mixed // Métadonnées additionnelles
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes pour les performances
paymentSchema.index({ user: 1 });
paymentSchema.index({ donation: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ provider: 1 });
paymentSchema.index({ paymentMethod: 1 });
paymentSchema.index({ 'transaction.reference': 1 });
paymentSchema.index({ 'cinetpay.transactionId': 1 });
paymentSchema.index({ 'cinetpay.paymentId': 1 });
paymentSchema.index({ 'cinetpay.siteId': 1 });
paymentSchema.index({ 'stripe.paymentIntentId': 1 });
paymentSchema.index({ 'paypal.orderId': 1 });
paymentSchema.index({ 'fusionpay.transactionId': 1 });
paymentSchema.index({ 'fusionpay.reference': 1 });
paymentSchema.index({ 'moneyfusion.token': 1 });
paymentSchema.index({ 'moneyfusion.transactionReference': 1 });
paymentSchema.index({ createdAt: -1 });

// Index composé pour les requêtes fréquentes
paymentSchema.index({ status: 1, provider: 1, createdAt: -1 });

// Virtual pour le montant formaté
paymentSchema.virtual('formattedAmount').get(function() {
  const formatter = new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: this.currency,
    minimumFractionDigits: 0
  });
  return formatter.format(this.amount);
});

// Virtual pour vérifier si le paiement est en cours
paymentSchema.virtual('isPending').get(function() {
  return ['pending', 'processing'].includes(this.status);
});

// Virtual pour calculer le montant net (après frais)
paymentSchema.virtual('netAmount').get(function() {
  return this.amount - (this.fees.processingFee || 0) - (this.fees.platformFee || 0);
});

// Middleware pre-save pour générer la référence
paymentSchema.pre('save', function(next) {
  if (this.isNew && !this.transaction.reference) {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex');
    this.transaction.reference = `PAY-${timestamp}-${random}`.toUpperCase();
  }
  next();
});

// Méthode pour ajouter une tentative de paiement
paymentSchema.methods.addAttempt = function(status, errorCode = null, errorMessage = null, processingTime = 0) {
  const attemptNumber = this.attempts.length + 1;
  this.attempts.push({
    attemptNumber,
    status,
    errorCode,
    errorMessage,
    processingTime
  });
  return this;
};

// Méthode pour ajouter un webhook
paymentSchema.methods.addWebhook = function(provider, eventType, eventId, payload, signature = null) {
  this.webhooks.push({
    provider,
    eventType,
    eventId,
    payload,
    signature
  });
  return this;
};

// Méthode pour ajouter une entrée à l'historique
paymentSchema.methods.addToHistory = function(action, description, performedBy = null, metadata = {}) {
  this.history.push({
    action,
    description,
    performedBy,
    metadata
  });
  return this;
};

// Méthode pour marquer comme complété
paymentSchema.methods.markCompleted = function(transactionData = {}) {
  this.status = 'completed';
  this.transaction.completedAt = new Date();
  
  // Mettre à jour les données spécifiques au fournisseur
  if (transactionData.cinetpay) {
    Object.assign(this.cinetpay, transactionData.cinetpay);
  }
  if (transactionData.stripe) {
    Object.assign(this.stripe, transactionData.stripe);
  }
  if (transactionData.paypal) {
    Object.assign(this.paypal, transactionData.paypal);
  }
  if (transactionData.fusionpay) {
    Object.assign(this.fusionpay, transactionData.fusionpay);
  }
  if (transactionData.mobileMoney) {
    Object.assign(this.mobileMoney, transactionData.mobileMoney);
  }
  
  this.addToHistory('completed', 'Paiement complété avec succès', null, transactionData);
  return this.save();
};

// Méthode pour marquer comme échoué
paymentSchema.methods.markFailed = function(reason, errorCode = null) {
  this.status = 'failed';
  this.transaction.failureReason = reason;
  this.addAttempt('failed', errorCode, reason);
  this.addToHistory('failed', reason);
  return this.save();
};

// Méthode pour initier un remboursement
paymentSchema.methods.initiateRefund = function(amount, reason) {
  if (this.status !== 'completed') {
    throw new Error('Seuls les paiements complétés peuvent être remboursés');
  }
  
  const refundAmount = amount || this.amount;
  if (refundAmount > this.amount) {
    throw new Error('Le montant du remboursement ne peut pas dépasser le montant du paiement');
  }
  
  this.refund = {
    amount: refundAmount,
    reason,
    status: 'pending'
  };
  
  if (refundAmount === this.amount) {
    this.status = 'refunded';
  } else {
    this.status = 'partially_refunded';
  }
  
  this.addToHistory('refunded', `Remboursement initié: ${refundAmount} ${this.currency}`, null, {
    refundAmount,
    reason
  });
  
  return this.save();
};

// Méthode pour calculer les frais
paymentSchema.methods.calculateFees = function() {
  let processingFee = 0;
  let platformFee = 0;
  
  // Calcul des frais selon le fournisseur
  switch (this.provider) {
    case 'cinetpay':
      // Frais CinetPay (exemple: 2.5% + 100 XOF)
      processingFee = (this.amount * 0.025) + 100;
      break;
    case 'stripe':
      // Frais Stripe (exemple: 2.9% + 30)
      processingFee = (this.amount * 0.029) + 30;
      break;
    case 'fusionpay':
      // Calculer les frais FusionPay selon la méthode
      const fusionPayService = require('../services/fusionPayService');
      const fees = fusionPayService.calculateFees(this.amount, this.currency, this.paymentMethod);
      processingFee = fees.totalFee;
      break;
    case 'moneyfusion':
      // Calculer les frais MoneyFusion
      const moneyFusionService = require('../services/moneyFusionService');
      const mfFees = moneyFusionService.calculateFees(this.amount, this.currency);
      processingFee = mfFees.totalFee;
      break;
    case 'paydunya':
      // Calculer les frais PayDunya selon la méthode de paiement
      const paydunyaService = require('../services/paydunyaService');
      const pdFees = paydunyaService.calculateFees(this.amount, this.currency, this.paymentMethod);
      processingFee = pdFees.totalFee;
      break;
    case 'orange_money':
    case 'mtn_mobile_money':
    case 'moov_money':
      // Frais Mobile Money (exemple: 1% min 50 XOF)
      processingFee = Math.max(this.amount * 0.01, 50);
      break;
    case 'paypal':
      // Frais PayPal (exemple: 3.4% + fixe selon région)
      processingFee = this.amount * 0.034;
      break;
  }
  
  // Frais de plateforme (exemple: 1%)
  platformFee = this.amount * 0.01;
  
  this.fees.processingFee = Math.round(processingFee);
  this.fees.platformFee = Math.round(platformFee);
  
  return {
    processingFee: this.fees.processingFee,
    platformFee: this.fees.platformFee,
    total: this.fees.processingFee + this.fees.platformFee
  };
};

// Méthode statique pour obtenir les statistiques de paiement
paymentSchema.statics.getStats = function(filters = {}) {
  const pipeline = [
    { $match: { ...filters } },
    {
      $group: {
        _id: {
          status: '$status',
          provider: '$provider'
        },
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        averageAmount: { $avg: '$amount' }
      }
    },
    {
      $group: {
        _id: null,
        stats: {
          $push: {
            status: '$_id.status',
            provider: '$_id.provider',
            count: '$count',
            totalAmount: '$totalAmount',
            averageAmount: '$averageAmount'
          }
        },
        totalTransactions: { $sum: '$count' },
        totalVolume: { $sum: '$totalAmount' }
      }
    }
  ];
  
  return this.aggregate(pipeline);
};

// Méthode statique pour obtenir les paiements en attente
paymentSchema.statics.getPendingPayments = function(olderThanMinutes = 60) {
  const cutoffDate = new Date(Date.now() - olderThanMinutes * 60 * 1000);
  
  return this.find({
    status: { $in: ['pending', 'processing'] },
    createdAt: { $lt: cutoffDate }
  }).populate('user donation');
};

// Apply pagination plugin
paymentSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Payment', paymentSchema); 