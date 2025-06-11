/**
 * Script de test pour vérifier l'accès des utilisateurs normaux
 */

const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();

const API_BASE = process.env.NODE_ENV === 'production' 
  ? 'https://your-api-domain.com/api' 
  : 'http://localhost:5000/api';

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(colors[color] + message + colors.reset);
}

// Test des routes utilisateur
async function testUserRoutes() {
  log('\n🧪 Test d\'accès utilisateur normal\n', 'cyan');

  // Créer un utilisateur de test
  const testUser = {
    firstName: 'Test',
    lastName: 'User',
    email: `testuser_${Date.now()}@example.com`,
    phone: '+2250779038001',
    password: 'testpassword123',
    country: 'CI',
    city: 'Abidjan',
    language: 'fr',
    currency: 'XOF'
  };

  let userToken = null;
  let userId = null;

  try {
    // 1. Inscription
    log('📝 Étape 1: Inscription utilisateur...', 'blue');
    const registerResponse = await axios.post(`${API_BASE}/auth/register`, testUser);
    
    if (registerResponse.data.success) {
      userToken = registerResponse.data.data.token;
      userId = registerResponse.data.data.user.id;
      log('✅ Inscription réussie', 'green');
    } else {
      throw new Error('Inscription échouée');
    }

    // 2. Test accès au profil personnel
    log('\n👤 Étape 2: Test accès profil personnel...', 'blue');
    try {
      const profileResponse = await axios.get(`${API_BASE}/users/profile`, {
        headers: { Authorization: `Bearer ${userToken}` }
      });
      log('✅ Accès profil personnel: OK', 'green');
    } catch (error) {
      log(`❌ Erreur accès profil: ${error.response?.status} - ${error.response?.data?.error}`, 'red');
    }

    // 3. Test accès aux données utilisateur par ID
    log('\n📊 Étape 3: Test accès données par ID...', 'blue');
    try {
      const userResponse = await axios.get(`${API_BASE}/users/${userId}`, {
        headers: { Authorization: `Bearer ${userToken}` }
      });
      log('✅ Accès données par ID: OK', 'green');
    } catch (error) {
      log(`❌ Erreur accès données par ID: ${error.response?.status} - ${error.response?.data?.error}`, 'red');
    }

    // 4. Test accès aux donations
    log('\n💰 Étape 4: Test accès donations...', 'blue');
    try {
      const donationsResponse = await axios.get(`${API_BASE}/donations`, {
        headers: { Authorization: `Bearer ${userToken}` }
      });
      log(`✅ Accès donations: OK (${donationsResponse.data.data?.donations?.length || 0} donations)`, 'green');
    } catch (error) {
      log(`❌ Erreur accès donations: ${error.response?.status} - ${error.response?.data?.error}`, 'red');
    }

    // 5. Test accès aux statistiques de donations
    log('\n📈 Étape 5: Test accès statistiques donations...', 'blue');
    try {
      const statsResponse = await axios.get(`${API_BASE}/donations/stats`, {
        headers: { Authorization: `Bearer ${userToken}` }
      });
      log('✅ Accès stats donations: OK', 'green');
    } catch (error) {
      log(`❌ Erreur accès stats donations: ${error.response?.status} - ${error.response?.data?.error}`, 'red');
    }

    // 6. Test accès aux donations de l'utilisateur par ID
    log('\n🏦 Étape 6: Test accès donations par ID utilisateur...', 'blue');
    try {
      const userDonationsResponse = await axios.get(`${API_BASE}/users/${userId}/donations`, {
        headers: { Authorization: `Bearer ${userToken}` }
      });
      log('✅ Accès donations par ID utilisateur: OK', 'green');
    } catch (error) {
      log(`❌ Erreur accès donations par ID: ${error.response?.status} - ${error.response?.data?.error}`, 'red');
    }

    // 7. Test accès aux statistiques utilisateur
    log('\n📊 Étape 7: Test accès statistiques utilisateur...', 'blue');
    try {
      const userStatsResponse = await axios.get(`${API_BASE}/users/${userId}/stats`, {
        headers: { Authorization: `Bearer ${userToken}` }
      });
      log('✅ Accès stats utilisateur: OK', 'green');
    } catch (error) {
      log(`❌ Erreur accès stats utilisateur: ${error.response?.status} - ${error.response?.data?.error}`, 'red');
    }

    // 8. Test accès refusé aux paiements (devrait échouer)
    log('\n💳 Étape 8: Test accès paiements (devrait échouer)...', 'blue');
    try {
      const paymentsResponse = await axios.get(`${API_BASE}/payments`, {
        headers: { Authorization: `Bearer ${userToken}` }
      });
      log('⚠️ Accès paiements: INATTENDU - l\'utilisateur ne devrait pas y accéder', 'yellow');
    } catch (error) {
      if (error.response?.status === 403) {
        log('✅ Accès paiements correctement refusé (403)', 'green');
      } else {
        log(`❌ Erreur inattendue paiements: ${error.response?.status}`, 'red');
      }
    }

    // 9. Test accès refusé aux stats paiements (devrait échouer)
    log('\n📊 Étape 9: Test accès stats paiements (devrait échouer)...', 'blue');
    try {
      const paymentStatsResponse = await axios.get(`${API_BASE}/payments/stats`, {
        headers: { Authorization: `Bearer ${userToken}` }
      });
      log('⚠️ Accès stats paiements: INATTENDU - l\'utilisateur ne devrait pas y accéder', 'yellow');
    } catch (error) {
      if (error.response?.status === 403) {
        log('✅ Accès stats paiements correctement refusé (403)', 'green');
      } else {
        log(`❌ Erreur inattendue stats paiements: ${error.response?.status}`, 'red');
      }
    }

    log('\n🎉 Test utilisateur terminé !', 'cyan');

  } catch (error) {
    log(`❌ Erreur globale: ${error.message}`, 'red');
  } finally {
    // Nettoyage
    if (userId) {
      try {
        await mongoose.connect(process.env.MONGODB_URI);
        const User = require('../models/User');
        const Profile = require('../models/Profile');
        
        await Profile.findOneAndDelete({ user: userId });
        await User.findByIdAndDelete(userId);
        await mongoose.disconnect();
        
        log('🧹 Utilisateur de test supprimé', 'blue');
      } catch (cleanupError) {
        log(`⚠️ Erreur nettoyage: ${cleanupError.message}`, 'yellow');
      }
    }
  }
}

// Test de validation des permissions
function testPermissionMatrix() {
  log('\n🔐 Test de la matrice des permissions\n', 'cyan');

  const expectedAccess = {
    'GET /api/users/profile': { user: true, support_agent: true, moderator: true, treasurer: true, admin: true },
    'GET /api/users/:id': { user: 'owner-only', support_agent: true, moderator: true, treasurer: true, admin: true },
    'GET /api/donations': { user: true, support_agent: true, moderator: true, treasurer: true, admin: true },
    'GET /api/donations/stats': { user: true, support_agent: true, moderator: true, treasurer: true, admin: true },
    'GET /api/payments': { user: false, support_agent: false, moderator: false, treasurer: true, admin: true },
    'GET /api/payments/stats': { user: false, support_agent: false, moderator: false, treasurer: true, admin: true },
    'GET /api/tickets/stats': { user: false, support_agent: true, moderator: true, treasurer: false, admin: true },
  };

  Object.entries(expectedAccess).forEach(([endpoint, access]) => {
    log(`📍 ${endpoint}:`, 'blue');
    Object.entries(access).forEach(([role, allowed]) => {
      const symbol = allowed === true ? '✅' : allowed === false ? '❌' : '🔄';
      const description = allowed === 'owner-only' ? 'propriétaire seulement' : allowed ? 'autorisé' : 'refusé';
      log(`    ${symbol} ${role}: ${description}`, allowed === true ? 'green' : allowed === false ? 'red' : 'yellow');
    });
  });
}

// Exécution
if (require.main === module) {
  testPermissionMatrix();
  testUserRoutes()
    .then(() => {
      log('\n✅ Tests terminés', 'green');
      process.exit(0);
    })
    .catch((error) => {
      log(`\n❌ Erreur tests: ${error.message}`, 'red');
      process.exit(1);
    });
}

module.exports = { testUserRoutes, testPermissionMatrix }; 