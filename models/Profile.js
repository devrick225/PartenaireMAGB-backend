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
    required: [true, 'La date de naissance est requise']
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other'],
    required: [true, 'Le genre est requis']
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
      required: [true, 'L\'adresse est requise']
    },
    neighborhood: String,
    postalCode: String,
    state: String,
    country: {
      type: String,
      required: [true, 'Le pays est requis']
    }
  },
  
  // Informations professionnelles
  occupation: {
    type: String,
    required: [true, 'La profession est requise']
  },
  employer: String,
  monthlyIncome: {
    type: Number,
    min: [0, 'Le revenu ne peut pas être négatif']
  },
  
  // Informations ecclésiastiques
  churchMembership: {
    isChurchMember: {
      type: Boolean,
      default: false
    },
    churchName: String,
    membershipDate: Date,
    baptismDate: Date,
    ministry: String, // Ministère dans l'église
    churchRole: {
      type: String,
      enum: ['member', 'deacon', 'elder', 'pastor', 'evangelist', 'other']
    }
  },
  
  // Informations de contact d'urgence
  emergencyContact: {
    name: {
      type: String,
      required: [true, 'Le nom du contact d\'urgence est requis']
    },
    relationship: {
      type: String,
      required: [true, 'La relation avec le contact d\'urgence est requise']
    },
    phone: {
      type: String,
      required: [true, 'Le téléphone du contact d\'urgence est requis'],
      match: [/^\+?[1-9]\d{1,14}$/, 'Numéro de téléphone invalide']
    },
    email: {
      type: String,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Email invalide']
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
      enum: ['tithe', 'offering', 'building', 'missions', 'charity', 'education', 'youth', 'women', 'men']
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
  
  // Préférences de communication
  communicationPreferences: {
    language: {
      type: String,
      enum: ['fr', 'en'],
      default: 'fr'
    },
    preferredContactMethod: {
      type: String,
      enum: ['email', 'sms', 'phone', 'whatsapp'],
      default: 'email'
    },
    receiveNewsletters: {
      type: Boolean,
      default: true
    },
    receiveEventNotifications: {
      type: Boolean,
      default: true
    },
    receiveDonationReminders: {
      type: Boolean,
      default: true
    }
  },
  
  // Compétences et disponibilités pour le bénévolat
  volunteer: {
    isAvailable: {
      type: Boolean,
      default: false
    },
    skills: [String],
    availability: {
      days: [{
        type: String,
        enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
      }],
      timeSlots: [{
        start: String, // Format HH:MM
        end: String    // Format HH:MM
      }]
    },
    interests: [{
      type: String,
      enum: ['teaching', 'music', 'technical', 'administration', 'counseling', 'children', 'youth', 'elderly']
    }]
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
    }],
    spouse: {
      name: String,
      dateOfBirth: Date,
      isChurchMember: {
        type: Boolean,
        default: false
      }
    }
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
    'employer',
    'monthlyIncome',
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