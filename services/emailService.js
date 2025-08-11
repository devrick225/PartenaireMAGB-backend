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
        user: process.env.EMAIL_USER || 'ivoprestalertes@gmail.com',
        pass: process.env.EMAIL_PASS || 'xdqi oekr ohqn rlum'
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

  // Email de vérification par code (pour mobile)
  async sendEmailVerificationCode(email, firstName, verificationCode) {
    const subject = 'Code de vérification - PARTENAIRE MAGB';
    const htmlContent = this.getEmailVerificationCodeTemplate(firstName, verificationCode);
    
    return await this.sendEmail(email, subject, htmlContent);
  }

  // Email de réinitialisation de mot de passe
  async sendPasswordResetEmail(email, firstName, resetToken) {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    
    const subject = 'Réinitialisation de votre mot de passe - PARTENAIRE MAGB';
    const htmlContent = this.getPasswordResetTemplate(firstName, resetUrl);
    
    return await this.sendEmail(email, subject, htmlContent);
  }

  // Email de code de réinitialisation de mot de passe (pour mobile)
  async sendPasswordResetCode(email, firstName, resetCode) {
    const subject = 'Code de réinitialisation - PARTENAIRE MAGB';
    const htmlContent = this.getPasswordResetCodeTemplate(firstName, resetCode);
    
    return await this.sendEmail(email, subject, htmlContent);
  }

  // Email de confirmation de don
  async sendDonationConfirmationEmail(email, firstName, donationDetails) {
    const subject = 'Confirmation de votre DON PARTENAIRE MAGB';
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

  // Email de bienvenue PARTENAIRE (personnalisé inscriptions)
  async sendPartnerWelcomeEmail(email, firstName, partnerId = null) {
    const subject = 'Bienvenue parmi les PARTENAIRES MAGB';
    const htmlContent = this.getPartnerWelcomeEmailTemplate(firstName, partnerId);
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
            <p>© ${new Date().getFullYear()} PARTENAIRE MAGB - Tous droits réservés</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  getEmailVerificationCodeTemplate(firstName, verificationCode) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Code de vérification</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #fff; padding: 30px; border: 1px solid #ddd; }
          .code-box { background: #f8f9fa; border: 3px solid #667eea; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0; }
          .code { font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 8px; font-family: 'Courier New', monospace; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; border-radius: 0 0 8px 8px; }
          .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📧 PARTENAIRE MAGB</h1>
            <p>Code de vérification email</p>
          </div>
          <div class="content">
            <h2>Bonjour ${firstName},</h2>
            <p>Voici votre code de vérification pour confirmer votre adresse email :</p>
            
            <div class="code-box">
              <div class="code">${verificationCode}</div>
            </div>
            
            <div class="warning">
              <strong>⏰ Important :</strong>
              <ul>
                <li>Ce code expire dans <strong>10 minutes</strong></li>
                <li>Utilisez ce code dans l'application mobile</li>
                <li>Ne partagez jamais ce code avec quelqu'un d'autre</li>
              </ul>
            </div>
            
            <p>Si vous n'avez pas demandé cette vérification, vous pouvez ignorer cet email.</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} PARTENAIRE MAGB - Tous droits réservés</p>
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
            <p>© ${new Date().getFullYear()} PARTENAIRE MAGB - Tous droits réservés</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  getPasswordResetCodeTemplate(firstName, resetCode) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Code de réinitialisation</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #fff; padding: 30px; border: 1px solid #ddd; }
          .code-box { background: #f8f9fa; border: 3px solid #667eea; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0; }
          .code { font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 8px; font-family: 'Courier New', monospace; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; border-radius: 0 0 8px 8px; }
          .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📧 PARTENAIRE MAGB</h1>
            <p>Code de réinitialisation</p>
          </div>
          <div class="content">
            <h2>Bonjour ${firstName},</h2>
            <p>Voici votre code de réinitialisation pour réinitialiser votre mot de passe :</p>
            
            <div class="code-box">
              <div class="code">${resetCode}</div>
            </div>
            
            <div class="warning">
              <strong>⏰ Important :</strong>
              <ul>
                <li>Ce code expire dans <strong>10 minutes</strong></li>
                <li>Utilisez ce code dans l'application mobile</li>
                <li>Ne partagez jamais ce code avec quelqu'un d'autre</li>
              </ul>
            </div>
            
            <p>Si vous n'avez pas demandé cette réinitialisation, vous pouvez ignorer cet email.</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} PARTENAIRE MAGB - Tous droits réservés</p>
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
            <h1>✅ DON PARTENAIRE MAGB confirmé</h1>
            <p>PARTENAIRE MAGB</p>
          </div>
          <div class="content">
            <h2>Merci ${firstName} !</h2>
            <p>Votre DON PARTENAIRE MAGB a été confirmé avec succès. Voici les détails :</p>
            
            <div class="donation-details">
              <h3>Détails du DON PARTENAIRE MAGB</h3>
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
            <p>© ${new Date().getFullYear()} PARTENAIRE MAGB - Tous droits réservés</p>
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
            <h1>📄 Reçu DON PARTENAIRE MAGB</h1>
            <p>PARTENAIRE MAGB</p>
          </div>
          <div class="content">
            <h2>Reçu officiel</h2>
            <p>Bonjour ${firstName},</p>
            <p>Voici votre reçu officiel pour votre DON PARTENAIRE MAGB :</p>
            
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
            <p>© ${new Date().getFullYear()} PARTENAIRE MAGB - Tous droits réservés</p>
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
            <h1>🔔 Rappel DON PARTENAIRE MAGB</h1>
            <p>PARTENAIRE MAGB</p>
          </div>
          <div class="content">
            <h2>Bonjour ${firstName},</h2>
            <p>Votre prochain DON PARTENAIRE MAGB récurrent est prévu pour bientôt :</p>
            
            <div class="reminder">
              <h3>Détails du DON PARTENAIRE MAGB récurrent</h3>
              <p><strong>Montant :</strong> ${donationDetails.formattedAmount}</p>
              <p><strong>Fréquence :</strong> ${this.getFrequencyLabel(donationDetails.frequency)}</p>
              <p><strong>Prochaine échéance :</strong> ${new Date(donationDetails.nextPaymentDate).toLocaleDateString('fr-FR')}</p>
              <p><strong>Catégorie :</strong> ${this.getCategoryLabel(donationDetails.category)}</p>
            </div>
            
            <p>Assurez-vous que votre moyen de paiement est à jour pour éviter tout échec de prélèvement.</p>
            
            <p>Pour modifier ou annuler ce don récurrent, connectez-vous à votre compte.</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} PARTENAIRE MAGB - Tous droits réservés</p>
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
            <p>© ${new Date().getFullYear()} PARTENAIRE MAGB - Tous droits réservés</p>
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
            <p>© ${new Date().getFullYear()} PARTENAIRE MAGB - Tous droits réservés</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  getPartnerWelcomeEmailTemplate(firstName, partnerId = null) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Bienvenue - PARTENAIRE MAGB</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.65; color: #222; }
          .container { max-width: 640px; margin: 0 auto; padding: 24px; }
          .header { background: linear-gradient(135deg, #335EF7 0%, #6D28D9 100%); color: white; padding: 28px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #fff; padding: 24px; border: 1px solid #e5e7eb; }
          .footer { background: #f8f9fa; padding: 16px; text-align: center; color: #666; border-radius: 0 0 10px 10px; font-size: 12px; }
          h1, h2, h3 { margin: 0 0 8px; }
          p { margin: 10px 0; }
          ul { margin: 8px 0 8px 18px; }
          .tag { display: inline-block; background: #EEF2FF; color: #3730A3; padding: 4px 8px; border-radius: 999px; font-size: 12px; margin-top: 8px; }
          .highlight { background: #FFF7ED; border-left: 4px solid #F97316; padding: 12px; border-radius: 6px; }
          .warning { background: #FEF2F2; border-left: 4px solid #DC2626; padding: 12px; border-radius: 6px; }
          .coords { background: #F1F5F9; padding: 12px; border-radius: 6px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>PARTENAIRE MAGB</h1>
            <p>Ministère d'Adoration Geneviève Brou</p>
          </div>
          <div class="content">
            <h2>Shalom ${firstName || 'Adoratreur'} !</h2>
            ${partnerId ? `<p class="tag">ID Partenaire : <strong>${partnerId}</strong></p>` : ''}

            <p>C'est avec joie que nous accusons réception de votre inscription à la liste des <strong>PARTENAIRES</strong> du Ministère d'Adoration Geneviève Brou. Nous vous remercions pour votre choix d'apporter votre contribution financière à la mission du Ministère.</p>

            <div class="warning">
              <p>🛑 Être partenaire financier, c'est <strong>SEMER SPIRITUELLEMENT</strong> dans le champ de DIEU et cela fait de vous un <strong>coparticipant</strong> aux âmes sauvées, aux vies transformées. Vous n'êtes pas juste un donateur mais plutôt un <strong>Bâtisseur du Royaume</strong>, un <strong>Investisseur</strong> et DIEU ne manque jamais de récompenser fidèlement ceux qui soutiennent son œuvre.</p>
            </div>

            <p>🛑 En tant que partenaire, vous contribuez à développer et faire avancer plus rapidement l'œuvre du Seigneur. Votre soutien financier contribuera à :</p>
            <ul>
              <li>faciliter le lancement ou l'expansion de plusieurs projets missionnaires ou évangéliques (grands rassemblements annuels, concerts et missions tant à l'intérieur qu'à l'extérieur du pays)</li>
              <li>évangéliser nos jeunes et nos enfants en leur permettant de participer gratuitement ou à moindre coût à nos campagnes d'évangélisation</li>
              <li>former les jeunes, les femmes et les hommes pour en faire des leaders chrétiens, des personnes qui ont le cœur tourné vers DIEU</li>
              <li>subvenir aux besoins primaires du Ministère (achat/location de matériels lors des missions externes)</li>
              <li>financer des voyages missionnaires, ...</li>
            </ul>

            <div class="highlight">
              <p><strong>⛔ Pour soutenir le Ministère d'Adoration Geneviève Brou</strong>, vous pouvez effectuer un transfert Mobile Money ou WAVE en choisissant l'un des modes de transferts suivants :</p>
              <div class="coords">
                <p>👉 <strong>Orange Money</strong> : +225 07 78 69 86 16 / 07 58 58 40 63<br/>
                👉 <strong>Moov Money</strong> : +225 01 03 21 20 54<br/>
                👉 <strong>MTN Money</strong> : +225 05 65 43 93 62</p>
                <p style="margin-top:8px;">Vous faites ensuite la <strong>capture du reçu</strong> ou du message de transfert pour l'envoyer par WhatsApp sur le même numéro de transfert.</p>
              </div>
            </div>

            <p>Que le Seigneur vous bénisse abondamment pour tout votre don.</p>

            <p><strong>Geneviève BROU</strong><br/>
            <em>Par le chant et dans l'ESPRIT SAINT, tourner les cœurs vers Dieu.</em></p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} PARTENAIRE MAGB - Tous droits réservés</p>
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
      'don_mensuel': 'Don mensuel',
      'don_ponctuel': 'Don ponctuel',
      'don_libre': 'Don libre',
      'don_concert_femmes': 'Don Concert des Femmes',
      'don_ria_2025': 'Don RIA 2025'
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