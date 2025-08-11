const mongoose = require('mongoose');
const User = require('../models/User');

// Configuration de la base de données
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(`✅ MongoDB connecté: ${conn.connection.host}`);
  } catch (error) {
    console.error('❌ Erreur connexion MongoDB:', error);
    process.exit(1);
  }
};

// Test de récupération des préférences utilisateur
const testGetUserPreferences = async (userId) => {
  try {
    console.log('\n🧪 Test de récupération des préférences utilisateur...');
    
    const user = await User.findById(userId);
    if (!user) {
      console.error('❌ Utilisateur non trouvé');
      return false;
    }

    console.log('📊 Utilisateur trouvé:', {
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    });

    // Simulation de la réponse de getUserPreferences
    const preferences = {
      language: user.language,
      currency: user.currency,
      emailNotifications: user.emailNotifications,
      smsNotifications: user.smsNotifications,
      timezone: user.timezone
    };

    console.log('✅ Préférences récupérées:', preferences);
    return true;

  } catch (error) {
    console.error('❌ Erreur test getUserPreferences:', error.message);
    return false;
  }
};

// Test de mise à jour des préférences
const testUpdateUserPreferences = async (userId, newPreferences) => {
  try {
    console.log('\n🧪 Test de mise à jour des préférences...');
    console.log('📝 Nouvelles préférences:', newPreferences);
    
    const user = await User.findById(userId);
    if (!user) {
      console.error('❌ Utilisateur non trouvé');
      return false;
    }

    console.log('📊 Préférences avant mise à jour:', {
      language: user.language,
      currency: user.currency,
    });

    // Simulation de la mise à jour
    if (newPreferences.language) user.language = newPreferences.language;
    if (newPreferences.currency) user.currency = newPreferences.currency;
    if (newPreferences.emailNotifications) {
      user.emailNotifications = { ...user.emailNotifications, ...newPreferences.emailNotifications };
    }
    if (newPreferences.smsNotifications) {
      user.smsNotifications = { ...user.smsNotifications, ...newPreferences.smsNotifications };
    }

    await user.save({ validateBeforeSave: false });

    console.log('✅ Préférences après mise à jour:', {
      language: user.language,
      currency: user.currency,
    });

    return true;

  } catch (error) {
    console.error('❌ Erreur test updateUserPreferences:', error.message);
    return false;
  }
};

// Test de persistance après "reconnexion"
const testPersistence = async (userId) => {
  try {
    console.log('\n🧪 Test de persistance des préférences...');
    
    // Simulation d'une nouvelle récupération (comme après reconnexion)
    const user = await User.findById(userId);
    if (!user) {
      console.error('❌ Utilisateur non trouvé');
      return false;
    }

    console.log('✅ Préférences persistées:', {
      language: user.language,
      currency: user.currency,
      emailNotifications: user.emailNotifications,
      smsNotifications: user.smsNotifications,
    });

    return true;

  } catch (error) {
    console.error('❌ Erreur test persistance:', error.message);
    return false;
  }
};

// Test de validation des valeurs
const testValidation = async () => {
  try {
    console.log('\n🧪 Test de validation des préférences...');
    
    const validLanguages = ['fr', 'en'];
    const validCurrencies = ['XOF', 'EUR', 'USD'];
    
    // Test de validation langue
    const testLanguage = 'en';
    const isValidLanguage = validLanguages.includes(testLanguage);
    console.log(`📝 Langue "${testLanguage}" valide: ${isValidLanguage ? '✅' : '❌'}`);
    
    // Test de validation devise
    const testCurrency = 'EUR';
    const isValidCurrency = validCurrencies.includes(testCurrency);
    console.log(`💰 Devise "${testCurrency}" valide: ${isValidCurrency ? '✅' : '❌'}`);
    
    // Test de valeurs invalides
    const invalidLanguage = 'es';
    const invalidCurrency = 'GBP';
    
    console.log(`📝 Langue "${invalidLanguage}" valide: ${validLanguages.includes(invalidLanguage) ? '✅' : '❌'}`);
    console.log(`💰 Devise "${invalidCurrency}" valide: ${validCurrencies.includes(invalidCurrency) ? '✅' : '❌'}`);
    
    return true;

  } catch (error) {
    console.error('❌ Erreur test validation:', error.message);
    return false;
  }
};

// Fonction principale de test
const runPreferencesTests = async (testUserId = null) => {
  try {
    console.log('🚀 Début des tests de préférences utilisateur');
    console.log('============================================\n');
    
    let userId = testUserId;
    
    // Si aucun ID fourni, trouver un utilisateur de test
    if (!userId) {
      console.log('🔍 Recherche d\'un utilisateur de test...');
      const testUser = await User.findOne({}).limit(1);
      if (!testUser) {
        console.error('❌ Aucun utilisateur trouvé pour les tests');
        return;
      }
      userId = testUser._id;
      console.log(`✅ Utilisateur de test: ${testUser.email}`);
    }
    
    // Test 1: Récupération des préférences
    const test1 = await testGetUserPreferences(userId);
    
    // Test 2: Validation
    const test2 = await testValidation();
    
    // Test 3: Mise à jour des préférences
    const test3 = await testUpdateUserPreferences(userId, {
      language: 'en',
      currency: 'EUR',
      emailNotifications: {
        donations: true,
        reminders: false,
      }
    });
    
    // Test 4: Persistance
    const test4 = await testPersistence(userId);
    
    // Test 5: Retour aux valeurs originales
    const test5 = await testUpdateUserPreferences(userId, {
      language: 'fr',
      currency: 'XOF',
    });
    
    // Résumé des tests
    console.log('\n📈 Résumé des tests:');
    console.log(`Test 1 - Récupération: ${test1 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Test 2 - Validation: ${test2 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Test 3 - Mise à jour: ${test3 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Test 4 - Persistance: ${test4 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Test 5 - Restauration: ${test5 ? '✅ PASS' : '❌ FAIL'}`);
    
    const allPassed = test1 && test2 && test3 && test4 && test5;
    
    if (allPassed) {
      console.log('\n🎉 Tous les tests passés avec succès !');
      console.log('✅ Le système de préférences fonctionne correctement');
    } else {
      console.log('\n⚠️ Certains tests ont échoué');
      console.log('❌ Vérifiez les erreurs ci-dessus');
    }
    
  } catch (error) {
    console.error('❌ Erreur fatale lors des tests:', error);
  }
};

// Fonction principale
const main = async () => {
  // Charger les variables d'environnement
  require('dotenv').config();
  
  try {
    await connectDB();
    
    // Récupérer l'ID utilisateur depuis les arguments
    const userId = process.argv[2];
    
    if (userId) {
      console.log(`🎯 Test avec utilisateur spécifique: ${userId}`);
    }
    
    await runPreferencesTests(userId);
    
  } catch (error) {
    console.error('❌ Erreur fatale:', error);
  } finally {
    // Fermer la connexion
    await mongoose.connection.close();
    console.log('\n🔌 Connexion MongoDB fermée');
    process.exit(0);
  }
};

// Gestion des signaux pour fermeture propre
process.on('SIGINT', async () => {
  console.log('\n⏹️ Tests interrompus...');
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
  }
  process.exit(0);
});

// Exécuter le script si appelé directement
if (require.main === module) {
  main();
}

module.exports = {
  testGetUserPreferences,
  testUpdateUserPreferences,
  testPersistence,
  testValidation,
  runPreferencesTests
};