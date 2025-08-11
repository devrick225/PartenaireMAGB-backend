const mongoose = require('mongoose');
require('dotenv').config();

// Importer les services
const moneyFusionService = require('../services/moneyFusionService');

async function testEnrichedUrl() {
  try {
    console.log('🧪 Test de l\'URL enrichie avec référence du don...');

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

    // Test de la fonction enrichPaymentUrl
    console.log('\n🔧 Test de la fonction enrichPaymentUrl...');
    
    const testUrl = 'https://payin.moneyfusion.net/payment/test123/1000/Test User';
    const donationData = {
      donationId: 'test_donation_456',
      amount: 1000,
      currency: 'XOF',
      description: 'DON PARTENAIRE MAGB',
      customerInfo
    };

    const enrichedUrl = moneyFusionService.enrichPaymentUrl(testUrl, donationData);
    
    console.log('\n📊 Résultats:');
    console.log('URL originale:', testUrl);
    console.log('URL enrichie:', enrichedUrl);
    
    // Analyser les paramètres ajoutés
    const urlParts = enrichedUrl.split('?');
    if (urlParts.length > 1) {
      const params = urlParts[1].split('&');
      console.log('\n📋 Paramètres ajoutés:');
      params.forEach(param => {
        const [key, value] = param.split('=');
        console.log(`- ${key}: ${decodeURIComponent(value)}`);
      });
    }

    // Test avec une URL qui contient déjà des paramètres
    console.log('\n🔧 Test avec URL contenant déjà des paramètres...');
    const testUrlWithParams = 'https://payin.moneyfusion.net/payment/test123/1000/Test User?existing=param';
    const enrichedUrlWithParams = moneyFusionService.enrichPaymentUrl(testUrlWithParams, donationData);
    
    console.log('URL avec paramètres existants:', testUrlWithParams);
    console.log('URL enrichie:', enrichedUrlWithParams);

    console.log('\n✅ Test terminé !');
    console.log('📝 L\'URL enrichie contient maintenant toutes les informations du don.');

  } catch (error) {
    console.error('❌ Erreur lors du test:', error);
  } finally {
    await mongoose.disconnect();
    console.log('✅ Déconnecté de MongoDB');
  }
}

// Exécuter le script si appelé directement
if (require.main === module) {
  testEnrichedUrl();
}

module.exports = testEnrichedUrl; 