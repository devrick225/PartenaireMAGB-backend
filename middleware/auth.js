const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware pour vérifier l'authentification
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Token d\'accès requis'
      });
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Récupérer l'utilisateur (sans le hash du mot de passe : les contrôleurs qui en
      // ont besoin le rechargent explicitement avec select('+password'))
      const user = await User.findById(decoded.id).select('+sessions +passwordChangedAt');
      
      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'Token invalide - utilisateur non trouvé'
        });
      }

      // Session fermée (déconnexion, changement de mot de passe) : le token n'est plus valable.
      // Même code que l'expiration pour que les clients tentent un refresh puis reconnectent.
      if (!user.acceptsToken(decoded)) {
        return res.status(401).json({
          success: false,
          error: 'Session expirée, veuillez vous reconnecter',
          code: 'TOKEN_EXPIRED'
        });
      }

      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          error: 'Compte désactivé'
        });
      }

      if (user.isLocked) {
        return res.status(423).json({
          success: false,
          error: 'Compte verrouillé temporairement'
        });
      }

      // Mettre à jour la dernière connexion (sans bloquer la requête)
      // Utiliser updateOne pour éviter un save() complet sur chaque requête
      // Au plus une écriture toutes les 5 minutes par utilisateur
      if (!user.lastLogin || Date.now() - user.lastLogin.getTime() > 5 * 60 * 1000) {
        User.updateOne(
          { _id: user._id },
          { $set: { lastLogin: new Date() } }
        ).catch(err => console.error('Erreur mise à jour lastLogin:', err));
      }

      req.user = user;
      req.auth = { sid: decoded.sid || null };
      next();
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Token expiré',
          code: 'TOKEN_EXPIRED'
        });
      } else if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          error: 'Token invalide',
          code: 'INVALID_TOKEN'
        });
      } else {
        throw jwtError;
      }
    }
  } catch (error) {
    console.error('Erreur dans authenticateToken:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur d\'authentification'
    });
  }
};

// Middleware pour autoriser certains rôles
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentification requise'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Accès refusé. Rôles autorisés: ${roles.join(', ')}`
      });
    }

    next();
  };
};

// Middleware pour vérifier si l'utilisateur est propriétaire ou admin
const authorizeOwnerOrAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentification requise'
    });
  }

  const userId = req.params.userId || req.params.id;
  const isOwner = req.user._id.toString() === userId;
  const isAdmin = ['admin', 'moderator', 'treasurer', 'support_agent'].includes(req.user.role);

  if (!isOwner && !isAdmin) {
    return res.status(403).json({
      success: false,
      error: 'Accès refusé - Vous ne pouvez accéder qu\'à vos propres données'
    });
  }

  next();
};

// Middleware optionnel (n'échoue pas si pas de token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('+sessions +passwordChangedAt');
      
      if (user && user.isActive && !user.isLocked && user.acceptsToken(decoded)) {
        req.user = user;
        req.auth = { sid: decoded.sid || null };
      }
    } catch (jwtError) {
      // Ignorer les erreurs de token pour l'auth optionnelle
    }

    next();
  } catch (error) {
    console.error('Erreur dans optionalAuth:', error);
    next(); // Continuer même en cas d'erreur
  }
};

// Middleware pour vérifier les permissions spécifiques
const hasPermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentification requise'
      });
    }

    const userPermissions = {
      user: ['read_own_profile', 'update_own_profile', 'create_donation', 'create_ticket'],
      support_agent: ['read_users', 'update_tickets', 'read_donations', 'moderate_content'],
      moderator: ['read_users', 'update_tickets', 'read_donations', 'moderate_content'],
      treasurer: ['read_all_donations', 'read_payments', 'generate_reports', 'manage_refunds'],
      admin: ['*'] // Toutes les permissions
    };

    const currentUserPermissions = userPermissions[req.user.role] || [];
    
    if (!currentUserPermissions.includes('*') && !currentUserPermissions.includes(permission)) {
      return res.status(403).json({
        success: false,
        error: `Permission requise: ${permission}`
      });
    }

    next();
  };
};

// Middleware pour vérifier si l'email est vérifié
const requireEmailVerification = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentification requise'
    });
  }

  if (!req.user.isEmailVerified) {
    return res.status(403).json({
      success: false,
      error: 'Email non vérifié. Veuillez vérifier votre email avant de continuer.',
      code: 'EMAIL_NOT_VERIFIED'
    });
  }

  next();
};

// Middleware pour vérifier si le profil est complet
const requireCompleteProfile = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentification requise'
      });
    }

    if (!req.user.profile) {
      return res.status(403).json({
        success: false,
        error: 'Profil incomplet. Veuillez compléter votre profil.',
        code: 'PROFILE_INCOMPLETE'
      });
    }

    // Charger le profil si nécessaire
    await req.user.populate('profile');

    if (!req.user.profile.isComplete) {
      return res.status(403).json({
        success: false,
        error: 'Profil incomplet. Veuillez compléter votre profil.',
        code: 'PROFILE_INCOMPLETE',
        completionPercentage: req.user.profile.profileCompletionPercentage
      });
    }

    next();
  } catch (error) {
    console.error('Erreur dans requireCompleteProfile:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la vérification du profil'
    });
  }
};

// Middleware pour vérifier la 2FA si activée
const verify2FA = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentification requise'
    });
  }

  if (req.user.twoFactorEnabled && !req.user.twoFactorVerified) {
    return res.status(403).json({
      success: false,
      error: 'Vérification 2FA requise',
      code: 'TWO_FACTOR_REQUIRED'
    });
  }

  next();
};

module.exports = {
  authenticateToken,
  authorizeRoles,
  authorizeOwnerOrAdmin,
  optionalAuth,
  hasPermission,
  requireEmailVerification,
  requireCompleteProfile,
  verify2FA
}; 