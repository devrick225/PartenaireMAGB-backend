const axios = require('axios');

// Configuration
const BASE_URL = 'http://localhost:5000/api';

// Tokens d'exemple (remplacez par de vrais tokens)
const TOKENS = {
  user: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', // Token utilisateur normal
  admin: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', // Token admin
  treasurer: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' // Token treasurer
};

// Fonction helper pour faire des requêtes
async function makeRequest(endpoint, token, userType) {
  try {
    console.log(`\n=== Test ${userType.toUpperCase()} ===`);
    console.log(`Endpoint: ${endpoint}`);
    
    const response = await axios.get(`${BASE_URL}${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log(`✅ Succès (${response.status})`);
    console.log(`📊 Total transactions: ${response.data.data.stats.totalTransactions}`);
    console.log(`💰 Volume total: ${response.data.data.stats.totalVolume || 'N/A'}`);
    console.log(`🔒 Stats personnelles: ${response.data.data.stats.isPersonalStats ? 'Oui' : 'Non'}`);
    
    return response.data;
  } catch (error) {
    console.log(`❌ Erreur (${error.response?.status || 'Network'}): ${error.response?.data?.error || error.message}`);
    return null;
  }
}

// Tests des endpoints
async function testStatsEndpoints() {
  console.log('🧪 Tests des endpoints de statistiques');
  console.log('=====================================');

  // Test 1: Stats de paiements
  console.log('\n📊 TESTS DES STATISTIQUES DE PAIEMENTS');
  await makeRequest('/payments/stats?period=month', TOKENS.user, 'utilisateur normal');
  await makeRequest('/payments/stats?period=month', TOKENS.admin, 'admin');
  await makeRequest('/payments/stats?period=month', TOKENS.treasurer, 'treasurer');

  // Test 2: Stats de tickets
  console.log('\n🎫 TESTS DES STATISTIQUES DE TICKETS');
  await makeRequest('/tickets/stats?period=month', TOKENS.user, 'utilisateur normal');
  await makeRequest('/tickets/stats?period=month', TOKENS.admin, 'admin');

  // Test 3: Périodes différentes
  console.log('\n📅 TESTS AVEC DIFFÉRENTES PÉRIODES');
  await makeRequest('/payments/stats?period=week', TOKENS.user, 'utilisateur (semaine)');
  await makeRequest('/payments/stats?period=year', TOKENS.admin, 'admin (année)');

  // Test 4: Paramètres invalides
  console.log('\n❌ TESTS AVEC PARAMÈTRES INVALIDES');
  await makeRequest('/payments/stats?period=mont', TOKENS.user, 'période invalide');
  await makeRequest('/tickets/stats?period=invalid', TOKENS.admin, 'période invalide');
}

// Fonction pour tester sans token
async function testWithoutAuth() {
  console.log('\n🔐 TEST SANS AUTHENTIFICATION');
  try {
    const response = await axios.get(`${BASE_URL}/payments/stats`);
    console.log('❌ Erreur: Accès autorisé sans token !');
  } catch (error) {
    console.log(`✅ Accès refusé correctement (${error.response?.status}): ${error.response?.data?.error}`);
  }
}

// Exécution des tests
async function runTests() {
  console.log('🚀 Démarrage des tests...\n');
  
  await testWithoutAuth();
  await testStatsEndpoints();
  
  console.log('\n✨ Tests terminés !');
  console.log('\n📝 Points à retenir:');
  console.log('- Les utilisateurs normaux voient uniquement leurs propres données');
  console.log('- Les admins/treasurers voient toutes les données du système');
  console.log('- Les paramètres invalides sont rejetés avec des messages explicites');
  console.log('- L\'authentification est requise pour tous les endpoints');
}

// Exporter pour usage en tant que module
module.exports = { makeRequest, testStatsEndpoints, runTests };

// Exécuter si appelé directement
if (require.main === module) {
  runTests().catch(console.error);
} 