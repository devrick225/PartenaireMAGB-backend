const mongoose = require('mongoose');
require('dotenv').config();

// Importer les services
const moneyFusionService = require('../services/moneyFusionService');

async function debugMoneyFusionName() {
  try {
    console.log('🔍 Débogage du problème de nom MoneyFusion...');

    // Connexion à la base de données
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/partenaire-magb');
    console.log('✅ Connecté à MongoDB');

    // Trouver un utilisateur de test
    const User = require('../models/User');
    const user = await User.findOne({});
    
    if (!user) {
      console.log('❌ Aucun utilisateur trouvé dans la base de données');
      return;
    }

    console.log('\n📋 Informations utilisateur:');
    console.log(`- ID: ${user._id}`);
    console.log(`- firstName: "${user.firstName}"`);
    console.log(`- lastName: "${user.lastName}"`);
    console.log(`- fullName: "${user.fullName}"`);

    // Simuler les données client comme dans le contrôleur
    const customerInfo = {
      userId: user._id,
      name: user.fullName,
      surname: '',
      email: user.email,
      phone: user.phone,
      address: '',
      city: user.city,
      country: user.country
    };

    console.log('\n🔧 Données client préparées:');
    console.log(JSON.stringify(customerInfo, null, 2));

    // Test de l'initialisation MoneyFusion
    console.log('\n🧪 Test d\'initialisation MoneyFusion...');
    
    try {
      const result = await moneyFusionService.initializePayment({
        amount: 100,
        currency: 'XOF',
        customerInfo,
        donationId: 'test_debug_123',
        callbackUrl: 'https://test.com/callback',
        description: 'DON PARTENAIRE MAGB'
      });

      console.log('\n✅ Résultat MoneyFusion:');
      console.log(JSON.stringify(result, null, 2));

      if (result.paymentUrl) {
        console.log('\n🔗 URL de paiement:');
        console.log(result.paymentUrl);
        
        if (result.paymentUrl.includes('Koffi Eric Rainier')) {
          console.log('\n❌ PROBLÈME DÉTECTÉ: L\'URL contient encore "Koffi Eric Rainier"');
        } else {
          console.log('\n✅ SUCCÈS: L\'URL ne contient plus "Koffi Eric Rainier"');
        }
      }

    } catch (error) {
      console.error('\n❌ Erreur lors du test MoneyFusion:', error.message);
    }

  } catch (error) {
    console.error('❌ Erreur lors du débogage:', error);
  } finally {
    await mongoose.disconnect();
    console.log('✅ Déconnecté de MongoDB');
  }
}

// Exécuter le script si appelé directement
if (require.main === module) {
  debugMoneyFusionName();
}

module.exports = debugMoneyFusionName; 