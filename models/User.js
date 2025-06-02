const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoosePaginate = require('mongoose-paginate-v2');

const userSchema = new mongoose.Schema({
  // Informations personnelles de base
  firstName: {
    type: String,
    required: [true, 'Le prénom est requis'],
    trim: true,
    maxlength: [50, 'Le prénom ne peut pas dépasser 50 caractères']
  },
  lastName: {
    type: String,
    required: [true, 'Le nom est requis'],
    trim: true,
    maxlength: [50, 'Le nom ne peut pas dépasser 50 caractères']
  },
  email: {
    type: String,
    required: [true, 'L\'email est requis'],
    unique: true,
    lowercase: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Veuillez entrer un email valide'
    ]
  },
  phone: {
    type: String,
    required: [true, 'Le numéro de téléphone est requis'],
    match: [/^\+?[1-9]\d{1,14}$/, 'Veuillez entrer un numéro de téléphone valide']
  },
  
  // Authentification
  password: {
    type: String,
    required: [true, 'Le mot de passe est requis'],
    minlength: [8, 'Le mot de passe doit contenir au moins 8 caractères'],
    select: false // Ne pas inclure dans les requêtes par défaut
  },
  
  // Rôles et permissions
  role: {
    type: String,
    enum: ['user', 'admin', 'moderator', 'treasurer'],
    default: 'user'
  },
  
  // Statut du compte
  isActive: {
    type: Boolean,
    default: true
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  isPhoneVerified: {
    type: Boolean,
    default: false
  },
  
  // Informations de localisation
  country: {
    type: String,
    required: [true, 'Le pays est requis']
  },
  city: {
    type: String,
    required: [true, 'La ville est requise']
  },
  
  // Photo de profil
  avatar: {
    type: String,
    default: null
  },
  
  // Préférences utilisateur
  language: {
    type: String,
    enum: ['fr', 'en'],
    default: 'fr'
  },
  currency: {
    type: String,
    enum: ['XOF', 'EUR', 'USD'],
    default: 'XOF'
  },
  timezone: {
    type: String,
    default: 'Africa/Abidjan'
  },
  
  // Notifications
  emailNotifications: {
    donations: { type: Boolean, default: true },
    reminders: { type: Boolean, default: true },
    newsletters: { type: Boolean, default: false }
  },
  smsNotifications: {
    donations: { type: Boolean, default: false },
    reminders: { type: Boolean, default: false }
  },
  
  // Sécurité
  lastLogin: {
    type: Date,
    default: null
  },
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date,
    default: null
  },
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  twoFactorSecret: {
    type: String,
    select: false
  },
  
  // Tokens de vérification et reset
  emailVerificationToken: {
    type: String,
    select: false
  },
  emailVerificationExpires: {
    type: Date,
    select: false
  },
  passwordResetToken: {
    type: String,
    select: false
  },
  passwordResetExpires: {
    type: Date,
    select: false
  },
  
  // Référence au profil détaillé
  profile: {
    type: mongoose.Schema.ObjectId,
    ref: 'Profile'
  },
  
  // Statistiques de gamification
  totalDonations: {
    type: Number,
    default: 0
  },
  donationCount: {
    type: Number,
    default: 0
  },
  level: {
    type: Number,
    default: 1
  },
  points: {
    type: Number,
    default: 0
  },
  badges: [{
    name: String,
    icon: String,
    earnedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes pour les performances
userSchema.index({ email: 1 });
userSchema.index({ phone: 1 });
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ createdAt: -1 });

// Virtual pour le nom complet
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual pour vérifier si le compte est verrouillé
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Middleware pre-save pour hasher le mot de passe
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Méthode pour comparer les mots de passe
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Méthode pour générer un JWT
userSchema.methods.generateAuthToken = function() {
  return jwt.sign(
    { 
      id: this._id,
      email: this.email,
      role: this.role 
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE }
  );
};

// Méthode pour générer un refresh token
userSchema.methods.generateRefreshToken = function() {
  return jwt.sign(
    { id: this._id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRE }
  );
};

// Méthode pour incrémenter les tentatives de connexion
userSchema.methods.incLoginAttempts = function() {
  // Si on a déjà un verrouillage et qu'il n'a pas expiré, on incrémente
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1, loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  // Verrouiller le compte après 5 tentatives pour 2 heures
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = {
      lockUntil: Date.now() + 2 * 60 * 60 * 1000 // 2 heures
    };
  }
  
  return this.updateOne(updates);
};

// Méthode pour réinitialiser les tentatives de connexion
userSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 }
  });
};

// Méthode pour mettre à jour les statistiques de donation
userSchema.methods.updateDonationStats = function(amount) {
  this.totalDonations += amount;
  this.donationCount += 1;
  
  // Système de points (1 point pour 1000 XOF ou équivalent)
  const points = Math.floor(amount / 1000);
  this.points += points;
  
  // Système de niveaux (tous les 1000 points)
  const newLevel = Math.floor(this.points / 1000) + 1;
  if (newLevel > this.level) {
    this.level = newLevel;
  }
  
  return this.save();
};

// Apply pagination plugin
userSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('User', userSchema); 