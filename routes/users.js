const express = require('express');
const { body, query } = require('express-validator');
const { authenticateToken, authorizeRoles, authorizeOwnerOrAdmin } = require('../middleware/auth');
const {
  getProfile,
  updateProfile,
  getUser,
  getUsers,
  updateUserRole,
  updateUserStatus,
  getUserDonations,
  getUserStats,
  uploadAvatar,
  uploadAvatarBase64,
  updateUserPreferences,
  deleteUserAccount,
  getLeaderboard,
  downloadPersonalData,
  getUserPreferences
} = require('../controllers/userController');
const cloudinaryService = require('../services/cloudinaryService');

const router = express.Router();

// Configuration de l'uploader d'avatar
const avatarUpload = cloudinaryService.getAvatarUploader();

// Validation pour la mise à jour du profil
const updateProfileValidation = [
  // Informations de base utilisateur
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Prénom invalide'),
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Nom de famille invalide'),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Email invalide'),
  body('phone')
    .optional()
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage('Numéro de téléphone invalide'),

  // Profil personnel
  body('dateOfBirth')
    .optional()
    .custom((value) => {
      if (value === '' || value === null || value === undefined) return true;
      return new Date(value).toString() !== 'Invalid Date';
    })
    .withMessage('Date de naissance invalide'),
  body('gender')
    .optional({ checkFalsy: true })
    .isIn(['male', 'female', 'other'])
    .withMessage('Genre invalide'),
  body('maritalStatus')
    .optional({ checkFalsy: true })
    .isIn(['single', 'married', 'divorced', 'widowed'])
    .withMessage('Statut matrimonial invalide'),
  body('occupation')
    .optional()
    .trim()
    .custom((value) => {
      if (value === '' || value === null || value === undefined) return true;
      return value.length >= 2 && value.length <= 100;
    })
    .withMessage('Profession invalide'),

  // Adresse
  body('address.street')
    .optional()
    .trim()
    .custom((value) => {
      if (value === '' || value === null || value === undefined) return true;
      return value.length >= 1 && value.length <= 200;
    })
    .withMessage('Rue invalide'),
  body('address.neighborhood')
    .optional()
    .trim()
    .custom((value) => {
      if (value === '' || value === null || value === undefined) return true;
      return value.length >= 1 && value.length <= 100;
    })
    .withMessage('Quartier invalide'),
  body('address.postalCode')
    .optional()
    .trim()
    .custom((value) => {
      if (value === '' || value === null || value === undefined) return true;
      return value.length >= 1 && value.length <= 20;
    })
    .withMessage('Code postal invalide'),
  body('address.state')
    .optional()
    .trim()
    .custom((value) => {
      if (value === '' || value === null || value === undefined) return true;
      return value.length >= 1 && value.length <= 100;
    })
    .withMessage('État/Région invalide'),
  body('address.country')
    .optional()
    .trim()
    .custom((value) => {
      if (value === '' || value === null || value === undefined) return true;
      return value.length >= 2 && value.length <= 3;
    })
    .withMessage('Code pays invalide'),

  // Contact d'urgence
  body('emergencyContact.name')
    .optional()
    .trim()
    .custom((value) => {
      if (value === '' || value === null || value === undefined) return true;
      return value.length <= 100;
    })
    .withMessage('Nom du contact d\'urgence invalide'),
  body('emergencyContact.relationship')
    .optional()
    .trim()
    .custom((value) => {
      if (value === '' || value === null || value === undefined) return true;
      return value.length <= 50;
    })
    .withMessage('Relation du contact d\'urgence invalide'),
  body('emergencyContact.phone')
    .optional()
    .custom((value) => {
      if (value === '' || value === null || value === undefined) return true;
      return /^\+?[1-9]\d{1,14}$/.test(value);
    })
    .withMessage('Téléphone du contact d\'urgence invalide'),
  body('emergencyContact.email')
    .optional()
    .custom((value) => {
      if (value === '' || value === null || value === undefined) return true;
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    })
    .withMessage('Email du contact d\'urgence invalide'),

  // Église
  body('churchMembership.isChurchMember')
    .optional()
    .isBoolean()
    .withMessage('Statut membre d\'église invalide'),
  body('churchMembership.churchName')
    .optional()
    .trim()
    .custom((value) => {
      if (value === '' || value === null || value === undefined) return true;
      return value.length <= 100;
    })
    .withMessage('Nom d\'église invalide'),
  body('churchMembership.membershipDuration')
    .optional()
    .custom((value) => {
      if (value === '' || value === null || value === undefined) return true;
      return Number.isInteger(Number(value)) && Number(value) >= 0;
    })
    .withMessage('Durée de membre invalide'),
  body('churchMembership.role')
    .optional()
    .trim()
    .custom((value) => {
      if (value === '' || value === null || value === undefined) return true;
      return value.length <= 50;
    })
    .withMessage('Rôle dans l\'église invalide'),

  // Préférences de don
  body('donationPreferences.preferredAmount')
    .optional()
    .custom((value) => {
      if (value === 0 || value === '' || value === null || value === undefined) return true;
      return Number.isInteger(Number(value)) && Number(value) >= 100;
    })
    .withMessage('Montant préféré invalide'),
  body('donationPreferences.preferredFrequency')
    .optional()
    .isIn(['weekly', 'monthly', 'quarterly', 'yearly', 'one_time'])
    .withMessage('Fréquence préférée invalide'),
  body('donationPreferences.preferredDay')
    .optional()
    .custom((value) => {
      if (value === '' || value === null || value === undefined) return true;
      const num = Number(value);
      return Number.isInteger(num) && num >= 1 && num <= 31;
    })
    .withMessage('Jour préféré invalide'),
  body('donationPreferences.preferredPaymentMethod')
    .optional()
    .isIn(['card', 'mobile_money', 'bank_transfer', 'cash'])
    .withMessage('Méthode de paiement préférée invalide'),
  body('donationPreferences.donationCategories')
    .optional()
    .isArray()
    .withMessage('Catégories de don invalides'),
  body('donationPreferences.donationCategories.*')
    .optional()
    .isIn(['don_libre', 'don_mensuel', 'don_special', 'dime', 'offrande', 'projet_special', 'soutien_missionnaire', 'aide_sociale', 'construction_temple', 'evangelisation', 'jeunesse', 'formation', 'media', 'charity'])
    .withMessage('Catégorie de don invalide'),

  // Informations familiales
  body('familyInfo.numberOfChildren')
    .optional()
    .custom((value) => {
      if (value === '' || value === null || value === undefined) return true;
      const num = Number(value);
      return Number.isInteger(num) && num >= 0 && num <= 20;
    })
    .withMessage('Nombre d\'enfants invalide'),
  body('familyInfo.children')
    .optional()
    .isArray()
    .withMessage('Informations enfants invalides')
];

// Validation pour les paramètres de requête
const getUsersValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('La page doit être un entier positif'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('La limite doit être entre 1 et 50'),
  query('role')
    .optional()
    .isIn(['user', 'support_agent', 'admin', 'moderator', 'treasurer'])
    .withMessage('Rôle invalide'),
  query('isActive')
    .optional()
    .isBoolean()
    .withMessage('Statut actif invalide'),
  query('search')
    .optional()
    .trim()
    .isLength({ min: 2 })
    .withMessage('Recherche doit contenir au moins 2 caractères')
];

// Validation pour modification de rôle
const updateRoleValidation = [
  body('role')
    .isIn(['user', 'support_agent', 'admin', 'moderator', 'treasurer'])
    .withMessage('Rôle invalide')
];

// Validation pour modification de statut
const updateStatusValidation = [
  body('isActive')
    .isBoolean()
    .withMessage('Le statut doit être un booléen'),
  body('reason')
    .optional()
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('La raison doit contenir entre 5 et 200 caractères')
];

// Validation pour suppression de compte
const deleteAccountValidation = [
  body('password')
    .notEmpty()
    .withMessage('Mot de passe requis'),
  body('confirmation')
    .equals('DELETE')
    .withMessage('Confirmation requise: tapez "DELETE"')
];

// Validation pour les préférences
const preferencesValidation = [
  body('language')
    .optional()
    .isIn(['fr', 'en'])
    .withMessage('Langue invalide'),
  body('currency')
    .optional()
    .isIn(['XOF', 'EUR', 'USD'])
    .withMessage('Devise invalide'),
  body('emailNotifications')
    .optional()
    .isObject()
    .withMessage('Notifications email invalides'),
  body('smsNotifications')
    .optional()
    .isObject()
    .withMessage('Notifications SMS invalides')
];

// GET /api/users/leaderboard - Tableau des leaders (gamification) - doit être avant /:id
router.get('/leaderboard', authenticateToken, [
  query('period')
    .optional()
    .isIn(['week', 'month', 'year', 'all'])
    .withMessage('Période invalide'),
  query('limit')
    .optional()
    .isInt({ min: 5, max: 50 })
    .withMessage('Limite invalide')
], getLeaderboard);

// GET /api/users/profile - Obtenir le profil de l'utilisateur connecté
router.get('/profile', authenticateToken, getProfile);

// PUT /api/users/profile - Mettre à jour le profil de l'utilisateur
router.put('/profile', authenticateToken, updateProfileValidation, updateProfile);

// PUT /api/users/preferences - Mettre à jour les préférences utilisateur
router.put('/preferences', authenticateToken, preferencesValidation, updateUserPreferences);

// POST /api/users/upload-avatar - Upload d'avatar avec fichier
router.post('/upload-avatar', authenticateToken, avatarUpload.single('avatar'), uploadAvatar);

// POST /api/users/upload-avatar-base64 - Upload d'avatar en base64 (pour mobile)
router.post('/upload-avatar-base64', authenticateToken, [
  body('imageData')
    .notEmpty()
    .withMessage('Données d\'image requises'),
  body('imageData')
    .matches(/^data:image\/(jpeg|jpg|png|webp);base64,/)
    .withMessage('Format d\'image invalide. Utilisez JPEG, PNG ou WebP en base64.')
], uploadAvatarBase64);

// DELETE /api/users/account - Supprimer son compte (avec confirmation)
router.delete('/account', authenticateToken, deleteAccountValidation, deleteUserAccount);

// GET /api/users - Liste des utilisateurs (admin seulement)
router.get('/', authenticateToken, authorizeRoles('admin', 'moderator', 'support_agent'), getUsersValidation, getUsers);

// GET /api/users/preferences - Récupérer les préférences utilisateur (doit être avant /:id)
router.get('/preferences', authenticateToken, getUserPreferences);

// GET /api/users/:id - Obtenir un utilisateur par ID (admin ou propriétaire)
router.get('/:id', authenticateToken, authorizeOwnerOrAdmin, getUser);

// PUT /api/users/:id/role - Modifier le rôle d'un utilisateur (admin seulement)
router.put('/:id/role', authenticateToken, authorizeRoles('admin'), updateRoleValidation, updateUserRole);

// PUT /api/users/:id/status - Activer/Désactiver un utilisateur (admin seulement)
router.put('/:id/status', authenticateToken, authorizeRoles('admin'), updateStatusValidation, updateUserStatus);

// GET /api/users/:id/donations - Historique des dons d'un utilisateur
router.get('/:id/donations', authenticateToken, authorizeOwnerOrAdmin, [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('La page doit être un entier positif'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('La limite doit être entre 1 et 50'),
  query('category')
    .optional()
    .isIn(['soutien', 'tithe', 'offering', 'building', 'missions', 'charity', 'education', 'youth', 'women', 'men', 'special', 'emergency'])
    .withMessage('Catégorie invalide'),
  query('status')
    .optional()
    .isIn(['pending', 'processing', 'completed', 'failed', 'cancelled'])
    .withMessage('Statut invalide'),
  query('period')
    .optional()
    .isIn(['week', 'month', 'year'])
    .withMessage('Période invalide')
], getUserDonations);

// GET /api/users/:id/stats - Statistiques d'un utilisateur
router.get('/:id/stats', authenticateToken, authorizeOwnerOrAdmin, getUserStats);

// GET /api/users/profile/download-data - Télécharger les données personnelles
router.get('/profile/download-data', authenticateToken, downloadPersonalData);

module.exports = router; 