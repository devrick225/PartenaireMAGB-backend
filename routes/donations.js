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
  getRecurringDonations
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
    .isIn(['card', 'mobile_money', 'bank_transfer', 'paypal', 'moneyfusion'])
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

// GET /api/donations/recurring - Liste des dons récurrents
router.get('/recurring', authenticateToken, getRecurringDonations);

// GET /api/donations/stats - Statistiques des dons (doit être avant /:id)
router.get('/stats', authenticateToken, getDonationStats);

// GET /api/donations/:id - Détails d'un don
router.get('/:id', authenticateToken, getDonation);

// PUT /api/donations/:id - Modifier un don (admin seulement)
router.put('/:id', authenticateToken, authorizeRoles('admin', 'moderator', 'treasurer', 'support_agent'), updateDonation);

// GET /api/donations/recurring - Liste des dons récurrents
router.get('/recurring', authenticateToken, getRecurringDonations);

// POST /api/donations/:id/cancel - Annuler un don récurrent
router.post('/:id/cancel', authenticateToken, [
  body('reason')
    .optional()
    .isLength({ max: 200 })
    .withMessage('La raison ne peut pas dépasser 200 caractères')
], cancelRecurringDonation);

// Pages de retour de paiement
// GET /api/donations/payment/success - Page de succès
router.get('/payment/success', async (req, res) => {
  try {
    const { donation_id, payment_id, transaction_id, provider } = req.query;
    
    // Redirection vers le frontend avec les paramètres
    const redirectUrl = `${process.env.FRONTEND_URL}/admin/donations/payment/success?` +
      `donation_id=${donation_id || ''}&` +
      `payment_id=${payment_id || ''}&` +
      `transaction_id=${transaction_id || ''}&` +
      `provider=${provider || ''}`;
    
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('Erreur page succès:', error);
    res.redirect(`${process.env.FRONTEND_URL}/admin/donations/payment/failure?error=redirect_error`);
  }
});

// GET /api/donations/payment/failure - Page d'échec
router.get('/payment/failure', async (req, res) => {
  try {
    const { donation_id, payment_id, error_code, error_message, transaction_id, provider } = req.query;
    
    const redirectUrl = `${process.env.FRONTEND_URL}/admin/donations/payment/failure?` +
      `donation_id=${donation_id || ''}&` +
      `payment_id=${payment_id || ''}&` +
      `error_code=${error_code || ''}&` +
      `error_message=${encodeURIComponent(error_message || '')}&` +
      `transaction_id=${transaction_id || ''}&` +
      `provider=${provider || ''}`;
    
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('Erreur page échec:', error);
    res.redirect(`${process.env.FRONTEND_URL}/admin/donations/payment/failure?error=redirect_error`);
  }
});

// GET /api/donations/payment/cancel - Page d'annulation
router.get('/payment/cancel', async (req, res) => {
  try {
    const { donation_id, payment_id, reason, transaction_id, provider } = req.query;
    
    const redirectUrl = `${process.env.FRONTEND_URL}/admin/donations/payment/cancel?` +
      `donation_id=${donation_id || ''}&` +
      `payment_id=${payment_id || ''}&` +
      `reason=${reason || 'user_cancelled'}&` +
      `transaction_id=${transaction_id || ''}&` +
      `provider=${provider || ''}`;
    
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('Erreur page annulation:', error);
    res.redirect(`${process.env.FRONTEND_URL}/admin/donations/payment/cancel?error=redirect_error`);
  }
});

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