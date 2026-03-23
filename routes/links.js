const express = require('express');
const { body } = require('express-validator');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const {
  getUsefulLinks,
  createUsefulLink,
  updateUsefulLink,
  deleteUsefulLink,
} = require('../controllers/usefulLinkController');

const router = express.Router();

router.get('/', authenticateToken, getUsefulLinks);
router.post(
  '/',
  authenticateToken,
  authorizeRoles('admin', 'moderator', 'support_agent'),
  [
    body('titre').trim().isLength({ min: 2, max: 150 }).withMessage('Titre invalide'),
    body('url').trim().isURL().withMessage('URL invalide'),
    body('description').optional().isLength({ max: 500 }).withMessage('Description trop longue'),
  ],
  createUsefulLink
);
router.put(
  '/:id',
  authenticateToken,
  authorizeRoles('admin', 'moderator', 'support_agent'),
  [
    body('titre').optional().trim().isLength({ min: 2, max: 150 }).withMessage('Titre invalide'),
    body('url').optional().trim().isURL().withMessage('URL invalide'),
    body('description').optional().isLength({ max: 500 }).withMessage('Description trop longue'),
  ],
  updateUsefulLink
);
router.delete('/:id', authenticateToken, authorizeRoles('admin', 'moderator', 'support_agent'), deleteUsefulLink);

module.exports = router;

