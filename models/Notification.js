const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 150,
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000,
  },
  recipientsType: {
    type: String,
    enum: ['all', 'users'],
    default: 'all',
  },
  recipients: [{
    type: mongoose.Schema.ObjectId,
    ref: 'User',
  }],
  readBy: [{
    type: mongoose.Schema.ObjectId,
    ref: 'User',
  }],
  createdBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
});

notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ recipientsType: 1 });
notificationSchema.index({ recipients: 1 });

module.exports = mongoose.model('Notification', notificationSchema);

