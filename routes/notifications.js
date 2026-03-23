const express = require('express');
const { body } = require('express-validator');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const {
  getNotifications,
  getMyNotifications,
  createNotification,
  markNotificationRead,
} = require('../controllers/notificationController');

const router = express.Router();

router.get('/', authenticateToken, getNotifications);
router.get('/my', authenticateToken, getMyNotifications);
router.post(
  '/',
  authenticateToken,
  authorizeRoles('admin', 'moderator', 'support_agent'),
  [
    body('titre').trim().isLength({ min: 2, max: 150 }).withMessage('Titre invalide'),
    body('message').trim().isLength({ min: 2, max: 1000 }).withMessage('Message invalide'),
  ],
  createNotification
);
router.patch('/:id/read', authenticateToken, markNotificationRead);

module.exports = router;

