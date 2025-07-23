const mongoose = require('mongoose');
require('dotenv').config();

async function cleanupRemovedProfileFields() {
  try {
    console.log('🧹 Début du nettoyage des champs supprimés du profil...');

    // Connexion à la base de données
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/partenaire-magb');
    console.log('✅ Connecté à MongoDB');

    // Obtenir la collection profiles directement
    const profilesCollection = mongoose.connection.db.collection('profiles');

    // Compter les documents avant nettoyage
    const totalProfiles = await profilesCollection.countDocuments();
    console.log(`📊 ${totalProfiles} profils trouvés`);

    // Champs à supprimer
    const fieldsToRemove = {
      // Informations professionnelles supprimées
      employer: 1,
      monthlyIncome: 1,
      
      // Informations ecclésiastiques supprimées
      'churchMembership.churchName': 1,
      'churchMembership.membershipDate': 1,
      'churchMembership.baptismDate': 1,
      'churchMembership.ministry': 1,
      'churchMembership.churchRole': 1,
      
      // Préférences de communication (section complète)
      communicationPreferences: 1,
      
      // Bénévolat (section complète)
      volunteer: 1,
      
      // Informations du conjoint
      'familyInfo.spouse': 1
    };

    console.log('🔄 Suppression des champs obsolètes...');
    
    // Supprimer les champs
    const result = await profilesCollection.updateMany(
      {}, // Tous les documents
      { $unset: fieldsToRemove }
    );

    console.log(`✅ ${result.modifiedCount} profils mis à jour`);
    
    // Vérifier quelques profils pour confirmer le nettoyage
    console.log('\n🔍 Vérification d\'un profil nettoyé...');
    const sampleProfile = await profilesCollection.findOne({});
    if (sampleProfile) {
      const hasRemovedFields = [
        'employer',
        'monthlyIncome', 
        'communicationPreferences',
        'volunteer'
      ].some(field => sampleProfile.hasOwnProperty(field));
      
      const hasRemovedChurchFields = sampleProfile.churchMembership && [
        'churchName',
        'membershipDate', 
        'baptismDate',
        'ministry',
        'churchRole'
      ].some(field => sampleProfile.churchMembership.hasOwnProperty(field));
      
      const hasRemovedSpouse = sampleProfile.familyInfo && 
        sampleProfile.familyInfo.hasOwnProperty('spouse');

      if (!hasRemovedFields && !hasRemovedChurchFields && !hasRemovedSpouse) {
        console.log('✅ Nettoyage confirmé - Aucun champ obsolète trouvé');
      } else {
        console.log('⚠️ Attention - Certains champs obsolètes subsistent');
      }
    }

    // Statistiques finales
    console.log('\n📊 Résumé du nettoyage:');
    console.log(`- Profils traités: ${result.modifiedCount}/${totalProfiles}`);
    console.log('- Champs supprimés:');
    console.log('  • employer (informations professionnelles)');
    console.log('  • monthlyIncome (informations professionnelles)');
    console.log('  • churchName, membershipDate, baptismDate, ministry, churchRole (informations ecclésiastiques)');
    console.log('  • communicationPreferences (section complète)');
    console.log('  • volunteer (section complète)');
    console.log('  • familyInfo.spouse (informations du conjoint)');

    console.log('\n🎉 Nettoyage terminé avec succès !');

  } catch (error) {
    console.error('❌ Erreur lors du nettoyage:', error);
  } finally {
    await mongoose.disconnect();
    console.log('✅ Déconnecté de MongoDB');
  }
}

// Exécuter le script si appelé directement
if (require.main === module) {
  cleanupRemovedProfileFields();
}

module.exports = cleanupRemovedProfileFields; 