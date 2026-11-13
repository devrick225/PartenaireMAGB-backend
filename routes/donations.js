const express = require('express');
const { body, query } = require('express-validator');
const { authenticateToken, requireEmailVerification, authorizeRoles } = require('../middleware/auth');
const {
  getDonations,
  createDonation,
  getDonation,
  cancelRecurringDonation,
  getDonationStats,
  updateDonation,
  updateDonationStatus,
  getRecurringDonations
} = require('../controllers/donationController');

const router = express.Router();

// Validation pour la création d'un don
const createDonationValidation = [
  body('amount')
    .isFloat({ max: 2000000 })
    .withMessage('Le montant doit être un nombre inférieur ou égal à 2 000 000')
    .bail()
    // Minimum selon la devise : 200 XOF, 1 EUR / 1 USD
    .custom((value, { req }) => {
      const min = ['EUR', 'USD'].includes(req.body.currency) ? 1 : 200;
      if (Number(value) < min) {
        throw new Error(`Le montant minimum est de ${min} ${req.body.currency || 'XOF'}`);
      }
      return true;
    }),
  body('currency')
    .isIn(['XOF', 'EUR', 'USD'])
    .withMessage('Devise non supportée'),
  body('category')
    .isIn(['don_mensuel', 'don_trimestriel', 'don_semestriel', 'don_ponctuel', 'don_libre', 'don_concert_femmes', 'don_ria_2025'])
    .withMessage('Catégorie invalide'),
  body('type')
    .isIn(['one_time', 'recurring'])
    .withMessage('Type de don invalide'),
  body('paymentMethod')
    .isIn(['card', 'mobile_money', 'bank_transfer', 'paypal', 'moneyfusion', 'paydunya', 'geniuspay'])
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
    .isIn(['don_mensuel', 'don_trimestriel', 'don_semestriel', 'don_ponctuel', 'don_libre', 'don_concert_femmes', 'don_ria_2025'])
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

// GET /api/donations/recurring - Liste des dons récurrents
router.get('/recurring', authenticateToken, getRecurringDonations);

// GET /api/donations/stats - Statistiques des dons (doit être avant /:id)
router.get('/stats', authenticateToken, getDonationStats);

// GET /api/donations/:id - Détails d'un don
router.get('/:id', authenticateToken, getDonation);

// PUT /api/donations/:id - Modifier un don (admin seulement)
router.put('/:id', authenticateToken, authorizeRoles('admin', 'moderator', 'treasurer'), updateDonation);

// PATCH /api/donations/:id/status - Mettre à jour le statut d'une donation (système/admin uniquement)
router.patch('/:id/status', authenticateToken, authorizeRoles('admin', 'moderator', 'treasurer'), updateDonationStatus);

// POST /api/donations/:id/cancel - Annuler un don récurrent
router.post('/:id/cancel', authenticateToken, [
  body('reason')
    .optional()
    .isLength({ max: 200 })
    .withMessage('La raison ne peut pas dépasser 200 caractères')
], cancelRecurringDonation);

// Pages de retour de paiement : redirection vers le frontend avec les paramètres reçus.
// Les valeurs sont encodées (URLSearchParams) pour qu'un paramètre ne puisse pas en injecter d'autres.
const paymentReturnRedirect = (page, fields, defaults = {}) => (req, res) => {
  const base = `${process.env.FRONTEND_URL}/admin/donations/payment/${page}`;
  try {
    const params = new URLSearchParams();
    fields.forEach(field => {
      const value = Array.isArray(req.query[field]) ? req.query[field][0] : req.query[field];
      params.append(field, value || defaults[field] || '');
    });
    res.redirect(`${base}?${params.toString()}`);
  } catch (error) {
    console.error(`Erreur page ${page}:`, error);
    res.redirect(`${base}?error=redirect_error`);
  }
};

// GET /api/donations/payment/success - Page de succès
router.get('/payment/success', paymentReturnRedirect('success', ['donation_id', 'payment_id', 'transaction_id', 'provider']));

// GET /api/donations/payment/failure - Page d'échec
router.get('/payment/failure', paymentReturnRedirect('failure', ['donation_id', 'payment_id', 'error_code', 'error_message', 'transaction_id', 'provider']));

// GET /api/donations/payment/cancel - Page d'annulation
router.get('/payment/cancel', paymentReturnRedirect('cancel', ['donation_id', 'payment_id', 'reason', 'transaction_id', 'provider'], { reason: 'user_cancelled' }));

// Routes administratives pour la vérification des paiements
// POST /api/donations/verify-payments - Vérification manuelle des paiements
router.post('/verify-payments', authenticateToken, authorizeRoles('admin', 'treasurer'), async (req, res) => {
  try {
    const cronJobs = require('../services/cronJobs');
    const results = await cronJobs.runPaymentVerificationNow();
    
    res.json({
      success: true,
      message: 'Vérification des paiements lancée',
      data: results
    });
  } catch (error) {
    console.error('Erreur vérification manuelle paiements:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la vérification des paiements'
    });
  }
});

// POST /api/donations/process-recurring - Générer les échéances des dons récurrents arrivées à terme
router.post('/process-recurring', authenticateToken, authorizeRoles('admin', 'treasurer'), async (req, res) => {
  try {
    const cronJobs = require('../services/cronJobs');
    const results = await cronJobs.runRecurringDonationsNow();

    res.json({
      success: true,
      message: 'Dons récurrents traités',
      data: results
    });
  } catch (error) {
    console.error('Erreur traitement dons récurrents:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du traitement des dons récurrents'
    });
  }
});

// GET /api/donations/cron-status - Statut des tâches cron
router.get('/cron-status', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const cronJobs = require('../services/cronJobs');
    const status = cronJobs.getStatus();
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('Erreur statut cron:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération du statut'
    });
  }
});

module.exports = router; 