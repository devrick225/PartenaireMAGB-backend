const Donation = require('../models/Donation');
const User = require('../models/User');
const pdfService = require('../services/pdfService');
const excelService = require('../services/excelService');
const moment = require('moment');
const mongoose = require('mongoose');

const invalidId = (res) => res.status(400).json({ success: false, error: 'Identifiant invalide' });

// @desc    Télécharger le reçu de donation en PDF
// @route   GET /api/documents/donation-receipt/:donationId
// @access  Private (Owner or Admin)
const downloadDonationReceipt = async (req, res) => {
  try {
    const { donationId } = req.params;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(donationId)) return invalidId(res);

    // Récupérer la donation avec le paiement (singulier)
    const donation = await Donation.findById(donationId)
      .populate('user', 'firstName lastName email phone partnerId')
      .populate({
        path: 'payment',
        select: 'provider status transaction reference cinetpay.completedAt paydunya.completedAt'
      });

    if (!donation) {
      return res.status(404).json({
        success: false,
        error: 'Donation non trouvée'
      });
    }

    // Vérifier que l'utilisateur a le droit d'accéder à cette donation
    if (donation.user?._id?.toString() !== userId && !['admin', 'treasurer'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Accès non autorisé à cette donation'
      });
    }

    // Générer le PDF
    const pdfBuffer = await pdfService.generateDonationReceipt(donation, donation.user);
    
    // Définir les headers pour le téléchargement
    const filename = `recu_donation_${donation._id}_${moment().format('YYYYMMDD')}.pdf`;
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    
    res.send(pdfBuffer);

  } catch (error) {
    console.error('Erreur téléchargement reçu:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la génération du reçu'
    });
  }
};

// @desc    Télécharger l'échéancier de don récurrent en PDF
// @route   GET /api/documents/schedule-pdf/:recurringDonationId
// @access  Private (Owner or Admin)
const downloadDonationSchedulePDF = async (req, res) => {
  try {
    const { recurringDonationId } = req.params;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(recurringDonationId)) return invalidId(res);

    // Récupérer le don récurrent
    const recurringDonation = await Donation.findById(recurringDonationId)
      .populate('user', 'firstName lastName email phone partnerId');

    if (!recurringDonation) {
      return res.status(404).json({
        success: false,
        error: 'Don récurrent non trouvé'
      });
    }

    // Vérifier que c'est bien un don récurrent
    if (recurringDonation.type !== 'recurring') {
      return res.status(400).json({
        success: false,
        error: 'Ce don n\'est pas un don récurrent'
      });
    }

    // Vérifier les droits d'accès
    if (recurringDonation.user?._id?.toString() !== userId && !['admin', 'treasurer'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Accès non autorisé à ce don récurrent'
      });
    }

    // Générer les prochaines occurrences
    const upcomingOccurrences = generateUpcomingOccurrences(recurringDonation, 12); // 12 prochaines occurrences
    
    // Générer le PDF
    const pdfBuffer = await pdfService.generateDonationSchedule(
      recurringDonation, 
      upcomingOccurrences, 
      recurringDonation.user
    );
    
    // Définir les headers
    const filename = `echeancier_don_${recurringDonation._id}_${moment().format('YYYYMMDD')}.pdf`;
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    
    res.send(pdfBuffer);

  } catch (error) {
    console.error('Erreur téléchargement échéancier PDF:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la génération de l\'échéancier PDF'
    });
  }
};

// @desc    Télécharger l'échéancier de don récurrent en Excel
// @route   GET /api/documents/schedule-excel/:recurringDonationId
// @access  Private (Owner or Admin)
const downloadDonationScheduleExcel = async (req, res) => {
  try {
    const { recurringDonationId } = req.params;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(recurringDonationId)) return invalidId(res);

    // Récupérer le don récurrent
    const recurringDonation = await Donation.findById(recurringDonationId)
      .populate('user', 'firstName lastName email phone partnerId');

    if (!recurringDonation) {
      return res.status(404).json({
        success: false,
        error: 'Don récurrent non trouvé'
      });
    }

    // Vérifier que c'est bien un don récurrent
    if (recurringDonation.type !== 'recurring') {
      return res.status(400).json({
        success: false,
        error: 'Ce don n\'est pas un don récurrent'
      });
    }

    // Vérifier les droits d'accès
    if (recurringDonation.user?._id?.toString() !== userId && !['admin', 'treasurer'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Accès non autorisé à ce don récurrent'
      });
    }

    // Générer les prochaines occurrences
    const upcomingOccurrences = generateUpcomingOccurrences(recurringDonation, 24); // 24 prochaines occurrences
    
    // Générer le fichier Excel
    const workbook = await excelService.generateDonationScheduleExcel(
      recurringDonation, 
      upcomingOccurrences, 
      recurringDonation.user
    );
    
    // Définir les headers
    const filename = `echeancier_don_${recurringDonation._id}_${moment().format('YYYYMMDD')}.xlsx`;
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    // Écrire le workbook en réponse
    await workbook.xlsx.write(res);

  } catch (error) {
    console.error('Erreur téléchargement échéancier Excel:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la génération de l\'échéancier Excel'
    });
  }
};

// @desc    Télécharger un rapport de donations en Excel
// @route   GET /api/documents/donations-report
// @access  Private
const downloadDonationsReport = async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      startDate, 
      endDate, 
      category, 
      status, 
      period = 'all' 
    } = req.query;

    // Construire les filtres
    let filters = { user: userId };
    
    // Filtres de date
    if (startDate && endDate) {
      filters.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    } else if (period !== 'all') {
      const now = moment();
      switch (period) {
        case 'week':
          filters.createdAt = {
            $gte: now.clone().startOf('week').toDate(),
            $lte: now.clone().endOf('week').toDate()
          };
          break;
        case 'month':
          filters.createdAt = {
            $gte: now.clone().startOf('month').toDate(),
            $lte: now.clone().endOf('month').toDate()
          };
          break;
        case 'year':
          filters.createdAt = {
            $gte: now.clone().startOf('year').toDate(),
            $lte: now.clone().endOf('year').toDate()
          };
          break;
      }
    }

    // Autres filtres
    if (category && category !== 'all') {
      filters.category = category;
    }
    if (status && status !== 'all') {
      filters.status = status;
    }

    // Récupérer les donations
    const donations = await Donation.find(filters)
      .populate({
        path: 'payment',
        select: 'provider status transaction.completedAt cinetpay.completedAt paydunya.completedAt'
      })
      .sort({ createdAt: -1 })
      .limit(1000); // Limiter à 1000 donations pour éviter les fichiers trop volumineux

    // Récupérer les informations utilisateur
    const user = await User.findById(userId)
      .select('firstName lastName email phone partnerId');

    // Générer le fichier Excel
    const workbook = await excelService.generateDonationsReportExcel(
      donations, 
      user,
      { startDate, endDate, period, category, status }
    );
    
    // Définir les headers
    const filename = `rapport_donations_${moment().format('YYYYMMDD_HHmmss')}.xlsx`;
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    // Écrire le workbook en réponse
    await workbook.xlsx.write(res);

  } catch (error) {
    console.error('Erreur téléchargement rapport donations:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la génération du rapport'
    });
  }
};

// @desc    Obtenir la liste des documents disponibles pour un utilisateur
// @route   GET /api/documents/available
// @access  Private
const getAvailableDocuments = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('🔄 getAvailableDocuments - User ID:', userId);

    // Test simple pour vérifier la connexion à la base de données
    const userExists = await User.findById(userId);
    if (!userExists) {
      console.error('❌ Utilisateur non trouvé:', userId);
      return res.status(404).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }
    console.log('✅ Utilisateur trouvé:', userExists.email);

    // Compter les donations avec gestion d'erreur
    let donationsCount = 0;
    try {
      donationsCount = await Donation.countDocuments({ 
        user: userId, 
        status: { $in: ['completed', 'processing'] } 
      });
      console.log('📊 Donations count:', donationsCount);
    } catch (countError) {
      console.error('❌ Erreur comptage donations:', countError);
      donationsCount = 0;
    }

    // Compter les dons récurrents avec gestion d'erreur
    let recurringDonationsCount = 0;
    try {
      recurringDonationsCount = await Donation.countDocuments({ 
        user: userId, 
        type: 'recurring',
        'recurring.isActive': true
      });
      console.log('📊 Recurring donations count:', recurringDonationsCount);
    } catch (recurringCountError) {
      console.error('❌ Erreur comptage dons récurrents:', recurringCountError);
      recurringDonationsCount = 0;
    }

    // Récupérer les dernières donations pour les reçus
    let recentDonations = [];
    try {
      recentDonations = await Donation.find({ 
        user: userId, 
        status: { $in: ['completed', 'processing'] } 
      })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('_id amount currency category createdAt status');
      console.log('📄 Recent donations found:', recentDonations.length);
    } catch (recentError) {
      console.error('❌ Erreur récupération donations récentes:', recentError);
      recentDonations = [];
    }

    // Récupérer les dons récurrents actifs
    let activeRecurringDonations = [];
    try {
      activeRecurringDonations = await Donation.find({ 
        user: userId, 
        type: 'recurring',
        'recurring.isActive': true
      })
      .select('_id amount currency category recurring.frequency recurring.nextPaymentDate');
      console.log('📅 Active recurring donations found:', activeRecurringDonations.length);
    } catch (recurringError) {
      console.error('❌ Erreur récupération dons récurrents:', recurringError);
      activeRecurringDonations = [];
    }

    const response = {
      success: true,
      data: {
        summary: {
          donationsCount,
          recurringDonationsCount,
          documentsAvailable: donationsCount + recurringDonationsCount > 0
        },
        donationReceipts: recentDonations.map(donation => ({
          id: donation._id,
          amount: donation.amount,
          currency: donation.currency,
          category: donation.category,
          date: donation.createdAt,
          status: donation.status,
          downloadUrl: `/api/documents/donation-receipt/${donation._id}`
        })),
        schedules: activeRecurringDonations.map(recurring => ({
          id: recurring._id,
          amount: recurring.amount,
          currency: recurring.currency,
          category: recurring.category,
          frequency: recurring.recurring?.frequency || 'monthly',
          nextPayment: recurring.recurring?.nextPaymentDate || null,
          pdfUrl: `/api/documents/schedule-pdf/${recurring._id}`,
          excelUrl: `/api/documents/schedule-excel/${recurring._id}`
        })),
        reports: {
          donationsReportUrl: '/api/documents/donations-report'
        }
      }
    };

    console.log('✅ getAvailableDocuments - Response prepared:', {
      summary: response.data.summary,
      receiptsCount: response.data.donationReceipts.length,
      schedulesCount: response.data.schedules.length
    });

    res.json(response);

  } catch (error) {
    console.error('❌ Erreur getAvailableDocuments:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des documents disponibles',
      details: error.message
    });
  }
};

// Fonction utilitaire pour générer les prochaines occurrences
const generateUpcomingOccurrences = (recurringDonation, limit = 12) => {
  const occurrences = [];
  let currentDate = moment(recurringDonation.recurring.nextPaymentDate || recurringDonation.recurring.startDate);
  const endDate = recurringDonation.recurring.endDate ? moment(recurringDonation.recurring.endDate) : null;
  
  for (let i = 0; i < limit; i++) {
    // Vérifier si on a dépassé la date de fin
    if (endDate && currentDate.isAfter(endDate)) {
      break;
    }

    occurrences.push({
      _id: `${recurringDonation._id}_${i + 1}`,
      dueDate: currentDate.toDate(),
      amount: recurringDonation.amount,
      currency: recurringDonation.currency,
      category: recurringDonation.category,
      description: recurringDonation.description,
      status: currentDate.isBefore(moment()) ? 'due' : 'pending',
      reference: `${recurringDonation._id}_${currentDate.format('YYYYMMDD')}`
    });

    // Calculer la prochaine occurrence selon la fréquence
    switch (recurringDonation.recurring.frequency) {
      case 'daily':
        currentDate.add(1, 'day');
        break;
      case 'weekly':
        currentDate.add(1, 'week');
        break;
      case 'monthly':
        currentDate.add(1, 'month');
        break;
      case 'quarterly':
        currentDate.add(3, 'months');
        break;
      case 'yearly':
        currentDate.add(1, 'year');
        break;
      default:
        currentDate.add(1, 'month');
    }
  }

  return occurrences;
};

module.exports = {
  downloadDonationReceipt,
  downloadDonationSchedulePDF,
  downloadDonationScheduleExcel,
  downloadDonationsReport,
  getAvailableDocuments
};