const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const mongoosePaginate = require('mongoose-paginate-v2');

// Nombre maximal d'appareils connectés en même temps par compte
const MAX_SESSIONS = 10;
// Délai pendant lequel l'ancien refresh token reste accepté après rotation
// (deux requêtes parties en même temps de la même application)
const REFRESH_REUSE_GRACE_MS = 60 * 1000;

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
      // Accepte les alias (+tag) et les extensions longues (.info, .church, .africa…)
      /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
      'Veuillez entrer un email valide'
    ]
  },
  phone: {
    type: String,
    required: [true, 'Le numéro de téléphone est requis'],
    match: [/^\+?[0-9]\d{7,14}$/, 'Veuillez entrer un numéro de téléphone valide']
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
    uppercase: true,
    validate: {
      validator: function(v) {
        // Permettre undefined pendant la création (sera généré par le middleware)
        return this.isNew ? true : (v && v.length === 10);
      },
      message: 'L\'ID partenaire doit contenir exactement 10 caractères'
    }
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
  // Nombre de codes erronés saisis — le code est invalidé au-delà du seuil (anti brute-force)
  passwordResetCodeAttempts: {
    type: Number,
    default: 0,
    select: false
  },
  
  passwordResetToken: {
    type: String,
    select: false
  },

  // Sessions ouvertes (une par appareil). Les JWT portent l'identifiant de session :
  // supprimer la session (déconnexion, changement de mot de passe) invalide aussitôt
  // l'access token et le refresh token correspondants.
  sessions: {
    type: [{
      _id: false,
      sid: String,          // identifiant de session, présent dans les deux tokens
      rid: String,          // identifiant du refresh token courant (rotation)
      prevRid: String,      // refresh token précédent, toléré quelques secondes
      rotatedAt: Date,
      createdAt: Date,
      expiresAt: Date
    }],
    default: [],
    select: false
  },
  // Les tokens émis avant cette date (anciens tokens sans session) sont refusés
  passwordChangedAt: {
    type: Date,
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
  toJSON: { virtuals: true, transform: stripPrivateFields },
  toObject: { virtuals: true, transform: stripPrivateFields }
});

// Champs techniques jamais renvoyés au client, même s'ils ont été chargés
function stripPrivateFields(doc, ret) {
  delete ret.password;
  delete ret.sessions;
  delete ret.passwordChangedAt;
  delete ret.passwordResetCodeAttempts;
  return ret;
}

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
    // Générer l'ID partenaire pour les nouveaux utilisateurs ou si manquant
    if (!this.partnerId) {
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
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

// Méthode pour générer un refresh token
userSchema.methods.generateRefreshToken = function() {
  return jwt.sign(
    { id: this._id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d' }
  );
};

// ---------------------------------------------------------------------------
// Sessions : émission, rotation et révocation des tokens
// ---------------------------------------------------------------------------

const randomId = () => crypto.randomBytes(16).toString('hex');

const signTokens = (user, sid, rid) => {
  const token = jwt.sign(
    { id: user._id, email: user.email, role: user.role, sid },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
  const refreshToken = jwt.sign(
    { id: user._id, sid, rid },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d' }
  );
  return { token, refreshToken };
};

// Ouvrir une session (connexion, inscription) et émettre ses tokens
userSchema.methods.issueTokens = async function() {
  const sid = randomId();
  const rid = randomId();
  const tokens = signTokens(this, sid, rid);
  const now = new Date();

  await this.constructor.updateOne(
    { _id: this._id },
    {
      $push: {
        sessions: {
          $each: [{ sid, rid, createdAt: now, expiresAt: new Date(jwt.decode(tokens.refreshToken).exp * 1000) }],
          $slice: -MAX_SESSIONS // au-delà, la session la plus ancienne est fermée
        }
      }
    }
  );

  return tokens;
};

/**
 * Échanger un refresh token contre une nouvelle paire de tokens (rotation).
 * Retourne null si le token n'est plus valable. Un refresh token déjà remplacé
 * et rejoué après le délai de grâce signale un vol : la session est fermée.
 */
userSchema.statics.rotateRefreshToken = async function(decoded) {
  const User = this;
  const user = await User.findById(decoded.id).select('+sessions +passwordChangedAt');
  if (!user || !user.isActive) return null;

  // Ancien refresh token émis avant la mise en place des sessions : accepté une fois
  // s'il est postérieur au dernier changement de mot de passe, puis converti en session.
  if (!decoded.sid) {
    if (user.passwordChangedAt && decoded.iat * 1000 < user.passwordChangedAt.getTime()) return null;
    return { user, tokens: await user.issueTokens() };
  }

  const session = (user.sessions || []).find(s => s.sid === decoded.sid);
  if (!session || (session.expiresAt && session.expiresAt < new Date())) return null;

  if (session.rid !== decoded.rid) {
    const withinGrace = session.prevRid === decoded.rid &&
      session.rotatedAt && Date.now() - session.rotatedAt.getTime() < REFRESH_REUSE_GRACE_MS;

    if (!withinGrace) {
      await User.updateOne({ _id: user._id }, { $pull: { sessions: { sid: decoded.sid } } });
      console.warn(`⚠️ Refresh token rejoué pour ${user.email} : session ${decoded.sid} fermée`);
      return null;
    }
    // Requête concurrente de la même application : renvoyer des tokens de la session courante
    return { user, tokens: signTokens(user, session.sid, session.rid) };
  }

  const rid = randomId();
  const tokens = signTokens(user, session.sid, rid);
  const rotated = await User.updateOne(
    { _id: user._id, sessions: { $elemMatch: { sid: session.sid, rid: session.rid } } },
    {
      $set: {
        'sessions.$.rid': rid,
        'sessions.$.prevRid': session.rid,
        'sessions.$.rotatedAt': new Date(),
        'sessions.$.expiresAt': new Date(jwt.decode(tokens.refreshToken).exp * 1000)
      }
    }
  );

  // Une autre requête vient de faire la rotation : retenter (on tombera dans le délai de grâce)
  if (rotated.modifiedCount === 0) return User.rotateRefreshToken(decoded);

  return { user, tokens };
};

// Un access token décodé correspond-il encore à une session ouverte ?
// (le document doit avoir été chargé avec select('+sessions +passwordChangedAt'))
userSchema.methods.acceptsToken = function(decoded) {
  if (decoded.sid) {
    return (this.sessions || []).some(s => s.sid === decoded.sid && (!s.expiresAt || s.expiresAt > new Date()));
  }
  // Ancien token sans session : valable tant que le mot de passe n'a pas changé depuis
  return !(this.passwordChangedAt && decoded.iat * 1000 < this.passwordChangedAt.getTime());
};

// Fermer une session (déconnexion d'un appareil)
userSchema.statics.revokeSession = function(userId, sid) {
  return this.updateOne({ _id: userId }, { $pull: { sessions: { sid } } });
};

// Fermer toutes les sessions (changement / réinitialisation du mot de passe)
userSchema.statics.revokeAllSessions = function(userId) {
  return this.updateOne({ _id: userId }, { $set: { sessions: [], passwordChangedAt: new Date() } });
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

// Niveau de partenaire correspondant à un total de dons
userSchema.statics.partnerLevelFor = function(totalDonations) {
  const total = Number(totalDonations) || 0;

  if (total >= 10000001) return 'or';
  if (total >= 1000001) return 'argent';
  if (total >= 300001) return 'bronze';
  return 'classique';
};

// Méthode pour mettre à jour les statistiques de donation.
// L'incrément est fait en base ($inc) et non sur le document en mémoire : le résultat
// reste correct si le document a été chargé partiellement (populate avec select) ou
// si deux paiements sont confirmés en même temps.
userSchema.methods.updateDonationStats = async function(amount) {
  const validAmount = Number(amount);
  if (!Number.isFinite(validAmount) || validAmount < 0) {
    console.error(`❌ Montant invalide pour updateDonationStats: ${amount} (type: ${typeof amount})`);
    throw new Error('Montant de donation invalide');
  }

  const User = this.constructor;
  const earnedPoints = Math.floor(validAmount / 1000); // 1 point pour 1000 XOF ou équivalent

  const updated = await User.findOneAndUpdate(
    { _id: this._id },
    { $inc: { totalDonations: validAmount, donationCount: 1, points: earnedPoints } },
    { new: true, projection: 'totalDonations donationCount points level partnerLevel' }
  );

  if (!updated) {
    throw new Error('Utilisateur introuvable pour la mise à jour des statistiques');
  }

  // Niveaux (tous les 1000 points) et niveau de partenaire
  const level = Math.max(Number(updated.level) || 1, Math.floor((Number(updated.points) || 0) / 1000) + 1);
  const partnerLevel = User.partnerLevelFor(updated.totalDonations);

  if (level !== updated.level || partnerLevel !== updated.partnerLevel) {
    await User.updateOne({ _id: this._id }, { $set: { level, partnerLevel } });
  }

  // Refléter les nouvelles valeurs sur le document en mémoire sans les marquer comme modifiées
  const fresh = {
    totalDonations: updated.totalDonations,
    donationCount: updated.donationCount,
    points: updated.points,
    level,
    partnerLevel
  };
  Object.entries(fresh).forEach(([field, value]) => {
    this[field] = value;
    this.unmarkModified(field);
  });

  console.log(`✅ Stats utilisateur mises à jour - Amount: ${validAmount}, Total: ${fresh.totalDonations}, Count: ${fresh.donationCount}, Points: ${fresh.points}, Partner Level: ${partnerLevel}`);

  return this;
};

// Méthode pour calculer le niveau de partenaire basé sur le total des dons
userSchema.methods.calculatePartnerLevel = function() {
  this.partnerLevel = this.constructor.partnerLevelFor(this.totalDonations);
  return this.partnerLevel;
};

// Apply pagination plugin
userSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('User', userSchema); 