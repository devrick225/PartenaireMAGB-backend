const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const Donation = require('../models/Donation');
const Payment = require('../models/Payment');
const User = require('../models/User');
const emailService = require('../services/emailService');

// @desc    Obtenir la liste des dons de l'utilisateur
// @route   GET /api/donations
// @access  Private
const getDonations = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, category, type, includeAll } = req.query;
    const userId = req.user.id;

    // Construction du filtre - par défaut, ne montrer que les donations complétées
    const filter = { user: userId };
    
    // Si includeAll=true est explicitement passé, montrer toutes les donations
    // Sinon, ne montrer que les donations complétées pour éviter la confusion financière
    if (includeAll === 'true') {
      if (status) filter.status = status;
    } else {
      // Par défaut, ne montrer que les donations complétées
      filter.status = status || 'completed';
    }
    
    if (category) filter.category = category;
    if (type) filter.type = type;

    // Options de pagination
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
      populate: [
        { path: 'payment', select: 'status provider amount currency' },
        { path: 'user', select: 'firstName lastName email' }
      ]
    };

    const donations = await Donation.paginate(filter, options);

    res.json({
      success: true,
      data: {
        donations: donations.docs,
        pagination: {
          current: donations.page,
          total: donations.totalPages,
          pages: donations.totalPages,
          limit: donations.limit,
          totalDocs: donations.totalDocs
        }
      }
    });
  } catch (error) {
    console.error('Erreur getDonations:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des dons'
    });
  }
};

// @desc    Créer un nouveau don
// @route   POST /api/donations
// @access  Private
const createDonation = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Données invalides',
        details: errors.array()
      });
    }

    const {
      amount,
      currency,
      category,
      type,
      paymentMethod,
      message,
      isAnonymous,
      recurring,
      dedication
    } = req.body;

    // Créer le don
    const donationData = {
      user: req.user.id,
      amount,
      currency: currency || 'XOF',
      category,
      type,
      paymentMethod,
      message,
      isAnonymous: isAnonymous || false,
      dedication
    };

    // Configuration pour les dons récurrents
    if (type === 'recurring' && recurring) {
      donationData.recurring = {
        frequency: recurring.frequency,
        interval: recurring.interval || 1,
        startDate: recurring.startDate || new Date(),
        endDate: recurring.endDate,
        maxOccurrences: recurring.maxOccurrences,
        dayOfWeek: recurring.dayOfWeek,
        dayOfMonth: recurring.dayOfMonth,
        isActive: true
      };

      // Calculer la prochaine date de paiement
      const donation = new Donation(donationData);
      donation.calculateNextPaymentDate();
      donationData.recurring.nextPaymentDate = donation.recurring.nextPaymentDate;
    }

    const donation = await Donation.create(donationData);

    /* Envoyer l'email de confirmation
    try {
      await emailService.sendDonationConfirmationEmail(
        req.user.email,
        req.user.firstName,
        {
          formattedAmount: donation.formattedAmount,
          category: donation.category,
          type: donation.type,
          reference: donation.receipt.number,
          createdAt: donation.createdAt,
          message: donation.message
        }
      );
    } catch (emailError) {
      console.error('Erreur envoi email confirmation don:', emailError);
    }*/

    res.status(201).json({
      success: true,
      message: 'Don créé avec succès',
      data: {
        donation: {
          id: donation._id,
          amount: donation.amount,
          currency: donation.currency,
          category: donation.category,
          type: donation.type,
          status: donation.status,
          receiptNumber: donation.receipt.number,
          createdAt: donation.createdAt,
          recurring: donation.recurring
        }
      }
    });
  } catch (error) {
    console.error('Erreur createDonation:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la création du don'
    });
  }
};

// @desc    Obtenir les détails d'un don
// @route   GET /api/donations/:id
// @access  Private
const getDonation = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'ID de don invalide'
      });
    }

    const donation = await Donation.findById(id)
      .populate('user', 'firstName lastName email')
      .populate('payment', 'status provider amount currency transactionId')
      .populate('campaign', 'name description')
      .populate('event', 'name description date');

    if (!donation) {
      return res.status(404).json({
        success: false,
        error: 'Don non trouvé'
      });
    }

    // Vérifier les permissions
    if (donation.user._id.toString() !== req.user.id && !['admin', 'moderator', 'treasurer'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Accès non autorisé à ce don'
      });
    }

    res.json({
      success: true,
      data: {
        donation
      }
    });
  } catch (error) {
    console.error('Erreur getDonation:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération du don'
    });
  }
};

// @desc    Annuler un don récurrent
// @route   POST /api/donations/:id/cancel
// @access  Private
const cancelRecurringDonation = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;

    console.log('🔄 cancelRecurringDonation - Don ID:', id, 'User ID:', userId, 'Reason:', reason);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.error('❌ ID de don invalide:', id);
      return res.status(400).json({
        success: false,
        error: 'ID de don invalide'
      });
    }

    const donation = await Donation.findById(id);

    if (!donation) {
      console.error('❌ Don non trouvé:', id);
      return res.status(404).json({
        success: false,
        error: 'Don non trouvé'
      });
    }

    console.log('✅ Don trouvé:', {
      id: donation._id,
      type: donation.type,
      user: donation.user,
      isActive: donation.recurring?.isActive,
      amount: donation.amount,
      category: donation.category
    });

    // Vérifier les permissions
    if (donation.user.toString() !== userId && !['admin', 'moderator'].includes(req.user.role)) {
      console.error('❌ Accès non autorisé - User:', userId, 'Don owner:', donation.user);
      return res.status(403).json({
        success: false,
        error: 'Accès non autorisé à ce don'
      });
    }

    // Vérifier que c'est un don récurrent
    if (donation.type !== 'recurring') {
      console.error('❌ Type de don incorrect:', donation.type);
      return res.status(400).json({
        success: false,
        error: 'Seuls les dons récurrents peuvent être annulés'
      });
    }

    // Vérifier que le don est actif
    if (!donation.recurring?.isActive) {
      console.error('❌ Don récurrent déjà inactif');
      return res.status(400).json({
        success: false,
        error: 'Ce don récurrent est déjà inactif'
      });
    }

    console.log('✅ Vérifications passées, annulation du don récurrent...');

    // Annuler le don récurrent
    try {
      await donation.stopRecurring(reason || 'Annulé par l\'utilisateur');
      console.log('✅ Don récurrent annulé avec succès');
    } catch (stopError) {
      console.error('❌ Erreur lors de l\'arrêt du don récurrent:', stopError);
      throw new Error(`Erreur lors de l'arrêt du don récurrent: ${stopError.message}`);
    }

    res.json({
      success: true,
      message: 'Don récurrent annulé avec succès',
      data: {
        donationId: donation._id,
        cancelledAt: new Date(),
        reason: reason || 'Annulé par l\'utilisateur'
      }
    });
  } catch (error) {
    console.error('❌ Erreur cancelRecurringDonation:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'annulation du don',
      details: error.message
    });
  }
};

// @desc    Obtenir les statistiques des dons
// @route   GET /api/donations/stats
// @access  Private
const getDonationStats = async (req, res) => {
    try {
      const userId = req.user.id;
      const { period = 'all' } = req.query;
  
      // Construire le filtre de date
      let dateFilter = {};
      const now = new Date();
      
      switch (period) {
        case 'week':
          dateFilter = { 
            createdAt: { 
              $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7) 
            } 
          };
          break;
        case 'month':
          dateFilter = { 
            createdAt: { 
              $gte: new Date(now.getFullYear(), now.getMonth(), 1) 
            } 
          };
          break;
        case 'year':
          dateFilter = { 
            createdAt: { 
              $gte: new Date(now.getFullYear(), 0, 1) 
            } 
          };
          break;
      }
  
      const baseFilter = { 
        user: new mongoose.Types.ObjectId(userId), // ✅ CORRECTION ICI
        status: 'completed',
        ...dateFilter 
      };
  
      // Statistiques générales
      const [generalStats] = await Donation.aggregate([
        { $match: baseFilter },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$amount' },
            totalCount: { $sum: 1 },
            averageAmount: { $avg: '$amount' }
          }
        }
      ]);
  
      // Répartition par catégorie
      const categoryStats = await Donation.aggregate([
        { $match: baseFilter },
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' }
          }
        },
        { $sort: { totalAmount: -1 } }
      ]);
  
      // Évolution mensuelle
      const monthlyStats = await Donation.aggregate([
        { $match: { user: new mongoose.Types.ObjectId(userId), status: 'completed' } }, // ✅ CORRECTION ICI
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' }
            },
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
        { $limit: 12 }
      ]);
  
      // Dons récurrents actifs
      const activeRecurringCount = await Donation.countDocuments({
        user: new mongoose.Types.ObjectId(userId), // ✅ CORRECTION ICI
        type: 'recurring',
        'recurring.isActive': true
      });
  
      res.json({
        success: true,
        data: {
          stats: {
            totalAmount: generalStats?.totalAmount || 0,
            totalCount: generalStats?.totalCount || 0,
            averageAmount: generalStats?.averageAmount || 0,
            activeRecurringDonations: activeRecurringCount,
            categoriesBreakdown: categoryStats,
            monthlyEvolution: monthlyStats
          }
        }
      });
    } catch (error) {
      console.error('Erreur getDonationStats:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de la récupération des statistiques'
      });
    }
  };

// @desc    Modifier un don (admin seulement)
// @route   PUT /api/donations/:id
// @access  Private (Admin/Moderator)
const updateDonation = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'ID de don invalide'
      });
    }

    // Vérifier les permissions
    if (!['admin', 'moderator', 'treasurer'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Permissions insuffisantes'
      });
    }

    const donation = await Donation.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    );

    if (!donation) {
      return res.status(404).json({
        success: false,
        error: 'Don non trouvé'
      });
    }

    // Ajouter à l'historique
    donation.addToHistory('updated', 'Don modifié par un administrateur', req.user.id, updates);
    await donation.save();

    res.json({
      success: true,
      message: 'Don modifié avec succès',
      data: {
        donation
      }
    });
  } catch (error) {
    console.error('Erreur updateDonation:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la modification du don'
    });
  }
};

// @desc    Traiter les dons récurrents dus
// @route   GET /api/donations/process-recurring (tâche cron)
// @access  Private (System)
const processRecurringDonations = async () => {
  try {
    const dueToday = await Donation.getDueToday();

    for (const donation of dueToday) {
      try {
        // Créer un nouveau paiement pour le don récurrent
        const newPayment = await Payment.create({
          user: donation.user._id,
          donation: donation._id,
          amount: donation.amount,
          currency: donation.currency,
          paymentMethod: donation.paymentMethod,
          provider: 'auto_recurring',
          status: 'processing'
        });

        // Marquer le don récurrent comme exécuté
        await donation.markRecurringExecuted();

        console.log(`Don récurrent traité: ${donation._id} pour ${donation.amount} ${donation.currency}`);

        // Envoyer notification par email
        try {
          await emailService.sendRecurringDonationReminder(
            donation.user.email,
            donation.user.firstName,
            {
              formattedAmount: donation.formattedAmount,
              frequency: donation.recurring.frequency,
              nextPaymentDate: donation.recurring.nextPaymentDate,
              category: donation.category
            }
          );
        } catch (emailError) {
          console.error('Erreur envoi email rappel don récurrent:', emailError);
        }

      } catch (processingError) {
        console.error(`Erreur traitement don récurrent ${donation._id}:`, processingError);
        
        // Ajouter à l'historique d'erreur
        donation.addToHistory('failed', `Erreur traitement automatique: ${processingError.message}`);
        await donation.save();
      }
    }

    return { processed: dueToday.length };
  } catch (error) {
    console.error('Erreur processRecurringDonations:', error);
    throw error;
  }
}
// @desc    Obtenir les donations récurrentes
// @route   GET /api/donations/recurring
// @access  Private
const getRecurringDonations = async (req, res) => {
    try {
      const { page = 1, limit = 10 } = req.query;
      const userId = req.user.id;
  
      // Filtrer les donations récurrentes de l'utilisateur
      const filter = { 
        user: userId, 
        type: 'recurring' 
      };
  
      // Options de pagination
      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { createdAt: -1 },
        populate: [
          { path: 'user', select: 'firstName lastName email' }
        ]
      };
  
      const donations = await Donation.paginate(filter, options);
  
      res.json({
        success: true,
        data: {
          donations: donations.docs,
          pagination: {
            current: donations.page,
            total: donations.totalPages,
            pages: donations.totalPages,
            limit: donations.limit,
            totalDocs: donations.totalDocs
          }
        }
      });
    } catch (error) {
      console.error('Erreur getRecurringDonations:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de la récupération des donations récurrentes'
      });
    }
  };

// @desc    Mettre à jour le statut d'une donation basé sur le statut du paiement
// @route   PATCH /api/donations/:id/status
// @access  Private
const updateDonationStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, updatedFrom, paymentStatus } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'ID de donation invalide'
      });
    }

    // Validation du statut
    const validStatuses = ['pending', 'processing', 'completed', 'failed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Statut de donation invalide'
      });
    }

    const donation = await Donation.findById(id).populate('user');

    if (!donation) {
      return res.status(404).json({
        success: false,
        error: 'Donation non trouvée'
      });
    }

    // Vérifier les permissions - utilisateur propriétaire ou admin
    if (donation.user._id.toString() !== req.user.id && !['admin', 'moderator', 'treasurer'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Accès non autorisé à cette donation'
      });
    }

    const oldStatus = donation.status;
    
    // Mettre à jour le statut
    donation.status = status;
    
    // Ajouter à l'historique
    const historyDescription = updatedFrom === 'payment_verification' 
      ? `Statut mis à jour via vérification de paiement (${paymentStatus} -> ${status})`
      : `Statut mis à jour: ${oldStatus} -> ${status}`;
      
    donation.addToHistory('updated', historyDescription, req.user.id, {
      oldStatus,
      newStatus: status,
      updatedFrom: updatedFrom || 'manual',
      paymentStatus
    });

    await donation.save();

    // Mettre à jour les statistiques utilisateur si nécessaire
    if (status === 'completed' && oldStatus !== 'completed') {
      await donation.user.updateDonationStats(donation.amount);
    }

    res.json({
      success: true,
      message: `Statut de la donation mis à jour: ${oldStatus} -> ${status}`,
      data: {
        donation: {
          _id: donation._id,
          status: donation.status,
          amount: donation.amount,
          currency: donation.currency,
          category: donation.category,
          updatedAt: donation.updatedAt
        },
        statusChange: {
          from: oldStatus,
          to: status,
          updatedFrom: updatedFrom || 'manual',
          updatedAt: new Date()
        }
      }
    });
  } catch (error) {
    console.error('Erreur updateDonationStatus:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la mise à jour du statut de la donation'
    });
  }
};

module.exports = {
  getDonations,
  createDonation,
  getDonation,
  cancelRecurringDonation,
  getDonationStats,
  updateDonation,
  updateDonationStatus,
  processRecurringDonations,
  getRecurringDonations
}; 