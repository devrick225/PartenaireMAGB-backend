const ExcelJS = require('exceljs');

class ExcelService {
  constructor() {
    this.colors = {
      primary: 'FF2E7D32',
      secondary: 'FF1976D2',
      accent: 'FFFF6F00',
      lightGray: 'FFF5F5F5',
      white: 'FFFFFFFF'
    };
  }

  // Créer un workbook avec style par défaut
  createWorkbook() {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'PARTENAIRE MAGB';
    workbook.lastModifiedBy = 'PARTENAIRE MAGB';
    workbook.created = new Date();
    workbook.modified = new Date();
    return workbook;
  }

  // Appliquer le style de header
  applyHeaderStyle(worksheet, row) {
    row.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: this.colors.primary }
      };
      cell.font = {
        color: { argb: this.colors.white },
        bold: true,
        size: 12
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'center'
      };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
  }

  // Appliquer le style de données
  applyDataStyle(cell, isAlternate = false) {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: isAlternate ? this.colors.lightGray : this.colors.white }
    };
    cell.font = {
      size: 10
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'left'
    };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
  }

  // Générer l'échéancier des dons récurrents en Excel
  async generateDonationScheduleExcel(recurringDonation, upcomingOccurrences, user) {
    try {
      const workbook = this.createWorkbook();
      const worksheet = workbook.addWorksheet('Échéancier de Dons');

      // Configuration des colonnes
      worksheet.columns = [
        { header: 'Date Prévue', key: 'dueDate', width: 15 },
        { header: 'Montant', key: 'amount', width: 15 },
        { header: 'Devise', key: 'currency', width: 10 },
        { header: 'Statut', key: 'status', width: 12 },
        { header: 'Catégorie', key: 'category', width: 15 },
        { header: 'Description', key: 'description', width: 25 },
        { header: 'Référence', key: 'reference', width: 20 }
      ];

      // Titre principal
      worksheet.mergeCells('A1:G1');
      const titleCell = worksheet.getCell('A1');
      titleCell.value = 'ÉCHÉANCIER DE DONS RÉCURRENTS - PARTENAIRE MAGB';
      titleCell.font = { size: 16, bold: true, color: { argb: this.colors.primary } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.getRow(1).height = 25;

      // Informations du donateur
      worksheet.mergeCells('A3:G3');
      const donatorInfoCell = worksheet.getCell('A3');
      donatorInfoCell.value = 'INFORMATIONS DU DONATEUR';
      donatorInfoCell.font = { size: 14, bold: true, color: { argb: this.colors.secondary } };
      donatorInfoCell.alignment = { horizontal: 'center' };

      worksheet.getCell('A4').value = 'Nom:';
      worksheet.getCell('B4').value = `${user.firstName} ${user.lastName}`;
      worksheet.getCell('A5').value = 'Email:';
      worksheet.getCell('B5').value = user.email;
      worksheet.getCell('A6').value = 'ID Partenaire:';
      worksheet.getCell('B6').value = user.partnerId || 'Non attribué';

      worksheet.getCell('D4').value = 'Téléphone:';
      worksheet.getCell('E4').value = user.phone || 'Non renseigné';
      worksheet.getCell('D5').value = 'Date de génération:';
      worksheet.getCell('E5').value = new Date().toLocaleDateString('fr-FR');

      // Informations du don récurrent
      worksheet.mergeCells('A8:G8');
      const recurringInfoCell = worksheet.getCell('A8');
      recurringInfoCell.value = 'DÉTAILS DU DON RÉCURRENT';
      recurringInfoCell.font = { size: 14, bold: true, color: { argb: this.colors.secondary } };
      recurringInfoCell.alignment = { horizontal: 'center' };

      worksheet.getCell('A9').value = 'Numéro:';
      worksheet.getCell('B9').value = recurringDonation._id;
      worksheet.getCell('A10').value = 'Montant:';
      worksheet.getCell('B10').value = this.formatCurrency(recurringDonation.amount, recurringDonation.currency);
      worksheet.getCell('A11').value = 'Fréquence:';
      worksheet.getCell('B11').value = this.formatFrequency(recurringDonation.frequency);

      worksheet.getCell('D9').value = 'Catégorie:';
      worksheet.getCell('E9').value = this.formatCategory(recurringDonation.category);
      worksheet.getCell('D10').value = 'Date de début:';
      worksheet.getCell('E10').value = new Date(recurringDonation.startDate).toLocaleDateString('fr-FR');
      worksheet.getCell('D11').value = 'Date de fin:';
      worksheet.getCell('E11').value = recurringDonation.endDate ? 
        new Date(recurringDonation.endDate).toLocaleDateString('fr-FR') : 'Indéterminée';

      // En-têtes du tableau des occurrences
      const headerRow = worksheet.getRow(13);
      this.applyHeaderStyle(worksheet, headerRow);
      worksheet.getRow(13).height = 20;

      // Données des occurrences
      upcomingOccurrences.forEach((occurrence, index) => {
        const row = worksheet.getRow(14 + index);
        const isAlternate = index % 2 === 1;

        row.getCell(1).value = new Date(occurrence.dueDate).toLocaleDateString('fr-FR');
        row.getCell(2).value = occurrence.amount;
        row.getCell(3).value = occurrence.currency;
        row.getCell(4).value = this.formatOccurrenceStatus(occurrence.status);
        row.getCell(5).value = this.formatCategory(occurrence.category || recurringDonation.category);
        row.getCell(6).value = occurrence.description || recurringDonation.description || 'Don récurrent';
        row.getCell(7).value = occurrence.reference || occurrence._id;

        // Appliquer le style
        row.eachCell((cell) => {
          this.applyDataStyle(cell, isAlternate);
        });

        // Formatage numérique pour le montant
        row.getCell(2).numFmt = '#,##0.00';
      });

      // Résumé financier
      const summaryRowStart = 14 + upcomingOccurrences.length + 2;
      worksheet.mergeCells(`A${summaryRowStart}:G${summaryRowStart}`);
      const summaryTitleCell = worksheet.getCell(`A${summaryRowStart}`);
      summaryTitleCell.value = 'RÉSUMÉ FINANCIER';
      summaryTitleCell.font = { size: 14, bold: true, color: { argb: this.colors.secondary } };
      summaryTitleCell.alignment = { horizontal: 'center' };

      const totalAmount = upcomingOccurrences.reduce((sum, occ) => sum + occ.amount, 0);
      
      worksheet.getCell(`A${summaryRowStart + 1}`).value = 'Nombre de paiements prévus:';
      worksheet.getCell(`B${summaryRowStart + 1}`).value = upcomingOccurrences.length;
      worksheet.getCell(`D${summaryRowStart + 1}`).value = 'Montant total prévu:';
      worksheet.getCell(`E${summaryRowStart + 1}`).value = this.formatCurrency(totalAmount, recurringDonation.currency);

      // Auto-ajuster les colonnes
      worksheet.columns.forEach(column => {
        if (column.header !== 'Description') {
          column.width = Math.max(column.width, 12);
        }
      });

      return workbook;
    } catch (error) {
      console.error('Erreur génération Excel échéancier:', error);
      throw error;
    }
  }

  // Générer un rapport de donations en Excel
  async generateDonationsReportExcel(donations, user, filters = {}) {
    try {
      const workbook = this.createWorkbook();
      const worksheet = workbook.addWorksheet('Rapport de Donations');

      // Configuration des colonnes
      worksheet.columns = [
        { header: 'Date', key: 'date', width: 12 },
        { header: 'Montant', key: 'amount', width: 15 },
        { header: 'Devise', key: 'currency', width: 10 },
        { header: 'Catégorie', key: 'category', width: 15 },
        { header: 'Statut', key: 'status', width: 12 },
        { header: 'Méthode de Paiement', key: 'paymentMethod', width: 20 },
        { header: 'Référence', key: 'reference', width: 20 },
        { header: 'Description', key: 'description', width: 25 }
      ];

      // Titre principal
      worksheet.mergeCells('A1:H1');
      const titleCell = worksheet.getCell('A1');
      titleCell.value = 'RAPPORT DE DONATIONS - PARTENAIRE MAGB';
      titleCell.font = { size: 16, bold: true, color: { argb: this.colors.primary } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.getRow(1).height = 25;

      // Informations du donateur
      worksheet.mergeCells('A3:H3');
      const donatorInfoCell = worksheet.getCell('A3');
      donatorInfoCell.value = 'INFORMATIONS DU DONATEUR';
      donatorInfoCell.font = { size: 14, bold: true, color: { argb: this.colors.secondary } };
      donatorInfoCell.alignment = { horizontal: 'center' };

      worksheet.getCell('A4').value = 'Nom:';
      worksheet.getCell('B4').value = `${user.firstName} ${user.lastName}`;
      worksheet.getCell('A5').value = 'Email:';
      worksheet.getCell('B5').value = user.email;
      worksheet.getCell('A6').value = 'ID Partenaire:';
      worksheet.getCell('B6').value = user.partnerId || 'Non attribué';

      worksheet.getCell('D4').value = 'Période:';
      worksheet.getCell('E4').value = this.formatPeriod(filters);
      worksheet.getCell('D5').value = 'Total donations:';
      worksheet.getCell('E5').value = donations.length;
      worksheet.getCell('D6').value = 'Date de génération:';
      worksheet.getCell('E6').value = new Date().toLocaleDateString('fr-FR');

      // En-têtes du tableau
      const headerRow = worksheet.getRow(8);
      this.applyHeaderStyle(worksheet, headerRow);
      worksheet.getRow(8).height = 20;

      // Données des donations
      donations.forEach((donation, index) => {
        const row = worksheet.getRow(9 + index);
        const isAlternate = index % 2 === 1;

        row.getCell(1).value = new Date(donation.createdAt).toLocaleDateString('fr-FR');
        row.getCell(2).value = donation.amount;
        row.getCell(3).value = donation.currency;
        row.getCell(4).value = this.formatCategory(donation.category);
        row.getCell(5).value = this.formatStatus(donation.status);
        row.getCell(6).value = this.getPaymentMethod(donation);
        row.getCell(7).value = donation._id;
        row.getCell(8).value = donation.description || 'Don thématique';

        // Appliquer le style
        row.eachCell((cell) => {
          this.applyDataStyle(cell, isAlternate);
        });

        // Formatage numérique pour le montant
        row.getCell(2).numFmt = '#,##0.00';
      });

      // Résumé financier
      const summaryRowStart = 9 + donations.length + 2;
      worksheet.mergeCells(`A${summaryRowStart}:H${summaryRowStart}`);
      const summaryTitleCell = worksheet.getCell(`A${summaryRowStart}`);
      summaryTitleCell.value = 'RÉSUMÉ FINANCIER';
      summaryTitleCell.font = { size: 14, bold: true, color: { argb: this.colors.secondary } };
      summaryTitleCell.alignment = { horizontal: 'center' };

      const totalAmount = donations.reduce((sum, donation) => sum + donation.amount, 0);
      const completedDonations = donations.filter(d => d.status === 'completed');
      const completedAmount = completedDonations.reduce((sum, donation) => sum + donation.amount, 0);
      
      worksheet.getCell(`A${summaryRowStart + 1}`).value = 'Total donations:';
      worksheet.getCell(`B${summaryRowStart + 1}`).value = donations.length;
      worksheet.getCell(`A${summaryRowStart + 2}`).value = 'Donations complétées:';
      worksheet.getCell(`B${summaryRowStart + 2}`).value = completedDonations.length;
      
      worksheet.getCell(`D${summaryRowStart + 1}`).value = 'Montant total:';
      worksheet.getCell(`E${summaryRowStart + 1}`).value = totalAmount;
      worksheet.getCell(`D${summaryRowStart + 2}`).value = 'Montant payé:';
      worksheet.getCell(`E${summaryRowStart + 2}`).value = completedAmount;

      // Formatage des montants du résumé
      worksheet.getCell(`E${summaryRowStart + 1}`).numFmt = '#,##0.00';
      worksheet.getCell(`E${summaryRowStart + 2}`).numFmt = '#,##0.00';

      return workbook;
    } catch (error) {
      console.error('Erreur génération Excel rapport:', error);
      throw error;
    }
  }

  // Méthodes utilitaires
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

  getPaymentMethod(donation) {
    if (donation.payments && donation.payments.length > 0) {
      const providers = {
        'moneyfusion': 'Money Fusion',
        'paydunya': 'PayDunya',
        'stripe': 'Stripe',
        'paypal': 'PayPal',
        'cinetpay': 'CinetPay'
      };
      return providers[donation.payments[0].provider] || donation.payments[0].provider;
    }
    return 'Non défini';
  }

  formatPeriod(filters) {
    if (filters.startDate && filters.endDate) {
      return `${new Date(filters.startDate).toLocaleDateString('fr-FR')} - ${new Date(filters.endDate).toLocaleDateString('fr-FR')}`;
    } else if (filters.period) {
      const periods = {
        'week': 'Cette semaine',
        'month': 'Ce mois',
        'year': 'Cette année'
      };
      return periods[filters.period] || 'Période personnalisée';
    }
    return 'Toute la période';
  }
}

module.exports = new ExcelService();