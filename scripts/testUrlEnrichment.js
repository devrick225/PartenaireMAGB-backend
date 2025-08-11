const moneyFusionService = require('../services/moneyFusionService');

function testUrlEnrichment() {
  console.log('🧪 Test rapide de l\'enrichissement d\'URL...');

  // URL de test (celle que vous recevez)
  const testUrl = 'https://payin.moneyfusion.net/payment/BOs15C3WsW8TiVERnwKI/200/Eric Rainier KOFFI';
  
  // Données de test
  const donationData = {
    donationId: 'test_donation_123',
    amount: 200,
    currency: 'XOF',
    description: 'DON PARTENAIRE MAGB',
    customerInfo: {
      name: 'John Doe',
      email: 'john@example.com'
    }
  };

  console.log('\n📋 Données de test:');
  console.log('URL originale:', testUrl);
  console.log('Donation data:', JSON.stringify(donationData, null, 2));

  // Test de la fonction enrichPaymentUrl
  console.log('\n🔧 Test de enrichPaymentUrl...');
  const enrichedUrl = moneyFusionService.enrichPaymentUrl(testUrl, donationData);

  console.log('\n📊 Résultat:');
  console.log('URL enrichie:', enrichedUrl);

  // Test du remplacement du nom
  console.log('\n🔧 Test du remplacement du nom...');
  const urlPattern = /\/payment\/[^\/]+\/\d+\/([^?]+)/;
  const match = enrichedUrl.match(urlPattern);
  
  if (match) {
    const currentName = match[1];
    const correctedUrl = enrichedUrl.replace(currentName, 'DON PARTENAIRE MAGB');
    console.log('URL avec nom remplacé:', correctedUrl);
  }

  // Vérifier si l'URL a changé
  if (testUrl !== enrichedUrl) {
    console.log('✅ SUCCÈS: L\'URL a été enrichie !');
    
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
  } else {
    console.log('❌ ÉCHEC: L\'URL n\'a pas été enrichie');
  }

  console.log('\n✅ Test terminé !');
}

// Exécuter le test
testUrlEnrichment(); 