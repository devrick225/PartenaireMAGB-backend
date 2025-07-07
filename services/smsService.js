const twilio = require('twilio');

class SmsService {
  constructor() {
    // Initialiser Twilio uniquement si les clés sont configurées
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      this.client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      this.fromNumber = process.env.TWILIO_PHONE_NUMBER;
      this.isConfigured = true;
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
      // Mode développement - log le message
      if (!this.isConfigured || process.env.NODE_ENV === 'development') {
        console.log(`📱 SMS vers ${to}: ${message}`);
        return {
          success: true,
          messageId: `dev_${Date.now()}`,
          mode: 'development'
        };
      }

      // Formatter le numéro de téléphone
      const formattedNumber = this.formatPhoneNumber(to);
      
      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: formattedNumber
      });

      console.log(`✅ SMS envoyé à ${to}: ${result.sid}`);
      return {
        success: true,
        messageId: result.sid,
        status: result.status,
        mode: 'production'
      };

    } catch (error) {
      console.error('❌ Erreur envoi SMS:', error);
      throw new Error(`Erreur envoi SMS: ${error.message}`);
    }
  }

  /**
   * Envoyer un code de vérification de téléphone
   */
  async sendPhoneVerificationCode(phoneNumber, code, firstName = '') {
    const message = `Bonjour ${firstName},

Votre code de vérification PARTENAIRE MAGB est : ${code}

Ce code expire dans 10 minutes.
Ne partagez jamais ce code.`;

    return await this.sendSms(phoneNumber, message);
  }

  /**
   * Envoyer un code de réinitialisation de mot de passe
   */
  async sendPasswordResetCode(phoneNumber, code, firstName = '') {
    const message = `Bonjour ${firstName},

Votre code de réinitialisation PARTENAIRE MAGB est : ${code}

Ce code expire dans 10 minutes.
Utilisez-le pour réinitialiser votre mot de passe.`;

    return await this.sendSms(phoneNumber, message);
  }

  /**
   * Envoyer une notification de don
   */
  async sendDonationNotification(phoneNumber, donationDetails) {
    const { amount, currency, receiptNumber, firstName } = donationDetails;
    
    const message = `Bonjour ${firstName},

Votre don de ${amount} ${currency} a été confirmé.
Reçu n°: ${receiptNumber}

Merci pour votre soutien à PARTENAIRE MAGB !`;

    return await this.sendSms(phoneNumber, message);
  }

  /**
   * Envoyer une notification de paiement
   */
  async sendPaymentNotification(phoneNumber, paymentDetails) {
    const { amount, currency, status, firstName } = paymentDetails;
    
    let message = `Bonjour ${firstName},\n\n`;
    
    if (status === 'completed') {
      message += `Votre paiement de ${amount} ${currency} a été confirmé avec succès.\n\nMerci !`;
    } else if (status === 'failed') {
      message += `Votre paiement de ${amount} ${currency} a échoué.\n\nVeuillez réessayer ou contacter le support.`;
    } else {
      message += `Votre paiement de ${amount} ${currency} est en cours de traitement.\n\nVous serez notifié du résultat.`;
    }

    return await this.sendSms(phoneNumber, message);
  }

  /**
   * Formatter le numéro de téléphone au format international
   */
  formatPhoneNumber(phoneNumber) {
    // Supprimer tous les espaces et caractères spéciaux
    let formatted = phoneNumber.replace(/\D/g, '');
    
    // Si le numéro commence par 0, remplacer par le code pays (exemple: +225 pour Côte d'Ivoire)
    if (formatted.startsWith('0')) {
      formatted = '225' + formatted.substring(1); // Code pays Côte d'Ivoire
    }
    
    // Ajouter le + si pas présent
    if (!formatted.startsWith('+')) {
      formatted = '+' + formatted;
    }
    
    return formatted;
  }

  /**
   * Valider le format du numéro de téléphone
   */
  isValidPhoneNumber(phoneNumber) {
    // Regex pour valider les numéros internationaux
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    const cleaned = phoneNumber.replace(/\D/g, '');
    return phoneRegex.test('+' + cleaned);
  }

  /**
   * Vérifier si SMS est configuré et disponible
   */
  isAvailable() {
    return this.isConfigured;
  }

  /**
   * Obtenir le statut du service
   */
  getStatus() {
    return {
      configured: this.isConfigured,
      mode: process.env.NODE_ENV,
      fromNumber: this.fromNumber,
      provider: 'Twilio'
    };
  }
}

// Créer une instance singleton
const smsService = new SmsService();

module.exports = smsService;
