const mongoose = require('mongoose');

const usefulLinkSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 150,
  },
  url: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500,
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500,
    default: '',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
});

usefulLinkSchema.index({ isActive: 1, createdAt: -1 });

module.exports = mongoose.model('UsefulLink', usefulLinkSchema);

