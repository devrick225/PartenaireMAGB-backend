const mongoose = require('mongoose');
const moment = require('moment');
const mongoosePaginate = require('mongoose-paginate-v2');

const donationSchema = new mongoose.Schema({
  // Référence utilisateur
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'L\'utilisateur est requis']
  },
  
  // Informations de base du don
  amount: {
    type: Number,
    required: [true, 'Le montant est requis'],
    min: [100, 'Le montant minimum est de 100 XOF']
  },
  currency: {
    type: String,
    enum: ['XOF', 'EUR', 'USD'],
    required: [true, 'La devise est requise'],
    default: 'XOF'
  },
  
  // Catégorie du don
  category: {
    type: String,
    enum: [
      'tithe',        // Dîme
      'offering',     // Offrande
      'building',     // Construction
      'missions',     // Missions
      'charity',      // Charité
      'education',    // Éducation
      'youth',        // Jeunesse
      'women',        // Femmes
      'men',          // Hommes
      'special',      // Événement spécial
      'emergency'     // Urgence
    ],
    required: [true, 'La catégorie est requise']
  },
  
  // Type de don
  type: {
    type: String,
    enum: ['one_time', 'recurring'],
    required: [true, 'Le type de don est requis'],
    default: 'one_time'
  },
  
  // Configuration pour les dons récurrents
  recurring: {
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'],
      required: function() {
        return this.type === 'recurring';
      }
    },
    interval: {
      type: Number,
      default: 1,
      min: [1, 'L\'intervalle doit être au minimum de 1']
    },
    dayOfWeek: {
      type: Number,
      min: 0,
      max: 6, // 0 = Dimanche, 6 = Samedi
      required: function() {
        return this.type === 'recurring' && this.recurring.frequency === 'weekly';
      }
    },
    dayOfMonth: {
      type: Number,
      min: 1,
      max: 31,
      required: function() {
        return this.type === 'recurring' && 
               ['monthly', 'quarterly', 'yearly'].includes(this.recurring.frequency);
      }
    },
    startDate: {
      type: Date,
      required: function() {
        return this.type === 'recurring';
      }
    },
    endDate: {
      type: Date,
      validate: {
        validator: function(value) {
          return !value || value > this.recurring.startDate;
        },
        message: 'La date de fin doit être postérieure à la date de début'
      }
    },
    maxOccurrences: {
      type: Number,
      min: [1, 'Le nombre maximum d\'occurrences doit être au minimum de 1']
    },
    isActive: {
      type: Boolean,
      default: true
    },
    nextPaymentDate: {
      type: Date,
      required: function() {
        return this.type === 'recurring';
      }
    },
    totalExecutions: {
      type: Number,
      default: 0
    }
  },
  
  // Statut du don
  status: {
    type: String,
    enum: [
      'pending',     // En attente
      'processing',  // En traitement
      'completed',   // Complété
      'failed',      // Échoué
      'cancelled',   // Annulé
      'refunded',    // Remboursé
      'scheduled'    // Programmé (pour récurrent)
    ],
    default: 'pending'
  },
  
  // Informations de paiement
  paymentMethod: {
    type: String,
    enum: ['card', 'mobile_money', 'bank_transfer', 'cash', 'paypal', 'moneyfusion'],
    required: [true, 'La méthode de paiement est requise']
  },
  
  // Référence au paiement
  payment: {
    type: mongoose.Schema.ObjectId,
    ref: 'Payment'
  },
  
  // Informations supplémentaires
  message: {
    type: String,
    maxlength: [500, 'Le message ne peut pas dépasser 500 caractères']
  },
  isAnonymous: {
    type: Boolean,
    default: false
  },
  
  // Reçu et documentation
  receipt: {
    number: {
      type: String,
      unique: true
    },
    issued: {
      type: Boolean,
      default: false
    },
    issuedAt: Date,
    downloadUrl: String
  },
  
  // Informations de campagne/événement
  campaign: {
    type: mongoose.Schema.ObjectId,
    ref: 'Campaign'
  },
  event: {
    type: mongoose.Schema.ObjectId,
    ref: 'Event'
  },
  
  // Dédicace ou hommage
  dedication: {
    type: {
      type: String,
      enum: ['honor', 'memory', 'celebration']
    },
    name: String,
    message: String
  },
  
  // Métadonnées administratives
  processedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },
  processedAt: Date,
  
  // Informations de traitement
  transactionId: String,
  
  // Notifications
  notifications: {
    donorNotified: {
      type: Boolean,
      default: false
    },
    adminNotified: {
      type: Boolean,
      default: false
    },
    receiptSent: {
      type: Boolean,
      default: false
    }
  },
  
  // Audit trail
  history: [{
    action: {
      type: String,
      enum: ['created', 'updated', 'processed', 'completed', 'failed', 'cancelled', 'refunded']
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
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes pour les performances
donationSchema.index({ user: 1 });
donationSchema.index({ status: 1 });
donationSchema.index({ type: 1 });
donationSchema.index({ category: 1 });
donationSchema.index({ createdAt: -1 });
donationSchema.index({ 'recurring.isActive': 1 });
donationSchema.index({ 'recurring.nextPaymentDate': 1 });
donationSchema.index({ 'receipt.number': 1 });

// Index composé pour les dons récurrents actifs
donationSchema.index({ 
  type: 1, 
  'recurring.isActive': 1, 
  'recurring.nextPaymentDate': 1 
});

// Virtual pour le montant formaté
donationSchema.virtual('formattedAmount').get(function() {
  const formatter = new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: this.currency,
    minimumFractionDigits: 0
  });
  return formatter.format(this.amount);
});

// Virtual pour vérifier si le don est en cours
donationSchema.virtual('isPending').get(function() {
  return ['pending', 'processing'].includes(this.status);
});

// Virtual pour vérifier si c'est un don récurrent actif
donationSchema.virtual('isActiveRecurring').get(function() {
  return this.type === 'recurring' && this.recurring.isActive;
});

// Middleware pre-save pour générer le numéro de reçu
donationSchema.pre('save', async function(next) {
  if (this.isNew && !this.receipt.number) {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    
    // Compter les donations du mois pour générer un numéro séquentiel
    const count = await this.constructor.countDocuments({
      createdAt: {
        $gte: new Date(year, new Date().getMonth(), 1),
        $lt: new Date(year, new Date().getMonth() + 1, 1)
      }
    });
    
    this.receipt.number = `DON-${year}${month}-${String(count + 1).padStart(4, '0')}`;
  }
  
  next();
});

// Méthode pour calculer la prochaine date de paiement
donationSchema.methods.calculateNextPaymentDate = function() {
  if (this.type !== 'recurring' || !this.recurring.isActive) return null;
  
  const { frequency, interval, dayOfWeek, dayOfMonth, startDate } = this.recurring;
  let nextDate = moment(this.recurring.nextPaymentDate || startDate);
  
  switch (frequency) {
    case 'daily':
      nextDate.add(interval, 'days');
      break;
    
    case 'weekly':
      if (dayOfWeek !== undefined) {
        nextDate.day(dayOfWeek);
        if (nextDate.isSameOrBefore(moment())) {
          nextDate.add(interval, 'weeks');
        }
      } else {
        nextDate.add(interval, 'weeks');
      }
      break;
    
    case 'monthly':
      if (dayOfMonth) {
        nextDate.date(dayOfMonth);
        if (nextDate.isSameOrBefore(moment())) {
          nextDate.add(interval, 'months').date(dayOfMonth);
        }
      } else {
        nextDate.add(interval, 'months');
      }
      break;
    
    case 'quarterly':
      if (dayOfMonth) {
        nextDate.date(dayOfMonth);
        if (nextDate.isSameOrBefore(moment())) {
          nextDate.add(interval * 3, 'months').date(dayOfMonth);
        }
      } else {
        nextDate.add(interval * 3, 'months');
      }
      break;
    
    case 'yearly':
      if (dayOfMonth) {
        nextDate.date(dayOfMonth);
        if (nextDate.isSameOrBefore(moment())) {
          nextDate.add(interval, 'years');
        }
      } else {
        nextDate.add(interval, 'years');
      }
      break;
  }
  
  // Vérifier si on a atteint la date de fin ou le nombre max d'occurrences
  if (this.recurring.endDate && nextDate.isAfter(this.recurring.endDate)) {
    this.recurring.isActive = false;
    return null;
  }
  
  if (this.recurring.maxOccurrences && 
      this.recurring.totalExecutions >= this.recurring.maxOccurrences) {
    this.recurring.isActive = false;
    return null;
  }
  
  this.recurring.nextPaymentDate = nextDate.toDate();
  return this.recurring.nextPaymentDate;
};

// Méthode pour marquer un paiement récurrent comme exécuté
donationSchema.methods.markRecurringExecuted = function() {
  if (this.type === 'recurring') {
    this.recurring.totalExecutions += 1;
    this.calculateNextPaymentDate();
    this.addToHistory('processed', 'Paiement récurrent exécuté');
  }
  return this.save();
};

// Méthode pour arrêter un don récurrent
donationSchema.methods.stopRecurring = function(reason = 'Arrêté par l\'utilisateur') {
  if (this.type === 'recurring') {
    this.recurring.isActive = false;
    this.addToHistory('cancelled', reason);
  }
  return this.save();
};

// Méthode pour ajouter une entrée à l'historique
donationSchema.methods.addToHistory = function(action, description, performedBy = null, metadata = {}) {
  this.history.push({
    action,
    description,
    performedBy,
    metadata
  });
  return this;
};

// Méthode pour marquer le reçu comme émis
donationSchema.methods.issueReceipt = function(downloadUrl = null) {
  this.receipt.issued = true;
  this.receipt.issuedAt = new Date();
  if (downloadUrl) {
    this.receipt.downloadUrl = downloadUrl;
  }
  this.notifications.receiptSent = true;
  this.addToHistory('updated', 'Reçu émis');
  return this.save();
};

// Méthode statique pour obtenir les dons dus aujourd'hui
donationSchema.statics.getDueToday = function() {
  const today = moment().startOf('day').toDate();
  const tomorrow = moment().add(1, 'day').startOf('day').toDate();
  
  return this.find({
    type: 'recurring',
    'recurring.isActive': true,
    'recurring.nextPaymentDate': {
      $gte: today,
      $lt: tomorrow
    }
  }).populate('user');
};

// Méthode statique pour obtenir les statistiques de donation
donationSchema.statics.getStats = function(filters = {}) {
  const pipeline = [
    { $match: { status: 'completed', ...filters } },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: '$amount' },
        totalCount: { $sum: 1 },
        averageAmount: { $avg: '$amount' },
        categoriesStats: {
          $push: {
            category: '$category',
            amount: '$amount'
          }
        }
      }
    }
  ];
  
  return this.aggregate(pipeline);
};

// Apply pagination plugin
donationSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Donation', donationSchema); 