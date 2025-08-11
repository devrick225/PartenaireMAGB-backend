const mongoose = require('mongoose');

const ministrySchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Le titre du ministère est requis'],
    trim: true,
    maxlength: [200, 'Le titre ne peut pas dépasser 200 caractères']
  },
  description: {
    type: String,
    required: [true, 'La description du ministère est requise'],
    trim: true,
    maxlength: [2000, 'La description ne peut pas dépasser 2000 caractères']
  },
  imageUrl: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        if (!v) return true; // Permettre les valeurs vides
        return /^https?:\/\/.+/.test(v);
      },
      message: 'L\'URL de l\'image doit être une URL valide'
    }
  },
  externalLink: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        if (!v) return true; // Permettre les valeurs vides
        return /^https?:\/\/.+/.test(v);
      },
      message: 'Le lien externe doit être une URL valide'
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  order: {
    type: Number,
    default: 0
  },
  category: {
    type: String,
    enum: ['general', 'youth', 'children', 'women', 'men', 'music', 'prayer', 'evangelism', 'social', 'other'],
    default: 'general'
  },
  contactInfo: {
    name: {
      type: String,
      trim: true,
      maxlength: [100, 'Le nom du contact ne peut pas dépasser 100 caractères']
    },
    phone: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      validate: {
        validator: function(v) {
          if (!v) return true; // Permettre les valeurs vides
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
        },
        message: 'L\'email du contact doit être valide'
      }
    }
  },
  meetingInfo: {
    day: {
      type: String,
      enum: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche', ''],
      default: ''
    },
    time: {
      type: String,
      trim: true
    },
    location: {
      type: String,
      trim: true,
      maxlength: [200, 'Le lieu ne peut pas dépasser 200 caractères']
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index pour améliorer les performances
ministrySchema.index({ isActive: 1, order: 1 });
ministrySchema.index({ category: 1, isActive: 1 });

// Méthode statique pour récupérer les ministères actifs
ministrySchema.statics.getActiveMinistries = function() {
  return this.find({ isActive: true }).sort({ order: 1, createdAt: -1 });
};

// Méthode statique pour récupérer les ministères par catégorie
ministrySchema.statics.getMinistriesByCategory = function(category) {
  return this.find({ 
    isActive: true, 
    category: category 
  }).sort({ order: 1, createdAt: -1 });
};

// Virtual pour l'URL complète de l'image
ministrySchema.virtual('fullImageUrl').get(function() {
  if (!this.imageUrl) return null;
  if (this.imageUrl.startsWith('http')) return this.imageUrl;
  return `${process.env.BACKEND_URL || 'http://localhost:5000'}/uploads/${this.imageUrl}`;
});

// Middleware pre-save pour nettoyer les données
ministrySchema.pre('save', function(next) {
  // Nettoyer les espaces en début et fin
  if (this.title) this.title = this.title.trim();
  if (this.description) this.description = this.description.trim();
  if (this.imageUrl) this.imageUrl = this.imageUrl.trim();
  if (this.externalLink) this.externalLink = this.externalLink.trim();
  
  next();
});

module.exports = mongoose.model('Ministry', ministrySchema); 