const express = require('express');
const { body, query } = require('express-validator');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const {
  initializePayment,
  paymentCallback,
  getPayment,
  verifyPayment,
  refundPayment,
  getPaymentStats,
  getPayments,
  getPaymentByDonationId,
  getAllPaymentsByDonationId
} = require('../controllers/paymentController');

const router = express.Router();

// Validation pour l'initialisation d'un paiement
const initializePaymentValidation = [
  body('donationId')
    .notEmpty()
    .isMongoId()
    .withMessage('ID de donation invalide'),
  body('provider')
    .isIn(['cinetpay', 'stripe', 'paypal', 'fusionpay', 'moneyfusion', 'orange_money', 'mtn_mobile_money', 'moov_money', 'paydunya'])
    .withMessage('Fournisseur de paiement invalide'),
  body('paymentMethod')
    .custom((value, { req }) => {
      // Pour PayDunya, accepter tous les opérateurs supportés
      if (req.body.provider === 'paydunya') {
        const paydunyaOperators = [
          'card', 'orange-money-senegal', 'wave-senegal', 'free-money-senegal', 'expresso-sn', 'wizall-senegal',
          'mtn-benin', 'moov-benin', 'orange-money-ci', 'wave-ci', 'mtn-ci', 'moov-ci',
          't-money-togo', 'moov-togo', 'orange-money-mali', 'moov-ml', 'orange-money-burkina', 'moov-burkina-faso'
        ];
        if (!paydunyaOperators.includes(value)) {
          throw new Error(`Opérateur PayDunya non supporté: ${value}`);
        }
        return true;
      }
      
      // Pour les autres fournisseurs, utiliser la validation standard
      const standardMethods = ['card', 'mobile_money', 'bank_transfer', 'paypal', 'crypto', 'moneyfusion'];
      if (!standardMethods.includes(value)) {
        throw new Error('Méthode de paiement invalide');
      }
      return true;
    })
    .withMessage('Méthode de paiement invalide'),
  body('customerPhone')
    .optional()
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage('Numéro de téléphone invalide'),
  body('existingPaymentId')
    .optional()
    .isMongoId()
    .withMessage('ID de paiement existant invalide')
];

// Validation pour le remboursement
const refundValidation = [
  body('amount')
    .optional()
    .isNumeric()
    .isFloat({ min: 0 })
    .withMessage('Le montant doit être positif'),
  body('reason')
    .notEmpty()
    .isLength({ min: 5, max: 200 })
    .withMessage('La raison doit contenir entre 5 et 200 caractères')
];

// Validation pour les paramètres de requête
const getPaymentsValidation = [
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
    .isIn(['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded'])
    .withMessage('Statut invalide'),
  query('provider')
    .optional()
    .isIn(['cinetpay', 'stripe', 'paypal', 'fusionpay', 'moneyfusion', 'orange_money', 'mtn_mobile_money', 'moov_money', 'paydunya'])
    .withMessage('Fournisseur invalide')
];

// Validation pour les statistiques de paiement
const getPaymentStatsValidation = [
  query('period')
    .optional()
    .isIn(['week', 'month', 'year'])
    .withMessage('Période invalide. Valeurs acceptées: week, month, year'),
  query('provider')
    .optional()
    .isIn(['cinetpay', 'stripe', 'paypal', 'fusionpay', 'moneyfusion', 'orange_money', 'mtn_mobile_money', 'moov_money', 'paydunya'])
    .withMessage('Fournisseur invalide')
];

// GET /api/payments/callback - Callback de paiement (public)
router.get('/callback', paymentCallback);

// POST /api/payments/initialize - Initialiser un paiement
router.post('/initialize', authenticateToken, initializePaymentValidation, initializePayment);

// GET /api/payments/stats - Statistiques des paiements (tous les utilisateurs authentifiés)
router.get('/stats', authenticateToken, getPaymentStatsValidation, getPaymentStats);

// GET /api/payments - Liste des paiements (avec filtres)
router.get('/', authenticateToken, getPaymentsValidation, getPayments);

// GET /api/payments/:id - Détails d'un paiement
router.get('/:id', authenticateToken, getPayment);

// GET /api/payments/donation/:donationId - Détails d'un paiement par donationId
router.get('/donation/:donationId', authenticateToken, getPaymentByDonationId);

// GET /api/payments/donation/:donationId/all - TOUS les paiements d'une donation (anti-doublon)
router.get('/donation/:donationId/all', authenticateToken, getAllPaymentsByDonationId);

// POST /api/payments/:id/verify - Vérifier un paiement
router.post('/:id/verify', authenticateToken, verifyPayment);

// POST /api/payments/:id/refund - Rembourser un paiement
router.post('/:id/refund', authenticateToken, authorizeRoles('admin', 'treasurer'), refundValidation, refundPayment);

module.exports = router; 