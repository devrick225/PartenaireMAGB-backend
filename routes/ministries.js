const express = require('express');
const { body, param } = require('express-validator');
const ministryController = require('../controllers/ministryController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const router = express.Router();

// Validation pour la création et mise à jour
const ministryValidation = [
  body('title')
    .trim()
    .isLength({ min: 3, max: 200 })
    .withMessage('Le titre doit contenir entre 3 et 200 caractères'),
  body('description')
    .trim()
    .isLength({ min: 10, max: 2000 })
    .withMessage('La description doit contenir entre 10 et 2000 caractères'),
  body('imageUrl')
    .optional()
    .isURL()
    .withMessage('L\'URL de l\'image doit être valide'),
  body('externalLink')
    .optional()
    .isURL()
    .withMessage('Le lien externe doit être valide'),
  body('category')
    .optional()
    .isIn(['general', 'youth', 'children', 'women', 'men', 'music', 'prayer', 'evangelism', 'social', 'other'])
    .withMessage('Catégorie invalide'),
  body('order')
    .optional()
    .isInt({ min: 0 })
    .withMessage('L\'ordre doit être un nombre positif'),
  body('contactInfo.name')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Le nom du contact ne peut pas dépasser 100 caractères'),
  body('contactInfo.phone')
    .optional()
    .trim()
    .isMobilePhone('any')
    .withMessage('Le numéro de téléphone doit être valide'),
  body('contactInfo.email')
    .optional()
    .isEmail()
    .withMessage('L\'email du contact doit être valide'),
  body('meetingInfo.day')
    .optional()
    .isIn(['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche', ''])
    .withMessage('Jour de réunion invalide'),
  body('meetingInfo.time')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('L\'heure ne peut pas dépasser 50 caractères'),
  body('meetingInfo.location')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Le lieu ne peut pas dépasser 200 caractères')
];

// Validation pour les paramètres
const paramValidation = [
  param('id')
    .isMongoId()
    .withMessage('ID de ministère invalide'),
  param('category')
    .isIn(['general', 'youth', 'children', 'women', 'men', 'music', 'prayer', 'evangelism', 'social', 'other'])
    .withMessage('Catégorie invalide')
];

// Routes publiques (accessibles à tous)
router.get('/', ministryController.getAllMinistries);
router.get('/category/:category', paramValidation.slice(1), ministryController.getMinistriesByCategory);
router.get('/:id', paramValidation.slice(0, 1), ministryController.getMinistryById);
router.get('/stats/overview', ministryController.getMinistryStats);

// Routes protégées (Admin seulement)
router.post('/', authenticateToken, authorizeRoles('admin'), ministryValidation, ministryController.createMinistry);
router.put('/:id', authenticateToken, authorizeRoles('admin'), paramValidation.slice(0, 1), ministryValidation, ministryController.updateMinistry);
router.delete('/:id', authenticateToken, authorizeRoles('admin'), paramValidation.slice(0, 1), ministryController.deleteMinistry);
router.patch('/:id/toggle', authenticateToken, authorizeRoles('admin'), paramValidation.slice(0, 1), ministryController.toggleMinistryStatus);

module.exports = router; 