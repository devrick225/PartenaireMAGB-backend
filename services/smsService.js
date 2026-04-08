const twilio = require('twilio');

class SmsService {
  constructor() {
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      this.client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      this.fromNumber = process.env.TWILIO_PHONE_NUMBER;
      this.serviceSid = process.env.TWILIO_SERVICE_SID; // Verify Service SID
      this.isConfigured = true;
      console.log('✅ Twilio configuré - SMS activé');
    } else {
      console.warn('⚠️ Twilio not configured - SMS services will use development mode');
      this.isConfigured = false;
    }
  }

  /**
   * Envoyer un SMS générique
   */
  async sendSms(to, message) {
    try {
      if (!this.isConfigured) {
        console.log(`📱 [DEV] SMS vers ${to}: ${message}`);
        return { success: true, messageId: `dev_${Date.now()}`, mode: 'development' };
      }

      const formattedNumber = this.formatPhoneNumber(to);
      
      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: formattedNumber
      });

      console.log(`✅ SMS envoyé à ${to}: ${result.sid}`);
      return { success: true, messageId: result.sid, status: result.status, mode: 'production' };

    } catch (error) {
      console.error('❌ Erreur envoi SMS:', error);
      throw new Error(`Erreur envoi SMS: ${error.message}`);
    }
  }

  /**
   * Envoyer un code OTP via Twilio Verify (recommandé pour les codes de vérification)
   */
  async sendVerificationCode(phoneNumber) {
    try {
      if (!this.isConfigured || !this.serviceSid) {
        // Mode dev: générer un code fictif
        const devCode = Math.floor(100000 + Math.random() * 900000).toString();
        console.log(`📱 [DEV] Code OTP pour ${phoneNumber}: ${devCode}`);
        return { success: true, code: devCode, mode: 'development' };
      }

      const formattedNumber = this.formatPhoneNumber(phoneNumber);
      
      const verification = await this.client.verify.v2
        .services(this.serviceSid)
        .verifications
        .create({ to: formattedNumber, channel: 'sms' });

      console.log(`✅ Code Twilio Verify envoyé à ${phoneNumber}: ${verification.status}`);
      return { success: true, status: verification.status, mode: 'production' };

    } catch (error) {
      console.error('❌ Erreur Twilio Verify sendCode:', error);
      throw new Error(`Erreur envoi code: ${error.message}`);
    }
  }

  /**
   * Vérifier un code OTP via Twilio Verify
   */
  async checkVerificationCode(phoneNumber, code) {
    try {
      if (!this.isConfigured || !this.serviceSid) {
        // Mode dev: accepter n'importe quel code à 6 chiffres
        console.log(`📱 [DEV] Vérification code ${code} pour ${phoneNumber}`);
        return { success: true, valid: code.length === 6, mode: 'development' };
      }

      const formattedNumber = this.formatPhoneNumber(phoneNumber);
      
      const verificationCheck = await this.client.verify.v2
        .services(this.serviceSid)
        .verificationChecks
        .create({ to: formattedNumber, code });

      const valid = verificationCheck.status === 'approved';
      console.log(`${valid ? '✅' : '❌'} Code Twilio Verify pour ${phoneNumber}: ${verificationCheck.status}`);
      return { success: true, valid, status: verificationCheck.status, mode: 'production' };

    } catch (error) {
      console.error('❌ Erreur Twilio Verify checkCode:', error);
      return { success: false, valid: false, error: error.message };
    }
  }

  /**
   * Envoyer un code de vérification de téléphone
   */
  async sendPhoneVerificationCode(phoneNumber, code, firstName = '') {
    // Utiliser Twilio Verify si disponible, sinon SMS classique
    if (this.serviceSid) {
      return await this.sendVerificationCode(phoneNumber);
    }

    const message = `Bonjour ${firstName},\n\nVotre code de vérification PARTENAIRE MAGB est : ${code}\n\nCe code expire dans 10 minutes.\nNe partagez jamais ce code.`;
    return await this.sendSms(phoneNumber, message);
  }

  /**
   * Envoyer un code de réinitialisation de mot de passe
   */
  async sendPasswordResetCode(phoneNumber, code, firstName = '') {
    const message = `Bonjour ${firstName},\n\nVotre code de réinitialisation PARTENAIRE MAGB est : ${code}\n\nCe code expire dans 10 minutes.`;
    return await this.sendSms(phoneNumber, message);
  }

  /**
   * Envoyer une notification de don
   */
  async sendDonationNotification(phoneNumber, donationDetails) {
    const { amount, currency, receiptNumber, firstName } = donationDetails;
    const message = `Bonjour ${firstName},\n\nVotre DON PARTENAIRE MAGB de ${amount} ${currency} a été confirmé.\nReçu n°: ${receiptNumber}\n\nMerci pour votre soutien !`;
    return await this.sendSms(phoneNumber, message);
  }

  /**
   * Envoyer une notification de paiement
   */
  async sendPaymentNotification(phoneNumber, paymentDetails) {
    const { amount, currency, status, firstName } = paymentDetails;
    let message = `Bonjour ${firstName},\n\n`;
    if (status === 'completed') {
      message += `Votre DON PARTENAIRE MAGB de ${amount} ${currency} a été confirmé. Merci !`;
    } else if (status === 'failed') {
      message += `Votre DON PARTENAIRE MAGB de ${amount} ${currency} a échoué. Veuillez réessayer.`;
    } else {
      message += `Votre DON PARTENAIRE MAGB de ${amount} ${currency} est en cours de traitement.`;
    }
    return await this.sendSms(phoneNumber, message);
  }

  formatPhoneNumber(phoneNumber) {
    let formatted = phoneNumber.replace(/\D/g, '');
    if (formatted.startsWith('0')) {
      formatted = '225' + formatted.substring(1);
    }
    if (!formatted.startsWith('+')) {
      formatted = '+' + formatted;
    }
    return formatted;
  }

  isValidPhoneNumber(phoneNumber) {
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    const cleaned = phoneNumber.replace(/\D/g, '');
    return phoneRegex.test('+' + cleaned);
  }

  isAvailable() { return this.isConfigured; }

  getStatus() {
    return {
      configured: this.isConfigured,
      verifyEnabled: !!this.serviceSid,
      mode: process.env.NODE_ENV,
      provider: 'Twilio'
    };
  }
}

const smsService = new SmsService();
module.exports = smsService;

