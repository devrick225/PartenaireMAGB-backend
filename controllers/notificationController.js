const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const Notification = require('../models/Notification');

const STAFF_ROLES = ['admin', 'moderator', 'support_agent'];

// Le staff voit la liste complète des destinataires et des lecteurs ; un utilisateur
// ne reçoit que ce qui le concerne (auparavant, chaque notification exposait les
// identifiants de tous les destinataires et de tous ceux qui l'avaient lue).
const mapNotification = (doc, viewer) => {
  const isStaff = viewer && STAFF_ROLES.includes(viewer.role);
  const viewerId = viewer ? viewer.id : null;
  const readers = (doc.readBy || []).map((id) => id.toString());
  const recipients = (doc.recipients || []).map((id) => id.toString());

  return {
    id: doc._id,
    titre: doc.title,
    message: doc.message,
    date: doc.createdAt,
    destinataires: doc.recipientsType === 'all'
      ? 'tous'
      : (isStaff ? recipients : recipients.filter((id) => id === viewerId)),
    lue: isStaff ? readers : readers.filter((id) => id === viewerId),
  };
};

// GET /api/notifications
const getNotifications = async (req, res) => {
  try {
    const isAdmin = ['admin', 'moderator', 'support_agent'].includes(req.user.role);
    const userId = new mongoose.Types.ObjectId(req.user.id);

    const filter = isAdmin
      ? {}
      : {
          $or: [
            { recipientsType: 'all' },
            { recipientsType: 'users', recipients: userId },
          ],
        };

    const notifications = await Notification.find(filter).sort({ createdAt: -1 }).limit(300);

    res.json({
      success: true,
      data: {
        notifications: notifications.map((n) => mapNotification(n, req.user)),
      },
    });
  } catch (error) {
    console.error('Erreur getNotifications:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des notifications',
    });
  }
};

// GET /api/notifications/my
const getMyNotifications = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const notifications = await Notification.find({
      $or: [
        { recipientsType: 'all' },
        { recipientsType: 'users', recipients: userId },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(300);

    res.json({
      success: true,
      data: {
        notifications: notifications.map((n) => mapNotification(n, req.user)),
      },
    });
  } catch (error) {
    console.error('Erreur getMyNotifications:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des notifications utilisateur',
    });
  }
};

// POST /api/notifications
const createNotification = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Données invalides',
        details: errors.array(),
      });
    }

    const { titre, message, destinataires } = req.body;
    if (!titre || !message) {
      return res.status(400).json({
        success: false,
        error: 'Titre et message requis',
      });
    }

    // « tous » (ou rien) = tout le monde ; sinon une liste d'identifiants d'utilisateurs
    const targetsUsers = Array.isArray(destinataires) && destinataires.length > 0;
    if (targetsUsers && !destinataires.every((id) => mongoose.Types.ObjectId.isValid(id))) {
      return res.status(400).json({
        success: false,
        error: 'Liste de destinataires invalide',
      });
    }
    const recipientsType = targetsUsers ? 'users' : 'all';
    const recipients = targetsUsers ? destinataires : [];

    const created = await Notification.create({
      title: titre,
      message,
      recipientsType,
      recipients,
      createdBy: req.user.id,
    });

    res.status(201).json({
      success: true,
      message: 'Notification créée avec succès',
      data: {
        notification: mapNotification(created, req.user),
      },
    });
  } catch (error) {
    console.error('Erreur createNotification:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la création de la notification',
    });
  }
};

// PATCH /api/notifications/:id/read
const markNotificationRead = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'ID notification invalide',
      });
    }

    // Mise à jour atomique, limitée aux notifications dont l'utilisateur est destinataire
    const notification = await Notification.findOneAndUpdate(
      {
        _id: id,
        $or: [
          { recipientsType: 'all' },
          { recipientsType: 'users', recipients: req.user._id },
        ],
      },
      { $addToSet: { readBy: req.user._id } },
      { new: true }
    );
    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification non trouvée',
      });
    }
    res.json({
      success: true,
      message: 'Notification marquée comme lue',
      data: {
        notification: mapNotification(notification, req.user),
      },
    });
  } catch (error) {
    console.error('Erreur markNotificationRead:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du marquage de la notification',
    });
  }
};

module.exports = {
  getNotifications,
  getMyNotifications,
  createNotification,
  markNotificationRead,
};

