const express = require('express');
const { body, query } = require('express-validator');
const { authenticateToken, requireEmailVerification, authorizeRoles } = require('../middleware/auth');
const {
  getDonations,
  createDonation,
  getDonation,
  cancelRecurringDonation,
  getDonationStats,
  updateDonation
} = require('../controllers/donationController');

const router = express.Router();

// Validation pour la création d'un don
const createDonationValidation = [
  body('amount')
    .isNumeric()
    .isFloat({ min: 100 })
    .withMessage('Le montant minimum est de 100'),
  body('currency')
    .isIn(['XOF', 'EUR', 'USD'])
    .withMessage('Devise non supportée'),
  body('category')
    .isIn(['tithe', 'offering', 'building', 'missions', 'charity', 'education', 'youth', 'women', 'men', 'special', 'emergency'])
    .withMessage('Catégorie invalide'),
  body('type')
    .isIn(['one_time', 'recurring'])
    .withMessage('Type de don invalide'),
  body('paymentMethod')
    .isIn(['card', 'mobile_money', 'bank_transfer', 'paypal'])
    .withMessage('Méthode de paiement invalide'),
  body('recurring.frequency')
    .if(body('type').equals('recurring'))
    .isIn(['daily', 'weekly', 'monthly', 'quarterly', 'yearly'])
    .withMessage('Fréquence invalide pour don récurrent'),
  body('recurring.startDate')
    .if(body('type').equals('recurring'))
    .isISO8601()
    .withMessage('Date de début invalide'),
  body('recurring.endDate')
    .optional()
    .isISO8601()
    .withMessage('Date de fin invalide'),
  body('message')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Le message ne peut pas dépasser 500 caractères')
];

// Validation pour les paramètres de requête
const getDonationsValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('La page doit être un entier positif'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('La limite doit être entre 1 et 50'),
  query('status')
    .optional()
    .isIn(['pending', 'processing', 'completed', 'failed', 'cancelled'])
    .withMessage('Statut invalide'),
  query('category')
    .optional()
    .isIn(['tithe', 'offering', 'building', 'missions', 'charity', 'education', 'youth', 'women', 'men', 'special', 'emergency'])
    .withMessage('Catégorie invalide'),
  query('type')
    .optional()
    .isIn(['one_time', 'recurring'])
    .withMessage('Type invalide')
];

// GET /api/donations - Liste des dons de l'utilisateur
router.get('/', authenticateToken, getDonationsValidation, getDonations);

// POST /api/donations - Créer un nouveau don
router.post('/', authenticateToken, requireEmailVerification, createDonationValidation, createDonation);

// GET /api/donations/stats - Statistiques des dons (doit être avant /:id)
router.get('/stats', authenticateToken, getDonationStats);

// GET /api/donations/:id - Détails d'un don
router.get('/:id', authenticateToken, getDonation);

// PUT /api/donations/:id - Modifier un don (admin seulement)
router.put('/:id', authenticateToken, authorizeRoles('admin', 'moderator', 'treasurer'), updateDonation);

// POST /api/donations/:id/cancel - Annuler un don récurrent
router.post('/:id/cancel', authenticateToken, [
  body('reason')
    .optional()
    .isLength({ max: 200 })
    .withMessage('La raison ne peut pas dépasser 200 caractères')
], cancelRecurringDonation);

module.exports = router; 