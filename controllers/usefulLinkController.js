const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const UsefulLink = require('../models/UsefulLink');

const mapLink = (doc) => ({
  id: doc._id,
  titre: doc.title,
  url: doc.url,
  description: doc.description || '',
  dateCreation: doc.createdAt,
});

// GET /api/links
const getUsefulLinks = async (req, res) => {
  try {
    const links = await UsefulLink.find({ isActive: true }).sort({ createdAt: -1 });
    res.json({
      success: true,
      data: {
        links: links.map(mapLink),
      },
    });
  } catch (error) {
    console.error('Erreur getUsefulLinks:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des liens utiles',
    });
  }
};

// POST /api/links
const createUsefulLink = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Données invalides',
        details: errors.array(),
      });
    }

    const { titre, url, description } = req.body;
    if (!titre || !url) {
      return res.status(400).json({
        success: false,
        error: 'Titre et URL requis',
      });
    }

    const created = await UsefulLink.create({
      title: titre,
      url,
      description: description || '',
      createdBy: req.user.id,
    });

    res.status(201).json({
      success: true,
      message: 'Lien utile créé avec succès',
      data: {
        link: mapLink(created),
      },
    });
  } catch (error) {
    console.error('Erreur createUsefulLink:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la création du lien utile',
    });
  }
};

// PUT /api/links/:id
const updateUsefulLink = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Données invalides',
        details: errors.array(),
      });
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'ID lien invalide',
      });
    }

    const { titre, url, description } = req.body;
    const updates = {};
    if (titre !== undefined) updates.title = titre;
    if (url !== undefined) updates.url = url;
    if (description !== undefined) updates.description = description;

    const updated = await UsefulLink.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
    if (!updated) {
      return res.status(404).json({
        success: false,
        error: 'Lien non trouvé',
      });
    }

    res.json({
      success: true,
      message: 'Lien utile mis à jour',
      data: {
        link: mapLink(updated),
      },
    });
  } catch (error) {
    console.error('Erreur updateUsefulLink:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la mise à jour du lien utile',
    });
  }
};

// DELETE /api/links/:id
const deleteUsefulLink = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'ID lien invalide',
      });
    }

    const deleted = await UsefulLink.findByIdAndUpdate(id, { isActive: false }, { new: true });
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Lien non trouvé',
      });
    }

    res.json({
      success: true,
      message: 'Lien utile supprimé',
    });
  } catch (error) {
    console.error('Erreur deleteUsefulLink:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la suppression du lien utile',
    });
  }
};

module.exports = {
  getUsefulLinks,
  createUsefulLink,
  updateUsefulLink,
  deleteUsefulLink,
};

