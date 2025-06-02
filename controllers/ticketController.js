const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const emailService = require('../services/emailService');

// @desc    Obtenir la liste des tickets
// @route   GET /api/tickets
// @access  Private
const getTickets = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, category, assignedTo, priority } = req.query;
    const isAdmin = ['admin', 'moderator'].includes(req.user.role);

    // Construction du filtre
    const filter = isAdmin ? {} : { user: req.user.id };
    
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (priority) filter.priority = priority;
    if (assignedTo && isAdmin) filter.assignedTo = assignedTo;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
      populate: [
        { path: 'user', select: 'firstName lastName email' },
        { path: 'assignedTo', select: 'firstName lastName email' },
        { path: 'resolvedBy', select: 'firstName lastName email' }
      ]
    };

    const tickets = await Ticket.paginate(filter, options);

    res.json({
      success: true,
      data: {
        tickets: tickets.docs,
        pagination: {
          current: tickets.page,
          total: tickets.totalPages,
          pages: tickets.totalPages,
          limit: tickets.limit,
          totalDocs: tickets.totalDocs
        },
        filters: filter
      }
    });
  } catch (error) {
    console.error('Erreur getTickets:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des tickets'
    });
  }
};

// @desc    Créer un nouveau ticket
// @route   POST /api/tickets
// @access  Private
const createTicket = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Données invalides',
        details: errors.array()
      });
    }

    const { subject, description, category, priority = 'medium' } = req.body;

    // Créer le ticket
    const ticket = await Ticket.create({
      user: req.user.id,
      subject,
      description,
      category,
      priority,
      status: 'open',
      context: {
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip || req.connection.remoteAddress
      }
    });

    // Ajouter à l'historique
    ticket.addToHistory('created', 'Ticket créé', req.user.id);
    await ticket.save();

    // Charger le ticket complet pour la réponse
    const populatedTicket = await Ticket.findById(ticket._id)
      .populate('user', 'firstName lastName email');

    // Envoyer l'email de confirmation au créateur
    try {
      await emailService.sendTicketNotificationEmail(
        req.user.email,
        req.user.firstName,
        {
          ticketNumber: ticket.ticketNumber,
          subject: ticket.subject,
          category: ticket.category,
          priority: ticket.priority,
          status: ticket.status
        },
        'created'
      );
    } catch (emailError) {
      console.error('Erreur envoi email création ticket:', emailError);
    }

    // Notifier les admins (optionnel - peut être configuré)
    try {
      const admins = await User.find({ 
        role: { $in: ['admin', 'moderator'] },
        'emailNotifications.tickets': true 
      }).select('email firstName');

      for (const admin of admins) {
        await emailService.sendTicketNotificationEmail(
          admin.email,
          admin.firstName,
          {
            ticketNumber: ticket.ticketNumber,
            subject: ticket.subject,
            category: ticket.category,
            priority: ticket.priority,
            status: ticket.status,
            createdBy: `${req.user.firstName} ${req.user.lastName}`
          },
          'created'
        );
      }
    } catch (emailError) {
      console.error('Erreur notification admins:', emailError);
    }

    res.status(201).json({
      success: true,
      message: 'Ticket créé avec succès',
      data: {
        ticket: {
          id: populatedTicket._id,
          ticketNumber: populatedTicket.ticketNumber,
          subject: populatedTicket.subject,
          description: populatedTicket.description,
          category: populatedTicket.category,
          priority: populatedTicket.priority,
          status: populatedTicket.status,
          user: populatedTicket.user,
          createdAt: populatedTicket.createdAt
        }
      }
    });
  } catch (error) {
    console.error('Erreur createTicket:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la création du ticket'
    });
  }
};

// @desc    Obtenir les détails d'un ticket
// @route   GET /api/tickets/:id
// @access  Private
const getTicket = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'ID de ticket invalide'
      });
    }

    const ticket = await Ticket.findById(id)
      .populate('user', 'firstName lastName email')
      .populate('assignedTo', 'firstName lastName email')
      .populate('resolvedBy', 'firstName lastName email')
      .populate('context.relatedDonation', 'amount currency category')
      .populate('context.relatedPayment', 'amount currency status provider')
      .populate('history.performedBy', 'firstName lastName email');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: 'Ticket non trouvé'
      });
    }

    // Vérifier les permissions
    const isOwner = ticket.user._id.toString() === req.user.id;
    const isAdmin = ['admin', 'moderator'].includes(req.user.role);
    const isAssigned = ticket.assignedTo && ticket.assignedTo._id.toString() === req.user.id;

    if (!isOwner && !isAdmin && !isAssigned) {
      return res.status(403).json({
        success: false,
        error: 'Accès non autorisé à ce ticket'
      });
    }

    // Calculer les métriques si première vue d'un admin
    if (isAdmin && !ticket.metrics.firstResponseTime) {
      ticket.calculateFirstResponseTime();
      await ticket.save();
    }

    res.json({
      success: true,
      data: {
        ticket
      }
    });
  } catch (error) {
    console.error('Erreur getTicket:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération du ticket'
    });
  }
};

// @desc    Modifier un ticket
// @route   PUT /api/tickets/:id
// @access  Private
const updateTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'ID de ticket invalide'
      });
    }

    const ticket = await Ticket.findById(id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: 'Ticket non trouvé'
      });
    }

    // Vérifier les permissions
    const isOwner = ticket.user.toString() === req.user.id;
    const isAdmin = ['admin', 'moderator'].includes(req.user.role);
    const isAssigned = ticket.assignedTo && ticket.assignedTo.toString() === req.user.id;

    if (!isOwner && !isAdmin && !isAssigned) {
      return res.status(403).json({
        success: false,
        error: 'Accès non autorisé à ce ticket'
      });
    }

    // Les utilisateurs normaux ne peuvent modifier que certains champs
    if (isOwner && !isAdmin) {
      const allowedFields = ['description', 'tags'];
      const filteredUpdates = {};
      allowedFields.forEach(field => {
        if (updates[field] !== undefined) {
          filteredUpdates[field] = updates[field];
        }
      });
      updates = filteredUpdates;
    }

    // Appliquer les mises à jour
    Object.keys(updates).forEach(key => {
      ticket[key] = updates[key];
    });

    // Ajouter à l'historique
    ticket.addToHistory('updated', 'Ticket mis à jour', req.user.id, updates);
    
    await ticket.save();

    res.json({
      success: true,
      message: 'Ticket modifié avec succès',
      data: {
        ticket: {
          id: ticket._id,
          ...updates,
          updatedAt: ticket.updatedAt
        }
      }
    });
  } catch (error) {
    console.error('Erreur updateTicket:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la modification du ticket'
    });
  }
};

// @desc    Assigner un ticket
// @route   POST /api/tickets/:id/assign
// @access  Private (Admin/Moderator)
const assignTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { assignedTo } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'ID de ticket invalide'
      });
    }

    const ticket = await Ticket.findById(id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: 'Ticket non trouvé'
      });
    }

    // Vérifier que l'utilisateur assigné existe
    const assignedUser = await User.findById(assignedTo);
    if (!assignedUser) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur assigné non trouvé'
      });
    }

    // Assigner le ticket
    await ticket.assign(assignedTo, req.user.id);

    // Envoyer notification à l'assigné
    try {
      await emailService.sendTicketNotificationEmail(
        assignedUser.email,
        assignedUser.firstName,
        {
          ticketNumber: ticket.ticketNumber,
          subject: ticket.subject,
          category: ticket.category,
          priority: ticket.priority,
          status: ticket.status
        },
        'assigned'
      );
    } catch (emailError) {
      console.error('Erreur notification assignation:', emailError);
    }

    res.json({
      success: true,
      message: 'Ticket assigné avec succès',
      data: {
        ticketId: ticket._id,
        assignedTo,
        assignedBy: req.user.id,
        assignedAt: ticket.assignedAt
      }
    });
  } catch (error) {
    console.error('Erreur assignTicket:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'assignation du ticket'
    });
  }
};

// @desc    Changer le statut d'un ticket
// @route   POST /api/tickets/:id/status
// @access  Private
const changeTicketStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason, resolution } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'ID de ticket invalide'
      });
    }

    const validStatuses = ['open', 'in_progress', 'waiting_user', 'waiting_admin', 'resolved', 'closed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Statut invalide'
      });
    }

    const ticket = await Ticket.findById(id).populate('user', 'firstName lastName email');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: 'Ticket non trouvé'
      });
    }

    // Vérifier les permissions selon le statut
    const isOwner = ticket.user._id.toString() === req.user.id;
    const isAdmin = ['admin', 'moderator'].includes(req.user.role);
    const isAssigned = ticket.assignedTo && ticket.assignedTo.toString() === req.user.id;

    // Logique de permissions pour changement de statut
    if (status === 'resolved' && !isAdmin && !isAssigned) {
      return res.status(403).json({
        success: false,
        error: 'Seuls les admins ou les assignés peuvent résoudre un ticket'
      });
    }

    if (status === 'closed' && !isAdmin && !isOwner) {
      return res.status(403).json({
        success: false,
        error: 'Seuls les admins ou le créateur peuvent fermer un ticket'
      });
    }

    // Ajouter la résolution si fournie
    if (resolution && status === 'resolved') {
      ticket.resolution = resolution;
    }

    // Changer le statut
    await ticket.changeStatus(status, req.user.id, reason);

    // Envoyer notification selon le nouveau statut
    try {
      let notificationType = 'updated';
      if (status === 'resolved') notificationType = 'resolved';
      
      await emailService.sendTicketNotificationEmail(
        ticket.user.email,
        ticket.user.firstName,
        {
          ticketNumber: ticket.ticketNumber,
          subject: ticket.subject,
          category: ticket.category,
          priority: ticket.priority,
          status: ticket.status,
          resolution: ticket.resolution
        },
        notificationType
      );
    } catch (emailError) {
      console.error('Erreur notification changement statut:', emailError);
    }

    res.json({
      success: true,
      message: 'Statut du ticket modifié avec succès',
      data: {
        ticketId: ticket._id,
        oldStatus: ticket.history[ticket.history.length - 2]?.oldValue || 'open',
        newStatus: status,
        reason,
        resolution,
        updatedBy: req.user.id,
        updatedAt: ticket.updatedAt
      }
    });
  } catch (error) {
    console.error('Erreur changeTicketStatus:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du changement de statut'
    });
  }
};

// @desc    Fermer un ticket
// @route   POST /api/tickets/:id/close
// @access  Private
const closeTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, resolution } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'ID de ticket invalide'
      });
    }

    const ticket = await Ticket.findById(id).populate('user', 'firstName lastName email');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: 'Ticket non trouvé'
      });
    }

    // Vérifier les permissions
    const isOwner = ticket.user._id.toString() === req.user.id;
    const isAdmin = ['admin', 'moderator'].includes(req.user.role);

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Seuls les admins ou le créateur peuvent fermer un ticket'
      });
    }

    // Fermer le ticket
    ticket.status = 'closed';
    ticket.closedAt = new Date();
    ticket.closedBy = req.user.id;
    ticket.closeReason = reason || 'resolved';
    if (resolution) ticket.resolution = resolution;

    // Calculer le temps de résolution
    ticket.calculateResolutionTime();
    
    // Ajouter à l'historique
    ticket.addToHistory('closed', `Ticket fermé: ${reason}`, req.user.id, { reason, resolution });
    
    await ticket.save();

    res.json({
      success: true,
      message: 'Ticket fermé avec succès',
      data: {
        ticketId: ticket._id,
        closedBy: req.user.id,
        closedAt: ticket.closedAt,
        reason,
        resolution
      }
    });
  } catch (error) {
    console.error('Erreur closeTicket:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la fermeture du ticket'
    });
  }
};

// @desc    Escalader un ticket
// @route   POST /api/tickets/:id/escalate
// @access  Private (Admin/Moderator)
const escalateTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { escalatedTo, reason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'ID de ticket invalide'
      });
    }

    const ticket = await Ticket.findById(id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: 'Ticket non trouvé'
      });
    }

    // Vérifier que l'utilisateur escaladé existe et a les bonnes permissions
    const escalatedUser = await User.findById(escalatedTo);
    if (!escalatedUser || !['admin', 'moderator'].includes(escalatedUser.role)) {
      return res.status(400).json({
        success: false,
        error: 'L\'utilisateur escaladé doit être un admin ou modérateur'
      });
    }

    // Escalader le ticket
    await ticket.escalate(escalatedTo, req.user.id, reason);

    // Envoyer notification
    try {
      await emailService.sendTicketNotificationEmail(
        escalatedUser.email,
        escalatedUser.firstName,
        {
          ticketNumber: ticket.ticketNumber,
          subject: ticket.subject,
          category: ticket.category,
          priority: ticket.priority,
          status: ticket.status,
          escalationReason: reason
        },
        'escalated'
      );
    } catch (emailError) {
      console.error('Erreur notification escalade:', emailError);
    }

    res.json({
      success: true,
      message: 'Ticket escaladé avec succès',
      data: {
        ticketId: ticket._id,
        escalatedTo,
        escalatedBy: req.user.id,
        escalatedAt: ticket.escalation.escalatedAt,
        reason
      }
    });
  } catch (error) {
    console.error('Erreur escalateTicket:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'escalade du ticket'
    });
  }
};

// @desc    Ajouter une évaluation
// @route   POST /api/tickets/:id/rating
// @access  Private (Owner only)
const addTicketRating = async (req, res) => {
  try {
    const { id } = req.params;
    const { score, comment } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'ID de ticket invalide'
      });
    }

    if (!score || score < 1 || score > 5) {
      return res.status(400).json({
        success: false,
        error: 'Le score doit être entre 1 et 5'
      });
    }

    const ticket = await Ticket.findById(id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: 'Ticket non trouvé'
      });
    }

    // Vérifier que c'est le propriétaire du ticket
    if (ticket.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Seul le créateur du ticket peut l\'évaluer'
      });
    }

    // Vérifier que le ticket est résolu ou fermé
    if (!['resolved', 'closed'].includes(ticket.status)) {
      return res.status(400).json({
        success: false,
        error: 'Seuls les tickets résolus ou fermés peuvent être évalués'
      });
    }

    // Ajouter l'évaluation
    await ticket.addRating(score, comment);

    res.json({
      success: true,
      message: 'Évaluation ajoutée avec succès',
      data: {
        ticketId: ticket._id,
        rating: {
          score,
          comment,
          ratedBy: req.user.id,
          ratedAt: ticket.rating.ratedAt
        }
      }
    });
  } catch (error) {
    console.error('Erreur addTicketRating:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'ajout de l\'évaluation'
    });
  }
};

// @desc    Obtenir les statistiques des tickets
// @route   GET /api/tickets/stats
// @access  Private (Admin/Moderator)
const getTicketStats = async (req, res) => {
  try {
    const { period = 'month' } = req.query;

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

    // Statistiques générales
    const [generalStats] = await Ticket.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: null,
          totalTickets: { $sum: 1 },
          openTickets: {
            $sum: { $cond: [{ $in: ['$status', ['open', 'in_progress', 'waiting_user', 'waiting_admin']] }, 1, 0] }
          },
          resolvedTickets: {
            $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] }
          },
          closedTickets: {
            $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] }
          },
          averageResolutionTime: { $avg: '$metrics.resolutionTime' },
          averageFirstResponseTime: { $avg: '$metrics.firstResponseTime' }
        }
      }
    ]);

    // Répartition par catégorie
    const categoryStats = await Ticket.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Répartition par priorité
    const priorityStats = await Ticket.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$priority',
          count: { $sum: 1 }
        }
      }
    ]);

    // Tickets en retard
    const overdueTickets = await Ticket.getOverdueTickets();

    res.json({
      success: true,
      data: {
        stats: {
          totalTickets: generalStats?.totalTickets || 0,
          openTickets: generalStats?.openTickets || 0,
          resolvedTickets: generalStats?.resolvedTickets || 0,
          closedTickets: generalStats?.closedTickets || 0,
          averageResolutionTime: Math.round(generalStats?.averageResolutionTime || 0),
          averageFirstResponseTime: Math.round(generalStats?.averageFirstResponseTime || 0),
          categoryBreakdown: categoryStats,
          priorityBreakdown: priorityStats,
          overdueTickets: overdueTickets.length
        }
      }
    });
  } catch (error) {
    console.error('Erreur getTicketStats:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des statistiques'
    });
  }
};

module.exports = {
  getTickets,
  createTicket,
  getTicket,
  updateTicket,
  assignTicket,
  changeTicketStatus,
  closeTicket,
  escalateTicket,
  addTicketRating,
  getTicketStats
}; 