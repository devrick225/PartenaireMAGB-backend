const mongoose = require('mongoose');
require('dotenv').config();

// Import des modèles pour tester les schémas
const User = require('../models/User');
const Ministry = require('../models/Ministry');
const Donation = require('../models/Donation');
const Payment = require('../models/Payment');

console.log('🔍 Test de connexion à la base de données MongoDB');

// Fonction pour tester la connexion
const testConnection = async () => {
  try {
    console.log('📡 Tentative de connexion à MongoDB...');
    console.log(`🔗 URI: ${process.env.MONGODB_URI || 'mongodb://localhost:27017/partenaire-magb'}`);
    
    const conn = await mongoose.connect(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/partenaire-magb'
    );
    
    console.log(`✅ Connexion réussie à: ${conn.connection.host}`);
    console.log(`📊 Base de données: ${conn.connection.name}`);
    console.log(`🔌 Port: ${conn.connection.port}`);
    console.log(`📋 État: ${conn.connection.readyState === 1 ? 'Connecté' : 'Déconnecté'}`);
    
    return conn;
  } catch (error) {
    console.error('❌ Erreur de connexion:', error.message);
    throw error;
  }
};

// Fonction pour vérifier les collections
const checkCollections = async () => {
  try {
    console.log('\n📂 Vérification des collections...');
    
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`✅ ${collections.length} collections trouvées:`);
    
    for (const collection of collections) {
      const count = await mongoose.connection.db.collection(collection.name).countDocuments();
      console.log(`  📁 ${collection.name}: ${count} documents`);
    }
    
  } catch (error) {
    console.error('❌ Erreur lors de la vérification des collections:', error);
  }
};

// Fonction pour tester les modèles
const testModels = async () => {
  try {
    console.log('\n🧪 Test des modèles Mongoose...');
    
    const models = [
      { name: 'User', model: User },
      { name: 'Ministry', model: Ministry },
      { name: 'Donation', model: Donation },
      { name: 'Payment', model: Payment }
    ];
    
    for (const { name, model } of models) {
      try {
        // Tenter une requête simple pour vérifier le modèle
        await model.findOne({}).lean().limit(1);
        console.log(`  ✅ Modèle ${name}: OK`);
      } catch (error) {
        console.log(`  ❌ Modèle ${name}: Erreur - ${error.message}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Erreur lors du test des modèles:', error);
  }
};

// Fonction pour vérifier les index
const checkIndexes = async () => {
  try {
    console.log('\n📇 Vérification des index...');
    
    const collections = ['users', 'ministries', 'donations', 'payments'];
    
    for (const collectionName of collections) {
      try {
        const indexes = await mongoose.connection.db.collection(collectionName).indexes();
        console.log(`  📁 ${collectionName}: ${indexes.length} index`);
        
        // Afficher les index principaux
        indexes.forEach(index => {
          const keys = Object.keys(index.key).join(', ');
          console.log(`    - ${index.name}: [${keys}]${index.unique ? ' (unique)' : ''}`);
        });
      } catch (error) {
        console.log(`  ⚠️ Collection ${collectionName} non trouvée`);
      }
    }
    
  } catch (error) {
    console.error('❌ Erreur lors de la vérification des index:', error);
  }
};

// Fonction pour tester une opération CRUD simple
const testCRUD = async () => {
  try {
    console.log('\n⚡ Test CRUD rapide...');
    
    // Test de création d'un document temporaire
    const testUser = new User({
      firstName: 'Test',
      lastName: 'User',
      email: `test_${Date.now()}@example.com`,
      phone: `+225${Math.random().toString().substr(2, 8)}`,
      password: 'Test123456!',
      country: 'Test Country',
      city: 'Test City'
    });
    
    // Sauvegarder
    const savedUser = await testUser.save();
    console.log(`  ✅ CREATE: Utilisateur créé (ID: ${savedUser._id})`);
    
    // Lire
    const foundUser = await User.findById(savedUser._id);
    console.log(`  ✅ READ: Utilisateur trouvé (${foundUser.email})`);
    
    // Mettre à jour
    foundUser.firstName = 'TestUpdated';
    await foundUser.save();
    console.log(`  ✅ UPDATE: Utilisateur mis à jour`);
    
    // Supprimer
    await User.deleteOne({ _id: savedUser._id });
    console.log(`  ✅ DELETE: Utilisateur supprimé`);
    
    console.log('  🎉 Test CRUD réussi !');
    
  } catch (error) {
    console.error('❌ Erreur lors du test CRUD:', error);
  }
};

// Fonction pour afficher les informations de l'environnement
const showEnvironmentInfo = () => {
  console.log('\n🌍 Informations d\'environnement:');
  console.log('================================');
  console.log(`📝 NODE_ENV: ${process.env.NODE_ENV || 'non défini'}`);
  console.log(`🔗 MONGODB_URI: ${process.env.MONGODB_URI ? '✅ défini' : '❌ non défini'}`);
  console.log(`🔐 JWT_SECRET: ${process.env.JWT_SECRET ? '✅ défini' : '❌ non défini'}`);
  console.log(`📧 EMAIL_USER: ${process.env.EMAIL_USER ? '✅ défini' : '❌ non défini'}`);
  console.log(`📱 TWILIO_ACCOUNT_SID: ${process.env.TWILIO_ACCOUNT_SID ? '✅ défini' : '❌ non défini'}`);
  console.log(`☁️ CLOUDINARY_CLOUD_NAME: ${process.env.CLOUDINARY_CLOUD_NAME ? '✅ défini' : '❌ non défini'}`);
  console.log('================================');
};

// Fonction principale
const runTests = async () => {
  try {
    console.log('🚀 Démarrage des tests de connexion...\n');
    
    // Afficher les informations d'environnement
    showEnvironmentInfo();
    
    // Tester la connexion
    const connection = await testConnection();
    
    // Vérifier les collections
    await checkCollections();
    
    // Tester les modèles
    await testModels();
    
    // Vérifier les index
    await checkIndexes();
    
    // Test CRUD si demandé
    const args = process.argv.slice(2);
    if (args.includes('--crud') || args.includes('-c')) {
      await testCRUD();
    }
    
    console.log('\n🎉 Tous les tests sont passés avec succès !');
    console.log('✅ Votre base de données est prête à l\'utilisation');
    
    if (!args.includes('--crud')) {
      console.log('\n💡 Conseil: Utilisez --crud pour tester les opérations CRUD');
    }
    
  } catch (error) {
    console.error('\n❌ Échec des tests:', error.message);
    
    // Suggestions de dépannage
    console.log('\n🔧 Suggestions de dépannage:');
    console.log('1. Vérifiez que MongoDB est démarré');
    console.log('2. Vérifiez votre MONGODB_URI dans le fichier .env');
    console.log('3. Vérifiez que vous avez les bonnes permissions');
    console.log('4. Essayez: npm run setup pour initialiser la base');
    
    process.exit(1);
  } finally {
    // Fermer la connexion
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('\n🔌 Connexion fermée');
    }
    process.exit(0);
  }
};

// Usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node scripts/testConnection.js [options]

Options:
  --help, -h     Affiche cette aide
  --crud, -c     Inclut un test CRUD complet

Exemples:
  node scripts/testConnection.js           # Test de base
  node scripts/testConnection.js --crud   # Test avec CRUD
    `);
    process.exit(0);
  }
  
  runTests();
}

module.exports = {
  testConnection,
  checkCollections,
  testModels,
  checkIndexes,
  testCRUD
};
