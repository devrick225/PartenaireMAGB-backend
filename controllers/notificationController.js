const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const Notification = require('../models/Notification');

const mapNotification = (doc) => ({
  id: doc._id,
  titre: doc.title,
  message: doc.message,
  date: doc.createdAt,
  destinataires: doc.recipientsType === 'all' ? 'tous' : (doc.recipients || []).map((id) => id.toString()),
  lue: (doc.readBy || []).map((id) => id.toString()),
});

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
        notifications: notifications.map(mapNotification),
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
        notifications: notifications.map(mapNotification),
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

    const recipientsType = destinataires === 'tous' ? 'all' : 'users';
    const recipients = Array.isArray(destinataires) ? destinataires : [];

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
        notification: mapNotification(created),
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

    const notification = await Notification.findById(id);
    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification non trouvée',
      });
    }

    const alreadyRead = (notification.readBy || []).some((readerId) => readerId.toString() === req.user.id);
    if (!alreadyRead) {
      notification.readBy.push(req.user.id);
      await notification.save();
    }

    res.json({
      success: true,
      message: 'Notification marquée comme lue',
      data: {
        notification: mapNotification(notification),
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

