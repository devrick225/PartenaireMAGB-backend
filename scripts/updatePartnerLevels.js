const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

// Script pour mettre à jour les niveaux de partenaire de tous les utilisateurs
const updatePartnerLevels = async () => {
  try {
    console.log('🔄 Connexion à la base de données...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connecté à MongoDB');

    console.log('🔄 Récupération de tous les utilisateurs...');
    const users = await User.find({});
    console.log(`📊 ${users.length} utilisateurs trouvés`);

    let updatedCount = 0;
    
    for (const user of users) {
      const oldLevel = user.partnerLevel;
      console.log(`📊 Utilisateur ${user.email}: niveau actuel = ${oldLevel}, totalDonations = ${user.totalDonations}`);
      
      // S'assurer que partnerLevel existe, sinon l'initialiser
      if (!user.partnerLevel) {
        user.partnerLevel = 'classique';
        console.log(`🔧 Initialisation du niveau à 'classique' pour ${user.email}`);
      }
      
      // Calculer le nouveau niveau de partenaire
      const newLevel = user.calculatePartnerLevel();
      console.log(`🔄 Nouveau niveau calculé pour ${user.email}: ${newLevel}`);
      
      console.log(`🔄 Mise à jour utilisateur ${user.email}: ${oldLevel || 'null'} → ${newLevel} (Total: ${user.totalDonations} FCFA)`);
      await user.save();
      updatedCount++;
    }

    console.log('');
    console.log('✅ Mise à jour terminée');
    console.log(`📊 ${updatedCount} utilisateurs mis à jour`);
    console.log(`📊 ${users.length - updatedCount} utilisateurs déjà à jour`);
    
    // Afficher les statistiques par niveau
    const levelStats = await User.aggregate([
      {
        $group: {
          _id: '$partnerLevel',
          count: { $sum: 1 },
          totalDonations: { $sum: '$totalDonations' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    console.log('');
    console.log('📈 Répartition par niveau de partenaire:');
    levelStats.forEach(stat => {
      const levels = {
        'classique': 'Partenaire Classique',
        'bronze': 'Partenaire Bronze',
        'argent': 'Partenaire Argent',
        'or': 'Partenaire Or'
      };
      console.log(`  ${levels[stat._id] || stat._id}: ${stat.count} utilisateurs (Total: ${stat.totalDonations.toLocaleString()} FCFA)`);
    });

  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Déconnecté de MongoDB');
    process.exit(0);
  }
};

// Exécuter le script
updatePartnerLevels(); 