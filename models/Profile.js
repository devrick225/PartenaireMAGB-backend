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
    enum: {
      values: ['male', 'female', 'other'],
      message: 'Genre invalide. Valeurs acceptées: male, female, other'
    },
    default: null,
    validate: {
      validator: function (value) {
        // Accepter null, undefined ou valeurs vides
        if (!value || value === '') return true;
        return ['male', 'female', 'other'].includes(value);
      },
      message: 'Genre invalide'
    }
  },
  maritalStatus: {
    type: String,
    enum: {
      values: ['single', 'married', 'divorced', 'widowed'],
      message: 'Statut matrimonial invalide. Valeurs acceptées: single, married, divorced, widowed'
    },
    default: null,
    validate: {
      validator: function (value) {
        // Accepter null, undefined ou valeurs vides
        if (!value || value === '') return true;
        return ['single', 'married', 'divorced', 'widowed'].includes(value);
      },
      message: 'Statut matrimonial invalide'
    }
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
        validator: function (value) {
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
        validator: function (value) {
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
      enum: ['don_mensuel', 'don_trimestriel', 'don_semestriel', 'don_ponctuel', 'don_libre', 'don_concert_femmes', 'don_ria_2025']
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
profileSchema.virtual('age').get(function () {
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
profileSchema.virtual('isActiveChurchMember').get(function () {
  return this.churchMembership.isChurchMember && this.churchMembership.membershipDate;
});

// Méthode pour calculer le pourcentage de completion du profil
// 100% = dateOfBirth + gender + address.street remplis
profileSchema.methods.calculateCompletionPercentage = function () {
  const isFilled = (value) => value !== null && value !== undefined && value !== '';

  const requiredFields = [
    'dateOfBirth',
    'gender',
    'address.street'
  ];

  const completed = requiredFields.filter(field => isFilled(this.get(field))).length;
  const total = requiredFields.length;

  this.profileCompletionPercentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  this.isComplete = this.profileCompletionPercentage >= 100;

  return this.profileCompletionPercentage;
};

// Middleware pre-save pour calculer automatiquement le pourcentage
profileSchema.pre('save', function (next) {
  this.calculateCompletionPercentage();
  next();
});

// Méthode pour ajouter une note
profileSchema.methods.addNote = function (content, author, isPrivate = false) {
  this.notes.push({
    content,
    author,
    isPrivate
  });
  return this.save();
};

// Méthode pour marquer une section comme complétée
profileSchema.methods.markSectionComplete = function (section) {
  const existingSection = this.completedSections.find(s => s.section === section);
  if (!existingSection) {
    this.completedSections.push({ section });
  }
  return this.save();
};

// Apply pagination plugin
profileSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Profile', profileSchema); 