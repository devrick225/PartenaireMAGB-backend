const AfricasTalking = require('africastalking');

class SmsService {
  constructor() {
    const apiKey  = process.env.AT_API_KEY;
    const username = process.env.AT_USERNAME; // 'sandbox' en dev, nom du compte en prod

    if (apiKey && username) {
      const at = AfricasTalking({ apiKey, username });
      this.sms = at.SMS;
      this.isConfigured = true;
      console.log(`✅ Africa's Talking configuré (username: ${username}) - SMS activé`);
    } else {
      console.warn("⚠️ Africa's Talking non configuré - SMS en mode développement");
      this.isConfigured = false;
      this.sms = null;
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

      const result = await this.sms.send({
        to: [formattedNumber],
        message,
        // from: 'MAGB' // Optionnel : sender ID alphanumérique (à activer sur AT dashboard)
      });

      const recipient = result.SMSMessageData?.Recipients?.[0];
      const messageId = recipient?.messageId || `at_${Date.now()}`;
      const status    = recipient?.status || 'unknown';

      console.log(`✅ SMS envoyé à ${formattedNumber}: ${messageId} (${status})`);
      return { success: true, messageId, status, mode: 'production' };

    } catch (error) {
      console.error("❌ Erreur envoi SMS Africa's Talking:", error);
      throw new Error(`Erreur envoi SMS: ${error.message}`);
    }
  }

  /**
   * Générer et envoyer un code OTP (Africa's Talking n'a pas de service Verify natif —
   * on génère le code côté serveur et on l'envoie par SMS, exactement comme avant avec Twilio SMS).
   */
  async sendVerificationCode(phoneNumber) {
    try {
      if (!this.isConfigured) {
        const devCode = Math.floor(100000 + Math.random() * 900000).toString();
        console.log(`📱 [DEV] Code OTP pour ${phoneNumber}: ${devCode}`);
        return { success: true, code: devCode, mode: 'development' };
      }

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const message = `Votre code de vérification PARTENAIRE MAGB est : ${code}\n\nCe code expire dans 10 minutes. Ne le partagez jamais.`;

      await this.sendSms(phoneNumber, message);
      return { success: true, code, mode: 'production' };

    } catch (error) {
      console.error("❌ Erreur envoi code OTP:", error);
      throw new Error(`Erreur envoi code: ${error.message}`);
    }
  }

  /**
   * Vérifier un code OTP (comparaison avec le code stocké en base/cache)
   * Le code est généré par sendVerificationCode et sauvegardé par le controller.
   */
  async checkVerificationCode(phoneNumber, code, storedCode) {
    try {
      if (!this.isConfigured) {
        console.log(`📱 [DEV] Vérification code ${code} pour ${phoneNumber}`);
        return { success: true, valid: code.length === 6, mode: 'development' };
      }

      const valid = storedCode && code === storedCode;
      console.log(`${valid ? '✅' : '❌'} Vérification OTP pour ${phoneNumber}: ${valid ? 'approuvé' : 'refusé'}`);
      return { success: true, valid, mode: 'production' };

    } catch (error) {
      console.error('❌ Erreur vérification OTP:', error);
      return { success: false, valid: false, error: error.message };
    }
  }

  /**
   * Envoyer un code de vérification de téléphone
   */
  async sendPhoneVerificationCode(phoneNumber, code, firstName = '') {
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

  // ─── Utilitaires ─────────────────────────────────────────────────────────────

  formatPhoneNumber(phoneNumber) {
    let formatted = phoneNumber.replace(/\D/g, '');
    // Remplacer le 0 de début par l'indicatif Côte d'Ivoire (+225)
    if (formatted.startsWith('0') && formatted.length <= 10) {
      formatted = '225' + formatted.substring(1);
    }
    if (!formatted.startsWith('+')) {
      formatted = '+' + formatted;
    }
    return formatted;
  }

  isValidPhoneNumber(phoneNumber) {
    const cleaned = phoneNumber.replace(/\D/g, '');
    return /^\+?[1-9]\d{1,14}$/.test('+' + cleaned);
  }

  isAvailable() { return this.isConfigured; }

  getStatus() {
    return {
      configured: this.isConfigured,
      mode: process.env.NODE_ENV,
      provider: "Africa's Talking",
      username: process.env.AT_USERNAME
    };
  }
}

module.exports = new SmsService();
