const Ministry = require('../models/Ministry');
const { validationResult } = require('express-validator');

/**
 * Récupérer tous les ministères actifs
 */
exports.getAllMinistries = async (req, res) => {
  try {
    const ministries = await Ministry.getActiveMinistries();
    
    res.status(200).json({
      success: true,
      data: ministries,
      message: 'Ministères récupérés avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des ministères:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des ministères',
      error: error.message
    });
  }
};

/**
 * Récupérer les ministères par catégorie
 */
exports.getMinistriesByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    
    // Validation de la catégorie
    const validCategories = ['general', 'youth', 'children', 'women', 'men', 'music', 'prayer', 'evangelism', 'social', 'other'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: 'Catégorie invalide'
      });
    }
    
    const ministries = await Ministry.getMinistriesByCategory(category);
    
    res.status(200).json({
      success: true,
      data: ministries,
      message: `Ministères de la catégorie ${category} récupérés avec succès`
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des ministères par catégorie:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des ministères',
      error: error.message
    });
  }
};

/**
 * Récupérer un ministère par ID
 */
exports.getMinistryById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const ministry = await Ministry.findById(id);
    
    if (!ministry) {
      return res.status(404).json({
        success: false,
        message: 'Ministère non trouvé'
      });
    }
    
    if (!ministry.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Ministère non disponible'
      });
    }
    
    res.status(200).json({
      success: true,
      data: ministry,
      message: 'Ministère récupéré avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la récupération du ministère:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du ministère',
      error: error.message
    });
  }
};

/**
 * Créer un nouveau ministère (Admin seulement)
 */
exports.createMinistry = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Données invalides',
        errors: errors.array()
      });
    }
    
    const ministryData = req.body;
    
    const ministry = new Ministry(ministryData);
    await ministry.save();
    
    res.status(201).json({
      success: true,
      data: ministry,
      message: 'Ministère créé avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la création du ministère:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création du ministère',
      error: error.message
    });
  }
};

/**
 * Mettre à jour un ministère (Admin seulement)
 */
exports.updateMinistry = async (req, res) => {
  try {
    const { id } = req.params;
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Données invalides',
        errors: errors.array()
      });
    }
    
    const ministryData = req.body;
    
    const ministry = await Ministry.findByIdAndUpdate(
      id,
      ministryData,
      { new: true, runValidators: true }
    );
    
    if (!ministry) {
      return res.status(404).json({
        success: false,
        message: 'Ministère non trouvé'
      });
    }
    
    res.status(200).json({
      success: true,
      data: ministry,
      message: 'Ministère mis à jour avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour du ministère:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour du ministère',
      error: error.message
    });
  }
};

/**
 * Supprimer un ministère (Admin seulement)
 */
exports.deleteMinistry = async (req, res) => {
  try {
    const { id } = req.params;
    
    const ministry = await Ministry.findByIdAndDelete(id);
    
    if (!ministry) {
      return res.status(404).json({
        success: false,
        message: 'Ministère non trouvé'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Ministère supprimé avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la suppression du ministère:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression du ministère',
      error: error.message
    });
  }
};

/**
 * Activer/Désactiver un ministère (Admin seulement)
 */
exports.toggleMinistryStatus = async (req, res) => {
  try {
    const { id } = req.params;
    
    const ministry = await Ministry.findById(id);
    
    if (!ministry) {
      return res.status(404).json({
        success: false,
        message: 'Ministère non trouvé'
      });
    }
    
    ministry.isActive = !ministry.isActive;
    await ministry.save();
    
    res.status(200).json({
      success: true,
      data: ministry,
      message: `Ministère ${ministry.isActive ? 'activé' : 'désactivé'} avec succès`
    });
  } catch (error) {
    console.error('Erreur lors du changement de statut du ministère:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du changement de statut du ministère',
      error: error.message
    });
  }
};

/**
 * Récupérer les statistiques des ministères
 */
exports.getMinistryStats = async (req, res) => {
  try {
    const totalMinistries = await Ministry.countDocuments();
    const activeMinistries = await Ministry.countDocuments({ isActive: true });
    const ministriesByCategory = await Ministry.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    res.status(200).json({
      success: true,
      data: {
        total: totalMinistries,
        active: activeMinistries,
        inactive: totalMinistries - activeMinistries,
        byCategory: ministriesByCategory
      },
      message: 'Statistiques des ministères récupérées avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des statistiques',
      error: error.message
    });
  }
}; 