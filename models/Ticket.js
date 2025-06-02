const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const ticketSchema = new mongoose.Schema({
  // Référence utilisateur
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'L\'utilisateur est requis']
  },
  
  // Informations de base du ticket
  ticketNumber: {
    type: String,
    unique: true,
    required: true
  },
  subject: {
    type: String,
    required: [true, 'Le sujet est requis'],
    trim: true,
    maxlength: [200, 'Le sujet ne peut pas dépasser 200 caractères']
  },
  description: {
    type: String,
    required: [true, 'La description est requise'],
    maxlength: [2000, 'La description ne peut pas dépasser 2000 caractères']
  },
  
  // Catégorie et type
  category: {
    type: String,
    enum: [
      'technical',       // Problème technique
      'payment',         // Problème de paiement
      'account',         // Problème de compte
      'donation',        // Question sur les dons
      'bug_report',      // Rapport de bug
      'feature_request', // Demande de fonctionnalité
      'general',         // Question générale
      'complaint',       // Réclamation
      'suggestion'       // Suggestion
    ],
    required: [true, 'La catégorie est requise']
  },
  
  // Priorité
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  
  // Statut
  status: {
    type: String,
    enum: [
      'open',           // Ouvert
      'in_progress',    // En cours
      'waiting_user',   // En attente de l'utilisateur
      'waiting_admin',  // En attente d'un admin
      'resolved',       // Résolu
      'closed',         // Fermé
      'cancelled'       // Annulé
    ],
    default: 'open'
  },
  
  // Assignation
  assignedTo: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },
  assignedAt: Date,
  assignedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },
  
  // Résolution
  resolution: {
    type: String,
    maxlength: [1000, 'La résolution ne peut pas dépasser 1000 caractères']
  },
  resolvedAt: Date,
  resolvedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },
  
  // Informations contextuelles
  context: {
    url: String,              // URL où le problème s'est produit
    userAgent: String,        // User agent du navigateur
    ipAddress: String,        // Adresse IP
    deviceInfo: String,       // Informations sur l'appareil
    errorDetails: mongoose.Schema.Types.Mixed, // Détails de l'erreur
    relatedDonation: {        // Donation liée (pour les problèmes de paiement)
      type: mongoose.Schema.ObjectId,
      ref: 'Donation'
    },
    relatedPayment: {         // Paiement lié
      type: mongoose.Schema.ObjectId,
      ref: 'Payment'
    }
  },
  
  // Pièces jointes
  attachments: [{
    filename: {
      type: String,
      required: true
    },
    originalName: String,
    url: String,
    size: Number,
    mimeType: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    uploadedBy: {
      type: mongoose.Schema.ObjectId,
      ref: 'User'
    }
  }],
  
  // Tags pour la catégorisation
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  
  // Évaluation du support (après résolution)
  rating: {
    score: {
      type: Number,
      min: 1,
      max: 5
    },
    comment: {
      type: String,
      maxlength: [500, 'Le commentaire ne peut pas dépasser 500 caractères']
    },
    ratedAt: Date
  },
  
  // Métriques de performance
  metrics: {
    firstResponseTime: Number,    // Temps de première réponse (en minutes)
    resolutionTime: Number,       // Temps de résolution (en minutes)
    responseCount: {              // Nombre total de réponses
      type: Number,
      default: 0
    },
    escalationCount: {            // Nombre d'escalades
      type: Number,
      default: 0
    }
  },
  
  // Escalade
  escalation: {
    isEscalated: {
      type: Boolean,
      default: false
    },
    escalatedAt: Date,
    escalatedBy: {
      type: mongoose.Schema.ObjectId,
      ref: 'User'
    },
    escalationReason: String,
    escalatedTo: {
      type: mongoose.Schema.ObjectId,
      ref: 'User'
    }
  },
  
  // Rappels et notifications
  reminders: [{
    type: {
      type: String,
      enum: ['follow_up', 'deadline', 'escalation']
    },
    scheduledFor: Date,
    message: String,
    sent: {
      type: Boolean,
      default: false
    },
    sentAt: Date
  }],
  
  // SLA (Service Level Agreement)
  sla: {
    responseDeadline: Date,      // Deadline pour la première réponse
    resolutionDeadline: Date,    // Deadline pour la résolution
    isResponseOverdue: {
      type: Boolean,
      default: false
    },
    isResolutionOverdue: {
      type: Boolean,
      default: false
    }
  },
  
  // Informations de fermeture
  closedAt: Date,
  closedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },
  closeReason: {
    type: String,
    enum: ['resolved', 'duplicate', 'spam', 'irrelevant', 'user_request']
  },
  
  // Audit trail
  history: [{
    action: {
      type: String,
      enum: [
        'created', 'updated', 'assigned', 'status_changed',
        'priority_changed', 'escalated', 'resolved', 'closed',
        'reopened', 'comment_added'
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
    oldValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed,
    metadata: mongoose.Schema.Types.Mixed
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes pour les performances
ticketSchema.index({ user: 1 });
ticketSchema.index({ ticketNumber: 1 });
ticketSchema.index({ status: 1 });
ticketSchema.index({ category: 1 });
ticketSchema.index({ priority: 1 });
ticketSchema.index({ assignedTo: 1 });
ticketSchema.index({ createdAt: -1 });
ticketSchema.index({ 'sla.responseDeadline': 1 });
ticketSchema.index({ 'sla.resolutionDeadline': 1 });

// Index composé pour les requêtes fréquentes
ticketSchema.index({ status: 1, priority: 1, createdAt: -1 });
ticketSchema.index({ assignedTo: 1, status: 1 });

// Virtual pour vérifier si le ticket est ouvert
ticketSchema.virtual('isOpen').get(function() {
  return ['open', 'in_progress', 'waiting_user', 'waiting_admin'].includes(this.status);
});

// Virtual pour calculer l'âge du ticket
ticketSchema.virtual('ageInHours').get(function() {
  const now = new Date();
  const created = this.createdAt;
  return Math.round((now - created) / (1000 * 60 * 60));
});

// Virtual pour calculer le temps écoulé depuis la dernière activité
ticketSchema.virtual('timeSinceLastActivity').get(function() {
  const now = new Date();
  const lastUpdate = this.updatedAt;
  return Math.round((now - lastUpdate) / (1000 * 60 * 60));
});

// Middleware pre-save pour générer le numéro de ticket
ticketSchema.pre('save', async function(next) {
  if (this.isNew && !this.ticketNumber) {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    
    // Compter les tickets du mois
    const count = await this.constructor.countDocuments({
      createdAt: {
        $gte: new Date(year, new Date().getMonth(), 1),
        $lt: new Date(year, new Date().getMonth() + 1, 1)
      }
    });
    
    this.ticketNumber = `TIC-${year}${month}-${String(count + 1).padStart(4, '0')}`;
  }
  
  // Calculer les SLA
  if (this.isNew) {
    this.calculateSLA();
  }
  
  next();
});

// Méthode pour calculer les SLA
ticketSchema.methods.calculateSLA = function() {
  const now = new Date();
  let responseHours = 24;  // 24h par défaut
  let resolutionHours = 72; // 72h par défaut
  
  // Ajuster selon la priorité
  switch (this.priority) {
    case 'urgent':
      responseHours = 2;
      resolutionHours = 8;
      break;
    case 'high':
      responseHours = 4;
      resolutionHours = 24;
      break;
    case 'medium':
      responseHours = 12;
      resolutionHours = 48;
      break;
    case 'low':
      responseHours = 24;
      resolutionHours = 96;
      break;
  }
  
  this.sla.responseDeadline = new Date(now.getTime() + responseHours * 60 * 60 * 1000);
  this.sla.resolutionDeadline = new Date(now.getTime() + resolutionHours * 60 * 60 * 1000);
};

// Méthode pour assigner le ticket
ticketSchema.methods.assign = function(assignedTo, assignedBy = null) {
  this.assignedTo = assignedTo;
  this.assignedAt = new Date();
  this.assignedBy = assignedBy;
  this.status = 'in_progress';
  
  this.addToHistory('assigned', `Ticket assigné à ${assignedTo}`, assignedBy, {
    assignedTo
  });
  
  return this.save();
};

// Méthode pour changer le statut
ticketSchema.methods.changeStatus = function(newStatus, performedBy = null, reason = null) {
  const oldStatus = this.status;
  this.status = newStatus;
  
  // Actions spéciales selon le nouveau statut
  if (newStatus === 'resolved') {
    this.resolvedAt = new Date();
    this.resolvedBy = performedBy;
    this.calculateResolutionTime();
  } else if (newStatus === 'closed') {
    this.closedAt = new Date();
    this.closedBy = performedBy;
    if (reason) this.closeReason = reason;
  }
  
  this.addToHistory('status_changed', `Statut changé de ${oldStatus} à ${newStatus}`, performedBy, {
    oldStatus,
    newStatus,
    reason
  });
  
  return this.save();
};

// Méthode pour escalader le ticket
ticketSchema.methods.escalate = function(escalatedTo, escalatedBy, reason) {
  this.escalation.isEscalated = true;
  this.escalation.escalatedAt = new Date();
  this.escalation.escalatedBy = escalatedBy;
  this.escalation.escalationReason = reason;
  this.escalation.escalatedTo = escalatedTo;
  this.metrics.escalationCount += 1;
  
  this.addToHistory('escalated', `Ticket escaladé: ${reason}`, escalatedBy, {
    escalatedTo,
    reason
  });
  
  return this.save();
};

// Méthode pour ajouter une pièce jointe
ticketSchema.methods.addAttachment = function(attachment) {
  this.attachments.push(attachment);
  this.addToHistory('updated', 'Pièce jointe ajoutée', attachment.uploadedBy, {
    filename: attachment.filename
  });
  return this.save();
};

// Méthode pour ajouter une évaluation
ticketSchema.methods.addRating = function(score, comment = null) {
  this.rating = {
    score,
    comment,
    ratedAt: new Date()
  };
  
  this.addToHistory('updated', `Évaluation ajoutée: ${score}/5`, this.user, {
    score,
    comment
  });
  
  return this.save();
};

// Méthode pour calculer le temps de première réponse
ticketSchema.methods.calculateFirstResponseTime = function() {
  if (this.metrics.firstResponseTime) return this.metrics.firstResponseTime;
  
  // Chercher la première réponse dans l'historique
  const firstResponse = this.history.find(h => h.action === 'comment_added' && 
    h.performedBy.toString() !== this.user.toString());
  
  if (firstResponse) {
    const responseTime = Math.round((firstResponse.performedAt - this.createdAt) / (1000 * 60));
    this.metrics.firstResponseTime = responseTime;
    
    // Vérifier si on a respecté le SLA
    if (firstResponse.performedAt > this.sla.responseDeadline) {
      this.sla.isResponseOverdue = true;
    }
  }
  
  return this.metrics.firstResponseTime;
};

// Méthode pour calculer le temps de résolution
ticketSchema.methods.calculateResolutionTime = function() {
  if (this.resolvedAt) {
    const resolutionTime = Math.round((this.resolvedAt - this.createdAt) / (1000 * 60));
    this.metrics.resolutionTime = resolutionTime;
    
    // Vérifier si on a respecté le SLA
    if (this.resolvedAt > this.sla.resolutionDeadline) {
      this.sla.isResolutionOverdue = true;
    }
  }
  
  return this.metrics.resolutionTime;
};

// Méthode pour ajouter une entrée à l'historique
ticketSchema.methods.addToHistory = function(action, description, performedBy = null, metadata = {}) {
  this.history.push({
    action,
    description,
    performedBy,
    metadata
  });
  return this;
};

// Méthode pour programmer un rappel
ticketSchema.methods.scheduleReminder = function(type, scheduledFor, message) {
  this.reminders.push({
    type,
    scheduledFor,
    message
  });
  return this.save();
};

// Méthode statique pour obtenir les tickets en retard
ticketSchema.statics.getOverdueTickets = function() {
  const now = new Date();
  
  return this.find({
    $or: [
      {
        status: { $in: ['open', 'in_progress'] },
        'sla.responseDeadline': { $lt: now },
        'sla.isResponseOverdue': false
      },
      {
        status: { $in: ['open', 'in_progress', 'waiting_admin'] },
        'sla.resolutionDeadline': { $lt: now },
        'sla.isResolutionOverdue': false
      }
    ]
  }).populate('user assignedTo');
};

// Méthode statique pour obtenir les statistiques
ticketSchema.statics.getStats = function(filters = {}) {
  const pipeline = [
    { $match: filters },
    {
      $group: {
        _id: {
          status: '$status',
          category: '$category',
          priority: '$priority'
        },
        count: { $sum: 1 },
        avgResolutionTime: { $avg: '$metrics.resolutionTime' },
        avgFirstResponseTime: { $avg: '$metrics.firstResponseTime' }
      }
    },
    {
      $group: {
        _id: null,
        stats: {
          $push: {
            status: '$_id.status',
            category: '$_id.category',
            priority: '$_id.priority',
            count: '$count',
            avgResolutionTime: '$avgResolutionTime',
            avgFirstResponseTime: '$avgFirstResponseTime'
          }
        },
        totalTickets: { $sum: '$count' }
      }
    }
  ];
  
  return this.aggregate(pipeline);
};

// Apply pagination plugin
ticketSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Ticket', ticketSchema); 