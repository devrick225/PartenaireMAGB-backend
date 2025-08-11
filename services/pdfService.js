const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

class PDFService {
  constructor() {
    this.colors = {
      primary: '#2E7D32',
      secondary: '#1976D2',
      accent: '#FF6F00',
      text: '#212121',
      lightGray: '#F5F5F5',
      darkGray: '#616161'
    };
  }

  // Créer un header commun pour tous les documents
  createHeader(doc, title, organizationName = 'PARTENAIRE MAGB') {
    // Logo/En-tête de l'organisation
    doc.fontSize(20)
       .fillColor(this.colors.primary)
       .text(organizationName, 50, 50, { align: 'center' });
    
    doc.fontSize(14)
       .fillColor(this.colors.text)
       .text('Système de Gestion des Dons', 50, 75, { align: 'center' });
    
    // Ligne de séparation
    doc.moveTo(50, 100)
       .lineTo(550, 100)
       .strokeColor(this.colors.primary)
       .lineWidth(2)
       .stroke();
    
    // Titre du document
    doc.fontSize(18)
       .fillColor(this.colors.secondary)
       .text(title, 50, 120, { align: 'center' });
    
    return 160; // Position Y après le header
  }

  // Créer un footer avec informations de contact
  createFooter(doc, pageHeight) {
    const footerY = pageHeight - 80;
    
    doc.fontSize(8)
       .fillColor(this.colors.darkGray)
       .text('Généré automatiquement par PARTENAIRE MAGB', 50, footerY, { align: 'center' });
    
    doc.text(`Date de génération: ${new Date().toLocaleDateString('fr-FR')}`, 50, footerY + 15, { align: 'center' });
    
    // Ligne de séparation
    doc.moveTo(50, footerY - 10)
       .lineTo(550, footerY - 10)
       .strokeColor(this.colors.lightGray)
       .lineWidth(1)
       .stroke();
  }

  // Générer un reçu de donation en PDF
  async generateDonationReceipt(donation, user) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument();
        const chunks = [];
        
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Header
        let currentY = this.createHeader(doc, 'REÇU DE DONATION');
        
        // Informations du donateur
        currentY += 30;
        doc.fontSize(14)
           .fillColor(this.colors.secondary)
           .text('Informations du Donateur', 50, currentY);
        
        currentY += 25;
        doc.fontSize(10)
           .fillColor(this.colors.text)
           .text(`Nom: ${user.firstName} ${user.lastName}`, 50, currentY)
           .text(`Email: ${user.email}`, 50, currentY + 15)
           .text(`Téléphone: ${user.phone || 'Non renseigné'}`, 50, currentY + 30)
           .text(`ID Partenaire: ${user.partnerId || 'Non attribué'}`, 50, currentY + 45);

        // Informations de la donation
        currentY += 80;
        doc.fontSize(14)
           .fillColor(this.colors.secondary)
           .text('Détails de la Donation', 50, currentY);

        currentY += 25;
        doc.fontSize(10)
           .fillColor(this.colors.text)
           .text(`Numéro de don: ${donation._id}`, 50, currentY)
           .text(`Date: ${new Date(donation.createdAt).toLocaleDateString('fr-FR')}`, 50, currentY + 15)
           .text(`Catégorie: ${this.formatCategory(donation.category)}`, 50, currentY + 30)
           .text(`Description: ${donation.description || 'Don thématique'}`, 50, currentY + 45);

        // Montant avec mise en évidence
        currentY += 70;
        doc.rect(50, currentY, 500, 40)
           .fillColor(this.colors.lightGray)
           .fill();
        
        doc.fontSize(16)
           .fillColor(this.colors.primary)
           .text(`Montant: ${this.formatCurrency(donation.amount, donation.currency)}`, 60, currentY + 10);

        // Statut de la donation
        currentY += 60;
        const statusColor = this.getStatusColor(donation.status);
        doc.fontSize(12)
           .fillColor(statusColor)
           .text(`Statut: ${this.formatStatus(donation.status)}`, 50, currentY);

        // Informations de paiement si disponible (utilise donation.payment)
        const payment = donation.payment || null;
        if (payment) {
          currentY += 40;
          doc.fontSize(14)
             .fillColor(this.colors.secondary)
             .text('Informations de Paiement', 50, currentY);

          currentY += 25;
          doc.fontSize(10)
             .fillColor(this.colors.text)
             .text(`Fournisseur: ${this.formatPaymentMethod(payment.provider)}`, 50, currentY)
             .text(`Référence: ${payment.transaction?.reference || payment._id}`, 50, currentY + 15);
          
          const completedAt = payment.transaction?.completedAt || payment.cinetpay?.completedAt || payment.paydunya?.completedAt;
          if (completedAt) {
            doc.text(`Date de paiement: ${new Date(completedAt).toLocaleDateString('fr-FR')}`, 50, currentY + 30);
          }
        }

        // Note de remerciement
        currentY += 60;
        doc.fontSize(12)
           .fillColor(this.colors.text)
           .text('Nous vous remercions pour votre généreuse contribution !', 50, currentY, { align: 'center' });

        // Footer
        this.createFooter(doc, doc.page.height);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  // Générer l'échéancier de dons récurrents en PDF
  async generateDonationSchedule(recurringDonation, upcomingOccurrences, user) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument();
        const chunks = [];
        
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Header
        let currentY = this.createHeader(doc, 'ÉCHÉANCIER DE DONS RÉCURRENTS');
        
        // Informations du donateur
        currentY += 30;
        doc.fontSize(14)
           .fillColor(this.colors.secondary)
           .text('Informations du Donateur', 50, currentY);
        
        currentY += 25;
        doc.fontSize(10)
           .fillColor(this.colors.text)
           .text(`Nom: ${user.firstName} ${user.lastName}`, 50, currentY)
           .text(`Email: ${user.email}`, 50, currentY + 15)
           .text(`ID Partenaire: ${user.partnerId || 'Non attribué'}`, 50, currentY + 30);

        // Informations du don récurrent (adapter aux champs imbriqués)
        currentY += 60;
        doc.fontSize(14)
           .fillColor(this.colors.secondary)
           .text('Détails du Don Récurrent', 50, currentY);

        currentY += 25;
        doc.fontSize(10)
           .fillColor(this.colors.text)
           .text(`Numéro: ${recurringDonation._id}`, 50, currentY)
           .text(`Montant: ${this.formatCurrency(recurringDonation.amount, recurringDonation.currency)}`, 50, currentY + 15)
           .text(`Fréquence: ${this.formatFrequency(recurringDonation.recurring?.frequency)}`, 50, currentY + 30)
           .text(`Catégorie: ${this.formatCategory(recurringDonation.category)}`, 50, currentY + 45)
           .text(`Date de début: ${new Date(recurringDonation.recurring?.startDate).toLocaleDateString('fr-FR')}`, 50, currentY + 60);

        if (recurringDonation.recurring?.endDate) {
          doc.text(`Date de fin: ${new Date(recurringDonation.recurring.endDate).toLocaleDateString('fr-FR')}`, 50, currentY + 75);
          currentY += 90;
        } else {
          doc.text('Date de fin: Indéterminée', 50, currentY + 75);
          currentY += 90;
        }

        // Tableau des prochaines occurrences
        currentY += 20;
        doc.fontSize(14)
           .fillColor(this.colors.secondary)
           .text('Prochains Paiements Prévus', 50, currentY);

        currentY += 30;
        
        // En-têtes du tableau
        const tableHeaders = ['Date Prévue', 'Montant', 'Statut'];
        const colWidths = [150, 150, 150];
        let tableX = 50;

        // Header du tableau
        doc.rect(tableX, currentY, 450, 25)
           .fillColor(this.colors.primary)
           .fill();

        doc.fontSize(10)
           .fillColor('white');
        
        tableHeaders.forEach((header, i) => {
          doc.text(header, tableX + (i * 150) + 10, currentY + 8);
        });

        currentY += 25;

        // Lignes du tableau
        upcomingOccurrences.slice(0, 10).forEach((occurrence, index) => {
          const rowY = currentY + (index * 20);
          
          // Alternance de couleurs
          if (index % 2 === 0) {
            doc.rect(tableX, rowY, 450, 20)
               .fillColor(this.colors.lightGray)
               .fill();
          }

          doc.fontSize(9)
             .fillColor(this.colors.text)
             .text(new Date(occurrence.dueDate).toLocaleDateString('fr-FR'), tableX + 10, rowY + 5)
             .text(this.formatCurrency(occurrence.amount, occurrence.currency), tableX + 160, rowY + 5)
             .text(this.formatOccurrenceStatus(occurrence.status), tableX + 310, rowY + 5);
        });

        currentY += (Math.min(upcomingOccurrences.length, 10) * 20) + 40;

        // Résumé financier
        if (currentY < doc.page.height - 150) {
          doc.fontSize(14)
             .fillColor(this.colors.secondary)
             .text('Résumé Financier', 50, currentY);

          currentY += 25;
          const totalAmount = upcomingOccurrences.reduce((sum, occ) => sum + occ.amount, 0);
          
          doc.fontSize(10)
             .fillColor(this.colors.text)
             .text(`Nombre de paiements prévus: ${upcomingOccurrences.length}`, 50, currentY)
             .text(`Montant total prévu: ${this.formatCurrency(totalAmount, recurringDonation.currency)}`, 50, currentY + 15);
        }

        // Footer
        this.createFooter(doc, doc.page.height);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  // Méthodes utilitaires de formatage
  formatCurrency(amount, currency = 'XOF') {
    const formatter = new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: currency
    });
    return formatter.format(amount);
  }

  formatCategory(category) {
    const categories = {
      'soutien': 'Soutien Général',
      'tithe': 'Dîme',
      'offering': 'Offrande',
      'building': 'Construction',
      'missions': 'Missions',
      'charity': 'Charité',
      'education': 'Éducation',
      'youth': 'Jeunesse',
      'women': 'Femmes',
      'men': 'Hommes',
      'special': 'Spécial',
      'emergency': 'Urgence'
    };
    return categories[category] || category;
  }

  formatStatus(status) {
    const statuses = {
      'pending': 'En Attente',
      'processing': 'En Traitement',
      'completed': 'Complété',
      'failed': 'Échoué',
      'cancelled': 'Annulé'
    };
    return statuses[status] || status;
  }

  formatFrequency(frequency) {
    const frequencies = {
      'daily': 'Quotidien',
      'weekly': 'Hebdomadaire',
      'monthly': 'Mensuel',
      'quarterly': 'Trimestriel',
      'yearly': 'Annuel'
    };
    return frequencies[frequency] || frequency;
  }

  formatPaymentMethod(provider) {
    const providers = {
      'moneyfusion': 'Money Fusion',
      'paydunya': 'PayDunya',
      'stripe': 'Stripe',
      'paypal': 'PayPal',
      'cinetpay': 'CinetPay'
    };
    return providers[provider] || provider;
  }

  formatOccurrenceStatus(status) {
    const statuses = {
      'pending': 'À Venir',
      'due': 'Échue',
      'completed': 'Payée',
      'failed': 'Échouée',
      'skipped': 'Ignorée'
    };
    return statuses[status] || status;
  }

  getStatusColor(status) {
    const colors = {
      'completed': '#4CAF50',
      'processing': '#FF9800',
      'pending': '#2196F3',
      'failed': '#F44336',
      'cancelled': '#9E9E9E'
    };
    return colors[status] || this.colors.text;
  }
}

module.exports = new PDFService();