const nodemailer = require('nodemailer');
const crypto = require('crypto');

class EmailService {
  constructor() {
    this.transporter = this.createTransporter();
  }

  createTransporter() {
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT),
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      tls: {
        rejectUnauthorized: false
      }
    });
  }

  async sendEmail(to, subject, htmlContent, textContent = null) {
    try {
      const mailOptions = {
        from: `"PARTENAIRE MAGB" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
        to,
        subject,
        html: htmlContent,
        text: textContent || this.htmlToText(htmlContent)
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log(`Email envoyé à ${to}: ${result.messageId}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('Erreur envoi email:', error);
      throw new Error(`Erreur envoi email: ${error.message}`);
    }
  }

  // Email de vérification
  async sendVerificationEmail(email, firstName, verificationToken) {
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email/${verificationToken}`;
    
    const subject = 'Vérifiez votre adresse email - PARTENAIRE MAGB';
    const htmlContent = this.getVerificationEmailTemplate(firstName, verificationUrl);
    
    return await this.sendEmail(email, subject, htmlContent);
  }

  // Email de réinitialisation de mot de passe
  async sendPasswordResetEmail(email, firstName, resetToken) {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    
    const subject = 'Réinitialisation de votre mot de passe - PARTENAIRE MAGB';
    const htmlContent = this.getPasswordResetTemplate(firstName, resetUrl);
    
    return await this.sendEmail(email, subject, htmlContent);
  }

  // Email de confirmation de don
  async sendDonationConfirmationEmail(email, firstName, donationDetails) {
    const subject = 'Confirmation de votre don - PARTENAIRE MAGB';
    const htmlContent = this.getDonationConfirmationTemplate(firstName, donationDetails);
    
    return await this.sendEmail(email, subject, htmlContent);
  }

  // Email de reçu de don
  async sendDonationReceiptEmail(email, firstName, receiptDetails) {
    const subject = `Reçu de don #${receiptDetails.receiptNumber} - PARTENAIRE MAGB`;
    const htmlContent = this.getDonationReceiptTemplate(firstName, receiptDetails);
    
    return await this.sendEmail(email, subject, htmlContent);
  }

  // Email de rappel de don récurrent
  async sendRecurringDonationReminder(email, firstName, donationDetails) {
    const subject = 'Rappel - Prochain don récurrent - PARTENAIRE MAGB';
    const htmlContent = this.getRecurringDonationReminderTemplate(firstName, donationDetails);
    
    return await this.sendEmail(email, subject, htmlContent);
  }

  // Email de notification de ticket
  async sendTicketNotificationEmail(email, firstName, ticketDetails, type = 'created') {
    let subject = '';
    let htmlContent = '';

    switch (type) {
      case 'created':
        subject = `Ticket #${ticketDetails.ticketNumber} créé - PARTENAIRE MAGB`;
        htmlContent = this.getTicketCreatedTemplate(firstName, ticketDetails);
        break;
      case 'updated':
        subject = `Ticket #${ticketDetails.ticketNumber} mis à jour - PARTENAIRE MAGB`;
        htmlContent = this.getTicketUpdatedTemplate(firstName, ticketDetails);
        break;
      case 'resolved':
        subject = `Ticket #${ticketDetails.ticketNumber} résolu - PARTENAIRE MAGB`;
        htmlContent = this.getTicketResolvedTemplate(firstName, ticketDetails);
        break;
    }
    
    return await this.sendEmail(email, subject, htmlContent);
  }

  // Email de bienvenue
  async sendWelcomeEmail(email, firstName) {
    const subject = 'Bienvenue dans PARTENAIRE MAGB';
    const htmlContent = this.getWelcomeEmailTemplate(firstName);
    
    return await this.sendEmail(email, subject, htmlContent);
  }

  // Templates d'emails
  getVerificationEmailTemplate(firstName, verificationUrl) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Vérification Email</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #fff; padding: 30px; border: 1px solid #ddd; }
          .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; border-radius: 0 0 8px 8px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🙏 PARTENAIRE MAGB</h1>
            <p>Plateforme de dons pour l'église</p>
          </div>
          <div class="content">
            <h2>Bonjour ${firstName},</h2>
            <p>Merci de vous être inscrit sur PARTENAIRE MAGB ! Pour activer votre compte, veuillez vérifier votre adresse email en cliquant sur le bouton ci-dessous :</p>
            
            <div style="text-align: center;">
              <a href="${verificationUrl}" class="button">Vérifier mon email</a>
            </div>
            
            <p><strong>Ce lien expirera dans 24 heures.</strong></p>
            
            <p>Si vous n'avez pas créé de compte, vous pouvez ignorer cet email.</p>
            
            <hr style="margin: 30px 0;">
            <p><small>Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :<br>
            <a href="${verificationUrl}">${verificationUrl}</a></small></p>
          </div>
          <div class="footer">
            <p>© 2023 PARTENAIRE MAGB - Tous droits réservés</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  getPasswordResetTemplate(firstName, resetUrl) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Réinitialisation mot de passe</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #fff; padding: 30px; border: 1px solid #ddd; }
          .button { display: inline-block; background: #dc3545; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; border-radius: 0 0 8px 8px; }
          .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔒 PARTENAIRE MAGB</h1>
            <p>Réinitialisation de mot de passe</p>
          </div>
          <div class="content">
            <h2>Bonjour ${firstName},</h2>
            <p>Vous avez demandé une réinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe :</p>
            
            <div style="text-align: center;">
              <a href="${resetUrl}" class="button">Réinitialiser mon mot de passe</a>
            </div>
            
            <div class="warning">
              <strong>⚠️ Important :</strong>
              <ul>
                <li>Ce lien expirera dans 10 minutes</li>
                <li>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email</li>
                <li>Votre mot de passe actuel reste valide jusqu'à ce que vous en créiez un nouveau</li>
              </ul>
            </div>
            
            <hr style="margin: 30px 0;">
            <p><small>Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :<br>
            <a href="${resetUrl}">${resetUrl}</a></small></p>
          </div>
          <div class="footer">
            <p>© 2023 PARTENAIRE MAGB - Tous droits réservés</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  getDonationConfirmationTemplate(firstName, donationDetails) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Confirmation de don</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #fff; padding: 30px; border: 1px solid #ddd; }
          .donation-details { background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; border-radius: 0 0 8px 8px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Don confirmé</h1>
            <p>PARTENAIRE MAGB</p>
          </div>
          <div class="content">
            <h2>Merci ${firstName} !</h2>
            <p>Votre don a été confirmé avec succès. Voici les détails :</p>
            
            <div class="donation-details">
              <h3>Détails du don</h3>
              <p><strong>Montant :</strong> ${donationDetails.formattedAmount}</p>
              <p><strong>Catégorie :</strong> ${this.getCategoryLabel(donationDetails.category)}</p>
              <p><strong>Type :</strong> ${donationDetails.type === 'recurring' ? 'Récurrent' : 'Ponctuel'}</p>
              <p><strong>Référence :</strong> ${donationDetails.reference}</p>
              <p><strong>Date :</strong> ${new Date(donationDetails.createdAt).toLocaleDateString('fr-FR')}</p>
              ${donationDetails.message ? `<p><strong>Message :</strong> ${donationDetails.message}</p>` : ''}
            </div>
            
            <p>Un reçu officiel vous sera envoyé séparément une fois le paiement traité.</p>
            
            <p>Que Dieu vous bénisse pour votre générosité ! 🙏</p>
          </div>
          <div class="footer">
            <p>© 2023 PARTENAIRE MAGB - Tous droits réservés</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  getDonationReceiptTemplate(firstName, receiptDetails) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Reçu de don</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #6f42c1 0%, #6610f2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #fff; padding: 30px; border: 1px solid #ddd; }
          .receipt { background: #f8f9fa; padding: 20px; border: 2px solid #6f42c1; border-radius: 5px; margin: 20px 0; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; border-radius: 0 0 8px 8px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📄 Reçu de don</h1>
            <p>PARTENAIRE MAGB</p>
          </div>
          <div class="content">
            <h2>Reçu officiel</h2>
            <p>Bonjour ${firstName},</p>
            <p>Voici votre reçu officiel pour votre don :</p>
            
            <div class="receipt">
              <h3>REÇU N° ${receiptDetails.receiptNumber}</h3>
              <p><strong>Donateur :</strong> ${receiptDetails.donorName}</p>
              <p><strong>Montant :</strong> ${receiptDetails.formattedAmount}</p>
              <p><strong>Date du don :</strong> ${new Date(receiptDetails.donationDate).toLocaleDateString('fr-FR')}</p>
              <p><strong>Méthode de paiement :</strong> ${receiptDetails.paymentMethod}</p>
              <p><strong>Catégorie :</strong> ${this.getCategoryLabel(receiptDetails.category)}</p>
              ${receiptDetails.downloadUrl ? `<p><strong>Télécharger le reçu PDF :</strong> <a href="${receiptDetails.downloadUrl}">Cliquez ici</a></p>` : ''}
            </div>
            
            <p><small>Ce reçu peut être utilisé à des fins fiscales selon la réglementation en vigueur.</small></p>
          </div>
          <div class="footer">
            <p>© 2023 PARTENAIRE MAGB - Tous droits réservés</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  getRecurringDonationReminderTemplate(firstName, donationDetails) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Rappel don récurrent</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #fd7e14 0%, #e83e8c 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #fff; padding: 30px; border: 1px solid #ddd; }
          .reminder { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; border-radius: 0 0 8px 8px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔔 Rappel de don</h1>
            <p>PARTENAIRE MAGB</p>
          </div>
          <div class="content">
            <h2>Bonjour ${firstName},</h2>
            <p>Votre prochain don récurrent est prévu pour bientôt :</p>
            
            <div class="reminder">
              <h3>Détails du don récurrent</h3>
              <p><strong>Montant :</strong> ${donationDetails.formattedAmount}</p>
              <p><strong>Fréquence :</strong> ${this.getFrequencyLabel(donationDetails.frequency)}</p>
              <p><strong>Prochaine échéance :</strong> ${new Date(donationDetails.nextPaymentDate).toLocaleDateString('fr-FR')}</p>
              <p><strong>Catégorie :</strong> ${this.getCategoryLabel(donationDetails.category)}</p>
            </div>
            
            <p>Assurez-vous que votre moyen de paiement est à jour pour éviter tout échec de prélèvement.</p>
            
            <p>Pour modifier ou annuler ce don récurrent, connectez-vous à votre compte.</p>
          </div>
          <div class="footer">
            <p>© 2023 PARTENAIRE MAGB - Tous droits réservés</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  getTicketCreatedTemplate(firstName, ticketDetails) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Nouveau ticket de support</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #17a2b8 0%, #6c757d 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #fff; padding: 30px; border: 1px solid #ddd; }
          .ticket-info { background: #e2f3ff; border: 1px solid #b8daff; padding: 15px; border-radius: 5px; margin: 20px 0; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; border-radius: 0 0 8px 8px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎫 Nouveau ticket</h1>
            <p>Support PARTENAIRE MAGB</p>
          </div>
          <div class="content">
            <h2>Bonjour ${firstName},</h2>
            <p>Votre demande de support a été créée avec succès :</p>
            
            <div class="ticket-info">
              <h3>Ticket #${ticketDetails.ticketNumber}</h3>
              <p><strong>Sujet :</strong> ${ticketDetails.subject}</p>
              <p><strong>Catégorie :</strong> ${this.getTicketCategoryLabel(ticketDetails.category)}</p>
              <p><strong>Priorité :</strong> ${this.getPriorityLabel(ticketDetails.priority)}</p>
              <p><strong>Statut :</strong> ${this.getStatusLabel(ticketDetails.status)}</p>
            </div>
            
            <p>Notre équipe de support traitera votre demande dans les plus brefs délais. Vous recevrez une notification par email à chaque mise à jour.</p>
            
            <p>Temps de réponse estimé : ${this.getResponseTime(ticketDetails.priority)}</p>
          </div>
          <div class="footer">
            <p>© 2023 PARTENAIRE MAGB - Tous droits réservés</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  getWelcomeEmailTemplate(firstName) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Bienvenue</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #fff; padding: 30px; border: 1px solid #ddd; }
          .features { background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; border-radius: 0 0 8px 8px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Bienvenue !</h1>
            <p>PARTENAIRE MAGB</p>
          </div>
          <div class="content">
            <h2>Bienvenue ${firstName} !</h2>
            <p>Votre compte a été créé avec succès. Nous sommes ravis de vous accueillir dans la communauté PARTENAIRE MAGB.</p>
            
            <div class="features">
              <h3>Avec votre compte, vous pouvez :</h3>
              <ul>
                <li>💰 Faire des dons ponctuels ou récurrents</li>
                <li>📊 Suivre l'historique de vos contributions</li>
                <li>🏆 Gagner des points et débloquer des badges</li>
                <li>📄 Télécharger vos reçus de dons</li>
                <li>🎫 Contacter notre support si besoin</li>
              </ul>
            </div>
            
            <p>N'hésitez pas à compléter votre profil pour une meilleure expérience.</p>
            
            <p>Que Dieu vous bénisse ! 🙏</p>
          </div>
          <div class="footer">
            <p>© 2023 PARTENAIRE MAGB - Tous droits réservés</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Méthodes utilitaires
  htmlToText(html) {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  getCategoryLabel(category) {
    const labels = {
      'tithe': 'Dîme',
      'offering': 'Offrande',
      'building': 'Construction',
      'missions': 'Missions',
      'charity': 'Charité',
      'education': 'Éducation',
      'youth': 'Jeunesse',
      'women': 'Femmes',
      'men': 'Hommes',
      'special': 'Événement spécial',
      'emergency': 'Urgence'
    };
    return labels[category] || category;
  }

  getFrequencyLabel(frequency) {
    const labels = {
      'daily': 'Quotidien',
      'weekly': 'Hebdomadaire',
      'monthly': 'Mensuel',
      'quarterly': 'Trimestriel',
      'yearly': 'Annuel'
    };
    return labels[frequency] || frequency;
  }

  getTicketCategoryLabel(category) {
    const labels = {
      'technical': 'Technique',
      'payment': 'Paiement',
      'account': 'Compte',
      'donation': 'Don',
      'bug_report': 'Rapport de bug',
      'feature_request': 'Demande de fonctionnalité',
      'general': 'Général',
      'complaint': 'Réclamation',
      'suggestion': 'Suggestion'
    };
    return labels[category] || category;
  }

  getPriorityLabel(priority) {
    const labels = {
      'low': 'Faible',
      'medium': 'Moyenne',
      'high': 'Élevée',
      'urgent': 'Urgente'
    };
    return labels[priority] || priority;
  }

  getStatusLabel(status) {
    const labels = {
      'open': 'Ouvert',
      'in_progress': 'En cours',
      'waiting_user': 'En attente utilisateur',
      'waiting_admin': 'En attente admin',
      'resolved': 'Résolu',
      'closed': 'Fermé',
      'cancelled': 'Annulé'
    };
    return labels[status] || status;
  }

  getResponseTime(priority) {
    const times = {
      'urgent': '2 heures',
      'high': '4 heures',
      'medium': '12 heures',
      'low': '24 heures'
    };
    return times[priority] || '24 heures';
  }
}

module.exports = new EmailService(); 