const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const Profile = require('../models/Profile');
const emailService = require('../services/emailService');
const smsService = require('../services/smsService');

// Les tokens à usage unique envoyés par email (vérification, réinitialisation) sont
// stockés hachés : une fuite de la base ne permet pas de les utiliser.
const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
// Accepte aussi la forme en clair pour les liens émis avant ce changement
const tokenLookup = (token) => ({ $in: [hashToken(token), String(token)] });

// Code à 6 chiffres tiré d'un générateur cryptographique (Math.random est prévisible)
const generateSixDigitCode = () => crypto.randomInt(100000, 1000000).toString();

// Nombre maximal de codes de réinitialisation erronés avant invalidation du code
const MAX_RESET_CODE_ATTEMPTS = 5;

// express-validator normalise l'email saisi (ex. suppression des points Gmail). Les comptes
// dont l'email a été enregistré par un autre chemin (admin, import, seed) gardent leur forme
// d'origine : on cherche donc les deux formes pour ne bloquer aucun utilisateur.
const emailCandidates = (req) => {
  const candidates = new Set();
  if (typeof req.body.email === 'string') candidates.add(req.body.email.trim().toLowerCase());
  const raw = req.rawEmail;
  if (typeof raw === 'string') candidates.add(raw.trim().toLowerCase());
  return [...candidates];
};

// Vérifie un code de réinitialisation et invalide le code après trop d'essais erronés
const checkPasswordResetCode = async (user, code) => {
  const isValid = !!user.passwordResetCode &&
    !!user.passwordResetCodeExpires &&
    user.passwordResetCodeExpires > new Date() &&
    (user.passwordResetCodeAttempts || 0) < MAX_RESET_CODE_ATTEMPTS &&
    user.passwordResetCode === String(code);

  if (!isValid && user.passwordResetCode) {
    const attempts = (user.passwordResetCodeAttempts || 0) + 1;
    const update = attempts >= MAX_RESET_CODE_ATTEMPTS
      ? { $unset: { passwordResetCode: 1, passwordResetCodeExpires: 1 }, $set: { passwordResetCodeAttempts: 0 } }
      : { $set: { passwordResetCodeAttempts: attempts } };
    await User.updateOne({ _id: user._id }, update);
  }

  return isValid;
};

// @desc    Inscription d'un nouvel utilisateur
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Données invalides',
        details: errors.array()
      });
    }

    const {
      firstName,
      lastName,
      email,
      phone,
      password,
      country,
      city,
      language,
      currency
    } = req.body;

    // Vérifier si l'utilisateur existe déjà
    const existingUser = await User.findOne({
      $or: [{ email }, { phone }]
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: existingUser.email === email 
          ? 'Cet email est déjà utilisé' 
          : 'Ce numéro de téléphone est déjà utilisé'
      });
    }

    // Créer le nouvel utilisateur
    const user = await User.create({
      firstName,
      lastName,
      email,
      phone,
      password,
      country,
      city,
      language: language || 'fr',
      currency: currency || 'XOF'
    });

    // Créer automatiquement un profil par défaut
    try {
      const defaultProfile = await Profile.create({
        user: user._id,
        address: {
          country: user.country
        },
        donationPreferences: {
          preferredFrequency: 'monthly'
        },
        isComplete: false
      });

      // Lier le profil à l'utilisateur
      user.profile = defaultProfile._id;
      console.log(`✅ Profil par défaut créé pour l'utilisateur ${user.email}`);
    } catch (profileError) {
      console.error('❌ Erreur création profil par défaut:', profileError);
      // Ne pas échouer l'inscription si la création du profil échoue
    }

    // Générer le token de vérification email
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');
    const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    user.emailVerificationToken = hashToken(emailVerificationToken);
    user.emailVerificationExpires = emailVerificationExpires;
    await user.save({ validateBeforeSave: false });

    // Ouvrir la session et générer les tokens
    const { token, refreshToken } = await user.issueTokens();

    // Envoyer l'email de vérification
    try {
      await emailService.sendVerificationEmail(
        user.email, 
        user.firstName, 
        emailVerificationToken
      );
      console.log(`Email de vérification envoyé à ${user.email}`);
    } catch (emailError) {
      console.error('Erreur envoi email de vérification:', emailError);
      // Ne pas échouer l'inscription si l'email échoue
    }

    // Envoyer l'email de bienvenue (optionnel)
    try {
      await emailService.sendWelcomeEmail(user.email, user.firstName);
      // Email partenaire personnalisé
      await emailService.sendPartnerWelcomeEmail(user.email, user.firstName, user.partnerId);
    } catch (emailError) {
      console.error('Erreur envoi email de bienvenue:', emailError);
    }

    res.status(201).json({
      success: true,
      message: 'Inscription réussie. Veuillez vérifier votre email.',
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          isEmailVerified: user.isEmailVerified,
          isPhoneVerified: user.isPhoneVerified,
          profileComplete: false,
          profileCompletionPercentage: 0,
          country: user.country,
          city: user.city,
          language: user.language,
          currency: user.currency,
          partnerId: user.partnerId
        },
        token,
        refreshToken
      }
    });
  } catch (error) {
    console.error('Erreur inscription:', error);

    // Deux inscriptions simultanées avec le même email : l'index unique tranche
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        error: 'Cet email est déjà utilisé'
      });
    }

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: Object.values(error.errors).map(e => e.message).join(', ')
      });
    }

    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'inscription'
    });
  }
};

// @desc    Connexion utilisateur
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Données invalides',
        details: errors.array()
      });
    }

    const { email, password } = req.body;

    // Trouver l'utilisateur avec le mot de passe
    const user = await User.findOne({ email: { $in: emailCandidates(req) } }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Email ou mot de passe incorrect'
      });
    }

    // Vérifier si le compte est verrouillé
    if (user.isLocked) {
      return res.status(423).json({
        success: false,
        error: 'Compte temporairement verrouillé. Réessayez plus tard.',
        lockUntil: user.lockUntil
      });
    }

    // Vérifier le mot de passe
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      // Incrémenter les tentatives de connexion
      await user.incLoginAttempts();
      
      return res.status(401).json({
        success: false,
        error: 'Email ou mot de passe incorrect'
      });
    }

    // Vérifier si le compte est actif
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Compte désactivé. Contactez l\'administrateur.'
      });
    }

    // Réinitialiser les tentatives de connexion en cas de succès
    if (user.loginAttempts > 0) {
      await user.resetLoginAttempts();
    }

    // Mettre à jour la dernière connexion
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    // Ouvrir la session et générer les tokens
    const { token, refreshToken } = await user.issueTokens();

    // Charger le profil si existe
    let profile = null;
    if (user.profile) {
      profile = await Profile.findById(user.profile);
    }

    res.json({
      success: true,
      message: 'Connexion réussie',
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          country: user.country,
          city: user.city,
          language: user.language,
          currency: user.currency,
          avatar: user.avatar,
          isEmailVerified: user.isEmailVerified,
          isPhoneVerified: user.isPhoneVerified,
          profileComplete: profile?.isComplete || false,
          profileCompletionPercentage: profile?.profileCompletionPercentage || 0,
          partnerId: user.partnerId
        },
        token,
        refreshToken
      }
    });
  } catch (error) {
    console.error('Erreur connexion:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la connexion'
    });
  }
};

// @desc    Rafraîchir le token
// @route   POST /api/auth/refresh
// @access  Public
const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token requis'
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (jwtError) {
      return res.status(401).json({
        success: false,
        error: 'Refresh token invalide ou expiré'
      });
    }

    // Rotation : chaque refresh token ne sert qu'une fois
    const rotation = await User.rotateRefreshToken(decoded);

    if (!rotation) {
      return res.status(401).json({
        success: false,
        error: 'Session expirée, veuillez vous reconnecter'
      });
    }

    res.json({
      success: true,
      data: {
        token: rotation.tokens.token,
        refreshToken: rotation.tokens.refreshToken
      }
    });
  } catch (error) {
    console.error('Erreur refresh token:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du rafraîchissement du token'
    });
  }
};

// @desc    Vérification de l'email
// @route   GET /api/auth/verify-email/:token
// @access  Public
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;

    const user = await User.findOne({
      emailVerificationToken: tokenLookup(token),
      emailVerificationExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'Token de vérification invalide ou expiré'
      });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save({ validateBeforeSave: false });

    res.json({
      success: true,
      message: 'Email vérifié avec succès'
    });
  } catch (error) {
    console.error('Erreur vérification email:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la vérification de l\'email'
    });
  }
};

// @desc    Demande de réinitialisation du mot de passe
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  try {
    const user = await User.findOne({ email: { $in: emailCandidates(req) } });

    // Réponse identique que l'utilisateur existe ou non (anti-énumération de comptes)
    if (!user) {
      return res.json({
        success: true,
        message: 'Si cet email est associé à un compte, vous recevrez les instructions de réinitialisation.'
      });
    }

    // Générer le token de réinitialisation
    const resetToken = crypto.randomBytes(32).toString('hex');
    const passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    user.passwordResetToken = hashToken(resetToken);
    user.passwordResetExpires = passwordResetExpires;
    await user.save({ validateBeforeSave: false });

    // Envoyer l'email de réinitialisation
    try {
      await emailService.sendPasswordResetEmail(
        user.email,
        user.firstName,
        resetToken
      );
      console.log(`Email de réinitialisation envoyé à ${user.email}`);
    } catch (emailError) {
      console.error('Erreur envoi email de réinitialisation:', emailError);
      // Réinitialiser les tokens si l'email échoue
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save({ validateBeforeSave: false });
      
      return res.status(500).json({
        success: false,
        error: 'Erreur lors de l\'envoi de l\'email de réinitialisation'
      });
    }

    res.json({
      success: true,
      message: 'Si cet email est associé à un compte, vous recevrez les instructions de réinitialisation.'
    });
  } catch (error) {
    console.error('Erreur forgot password:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la demande de réinitialisation'
    });
  }
};

// @desc    Réinitialisation du mot de passe
// @route   POST /api/auth/reset-password/:token
// @access  Public
const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const user = await User.findOne({
      passwordResetToken: tokenLookup(token),
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'Token de réinitialisation invalide ou expiré'
      });
    }

    // Mettre à jour le mot de passe
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.loginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    // Déconnecter tous les appareils : l'ancien mot de passe était peut-être compromis
    await User.revokeAllSessions(user._id);

    res.json({
      success: true,
      message: 'Mot de passe réinitialisé avec succès'
    });
  } catch (error) {
    console.error('Erreur reset password:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la réinitialisation du mot de passe'
    });
  }
};

// @desc    Demande de code de réinitialisation du mot de passe
// @route   POST /api/auth/request-password-reset-code
// @access  Public
const requestPasswordResetCode = async (req, res) => {
  try {
    const user = await User.findOne({ email: { $in: emailCandidates(req) } });

    // Réponse identique que l'utilisateur existe ou non (anti-énumération)
    if (!user) {
      return res.json({
        success: true,
        message: 'Si cet email est associé à un compte, vous recevrez un code de réinitialisation.'
      });
    }

    // Générer un code à 6 chiffres
    const resetCode = generateSixDigitCode();
    const codeExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    user.passwordResetCode = resetCode;
    user.passwordResetCodeExpires = codeExpires;
    user.passwordResetCodeAttempts = 0;
    await user.save({ validateBeforeSave: false });

    console.log('Debug envoi code reset:', {
      userId: user._id,
      email: user.email,
      // Ne jamais logger le code en clair en production
      ...(process.env.NODE_ENV === 'development' && { code: resetCode }),
      expiresAt: codeExpires
    });

    // Envoyer l'email avec le code
    try {
      await emailService.sendPasswordResetCode(
        user.email,
        user.firstName,
        resetCode
      );
      console.log(`Code de réinitialisation envoyé à ${user.email}`);
    } catch (emailError) {
      console.error('Erreur envoi code reset:', emailError);
      // Réinitialiser les codes si l'email échoue
      user.passwordResetCode = undefined;
      user.passwordResetCodeExpires = undefined;
      await user.save({ validateBeforeSave: false });
      
      return res.status(500).json({
        success: false,
        error: 'Erreur lors de l\'envoi du code de réinitialisation'
      });
    }

    res.json({
      success: true,
      message: 'Si cet email est associé à un compte, vous recevrez un code de réinitialisation.'
    });
  } catch (error) {
    console.error('Erreur request password reset code:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la demande de réinitialisation'
    });
  }
};

// @desc    Réinitialisation du mot de passe avec code
// @route   POST /api/auth/reset-password-with-code
// @access  Public
const resetPasswordWithCode = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    const user = await User.findOne({ email: { $in: emailCandidates(req) } })
      .select('+passwordResetCode +passwordResetCodeExpires +passwordResetCodeAttempts');

    // Même réponse que le compte existe ou non (anti-énumération) ; le nombre
    // d'essais est limité pour empêcher de deviner le code par force brute.
    if (!user || !(await checkPasswordResetCode(user, code))) {
      return res.status(400).json({
        success: false,
        error: 'Code de réinitialisation invalide ou expiré'
      });
    }

    // Mettre à jour le mot de passe
    user.password = newPassword;
    user.passwordResetCode = undefined;
    user.passwordResetCodeExpires = undefined;
    user.passwordResetCodeAttempts = 0;
    // Débloquer le compte : le propriétaire vient de prouver son identité
    user.loginAttempts = 0;
    user.lockUntil = null;
    // On garde aussi les anciens champs pour compatibilité
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    // Déconnecter tous les appareils : l'ancien mot de passe était peut-être compromis
    await User.revokeAllSessions(user._id);

    res.json({
      success: true,
      message: 'Mot de passe réinitialisé avec succès'
    });
  } catch (error) {
    console.error('Erreur reset password with code:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la réinitialisation du mot de passe'
    });
  }
};

// @desc    Changer le mot de passe
// @route   PUT /api/auth/change-password
// @access  Private
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user.id).select('+password');

    // Vérifier le mot de passe actuel
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);

    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        error: 'Mot de passe actuel incorrect'
      });
    }

    // Mettre à jour le mot de passe
    user.password = newPassword;
    await user.save();

    // Fermer toutes les sessions (autres appareils compris) puis en rouvrir une
    // pour l'appareil courant
    await User.revokeAllSessions(user._id);
    const { token, refreshToken } = await user.issueTokens();

    res.json({
      success: true,
      message: 'Mot de passe modifié avec succès',
      data: {
        token,
        refreshToken,
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          isEmailVerified: user.isEmailVerified,
          isPhoneVerified: user.isPhoneVerified,
          partnerId: user.partnerId,
          partnerLevel: user.partnerLevel,
          partnerLevelDetails: user.partnerLevelDetails
        }
      }
    });
  } catch (error) {
    console.error('Erreur change password:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du changement de mot de passe'
    });
  }
};

// @desc    Obtenir l'utilisateur actuel
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('profile');

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          isEmailVerified: user.isEmailVerified,
          isPhoneVerified: user.isPhoneVerified,
          country: user.country,
          city: user.city,
          language: user.language,
          currency: user.currency,
          avatar: user.avatar,
          totalDonations: user.totalDonations,
          donationCount: user.donationCount,
          level: user.level,
          points: user.points,
          badges: user.badges,
          lastLogin: user.lastLogin,
          createdAt: user.createdAt,
          profile: user.profile,
          partnerId: user.partnerId,
          partnerLevel: user.partnerLevel,
          partnerLevelDetails: user.partnerLevelDetails
        }
      }
    });
  } catch (error) {
    console.error('Erreur getMe:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération du profil'
    });
  }
};

// @desc    Déconnexion
// @route   POST /api/auth/logout
// @access  Private
const logout = async (req, res) => {
  try {
    // Fermer la session : l'access token et le refresh token de cet appareil
    // cessent immédiatement d'être acceptés.
    if (req.auth?.sid) {
      await User.revokeSession(req.user._id, req.auth.sid);
    }
    
    res.json({
      success: true,
      message: 'Déconnexion réussie'
    });
  } catch (error) {
    console.error('Erreur logout:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la déconnexion'
    });
  }
};

// @desc    Envoyer code de vérification email
// @route   POST /api/auth/send-email-verification-code
// @access  Private
const sendEmailVerificationCode = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({
        success: false,
        error: 'Email déjà vérifié'
      });
    }

    // Générer un code à 6 chiffres
    const verificationCode = generateSixDigitCode();
    const codeExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    user.emailVerificationCode = verificationCode;
    user.emailVerificationCodeExpires = codeExpires;
    await user.save({ validateBeforeSave: false });

    console.log('Debug envoi code:', {
      userId: user._id,
      email: user.email,
      // Ne jamais logger le code en clair en production
      ...(process.env.NODE_ENV === 'development' && { code: verificationCode }),
      expiresAt: codeExpires
    });

    // Envoyer l'email avec le code
    try {
      await emailService.sendEmailVerificationCode(
        user.email,
        user.firstName,
        verificationCode
      );
      console.log(`Code de vérification email envoyé à ${user.email}`);
    } catch (emailError) {
      console.error('Erreur envoi code email:', emailError);
      return res.status(500).json({
        success: false,
        error: 'Erreur lors de l\'envoi du code de vérification'
      });
    }

    res.json({
      success: true,
      message: 'Code de vérification envoyé par email'
    });
  } catch (error) {
    console.error('Erreur sendEmailVerificationCode:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'envoi du code de vérification'
    });
  }
};

// @desc    Vérifier code email
// @route   POST /api/auth/verify-email-code
// @access  Private
const verifyEmailCode = async (req, res) => {
  try {
    const { code } = req.body;
    const user = await User.findById(req.user.id).select('+emailVerificationCode +emailVerificationCodeExpires');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({
        success: false,
        error: 'Email déjà vérifié'
      });
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('Debug verification:', {
        receivedCode: code,
        storedCode: user.emailVerificationCode,
        expiresAt: user.emailVerificationCodeExpires,
      });
    }

    // Vérifier le code et l'expiration
    if (!user.emailVerificationCode || 
        user.emailVerificationCode !== code ||
        user.emailVerificationCodeExpires < new Date()) {
      return res.status(400).json({
        success: false,
        error: 'Code de vérification invalide ou expiré'
      });
    }

    // Marquer l'email comme vérifié
    user.isEmailVerified = true;
    user.emailVerificationCode = undefined;
    user.emailVerificationCodeExpires = undefined;
    await user.save({ validateBeforeSave: false });

    res.json({
      success: true,
      message: 'Email vérifié avec succès'
    });
  } catch (error) {
    console.error('Erreur verifyEmailCode:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la vérification du code'
    });
  }
};

// @desc    Envoyer code de vérification SMS
// @route   POST /api/auth/send-phone-verification-code
// @access  Private
const sendPhoneVerificationCode = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
    if (user.isPhoneVerified) return res.status(400).json({ success: false, error: 'Numéro de téléphone déjà vérifié' });
    if (!user.phone) return res.status(400).json({ success: false, error: 'Aucun numéro de téléphone enregistré' });

    // Envoyer le code via Africa's Talking
    const verificationCode = generateSixDigitCode();
    const codeExpires = new Date(Date.now() + 10 * 60 * 1000);
    user.phoneVerificationCode = verificationCode;
    user.phoneVerificationCodeExpires = codeExpires;
    await user.save({ validateBeforeSave: false });

    try {
      await smsService.sendPhoneVerificationCode(user.phone, verificationCode, user.firstName);
    } catch (smsError) {
      console.error('Erreur envoi SMS:', smsError.message);
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`Code SMS pour ${user.phone}: ${verificationCode}`);
    }
    res.json({
      success: true,
      message: 'Code de vérification envoyé par SMS',
      ...(process.env.NODE_ENV === 'development' && { code: verificationCode })
    });
  } catch (error) {
    console.error('Erreur sendPhoneVerificationCode:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de l\'envoi du code' });
  }
};

// @desc    Vérifier code SMS
// @route   POST /api/auth/verify-phone-code
// @access  Private
const verifyPhoneCode = async (req, res) => {
  try {
    const { code } = req.body;
    const user = await User.findById(req.user.id).select('+phoneVerificationCode +phoneVerificationCodeExpires');

    if (!user) return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
    if (user.isPhoneVerified) return res.status(400).json({ success: false, error: 'Numéro de téléphone déjà vérifié' });

    // Vérification du code stocké en base (Africa's Talking)
    if (!user.phoneVerificationCode || 
        user.phoneVerificationCode !== code ||
        user.phoneVerificationCodeExpires < new Date()) {
      return res.status(400).json({ success: false, error: 'Code de vérification invalide ou expiré' });
    }

    user.isPhoneVerified = true;
    user.phoneVerificationCode = undefined;
    user.phoneVerificationCodeExpires = undefined;
    await user.save({ validateBeforeSave: false });
    return res.json({ success: true, message: 'Numéro de téléphone vérifié avec succès' });
  } catch (error) {
    console.error('Erreur verifyPhoneCode:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la vérification du code' });
  }
};

// @desc    Demande de code de réinitialisation du mot de passe par SMS
// @route   POST /api/auth/request-password-reset-sms-code
// @access  Public
const requestPasswordResetSmsCode = async (req, res) => {
  try {
    const { phone } = req.body;

    const user = await User.findOne({ phone });

    // Réponse identique que le numéro existe ou non (anti-énumération)
    if (!user) {
      return res.json({
        success: true,
        message: "Si ce numéro est associé à un compte, vous recevrez un code de réinitialisation."
      });
    }

    // Générer un code à 6 chiffres
    const resetCode = generateSixDigitCode();
    const codeExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    user.passwordResetCode = resetCode;
    user.passwordResetCodeExpires = codeExpires;
    user.passwordResetCodeAttempts = 0;
    await user.save({ validateBeforeSave: false });

    console.log("Debug envoi code reset SMS:", {
      userId: user._id,
      phone: user.phone,
      // Ne jamais logger le code en clair en production
      ...(process.env.NODE_ENV === 'development' && { code: resetCode }),
      expiresAt: codeExpires
    });

    // Envoyer le SMS avec le code
    try {
      await smsService.sendPasswordResetCode(
        user.phone,
        resetCode,
        user.firstName
      );
      console.log(`Code de réinitialisation SMS envoyé à ${user.phone}`);
    } catch (smsError) {
      console.error("Erreur envoi SMS reset:", smsError);
      // Réinitialiser les codes si le SMS échoue
      user.passwordResetCode = undefined;
      user.passwordResetCodeExpires = undefined;
      await user.save({ validateBeforeSave: false });
      
      return res.status(500).json({
        success: false,
        error: "Erreur lors de l'envoi du code de réinitialisation par SMS"
      });
    }

    res.json({
      success: true,
      message: "Si ce numéro est associé à un compte, vous recevrez un code de réinitialisation."
    });
  } catch (error) {
    console.error("Erreur request password reset SMS code:", error);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la demande de réinitialisation"
    });
  }
};

// @desc    Réinitialisation du mot de passe avec code SMS
// @route   POST /api/auth/reset-password-with-sms-code
// @access  Public
const resetPasswordWithSmsCode = async (req, res) => {
  try {
    const { phone, code, newPassword } = req.body;

    const user = await User.findOne({ phone })
      .select('+passwordResetCode +passwordResetCodeExpires +passwordResetCodeAttempts');

    // Même réponse que le compte existe ou non (anti-énumération) ; le nombre
    // d'essais est limité pour empêcher de deviner le code par force brute.
    if (!user || !(await checkPasswordResetCode(user, code))) {
      return res.status(400).json({
        success: false,
        error: "Code de réinitialisation invalide ou expiré"
      });
    }

    // Mettre à jour le mot de passe
    user.password = newPassword;
    user.passwordResetCode = undefined;
    user.passwordResetCodeExpires = undefined;
    user.passwordResetCodeAttempts = 0;
    // Débloquer le compte : le propriétaire vient de prouver son identité
    user.loginAttempts = 0;
    user.lockUntil = null;
    // On garde aussi les anciens champs pour compatibilité
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    // Déconnecter tous les appareils : l'ancien mot de passe était peut-être compromis
    await User.revokeAllSessions(user._id);

    res.json({
      success: true,
      message: "Mot de passe réinitialisé avec succès"
    });
  } catch (error) {
    console.error("Erreur reset password with SMS code:", error);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la réinitialisation du mot de passe"
    });
  }
};

module.exports = {
  register,
  login,
  refreshToken,
  verifyEmail,
  forgotPassword,
  resetPassword,
  changePassword,
  getMe,
  logout,
  sendEmailVerificationCode,
  verifyEmailCode,
  sendPhoneVerificationCode,
  verifyPhoneCode,
  requestPasswordResetCode,
  requestPasswordResetSmsCode,
  resetPasswordWithSmsCode,
  resetPasswordWithCode
}; 