const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const User = require('../models/User');
const Profile = require('../models/Profile');
const Donation = require('../models/Donation');
const emailService = require('../services/emailService');

// @desc    Obtenir le profil de l'utilisateur connecté
// @route   GET /api/users/profile
// @access  Private
const getProfile = async (req, res) => {
  try {
    // Charger l'utilisateur avec son profil
    const user = await User.findById(req.user.id).populate('profile');
    
    let profile = user.profile;
    
    // Créer un profil vide si il n'existe pas
    if (!profile) {
      profile = await Profile.create({
        user: user._id,
        dateOfBirth: null,
        gender: null,
        occupation: null,
        address: {
          street: '',
          country: user.country
        },
        emergencyContact: {
          name: '',
          relationship: '',
          phone: ''
        }
      });
      
      user.profile = profile._id;
      await user.save({ validateBeforeSave: false });
    }

    res.json({
      success: true,
      data: {
        profile: {
          // Données de base de l'utilisateur
          user: {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            fullName: user.fullName,
            email: user.email,
            phone: user.phone,
            country: user.country,
            city: user.city,
            language: user.language,
            currency: user.currency,
            avatar: user.avatar,
            role: user.role,
            isActive: user.isActive,
            isEmailVerified: user.isEmailVerified,
            isPhoneVerified: user.isPhoneVerified,
            createdAt: user.createdAt,
            lastLogin: user.lastLogin,
            totalDonations: user.totalDonations,
            donationCount: user.donationCount,
            level: user.level,
            points: user.points,
            badges: user.badges
          },
          // Données du profil étendu
          dateOfBirth: profile.dateOfBirth,
          age: profile.age,
          gender: profile.gender,
          maritalStatus: profile.maritalStatus,
          occupation: profile.occupation,
          employer: profile.employer,
          monthlyIncome: profile.monthlyIncome,
          address: profile.address,
          emergencyContact: profile.emergencyContact,
          churchMembership: profile.churchMembership,
          donationPreferences: profile.donationPreferences,
          communicationPreferences: profile.communicationPreferences,
          volunteer: profile.volunteer,
          familyInfo: profile.familyInfo,
          isComplete: profile.isComplete,
          completionPercentage: profile.profileCompletionPercentage,
          createdAt: profile.createdAt,
          updatedAt: profile.updatedAt
        }
      }
    });
  } catch (error) {
    console.error('Erreur getProfile:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération du profil'
    });
  }
};

// @desc    Mettre à jour le profil de l'utilisateur
// @route   PUT /api/users/profile
// @access  Private
const updateProfile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Données invalides',
        details: errors.array()
      });
    }

    const updates = req.body;
    const user = await User.findById(req.user.id).populate('profile');

    let profile = user.profile;
    
    // Créer un profil si il n'existe pas
    if (!profile) {
      profile = await Profile.create({
        user: user._id,
        ...updates
      });
      user.profile = profile._id;
      await user.save({ validateBeforeSave: false });
    } else {
      // Mettre à jour le profil existant avec gestion des champs imbriqués
      Object.keys(updates).forEach(key => {
        if (updates[key] !== undefined) {
          // Gérer les champs imbriqués spéciaux
          if (key.includes('.')) {
            // Utiliser la notation point pour les champs imbriqués
            const keys = key.split('.');
            let current = profile;
            
            // Naviguer jusqu'au parent
            for (let i = 0; i < keys.length - 1; i++) {
              if (!current[keys[i]]) {
                current[keys[i]] = {};
              }
              current = current[keys[i]];
            }
            
            // Assigner la valeur
            current[keys[keys.length - 1]] = updates[key];
          } else {
            // Champ simple
            profile[key] = updates[key];
          }
        }
      });
      
      // Marquer les champs modifiés pour Mongoose
      profile.markModified('address');
      profile.markModified('emergencyContact');
      profile.markModified('churchMembership');
      profile.markModified('donationPreferences');
      profile.markModified('communicationPreferences');
      profile.markModified('volunteer');
      profile.markModified('familyInfo');
      
      await profile.save();
    }

    // Mettre à jour aussi les informations de base dans User si nécessaire
    const userFields = ['firstName', 'lastName', 'phone', 'language', 'currency'];
    let userUpdated = false;
    
    userFields.forEach(field => {
      if (updates[field] && user[field] !== updates[field]) {
        user[field] = updates[field];
        userUpdated = true;
      }
    });
    
    if (userUpdated) {
      await user.save({ validateBeforeSave: false });
    }

    // Recharger le profil avec les données calculées
    await profile.populate('user', 'firstName lastName email phone avatar isActive isEmailVerified isPhoneVerified level points badges totalDonations donationCount country city language currency createdAt');

    res.json({
      success: true,
      message: 'Profil mis à jour avec succès',
      data: {
        user: {
          firstName: profile.user.firstName,
          lastName: profile.user.lastName,
          email: profile.user.email,
          phone: profile.user.phone,
          avatar: profile.user.avatar,
          isActive: profile.user.isActive,
          isEmailVerified: profile.user.isEmailVerified,
          isPhoneVerified: profile.user.isPhoneVerified,
          level: profile.user.level,
          points: profile.user.points,
          badges: profile.user.badges,
          totalDonations: profile.user.totalDonations,
          donationCount: profile.user.donationCount,
          country: profile.user.country,
          city: profile.user.city,
          language: profile.user.language,
          currency: profile.user.currency,
          createdAt: profile.user.createdAt
        },
        profile: {
          dateOfBirth: profile.dateOfBirth,
          age: profile.age,
          gender: profile.gender,
          maritalStatus: profile.maritalStatus,
          occupation: profile.occupation,
          employer: profile.employer,
          monthlyIncome: profile.monthlyIncome,
          address: profile.address,
          emergencyContact: profile.emergencyContact,
          churchMembership: profile.churchMembership,
          donationPreferences: profile.donationPreferences,
          communicationPreferences: profile.communicationPreferences,
          volunteer: profile.volunteer,
          familyInfo: profile.familyInfo,
          isComplete: profile.isComplete,
          completionPercentage: profile.profileCompletionPercentage,
          updatedAt: profile.updatedAt
        }
      }
    });
  } catch (error) {
    console.error('Erreur updateProfile:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la mise à jour du profil'
    });
  }
};

// @desc    Obtenir un utilisateur par ID
// @route   GET /api/users/:id
// @access  Private (Owner or Admin)
const getUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'ID utilisateur invalide'
      });
    }

    const user = await User.findById(id)
      .populate('profile')
      .select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    // Vérifier les permissions
    const isOwner = user._id.toString() === req.user.id;
    const isAdmin = ['admin', 'moderator'].includes(req.user.role);

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Accès non autorisé à cet utilisateur'
      });
    }

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
          isActive: user.isActive,
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
    console.error('Erreur getUser:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération de l\'utilisateur'
    });
  }
};

// @desc    Liste des utilisateurs
// @route   GET /api/users
// @access  Private (Admin/Moderator)
const getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, role, isActive, search } = req.query;

    // Construction du filtre
    const filter = {};
    if (role) filter.role = role;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
      populate: [
        { path: 'profile', select: 'isComplete profileCompletionPercentage occupation' }
      ],
      select: '-password'
    };

    const users = await User.paginate(filter, options);

    res.json({
      success: true,
      data: {
        users: users.docs,
        pagination: {
          current: users.page,
          total: users.totalPages,
          pages: users.totalPages,
          limit: users.limit,
          totalDocs: users.totalDocs
        },
        filters: { role, isActive, search }
      }
    });
  } catch (error) {
    console.error('Erreur getUsers:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des utilisateurs'
    });
  }
};

// @desc    Modifier le rôle d'un utilisateur
// @route   PUT /api/users/:id/role
// @access  Private (Admin only)
const updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'ID utilisateur invalide'
      });
    }

    // Vérifier que le rôle est valide
    const validRoles = ['user', 'admin', 'moderator', 'treasurer'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Rôle invalide'
      });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    // Empêcher de modifier son propre rôle
    if (user._id.toString() === req.user.id) {
      return res.status(400).json({
        success: false,
        error: 'Vous ne pouvez pas modifier votre propre rôle'
      });
    }

    const oldRole = user.role;
    user.role = role;
    await user.save({ validateBeforeSave: false });

    // Log de l'action
    console.log(`Rôle utilisateur modifié: ${user.email} de ${oldRole} à ${role} par ${req.user.email}`);

    res.json({
      success: true,
      message: 'Rôle modifié avec succès',
      data: {
        userId: user._id,
        oldRole,
        newRole: role,
        updatedBy: req.user.id,
        updatedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Erreur updateUserRole:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la modification du rôle'
    });
  }
};

// @desc    Activer/Désactiver un utilisateur
// @route   PUT /api/users/:id/status
// @access  Private (Admin only)
const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive, reason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'ID utilisateur invalide'
      });
    }

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'Le statut doit être un booléen'
      });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    // Empêcher de désactiver son propre compte
    if (user._id.toString() === req.user.id && !isActive) {
      return res.status(400).json({
        success: false,
        error: 'Vous ne pouvez pas désactiver votre propre compte'
      });
    }

    const oldStatus = user.isActive;
    user.isActive = isActive;
    await user.save({ validateBeforeSave: false });

    // Log de l'action
    console.log(`Statut utilisateur modifié: ${user.email} ${isActive ? 'activé' : 'désactivé'} par ${req.user.email} - Raison: ${reason}`);

    res.json({
      success: true,
      message: `Utilisateur ${isActive ? 'activé' : 'désactivé'} avec succès`,
      data: {
        userId: user._id,
        oldStatus,
        isActive,
        reason,
        updatedBy: req.user.id,
        updatedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Erreur updateUserStatus:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la modification du statut'
    });
  }
};

// @desc    Historique des dons d'un utilisateur
// @route   GET /api/users/:id/donations
// @access  Private (Owner or Admin)
const getUserDonations = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10, category, status, period } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'ID utilisateur invalide'
      });
    }

    // Vérifier les permissions
    const isOwner = id === req.user.id;
    const isAdmin = ['admin', 'moderator', 'treasurer'].includes(req.user.role);

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Accès non autorisé aux dons de cet utilisateur'
      });
    }

    // Construction du filtre
    const filter = { user: id };
    if (category) filter.category = category;
    if (status) filter.status = status;

    // Filtre par période
    if (period) {
      const now = new Date();
      switch (period) {
        case 'week':
          filter.createdAt = { 
            $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7) 
          };
          break;
        case 'month':
          filter.createdAt = { 
            $gte: new Date(now.getFullYear(), now.getMonth(), 1) 
          };
          break;
        case 'year':
          filter.createdAt = { 
            $gte: new Date(now.getFullYear(), 0, 1) 
          };
          break;
      }
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
      populate: [
        { path: 'payment', select: 'status provider' }
      ]
    };

    const donations = await Donation.paginate(filter, options);

    // Calculer les statistiques
    const statsFilter = { user: id, status: 'completed' };
    const [stats] = await Donation.aggregate([
      { $match: statsFilter },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          totalCount: { $sum: 1 },
          averageAmount: { $avg: '$amount' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        donations: donations.docs,
        stats: {
          totalAmount: stats?.totalAmount || 0,
          totalCount: stats?.totalCount || 0,
          averageAmount: stats?.averageAmount || 0
        },
        pagination: {
          current: donations.page,
          total: donations.totalPages,
          pages: donations.totalPages,
          limit: donations.limit,
          totalDocs: donations.totalDocs
        }
      }
    });
  } catch (error) {
    console.error('Erreur getUserDonations:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des dons'
    });
  }
};

// @desc    Statistiques d'un utilisateur
// @route   GET /api/users/:id/stats
// @access  Private (Owner or Admin)
const getUserStats = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'ID utilisateur invalide'
      });
    }

    // Vérifier les permissions
    const isOwner = id === req.user.id;
    const isAdmin = ['admin', 'moderator', 'treasurer'].includes(req.user.role);

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Accès non autorisé aux statistiques de cet utilisateur'
      });
    }

    const user = await User.findById(id).populate('profile');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    // Statistiques des dons
    const [donationStats] = await Donation.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(id), status: 'completed' } },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          totalCount: { $sum: 1 },
          averageAmount: { $avg: '$amount' }
        }
      }
    ]);

    // Dernière donation
    const lastDonation = await Donation.findOne({ 
      user: id, 
      status: 'completed' 
    }).sort({ createdAt: -1 });

    // Dons récurrents actifs
    const activeRecurringCount = await Donation.countDocuments({
      user: id,
      type: 'recurring',
      'recurring.isActive': true
    });

    res.json({
      success: true,
      data: {
        stats: {
          totalDonations: donationStats?.totalAmount || 0,
          donationCount: donationStats?.totalCount || 0,
          averageDonation: donationStats?.averageAmount || 0,
          level: user.level,
          points: user.points,
          badges: user.badges,
          activeRecurringDonations: activeRecurringCount,
          lastDonation: lastDonation ? {
            amount: lastDonation.amount,
            currency: lastDonation.currency,
            category: lastDonation.category,
            date: lastDonation.createdAt
          } : null,
          memberSince: user.createdAt,
          profileCompletion: user.profile?.profileCompletionPercentage || 0
        }
      }
    });
  } catch (error) {
    console.error('Erreur getUserStats:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des statistiques'
    });
  }
};

// @desc    Upload d'avatar
// @route   POST /api/users/upload-avatar
// @access  Private
const uploadAvatar = async (req, res) => {
  try {
    // TODO: Implémenter l'upload d'avatar avec Multer et Cloudinary
    // Cette implémentation nécessiterait la configuration de Multer et Cloudinary
    
    res.json({
      success: true,
      message: 'Avatar uploadé avec succès',
      data: {
        avatarUrl: 'https://cloudinary.com/avatar-url'
      }
    });
  } catch (error) {
    console.error('Erreur uploadAvatar:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'upload de l\'avatar'
    });
  }
};

// @desc    Mettre à jour les préférences utilisateur
// @route   PUT /api/users/preferences
// @access  Private
const updateUserPreferences = async (req, res) => {
  try {
    const { language, currency, emailNotifications, smsNotifications } = req.body;

    const user = await User.findById(req.user.id);

    if (language) user.language = language;
    if (currency) user.currency = currency;
    if (emailNotifications) user.emailNotifications = { ...user.emailNotifications, ...emailNotifications };
    if (smsNotifications) user.smsNotifications = { ...user.smsNotifications, ...smsNotifications };

    await user.save({ validateBeforeSave: false });

    res.json({
      success: true,
      message: 'Préférences mises à jour avec succès',
      data: {
        preferences: {
          language: user.language,
          currency: user.currency,
          emailNotifications: user.emailNotifications,
          smsNotifications: user.smsNotifications,
          updatedAt: new Date()
        }
      }
    });
  } catch (error) {
    console.error('Erreur updateUserPreferences:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la mise à jour des préférences'
    });
  }
};

// @desc    Supprimer son compte
// @route   DELETE /api/users/account
// @access  Private
const deleteUserAccount = async (req, res) => {
  try {
    const { password, confirmation } = req.body;

    if (confirmation !== 'DELETE') {
      return res.status(400).json({
        success: false,
        error: 'Confirmation requise: tapez "DELETE" pour confirmer'
      });
    }

    const user = await User.findById(req.user.id).select('+password');

    // Vérifier le mot de passe
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        error: 'Mot de passe incorrect'
      });
    }

    // TODO: Implémenter la logique de suppression de compte
    // - Anonymiser les données sensibles
    // - Conserver les dons pour les rapports comptables
    // - Supprimer le profil et autres données personnelles
    
    // Pour l'instant, on désactive seulement le compte
    user.isActive = false;
    user.email = `deleted_${Date.now()}@example.com`;
    await user.save({ validateBeforeSave: false });

    res.json({
      success: true,
      message: 'Compte supprimé avec succès'
    });
  } catch (error) {
    console.error('Erreur deleteUserAccount:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la suppression du compte'
    });
  }
};

// @desc    Tableau des leaders (gamification)
// @route   GET /api/users/leaderboard
// @access  Private
const getLeaderboard = async (req, res) => {
  try {
    const { period = 'month', limit = 10 } = req.query;

    // Construire le filtre de date
    let dateFilter = {};
    const now = new Date();
    
    switch (period) {
      case 'week':
        dateFilter = { 
          createdAt: { 
            $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7) 
          } 
        };
        break;
      case 'month':
        dateFilter = { 
          createdAt: { 
            $gte: new Date(now.getFullYear(), now.getMonth(), 1) 
          } 
        };
        break;
      case 'year':
        dateFilter = { 
          createdAt: { 
            $gte: new Date(now.getFullYear(), 0, 1) 
          } 
        };
        break;
      default:
        // Tous les temps
        break;
    }

    let leaderboard;

    if (period === 'all') {
      // Utiliser les totaux stockés dans User
      leaderboard = await User.find({ isActive: true })
        .select('firstName lastName avatar totalDonations donationCount level points badges')
        .sort({ totalDonations: -1 })
        .limit(parseInt(limit));
    } else {
      // Calculer pour la période spécifique
      leaderboard = await Donation.aggregate([
        { 
          $match: { 
            status: 'completed',
            ...dateFilter
          } 
        },
        {
          $group: {
            _id: '$user',
            totalAmount: { $sum: '$amount' },
            donationCount: { $sum: 1 }
          }
        },
        { $sort: { totalAmount: -1 } },
        { $limit: parseInt(limit) },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user'
          }
        },
        { $unwind: '$user' },
        {
          $project: {
            firstName: '$user.firstName',
            lastName: '$user.lastName',
            avatar: '$user.avatar',
            level: '$user.level',
            badges: '$user.badges',
            totalAmount: 1,
            donationCount: 1
          }
        }
      ]);
    }

    // Trouver le rang de l'utilisateur actuel
    const userRank = leaderboard.findIndex(
      entry => entry._id?.toString() === req.user.id || entry.user?._id?.toString() === req.user.id
    ) + 1;

    const totalParticipants = await User.countDocuments({ 
      isActive: true,
      totalDonations: { $gt: 0 }
    });

    res.json({
      success: true,
      data: {
        leaderboard,
        period,
        userRank: userRank || null,
        totalParticipants
      }
    });
  } catch (error) {
    console.error('Erreur getLeaderboard:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération du tableau des leaders'
    });
  }
};

// @desc    Télécharger les données personnelles (RGPD)
// @route   GET /api/users/profile/download-data
// @access  Private
const downloadPersonalData = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('profile')
      .select('-password -emailVerificationToken -passwordResetToken -twoFactorSecret');

    const donations = await Donation.find({ user: req.user.id })
      .populate('payment', 'status provider')
      .select('-__v');

    const personalData = {
      user: {
        ...user.toObject(),
        exportDate: new Date().toISOString(),
        exportedBy: 'User Self-Export'
      },
      donations: donations.map(donation => donation.toObject()),
      exportMetadata: {
        version: '1.0',
        format: 'JSON',
        totalRecords: {
          user: 1,
          donations: donations.length
        }
      }
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="donnees-personnelles-${user.firstName}-${user.lastName}-${Date.now()}.json"`);
    
    res.json(personalData);
  } catch (error) {
    console.error('Erreur downloadPersonalData:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du téléchargement des données'
    });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  getUser,
  getUsers,
  updateUserRole,
  updateUserStatus,
  getUserDonations,
  getUserStats,
  uploadAvatar,
  updateUserPreferences,
  deleteUserAccount,
  getLeaderboard,
  downloadPersonalData
}; 