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

// Test de création d'utilisateur avec génération automatique d'ID partenaire
const testUserCreation = async () => {
  try {
    console.log('🧪 Test de création d\'utilisateur avec ID partenaire automatique...');
    
    const testUser = {
      firstName: 'Test',
      lastName: 'Partner',
      email: `test.partner.${Date.now()}@example.com`,
      phone: `+33${Math.floor(Math.random() * 1000000000)}`,
      password: 'testpassword123',
      country: 'France',
      city: 'Paris',
      language: 'fr',
      currency: 'EUR'
    };
    
    console.log('📝 Données utilisateur de test:', {
      ...testUser,
      password: '[HIDDEN]'
    });
    
    // Créer l'utilisateur (l'ID partenaire devrait être généré automatiquement)
    const user = await User.create(testUser);
    
    console.log('✅ Utilisateur créé avec succès:');
    console.log(`   - ID: ${user._id}`);
    console.log(`   - Email: ${user.email}`);
    console.log(`   - Nom: ${user.firstName} ${user.lastName}`);
    console.log(`   - ID Partenaire: ${user.partnerId}`);
    console.log(`   - Niveau: ${user.partnerLevel}`);
    
    // Vérifier que l'ID partenaire est correct
    if (!user.partnerId) {
      throw new Error('❌ ID partenaire non généré');
    }
    
    if (user.partnerId.length !== 10) {
      throw new Error(`❌ ID partenaire invalide - longueur: ${user.partnerId.length} (attendu: 10)`);
    }
    
    // Vérifier le format (2 lettres + 8 alphanumériques)
    const partnerIdRegex = /^[A-Z]{2}[A-Z0-9]{8}$/;
    if (!partnerIdRegex.test(user.partnerId)) {
      throw new Error(`❌ ID partenaire format invalide: ${user.partnerId}`);
    }
    
    console.log('✅ Format de l\'ID partenaire validé');
    
    // Nettoyer - supprimer l'utilisateur de test
    await User.findByIdAndDelete(user._id);
    console.log('🧹 Utilisateur de test supprimé');
    
    return user.partnerId;
    
  } catch (error) {
    console.error('❌ Erreur test création utilisateur:', error.message);
    throw error;
  }
};

// Test de vérification d'unicité
const testUniqueness = async () => {
  try {
    console.log('\n🧪 Test d\'unicité des ID partenaire...');
    
    const generatedIds = new Set();
    const testCount = 100;
    
    console.log(`📊 Génération de ${testCount} utilisateurs de test...`);
    
    const createdUsers = [];
    
    for (let i = 0; i < testCount; i++) {
      const testUser = {
        firstName: `Test${i}`,
        lastName: 'Unique',
        email: `test.unique.${i}.${Date.now()}@example.com`,
        phone: `+33${Math.floor(Math.random() * 1000000000)}`,
        password: 'testpassword123',
        country: 'France',
        city: 'Paris',
        language: 'fr',
        currency: 'EUR'
      };
      
      try {
        const user = await User.create(testUser);
        createdUsers.push(user._id);
        
        if (generatedIds.has(user.partnerId)) {
          throw new Error(`❌ ID partenaire dupliqué détecté: ${user.partnerId}`);
        }
        
        generatedIds.add(user.partnerId);
        
        if ((i + 1) % 10 === 0) {
          process.stdout.write(`${i + 1}/${testCount} `);
        }
        
      } catch (error) {
        // Nettoyer les utilisateurs créés en cas d'erreur
        await User.deleteMany({ _id: { $in: createdUsers } });
        throw error;
      }
    }
    
    console.log(`\n✅ ${testCount} ID partenaire uniques générés avec succès`);
    console.log(`📊 Exemples d'ID générés:`);
    
    const sampleIds = Array.from(generatedIds).slice(0, 10);
    sampleIds.forEach((id, index) => {
      console.log(`   ${index + 1}. ${id}`);
    });
    
    // Nettoyer tous les utilisateurs de test
    await User.deleteMany({ _id: { $in: createdUsers } });
    console.log('🧹 Tous les utilisateurs de test supprimés');
    
  } catch (error) {
    console.error('❌ Erreur test unicité:', error.message);
    throw error;
  }
};

// Test de performance
const testPerformance = async () => {
  try {
    console.log('\n🧪 Test de performance de génération d\'ID...');
    
    const startTime = Date.now();
    const testCount = 50;
    
    console.log(`⏱️ Génération de ${testCount} utilisateurs (test de performance)...`);
    
    const createdUsers = [];
    
    for (let i = 0; i < testCount; i++) {
      const testUser = {
        firstName: `Perf${i}`,
        lastName: 'Test',
        email: `perf.test.${i}.${Date.now()}@example.com`,
        phone: `+33${Math.floor(Math.random() * 1000000000)}`,
        password: 'testpassword123',
        country: 'France',
        city: 'Paris',
        language: 'fr',
        currency: 'EUR'
      };
      
      const user = await User.create(testUser);
      createdUsers.push(user._id);
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    const averageTime = duration / testCount;
    
    console.log(`✅ Performance validée:`);
    console.log(`   - Total: ${duration}ms`);
    console.log(`   - Moyenne par utilisateur: ${averageTime.toFixed(2)}ms`);
    console.log(`   - Utilisateurs/seconde: ${(1000 / averageTime).toFixed(2)}`);
    
    // Nettoyer
    await User.deleteMany({ _id: { $in: createdUsers } });
    console.log('🧹 Utilisateurs de test de performance supprimés');
    
  } catch (error) {
    console.error('❌ Erreur test performance:', error.message);
    throw error;
  }
};

// Test de validation du modèle
const testModelValidation = async () => {
  try {
    console.log('\n🧪 Test de validation du modèle User...');
    
    // Test d'utilisateur sans ID partenaire (ne devrait pas échouer car auto-généré)
    const user1 = new User({
      firstName: 'Test',
      lastName: 'Validation',
      email: `validation.test.${Date.now()}@example.com`,
      phone: `+33${Math.floor(Math.random() * 1000000000)}`,
      password: 'testpassword123',
      country: 'France',
      city: 'Paris',
    });
    
    await user1.save();
    console.log(`✅ Utilisateur créé avec ID auto-généré: ${user1.partnerId}`);
    
    // Test d'unicité - essayer de créer un utilisateur avec le même ID partenaire
    try {
      const user2 = new User({
        firstName: 'Test2',
        lastName: 'Validation',
        email: `validation.test2.${Date.now()}@example.com`,
        phone: `+33${Math.floor(Math.random() * 1000000000)}`,
        password: 'testpassword123',
        country: 'France',
        city: 'Paris',
        partnerId: user1.partnerId // Même ID partenaire
      });
      
      await user2.save();
      
      // Si on arrive ici, l'unicité n'est pas respectée
      await User.deleteMany({ _id: { $in: [user1._id, user2._id] } });
      throw new Error('❌ L\'unicité de l\'ID partenaire n\'est pas respectée');
      
    } catch (duplicateError) {
      if (duplicateError.code === 11000) {
        console.log('✅ Contrainte d\'unicité validée - duplication rejetée');
      } else {
        throw duplicateError;
      }
    }
    
    // Nettoyer
    await User.findByIdAndDelete(user1._id);
    console.log('🧹 Utilisateur de validation supprimé');
    
  } catch (error) {
    console.error('❌ Erreur test validation:', error.message);
    throw error;
  }
};

// Fonction principale de test
const runAllTests = async () => {
  try {
    console.log('🚀 Début des tests d\'ID Partenaire');
    console.log('====================================\n');
    
    // Test 1: Création basique
    await testUserCreation();
    
    // Test 2: Unicité
    await testUniqueness();
    
    // Test 3: Performance
    await testPerformance();
    
    // Test 4: Validation du modèle
    await testModelValidation();
    
    console.log('\n🎉 Tous les tests passés avec succès !');
    console.log('✅ La génération d\'ID partenaire fonctionne correctement');
    
  } catch (error) {
    console.error('\n❌ Échec des tests:', error.message);
    throw error;
  }
};

// Fonction principale
const main = async () => {
  // Charger les variables d'environnement
  require('dotenv').config();
  
  try {
    await connectDB();
    await runAllTests();
    
  } catch (error) {
    console.error('❌ Erreur fatale:', error);
    process.exit(1);
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
  testUserCreation,
  testUniqueness,
  testPerformance,
  testModelValidation,
  runAllTests
};