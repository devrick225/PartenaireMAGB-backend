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
    enum: ['user', 'support_agent', 'moderator', 'treasurer', 'admin'],
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
  avatarPublicId: {
    type: String,
    default: null,
    select: false
  },
  
  // Préférences utilisateur
  language: {
    type: String,
    enum: ['fr', 'en'],
    default: 'fr'
  },
  
  // ID Partenaire unique
  partnerId: {
    type: String,
    unique: true,
    required: true,
    uppercase: true,
    length: 10,
    index: true
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
  
  // Codes de vérification (nouveaux)
  emailVerificationCode: {
    type: String,
    select: false
  },
  emailVerificationCodeExpires: {
    type: Date,
    select: false
  },
  phoneVerificationCode: {
    type: String,
    select: false
  },
  phoneVerificationCodeExpires: {
    type: Date,
    select: false
  },
  
  // Codes de réinitialisation de mot de passe
  passwordResetCode: {
    type: String,
    select: false
  },
  passwordResetCodeExpires: {
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
  
  // Système de niveaux de partenaire
  partnerLevel: {
    type: String,
    enum: ['classique', 'bronze', 'argent', 'or'],
    default: 'classique'
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
// userSchema.index({ email: 1 }); // Supprimé car unique: true crée déjà l'index
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

// Virtual pour obtenir les détails du niveau de partenaire
userSchema.virtual('partnerLevelDetails').get(function() {
  const levels = {
    'classique': {
      name: 'Partenaire Classique',
      range: 'Jusqu\'à 300 000 FCFA',
      minAmount: 0,
      maxAmount: 300000,
      color: '#8B5CF6', // Violet
      icon: 'star-outline'
    },
    'bronze': {
      name: 'Partenaire Bronze',
      range: '300 001 - 1M FCFA',
      minAmount: 300001,
      maxAmount: 1000000,
      color: '#CD7F32', // Bronze
      icon: 'star'
    },
    'argent': {
      name: 'Partenaire Argent',
      range: '1M - 10M FCFA',
      minAmount: 1000001,
      maxAmount: 10000000,
      color: '#C0C0C0', // Argent
      icon: 'star'
    },
    'or': {
      name: 'Partenaire Or',
      range: '10M+ FCFA',
      minAmount: 10000001,
      maxAmount: Infinity,
      color: '#FFD700', // Or
      icon: 'star'
    }
  };
  
  return levels[this.partnerLevel] || levels['classique'];
});

// Fonction utilitaire pour générer un ID de partenaire unique
const generatePartnerId = async (userModel) => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let partnerId;
  let isUnique = false;
  let attempts = 0;
  const maxAttempts = 10;

  while (!isUnique && attempts < maxAttempts) {
    // Générer un ID de 10 caractères : 2 lettres + 8 chiffres/lettres
    let id = '';
    
    // Les 2 premiers caractères sont des lettres (pour faciliter la lecture)
    for (let i = 0; i < 2; i++) {
      id += characters.charAt(Math.floor(Math.random() * 26)); // Lettres seulement (A-Z)
    }
    
    // Les 8 caractères suivants sont alphanumériques
    for (let i = 0; i < 8; i++) {
      id += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    
    partnerId = id;
    
    // Vérifier l'unicité
    const existingUser = await userModel.findOne({ partnerId });
    if (!existingUser) {
      isUnique = true;
    }
    
    attempts++;
  }
  
  if (!isUnique) {
    throw new Error('Impossible de générer un ID partenaire unique après plusieurs tentatives');
  }
  
  return partnerId;
};

// Middleware pre-save pour générer l'ID partenaire et hasher le mot de passe
userSchema.pre('save', async function(next) {
  try {
    // Générer l'ID partenaire pour les nouveaux utilisateurs
    if (this.isNew && !this.partnerId) {
      this.partnerId = await generatePartnerId(this.constructor);
      console.log(`✅ ID Partenaire généré: ${this.partnerId} pour ${this.email}`);
    }
    
    // Hasher le mot de passe si modifié
    if (this.isModified('password')) {
      const salt = await bcrypt.genSalt(12);
      this.password = await bcrypt.hash(this.password, salt);
    }
    
    next();
  } catch (error) {
    console.error('❌ Erreur dans pre-save hook:', error);
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
  // Valider et nettoyer le montant
  const validAmount = Number(amount);
  if (isNaN(validAmount) || validAmount < 0) {
    console.error(`❌ Montant invalide pour updateDonationStats: ${amount} (type: ${typeof amount})`);
    throw new Error('Montant de donation invalide');
  }

  // S'assurer que les valeurs actuelles sont valides
  this.totalDonations = isNaN(this.totalDonations) ? 0 : Number(this.totalDonations);
  this.donationCount = isNaN(this.donationCount) ? 0 : Number(this.donationCount);
  this.points = isNaN(this.points) ? 0 : Number(this.points);
  this.level = isNaN(this.level) ? 1 : Number(this.level);

  // Stocker l'ancien niveau de partenaire pour détecter les changements
  const oldPartnerLevel = this.partnerLevel;

  // Mettre à jour les statistiques
  this.totalDonations += validAmount;
  this.donationCount += 1;
  
  // Système de points (1 point pour 1000 XOF ou équivalent)
  const points = Math.floor(validAmount / 1000);
  this.points += points;
  
  // Système de niveaux (tous les 1000 points)
  const newLevel = Math.floor(this.points / 1000) + 1;
  if (newLevel > this.level) {
    this.level = newLevel;
  }

  // Calculer le nouveau niveau de partenaire
  const newPartnerLevel = this.calculatePartnerLevel();

  console.log(`✅ Stats utilisateur mises à jour - Amount: ${validAmount}, Total: ${this.totalDonations}, Count: ${this.donationCount}, Points: ${this.points}, Partner Level: ${oldPartnerLevel} → ${newPartnerLevel}`);
  
  return this.save();
};

// Méthode pour calculer le niveau de partenaire basé sur le total des dons
userSchema.methods.calculatePartnerLevel = function() {
  const totalDonations = this.totalDonations || 0;
  
  if (totalDonations >= 10000001) {
    this.partnerLevel = 'or';
  } else if (totalDonations >= 1000001) {
    this.partnerLevel = 'argent';
  } else if (totalDonations >= 300001) {
    this.partnerLevel = 'bronze';
  } else {
    this.partnerLevel = 'classique';
  }
  
  return this.partnerLevel;
};

// Apply pagination plugin
userSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('User', userSchema); 