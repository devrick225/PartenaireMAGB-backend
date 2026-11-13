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
    .isIn(['cinetpay', 'stripe', 'paypal', 'fusionpay', 'moneyfusion', 'orange_money', 'mtn_mobile_money', 'moov_money', 'paydunya', 'geniuspay'])
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
      const standardMethods = ['card', 'mobile_money', 'bank_transfer', 'paypal', 'crypto', 'moneyfusion', 'geniuspay'];
      if (!standardMethods.includes(value)) {
        throw new Error('Méthode de paiement invalide');
      }
      return true;
    })
    .withMessage('Méthode de paiement invalide'),
  body('customerPhone')
    .optional({ checkFalsy: true })
    // Même format que le modèle User : les numéros locaux commençant par 0 sont valides
    .matches(/^\+?[0-9]\d{7,14}$/)
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
    .isIn(['cinetpay', 'stripe', 'paypal', 'fusionpay', 'moneyfusion', 'orange_money', 'mtn_mobile_money', 'moov_money', 'paydunya', 'geniuspay'])
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
    .isIn(['cinetpay', 'stripe', 'paypal', 'fusionpay', 'moneyfusion', 'orange_money', 'mtn_mobile_money', 'moov_money', 'paydunya', 'geniuspay'])
    .withMessage('Fournisseur invalide')
];

// GET /api/payments/callback - Callback de paiement (public)
router.get('/callback', paymentCallback);

/**
 * GET /api/payments/mobile-callback
 * Route intermédiaire pour MoneyFusion.
 *
 * MoneyFusion exige une URL HTTPS pour le return_url.
 * Cette route reçoit la redirection après paiement et redirige
 * immédiatement vers le deep link de l'app mobile.
 *
 * Flux : MoneyFusion → HTTPS backend → deep link (partenaireMagb:// ou exp://)
 * Le deep link est passé en paramètre pour supporter Expo Go en dev.
 */
// Schémas autorisés pour le deep link de retour (app de production et Expo Go en dev)
const ALLOWED_DEEP_LINK_SCHEMES = ['partenairemagb:', 'exp:', 'exps:'];

const isAllowedDeepLink = (value) => {
  try {
    return ALLOWED_DEEP_LINK_SCHEMES.includes(new URL(value).protocol.toLowerCase());
  } catch (error) {
    return false;
  }
};

// Sérialise une valeur pour l'insérer dans un <script> inline sans pouvoir en sortir
const toInlineScriptString = (value) => JSON.stringify(String(value))
  .replace(/</g, '\\u003c')
  .replace(/>/g, '\\u003e')
  .replace(/&/g, '\\u0026')
  // Tout caractère non ASCII (dont les séparateurs de ligne Unicode) est échappé
  .replace(/[^\x20-\x7e]/g, (char) => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'));

router.get('/mobile-callback', (req, res) => {
  const first = (value) => (Array.isArray(value) ? value[0] : value);
  const donationId = first(req.query.donationId);
  const token = first(req.query.token);
  const statut = first(req.query.statut);
  const transactionId = first(req.query.transactionId);
  const deepLink = first(req.query.deepLink);
  // MoneyFusion renvoie "statut", GeniusPay "status"
  const rawStatus = statut || first(req.query.status);

  // Mapper le statut du fournisseur vers le statut interne.
  // Purement indicatif pour l'affichage : l'application doit toujours confirmer
  // le paiement via POST /api/payments/:id/verify.
  const status = ['paid', 'completed', 'success'].includes(rawStatus) ? 'completed'
    : ['failed', 'failure', 'no paid', 'error'].includes(rawStatus) ? 'failed'
    : rawStatus === 'cancelled' ? 'cancelled'
    : 'pending';

  let targetDeepLink;

  // Le deep link vient de la query string : n'accepter que les schémas de l'application,
  // sinon cette page servirait de redirection ouverte / d'injection de script.
  if (deepLink && isAllowedDeepLink(deepLink)) {
    // Utiliser le deep link fourni par le mobile (supporte Expo Go en dev)
    const separator = deepLink.includes('?') ? '&' : '?';
    targetDeepLink = /[?&]status=/.test(deepLink)
      ? deepLink.replace(/([?&])status=[^&]*/, `$1status=${status}`)
      : `${deepLink}${separator}status=${status}`;
    if (token && !targetDeepLink.includes('transactionId=')) {
      targetDeepLink += `&transactionId=${encodeURIComponent(token)}`;
    }
  } else {
    // Fallback : construire le deep link de production
    const params = new URLSearchParams();
    if (donationId) params.append('donationId', donationId);
    if (token || transactionId) params.append('transactionId', token || transactionId);
    params.append('status', status);
    targetDeepLink = `partenaireMagb://payment/return?${params.toString()}`;
  }

  // Fallback web si l'app n'est pas installée
  const fallbackParams = new URLSearchParams();
  if (donationId) fallbackParams.append('donationId', donationId);
  fallbackParams.append('status', status);
  const fallbackUrl = `${process.env.FRONTEND_URL || 'https://partenairemagb-frontend.onrender.com'}/payment-result?${fallbackParams.toString()}`;

  // La page contient un script inline : assouplir la CSP de helmet pour cette réponse uniquement
  res.set('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'");

  // Page HTML qui tente le deep link puis redirige vers le fallback
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Retour vers l'application...</title>
  <style>
    body { font-family: sans-serif; text-align: center; padding: 40px 20px; background: #f5f5f5; }
    .spinner { width: 40px; height: 40px; border: 4px solid #e0e0e0; border-top-color: #59376b; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 20px auto; }
    @keyframes spin { to { transform: rotate(360deg); } }
    p { color: #666; font-size: 16px; }
    .status { font-weight: bold; color: ${status === 'completed' ? '#4CAF50' : status === 'failed' ? '#F44336' : '#FF9800'}; }
  </style>
</head>
<body>
  <div class="spinner"></div>
  <p>Paiement <span class="status">${status === 'completed' ? 'confirmé ✓' : status === 'failed' ? 'échoué ✗' : status === 'cancelled' ? 'annulé' : 'en cours...'}</span></p>
  <p>Retour vers l'application...</p>
  <script>
    // Tenter d'ouvrir le deep link immédiatement
    window.location.href = ${toInlineScriptString(targetDeepLink)};
    // Si l'app ne s'ouvre pas dans 3 secondes, rediriger vers le fallback web
    setTimeout(function() {
      window.location.href = ${toInlineScriptString(fallbackUrl)};
    }, 3000);
  </script>
</body>
</html>`);
});

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