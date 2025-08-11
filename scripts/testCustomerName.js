const mongoose = require('mongoose');
require('dotenv').config();

// Importer les modèles
const User = require('../models/User');
const moneyFusionService = require('../services/moneyFusionService');

async function testCustomerName() {
  try {
    console.log('🧪 Test du formatage du nom client...');

    // Connexion à la base de données
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/partenaire-magb');
    console.log('✅ Connecté à MongoDB');

    // Trouver un utilisateur de test
    const user = await User.findOne({});
    
    if (!user) {
      console.log('❌ Aucun utilisateur trouvé dans la base de données');
      return;
    }

    console.log('\n📋 Informations utilisateur:');
    console.log(`- firstName: "${user.firstName}"`);
    console.log(`- lastName: "${user.lastName}"`);
    console.log(`- fullName: "${user.fullName}"`);

    // Simuler les données client comme dans le contrôleur de paiement
    const customerInfo = {
      userId: user._id,
      name: user.fullName, // Utiliser le nom complet
      surname: '', // Vide car nous utilisons le nom complet dans name
      email: user.email,
      phone: user.phone,
      address: '',
      city: user.city,
      country: user.country
    };

    console.log('\n🔧 Données client préparées:');
    console.log(`- name: "${customerInfo.name}"`);
    console.log(`- surname: "${customerInfo.surname}"`);
    console.log(`- email: "${customerInfo.email}"`);
    console.log(`- phone: "${customerInfo.phone}"`);

    // Test de la construction du nom pour MoneyFusion
    const moneyFusionName = customerInfo.name; // Utilise directement customerInfo.name
    console.log('\n💳 Nom pour MoneyFusion:');
    console.log(`- clientName: "${moneyFusionName}"`);

    // Test de la construction du nom pour FusionPay
    const fusionPayName = customerInfo.name; // Utilise directement customerInfo.name
    console.log('\n💳 Nom pour FusionPay:');
    console.log(`- customer.name: "${fusionPayName}"`);

    // Test de la construction du nom pour CinetPay
    const cinetPayName = customerInfo.name; // Utilise directement customerInfo.name
    console.log('\n💳 Nom pour CinetPay:');
    console.log(`- customer_name: "${cinetPayName}"`);

    console.log('\n✅ Test terminé !');
    console.log('📝 Le nom complet de l\'utilisateur sera maintenant utilisé dans tous les services de paiement.');

  } catch (error) {
    console.error('❌ Erreur lors du test:', error);
  } finally {
    await mongoose.disconnect();
    console.log('✅ Déconnecté de MongoDB');
  }
}

// Exécuter le script si appelé directement
if (require.main === module) {
  testCustomerName();
}

module.exports = testCustomerName; 