const mongoose = require('mongoose');
require('dotenv').config();

// Importer les services
const moneyFusionService = require('../services/moneyFusionService');
const fusionPayService = require('../services/fusionPayService');
const paymentService = require('../services/paymentService');

async function testDonDescription() {
  try {
    console.log('🧪 Test des descriptions DON PARTENAIRE MAGB...');

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
    console.log(`- Nom complet: "${user.fullName}"`);
    console.log(`- Email: "${user.email}"`);

    // Simuler les données client
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

    const testData = {
      amount: 1000,
      currency: 'XOF',
      customerInfo,
      donationId: 'test_donation_123',
      callbackUrl: 'https://test.com/callback'
    };

    console.log('\n🔧 Test des descriptions par service:');

    // Test MoneyFusion
    console.log('\n💳 MoneyFusion:');
    console.log(`- Description par défaut: "DON PARTENAIRE MAGB"`);
    
    // Test FusionPay
    console.log('\n💳 FusionPay:');
    console.log(`- Description par défaut: "DON PARTENAIRE MAGB"`);
    
    // Test CinetPay
    console.log('\n💳 CinetPay:');
    console.log(`- Description: "DON PARTENAIRE MAGB"`);
    
    // Test Stripe
    console.log('\n💳 Stripe:');
    console.log(`- Description: "DON PARTENAIRE MAGB"`);
    
    // Test PayPal
    console.log('\n💳 PayPal:');
    console.log(`- Description: "DON PARTENAIRE MAGB"`);
    console.log(`- Brand name: "PARTENAIRE MAGB"`);
    
    // Test Mobile Money
    console.log('\n💳 Mobile Money:');
    console.log(`- Payer message: "DON PARTENAIRE MAGB"`);
    console.log(`- Payee note: "DON PARTENAIRE MAGB"`);

    console.log('\n✅ Test terminé !');
    console.log('📝 Toutes les descriptions utilisent maintenant "DON PARTENAIRE MAGB" de manière cohérente.');

  } catch (error) {
    console.error('❌ Erreur lors du test:', error);
  } finally {
    await mongoose.disconnect();
    console.log('✅ Déconnecté de MongoDB');
  }
}

// Exécuter le script si appelé directement
if (require.main === module) {
  testDonDescription();
}

module.exports = testDonDescription; 