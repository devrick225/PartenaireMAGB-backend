const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const Profile = require('../models/Profile');
const emailService = require('../services/emailService');

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
        communicationPreferences: {
          language: user.language
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

    user.emailVerificationToken = emailVerificationToken;
    user.emailVerificationExpires = emailVerificationExpires;
    await user.save({ validateBeforeSave: false });

    // Générer le JWT
    const token = user.generateAuthToken();
    const refreshToken = user.generateRefreshToken();

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
          currency: user.currency
        },
        token,
        refreshToken
      }
    });
  } catch (error) {
    console.error('Erreur inscription:', error);
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
    const user = await User.findOne({ email }).select('+password');

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

    // Générer les tokens
    const token = user.generateAuthToken();
    const refreshToken = user.generateRefreshToken();

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
          isEmailVerified: user.isEmailVerified,
          isPhoneVerified: user.isPhoneVerified,
          profileComplete: profile?.isComplete || false,
          profileCompletionPercentage: profile?.profileCompletionPercentage || 0
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

    try {
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
      const user = await User.findById(decoded.id);

      if (!user || !user.isActive) {
        return res.status(401).json({
          success: false,
          error: 'Utilisateur non trouvé ou désactivé'
        });
      }

      const newToken = user.generateAuthToken();
      const newRefreshToken = user.generateRefreshToken();

      res.json({
        success: true,
        data: {
          token: newToken,
          refreshToken: newRefreshToken
        }
      });
    } catch (jwtError) {
      return res.status(401).json({
        success: false,
        error: 'Refresh token invalide ou expiré'
      });
    }
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
      emailVerificationToken: token,
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
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Aucun utilisateur trouvé avec cet email'
      });
    }

    // Générer le token de réinitialisation
    const resetToken = crypto.randomBytes(32).toString('hex');
    const passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    user.passwordResetToken = resetToken;
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
      message: 'Instructions de réinitialisation envoyées par email'
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
      passwordResetToken: token,
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
    await user.save();

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

// @desc    Changement de mot de passe
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

    res.json({
      success: true,
      message: 'Mot de passe modifié avec succès'
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
          profile: user.profile
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
    // Pour une déconnexion simple, on peut juste retourner success
    // En production, on pourrait blacklister le token ou utiliser Redis
    
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

module.exports = {
  register,
  login,
  refreshToken,
  verifyEmail,
  forgotPassword,
  resetPassword,
  changePassword,
  getMe,
  logout
}; 