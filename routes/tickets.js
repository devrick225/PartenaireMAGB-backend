const express = require('express');
const { body, query } = require('express-validator');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const {
  getTickets,
  createTicket,
  getTicket,
  updateTicket,
  assignTicket,
  changeTicketStatus,
  closeTicket,
  escalateTicket,
  addTicketRating,
  getTicketStats,
  addTicketComment,
  getTicketComments,
  uploadTicketAttachment
} = require('../controllers/ticketController');

const router = express.Router();

// Validation pour la création d'un ticket
const createTicketValidation = [
  body('subject')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Le sujet doit contenir entre 5 et 200 caractères'),
  body('description')
    .trim()
    .isLength({ min: 10, max: 2000 })
    .withMessage('La description doit contenir entre 10 et 2000 caractères'),
  body('category')
    .isIn(['technical', 'payment', 'account', 'donation', 'bug_report', 'feature_request', 'general', 'complaint', 'suggestion'])
    .withMessage('Catégorie invalide'),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Priorité invalide')
];

// Validation pour les paramètres de requête
const getTicketsValidation = [
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
    .isIn(['open', 'in_progress', 'waiting_user', 'waiting_admin', 'resolved', 'closed', 'cancelled'])
    .withMessage('Statut invalide'),
  query('category')
    .optional()
    .isIn(['technical', 'payment', 'account', 'donation', 'bug_report', 'feature_request', 'general', 'complaint', 'suggestion'])
    .withMessage('Catégorie invalide'),
  query('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Priorité invalide'),
  query('assignedTo')
    .optional()
    .isMongoId()
    .withMessage('ID assigné invalide')
];

// Validation pour l'assignation
const assignTicketValidation = [
  body('assignedTo')
    .notEmpty()
    .isMongoId()
    .withMessage('ID utilisateur assigné invalide')
];

// Validation pour le changement de statut
const changeStatusValidation = [
  body('status')
    .isIn(['open', 'in_progress', 'waiting_user', 'waiting_admin', 'resolved', 'closed', 'cancelled'])
    .withMessage('Statut invalide'),
  body('reason')
    .optional()
    .isLength({ max: 200 })
    .withMessage('La raison ne peut pas dépasser 200 caractères'),
  body('resolution')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('La résolution ne peut pas dépasser 1000 caractères')
];

// Validation pour l'escalade
const escalateTicketValidation = [
  body('escalatedTo')
    .notEmpty()
    .isMongoId()
    .withMessage('ID utilisateur escaladé invalide'),
  body('reason')
    .notEmpty()
    .isLength({ min: 5, max: 200 })
    .withMessage('La raison doit contenir entre 5 et 200 caractères')
];

// Validation pour l'évaluation
const ratingValidation = [
  body('score')
    .isInt({ min: 1, max: 5 })
    .withMessage('Le score doit être entre 1 et 5'),
  body('comment')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Le commentaire ne peut pas dépasser 500 caractères')
];

// GET /api/tickets/stats - Statistiques des tickets (admin seulement) - doit être avant /:id
router.get('/stats', authenticateToken, authorizeRoles('admin', 'moderator'), getTicketStats);

// GET /api/tickets - Liste des tickets
router.get('/', authenticateToken, getTicketsValidation, getTickets);

// POST /api/tickets - Créer un nouveau ticket
router.post('/', authenticateToken, createTicketValidation, createTicket);

// GET /api/tickets/:id - Détails d'un ticket
router.get('/:id', authenticateToken, getTicket);

// PUT /api/tickets/:id - Modifier un ticket
router.put('/:id', authenticateToken, updateTicket);

// POST /api/tickets/:id/assign - Assigner un ticket (admin seulement)
router.post('/:id/assign', authenticateToken, authorizeRoles('admin', 'moderator'), assignTicketValidation, assignTicket);

// POST /api/tickets/:id/status - Changer le statut d'un ticket
router.post('/:id/status', authenticateToken, changeStatusValidation, changeTicketStatus);

// POST /api/tickets/:id/close - Fermer un ticket
router.post('/:id/close', authenticateToken, [
  body('reason')
    .optional()
    .isLength({ max: 200 })
    .withMessage('La raison ne peut pas dépasser 200 caractères'),
  body('resolution')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('La résolution ne peut pas dépasser 1000 caractères')
], closeTicket);

// POST /api/tickets/:id/escalate - Escalader un ticket (admin seulement)
router.post('/:id/escalate', authenticateToken, authorizeRoles('admin', 'moderator'), escalateTicketValidation, escalateTicket);

// POST /api/tickets/:id/rating - Évaluer le support (utilisateur seulement, ticket résolu)
router.post('/:id/rating', authenticateToken, ratingValidation, addTicketRating);

// POST /api/tickets/:id/comments - Ajouter un commentaire
router.post('/:id/comments', authenticateToken, [
  body('comment')
    .notEmpty()
    .isLength({ min: 5, max: 1000 })
    .withMessage('Le commentaire doit contenir entre 5 et 1000 caractères'),
  body('isInternal')
    .optional()
    .isBoolean()
    .withMessage('isInternal doit être un booléen')
], addTicketComment);

// POST /api/tickets/:id/attachments - Upload de pièce jointe
router.post('/:id/attachments', authenticateToken, uploadTicketAttachment);

// GET /api/tickets/:id/comments - Obtenir les commentaires d'un ticket
router.get('/:id/comments', authenticateToken, getTicketComments);

module.exports = router; 