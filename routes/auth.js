const express = require('express');
const { body } = require('express-validator');
const {
  register,
  login,
  refreshToken,
  verifyEmail,
  forgotPassword,
  resetPassword,
  changePassword,
  getMe,
  logout,
  sendEmailVerificationCode,
  verifyEmailCode,
  sendPhoneVerificationCode,
  verifyPhoneCode
} = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Validations
const registerValidation = [
  body('firstName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Le prénom doit contenir entre 2 et 50 caractères'),
  body('lastName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Le nom doit contenir entre 2 et 50 caractères'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email invalide'),
  body('phone')
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage('Numéro de téléphone invalide'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Le mot de passe doit contenir au moins 8 caractères')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Le mot de passe doit contenir au moins une minuscule, une majuscule et un chiffre'),
  body('country')
    .notEmpty()
    .withMessage('Le pays est requis'),
  body('city')
    .notEmpty()
    .withMessage('La ville est requise')
];

const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email invalide'),
  body('password')
    .notEmpty()
    .withMessage('Mot de passe requis')
];

const changePasswordValidation = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Mot de passe actuel requis'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('Le nouveau mot de passe doit contenir au moins 8 caractères')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Le nouveau mot de passe doit contenir au moins une minuscule, une majuscule et un chiffre')
];

const resetPasswordValidation = [
  body('password')
    .isLength({ min: 8 })
    .withMessage('Le mot de passe doit contenir au moins 8 caractères')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Le mot de passe doit contenir au moins une minuscule, une majuscule et un chiffre')
];

const forgotPasswordValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email invalide')
];

// Routes publiques
router.post('/register', registerValidation, register);
router.post('/login', loginValidation, login);
router.post('/refresh', refreshToken);
router.get('/verify-email/:token', verifyEmail);
router.post('/forgot-password', forgotPasswordValidation, forgotPassword);
router.post('/reset-password/:token', resetPasswordValidation, resetPassword);

// Routes protégées
router.get('/me', authenticateToken, getMe);
router.put('/change-password', authenticateToken, changePasswordValidation, changePassword);
router.post('/logout', authenticateToken, logout);

// Routes de vérification par codes
router.post('/send-email-verification-code', authenticateToken, sendEmailVerificationCode);
router.post('/verify-email-code', authenticateToken, [
  body('code')
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('Code de vérification invalide (6 chiffres requis)')
], verifyEmailCode);

router.post('/send-phone-verification-code', authenticateToken, sendPhoneVerificationCode);
router.post('/verify-phone-code', authenticateToken, [
  body('code')
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('Code de vérification invalide (6 chiffres requis)')
], verifyPhoneCode);

module.exports = router; 