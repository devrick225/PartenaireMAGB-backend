const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();

const API_BASE = 'http://localhost:5000/api';

// Données de test pour l'inscription
const testUserData = {
  firstName: 'Jean',
  lastName: 'Kouassi',
  email: `test_${Date.now()}@example.com`,
  phone: '+2250779038069',
  password: 'testpassword123',
  country: 'CI',
  city: 'Abidjan',
  language: 'fr',
  currency: 'XOF'
};

async function testRegistration() {
  try {
    console.log('🧪 Test d\'inscription et création automatique de profil...');
    console.log('📋 Données de test:', testUserData);

    // 1. Tester l'inscription
    console.log('\n📝 Étape 1: Inscription...');
    const registerResponse = await axios.post(`${API_BASE}/auth/register`, testUserData);
    
    if (registerResponse.data.success) {
      console.log('✅ Inscription réussie!');
      console.log('👤 Utilisateur créé:', {
        id: registerResponse.data.data.user.id,
        nom: `${registerResponse.data.data.user.firstName} ${registerResponse.data.data.user.lastName}`,
        email: registerResponse.data.data.user.email,
        profileComplete: registerResponse.data.data.user.profileComplete,
        profileCompletionPercentage: registerResponse.data.data.user.profileCompletionPercentage
      });
      
      const token = registerResponse.data.data.token;
      const userId = registerResponse.data.data.user.id;

      // 2. Vérifier que le profil a été créé automatiquement
      console.log('\n🔍 Étape 2: Vérification du profil...');
      const profileResponse = await axios.get(`${API_BASE}/users/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (profileResponse.data.success) {
        console.log('✅ Profil automatique créé!');
        console.log('📊 Profil détails:', {
          id: profileResponse.data.data.profile.id,
          userId: profileResponse.data.data.profile.user,
          isComplete: profileResponse.data.data.profile.isComplete,
          completionPercentage: profileResponse.data.data.profile.profileCompletionPercentage,
          pays: profileResponse.data.data.profile.address?.country,
          langue: profileResponse.data.data.profile.communicationPreferences?.language
        });
      } else {
        console.log('❌ Échec récupération profil:', profileResponse.data);
      }

      // 3. Tester la connexion
      console.log('\n🔐 Étape 3: Test de connexion...');
      const loginResponse = await axios.post(`${API_BASE}/auth/login`, {
        email: testUserData.email,
        password: testUserData.password
      });

      if (loginResponse.data.success) {
        console.log('✅ Connexion réussie!');
        console.log('🎯 Token généré:', loginResponse.data.data.token ? 'Oui' : 'Non');
        console.log('📈 Profil completion:', `${loginResponse.data.data.user.profileCompletionPercentage || 0}%`);
      } else {
        console.log('❌ Échec connexion:', loginResponse.data);
      }

      // 4. Tester les données utilisateur après connexion
      console.log('\n👤 Étape 4: Récupération profil utilisateur...');
      const meResponse = await axios.get(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${loginResponse.data.data.token}` }
      });

      if (meResponse.data.success) {
        console.log('✅ Données utilisateur récupérées!');
        const user = meResponse.data.data.user;
        console.log('📊 Statistiques utilisateur:', {
          totalDonations: user.totalDonations,
          donationCount: user.donationCount,
          points: user.points,
          level: user.level,
          hasProfile: !!user.profile
        });
      }

      console.log('\n🎉 Test complet terminé avec succès!');
      
    } else {
      console.log('❌ Échec inscription:', registerResponse.data);
    }

  } catch (error) {
    console.error('❌ Erreur lors du test:', error.response?.data || error.message);
  } finally {
    // Optionnel: nettoyer les données de test
    if (testUserData.email) {
      try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/partenaire-magb');
        const User = require('../models/User');
        const Profile = require('../models/Profile');
        
        const user = await User.findOne({ email: testUserData.email });
        if (user) {
          // Supprimer le profil d'abord
          await Profile.findOneAndDelete({ user: user._id });
          // Puis l'utilisateur
          await User.findByIdAndDelete(user._id);
          console.log('🧹 Données de test nettoyées');
        }
        
        await mongoose.disconnect();
      } catch (cleanupError) {
        console.error('⚠️ Erreur nettoyage:', cleanupError.message);
      }
    }
  }
}

// Exécuter le test
if (require.main === module) {
  testRegistration()
    .then(() => {
      console.log('✅ Script de test terminé');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Erreur script de test:', error);
      process.exit(1);
    });
}

module.exports = testRegistration; 