const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const profileSchema = new mongoose.Schema({
  // Référence utilisateur
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  
  // Informations personnelles détaillées
  dateOfBirth: {
    type: Date,
    default: null
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other'],
    default: null
  },
  maritalStatus: {
    type: String,
    enum: ['single', 'married', 'divorced', 'widowed'],
    default: 'single'
  },
  
  // Adresse complète
  address: {
    street: {
      type: String,
      default: ''
    },
    neighborhood: String,
    postalCode: String,
    state: String,
    country: {
      type: String,
      default: ''
    }
  },
  
  // Informations professionnelles
  occupation: {
    type: String,
    default: ''
  },
  
  // Informations ecclésiastiques
  churchMembership: {
    isChurchMember: {
      type: Boolean,
      default: false
    }
  },
  
  // Informations de contact d'urgence
  emergencyContact: {
    name: {
      type: String,
      default: ''
    },
    relationship: {
      type: String,
      default: ''
    },
    phone: {
      type: String,
      default: '',
      validate: {
        validator: function(value) {
          // Valider seulement si le champ n'est pas vide
          return !value || /^\+?[1-9]\d{1,14}$/.test(value);
        },
        message: 'Numéro de téléphone invalide'
      }
    },
    email: {
      type: String,
      default: '',
      validate: {
        validator: function(value) {
          // Valider seulement si le champ n'est pas vide
          return !value || /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(value);
        },
        message: 'Email invalide'
      }
    }
  },
  
  // Préférences de donation
  donationPreferences: {
    preferredAmount: {
      type: Number,
      min: [0, 'Le montant ne peut pas être négatif']
    },
    preferredFrequency: {
      type: String,
      enum: ['weekly', 'monthly', 'quarterly', 'yearly'],
      default: 'monthly'
    },
    preferredDay: {
      type: Number,
      min: 1,
      max: 31
    },
    preferredPaymentMethod: {
      type: String,
      enum: ['card', 'mobile_money', 'bank_transfer', 'cash']
    },
    donationCategories: [{
      type: String,
      enum: ['don_mensuel', 'don_ponctuel', 'don_libre', 'don_concert_femmes', 'don_ria_2025']
    }]
  },
  
  // Informations financières pour les rapports
  financialInfo: {
    bankName: String,
    accountNumber: {
      type: String,
      select: false // Sensible - ne pas exposer par défaut
    },
    mobileMoney: {
      provider: {
        type: String,
        enum: ['orange', 'mtn', 'moov', 'wave']
      },
      number: {
        type: String,
        select: false // Sensible
      }
    }
  },
  

  

  
  // Informations sur la famille
  familyInfo: {
    numberOfChildren: {
      type: Number,
      default: 0,
      min: [0, 'Le nombre d\'enfants ne peut pas être négatif']
    },
    children: [{
      name: String,
      dateOfBirth: Date,
      gender: {
        type: String,
        enum: ['male', 'female']
      }
    }]
  },
  
  // Historique et notes administratives
  notes: [{
    content: String,
    author: {
      type: mongoose.Schema.ObjectId,
      ref: 'User'
    },
    isPrivate: {
      type: Boolean,
      default: false
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Statut du profil
  isComplete: {
    type: Boolean,
    default: false
  },
  completedSections: [{
    section: String,
    completedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Métadonnées
  profileCompletionPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes pour les performances
profileSchema.index({ user: 1 });
profileSchema.index({ 'address.country': 1 });
profileSchema.index({ 'churchMembership.isChurchMember': 1 });
profileSchema.index({ isComplete: 1 });
profileSchema.index({ createdAt: -1 });

// Virtual pour calculer l'âge
profileSchema.virtual('age').get(function() {
  if (!this.dateOfBirth) return null;
  const today = new Date();
  const birthDate = new Date(this.dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
});

// Virtual pour vérifier si c'est un membre d'église actif
profileSchema.virtual('isActiveChurchMember').get(function() {
  return this.churchMembership.isChurchMember && this.churchMembership.membershipDate;
});

// Méthode pour calculer le pourcentage de completion du profil
profileSchema.methods.calculateCompletionPercentage = function() {
  const requiredFields = [
    'dateOfBirth',
    'gender',
    'address.street',
    'address.country',
    'occupation',
    'emergencyContact.name',
    'emergencyContact.relationship',
    'emergencyContact.phone'
  ];
  
  const optionalFields = [
    'maritalStatus',
    'churchMembership.isChurchMember',
    'donationPreferences.preferredAmount',
    'donationPreferences.preferredFrequency'
  ];
  
  let completedRequired = 0;
  let completedOptional = 0;
  
  // Vérifier les champs requis (70% du score)
  requiredFields.forEach(field => {
    const value = this.get(field);
    if (value !== null && value !== undefined && value !== '') {
      completedRequired++;
    }
  });
  
  // Vérifier les champs optionnels (30% du score)
  optionalFields.forEach(field => {
    const value = this.get(field);
    if (value !== null && value !== undefined && value !== '') {
      completedOptional++;
    }
  });
  
  const requiredScore = (completedRequired / requiredFields.length) * 70;
  const optionalScore = (completedOptional / optionalFields.length) * 30;
  
  this.profileCompletionPercentage = Math.round(requiredScore + optionalScore);
  this.isComplete = this.profileCompletionPercentage >= 80;
  
  return this.profileCompletionPercentage;
};

// Middleware pre-save pour calculer automatiquement le pourcentage
profileSchema.pre('save', function(next) {
  this.calculateCompletionPercentage();
  next();
});

// Méthode pour ajouter une note
profileSchema.methods.addNote = function(content, author, isPrivate = false) {
  this.notes.push({
    content,
    author,
    isPrivate
  });
  return this.save();
};

// Méthode pour marquer une section comme complétée
profileSchema.methods.markSectionComplete = function(section) {
  const existingSection = this.completedSections.find(s => s.section === section);
  if (!existingSection) {
    this.completedSections.push({ section });
  }
  return this.save();
};

// Apply pagination plugin
profileSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Profile', profileSchema); 