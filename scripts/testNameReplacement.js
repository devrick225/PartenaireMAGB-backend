const moneyFusionService = require('../services/moneyFusionService');

function testNameReplacement() {
  console.log('🧪 Test du remplacement du nom dans l\'URL...');

  // URL de test (celle que vous recevez)
  const testUrl = 'https://payin.moneyfusion.net/payment/BOs15C3WsW8TiVERnwKI/200/Eric Rainier KOFFI?donationId=688783681e2b87be37a9cfb5&amount=200&currency=XOF&description=DON%20PARTENAIRE%20MAGB&customerName=Eric%20Rainier%20KOFFI&customerEmail=erickoffi29%40gmail.com&platform=partenaire-magb&timestamp=1753711467497';
  
  console.log('\n📋 URL de test:');
  console.log(testUrl);

  // Test du pattern de remplacement
  console.log('\n🔧 Test du pattern de remplacement...');
  
  const urlPattern = /\/payment\/[^\/]+\/\d+\/([^?]+)/;
  const match = testUrl.match(urlPattern);
  
  if (match) {
    const currentName = match[1];
    console.log('✅ Nom trouvé dans l\'URL:', currentName);
    
    // Remplacer le nom par "DON PARTENAIRE MAGB"
    const correctedUrl = testUrl.replace(currentName, 'DON PARTENAIRE MAGB');
    
    console.log('\n📊 Résultat:');
    console.log('URL originale:', testUrl);
    console.log('URL corrigée:', correctedUrl);
    
    // Vérifier que le remplacement a fonctionné
    if (correctedUrl.includes('DON PARTENAIRE MAGB') && !correctedUrl.includes('Eric Rainier KOFFI')) {
      console.log('✅ SUCCÈS: Le nom a été remplacé par "DON PARTENAIRE MAGB"');
    } else {
      console.log('❌ ÉCHEC: Le remplacement n\'a pas fonctionné');
    }
    
    // Analyser les paramètres
    const urlParts = correctedUrl.split('?');
    if (urlParts.length > 1) {
      const params = urlParts[1].split('&');
      console.log('\n📋 Paramètres de l\'URL:');
      params.forEach(param => {
        const [key, value] = param.split('=');
        console.log(`- ${key}: ${decodeURIComponent(value)}`);
      });
    }
    
  } else {
    console.log('❌ ÉCHEC: Impossible de trouver le nom dans l\'URL');
  }

  // Test avec d'autres noms
  console.log('\n🔧 Test avec d\'autres noms...');
  const testUrls = [
    'https://payin.moneyfusion.net/payment/ABC123/500/John Doe?param=value',
    'https://payin.moneyfusion.net/payment/DEF456/1000/Marie Dupont',
    'https://payin.moneyfusion.net/payment/GHI789/750/Koffi Eric Rainier?param=value'
  ];
  
  testUrls.forEach((url, index) => {
    console.log(`\nTest ${index + 1}:`);
    console.log('URL originale:', url);
    
    const match = url.match(urlPattern);
    if (match) {
      const currentName = match[1];
      const correctedUrl = url.replace(currentName, 'DON PARTENAIRE MAGB');
      console.log('URL corrigée:', correctedUrl);
    } else {
      console.log('❌ Pattern non trouvé');
    }
  });

  console.log('\n✅ Test terminé !');
}

// Exécuter le test
testNameReplacement(); 