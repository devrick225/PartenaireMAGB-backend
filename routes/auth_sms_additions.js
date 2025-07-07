
// Validations pour SMS
const requestPasswordResetSmsCodeValidation = [
  body('phone')
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage('Numéro de téléphone invalide')
];

const resetPasswordWithSmsCodeValidation = [
  body('phone')
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage('Numéro de téléphone invalide'),
  body('code')
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('Code de réinitialisation invalide (6 chiffres requis)'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('Le nouveau mot de passe doit contenir au moins 8 caractères')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Le nouveau mot de passe doit contenir au moins une minuscule, une majuscule et un chiffre')
];

// Nouvelles routes pour réinitialisation par SMS
router.post('/request-password-reset-sms-code', requestPasswordResetSmsCodeValidation, requestPasswordResetSmsCode);
router.post('/reset-password-with-sms-code', resetPasswordWithSmsCodeValidation, resetPasswordWithSmsCode);

