const express = require('express');
const { query, param } = require('express-validator');
const { authenticateToken, authorizeOwnerOrAdmin } = require('../middleware/auth');
const {
  downloadDonationReceipt,
  downloadDonationSchedulePDF,
  downloadDonationScheduleExcel,
  downloadDonationsReport,
  getAvailableDocuments
} = require('../controllers/documentsController');

const router = express.Router();

// Validation pour les paramètres de donation ID
const donationIdValidation = [
  param('donationId')
    .isMongoId()
    .withMessage('ID de donation invalide')
];

// Validation pour les paramètres de don récurrent ID
const recurringDonationIdValidation = [
  param('recurringDonationId')
    .isMongoId()
    .withMessage('ID de don récurrent invalide')
];

// Validation pour les paramètres de rapport
const reportValidation = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Date de début invalide (format ISO8601 requis)'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Date de fin invalide (format ISO8601 requis)'),
  query('category')
    .optional()
    .isIn(['all', 'soutien', 'tithe', 'offering', 'building', 'missions', 'charity', 'education', 'youth', 'women', 'men', 'special', 'emergency'])
    .withMessage('Catégorie invalide'),
  query('status')
    .optional()
    .isIn(['all', 'pending', 'processing', 'completed', 'failed', 'cancelled'])
    .withMessage('Statut invalide'),
  query('period')
    .optional()
    .isIn(['all', 'week', 'month', 'year'])
    .withMessage('Période invalide')
];

// @route   GET /api/documents/available
// @desc    Obtenir la liste des documents disponibles pour l'utilisateur
// @access  Private
router.get('/available', authenticateToken, getAvailableDocuments);

// @route   GET /api/documents/donation-receipt/:donationId
// @desc    Télécharger le reçu de donation en PDF
// @access  Private (Owner or Admin)
router.get('/donation-receipt/:donationId', 
  authenticateToken, 
  donationIdValidation, 
  downloadDonationReceipt
);

// @route   GET /api/documents/schedule-pdf/:recurringDonationId
// @desc    Télécharger l'échéancier de don récurrent en PDF
// @access  Private (Owner or Admin)
router.get('/schedule-pdf/:recurringDonationId', 
  authenticateToken, 
  recurringDonationIdValidation, 
  downloadDonationSchedulePDF
);

// @route   GET /api/documents/schedule-excel/:recurringDonationId
// @desc    Télécharger l'échéancier de don récurrent en Excel
// @access  Private (Owner or Admin)
router.get('/schedule-excel/:recurringDonationId', 
  authenticateToken, 
  recurringDonationIdValidation, 
  downloadDonationScheduleExcel
);

// @route   GET /api/documents/donations-report
// @desc    Télécharger un rapport de donations en Excel
// @access  Private
router.get('/donations-report', 
  authenticateToken, 
  reportValidation, 
  downloadDonationsReport
);

module.exports = router;