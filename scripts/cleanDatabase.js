const mongoose = require('mongoose');
require('dotenv').config();

// Import des modèles
const User = require('../models/User');
const Ministry = require('../models/Ministry');
const Donation = require('../models/Donation');
const Payment = require('../models/Payment');
const Profile = require('../models/Profile');
const Ticket = require('../models/Ticket');

console.log('🧹 Script de nettoyage de la base de données');

// Connexion à la base de données
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/partenaire-magb');
    console.log(`✅ MongoDB connecté: ${conn.connection.host}`);
  } catch (error) {
    console.error('❌ Erreur de connexion MongoDB:', error);
    process.exit(1);
  }
};

// Fonction pour afficher les statistiques avant nettoyage
const showStats = async () => {
  try {
    const userCount = await User.countDocuments();
    const ministryCount = await Ministry.countDocuments();
    const donationCount = await Donation.countDocuments();
    const paymentCount = await Payment.countDocuments();
    const profileCount = await Profile.countDocuments();
    const ticketCount = await Ticket.countDocuments();

    console.log('\n📊 Statistiques actuelles de la base de données:');
    console.log('================================================');
    console.log(`👥 Utilisateurs: ${userCount}`);
    console.log(`⛪ Ministères: ${ministryCount}`);
    console.log(`💰 Donations: ${donationCount}`);
    console.log(`💳 Paiements: ${paymentCount}`);
    console.log(`📋 Profils: ${profileCount}`);
    console.log(`🎫 Tickets: ${ticketCount}`);
    console.log('================================================\n');

    return {
      userCount,
      ministryCount,
      donationCount,
      paymentCount,
      profileCount,
      ticketCount
    };
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des statistiques:', error);
    return null;
  }
};

// Fonction pour nettoyer toutes les collections
const cleanAllCollections = async () => {
  try {
    console.log('🗑️ Suppression de toutes les données...');
    
    // Supprimer dans l'ordre pour éviter les problèmes de références
    await Payment.deleteMany({});
    console.log('✅ Paiements supprimés');
    
    await Donation.deleteMany({});
    console.log('✅ Donations supprimées');
    
    await Ticket.deleteMany({});
    console.log('✅ Tickets supprimés');
    
    await Profile.deleteMany({});
    console.log('✅ Profils supprimés');
    
    await User.deleteMany({});
    console.log('✅ Utilisateurs supprimés');
    
    await Ministry.deleteMany({});
    console.log('✅ Ministères supprimés');
    
    console.log('\n🎉 Base de données nettoyée avec succès !');
    
  } catch (error) {
    console.error('❌ Erreur lors du nettoyage:', error);
    throw error;
  }
};

// Fonction pour nettoyer seulement les données de test
const cleanTestData = async () => {
  try {
    console.log('🧪 Suppression des données de test...');
    
    // Supprimer les utilisateurs de test (garder les admins)
    const testUsers = await User.find({
      $or: [
        { email: { $regex: '@example\.com$' } },
        { email: { $regex: '@test\.com$' } },
        { role: 'user' }
      ]
    });
    
    const testUserIds = testUsers.map(user => user._id);
    
    // Supprimer les donations et paiements des utilisateurs de test
    await Payment.deleteMany({ user: { $in: testUserIds } });
    await Donation.deleteMany({ user: { $in: testUserIds } });
    await Profile.deleteMany({ user: { $in: testUserIds } });
    await User.deleteMany({ _id: { $in: testUserIds } });
    
    console.log(`✅ ${testUsers.length} utilisateurs de test et leurs données associées supprimés`);
    
  } catch (error) {
    console.error('❌ Erreur lors du nettoyage des données de test:', error);
    throw error;
  }
};

// Fonction pour confirmer l'action
const confirmAction = () => {
  return new Promise((resolve) => {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const action = process.argv[2] || 'all';
    const message = action === 'test' 
      ? 'Voulez-vous vraiment supprimer les données de test ? (oui/non): '
      : 'Voulez-vous vraiment supprimer TOUTES les données ? (oui/non): ';

    readline.question(message, (answer) => {
      readline.close();
      resolve(answer.toLowerCase() === 'oui' || answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
};

// Fonction principale
const cleanDatabase = async () => {
  try {
    console.log('🚀 Démarrage du processus de nettoyage...');
    
    // Connexion à la base de données
    await connectDB();
    
    // Afficher les statistiques
    const statsBefore = await showStats();
    
    // Vérifier le mode (all ou test)
    const mode = process.argv[2] || 'all';
    
    if (mode !== 'force') {
      // Demander confirmation
      const confirmed = await confirmAction();
      if (!confirmed) {
        console.log('❌ Opération annulée par l\'utilisateur');
        process.exit(0);
      }
    }
    
    // Nettoyer selon le mode
    if (mode === 'test') {
      await cleanTestData();
    } else {
      await cleanAllCollections();
    }
    
    // Afficher les nouvelles statistiques
    console.log('\n📊 Statistiques après nettoyage:');
    await showStats();
    
    console.log('✅ Nettoyage terminé avec succès !');
    
  } catch (error) {
    console.error('❌ Erreur lors du nettoyage:', error);
    process.exit(1);
  } finally {
    // Fermer la connexion
    await mongoose.connection.close();
    console.log('🔌 Connexion MongoDB fermée');
    process.exit(0);
  }
};

// Usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node scripts/cleanDatabase.js [mode]

Modes:
  all     - Supprime toutes les données (par défaut)
  test    - Supprime seulement les données de test
  force   - Force la suppression sans confirmation

Exemples:
  node scripts/cleanDatabase.js           # Supprime tout (avec confirmation)
  node scripts/cleanDatabase.js test     # Supprime les données de test
  node scripts/cleanDatabase.js force    # Supprime tout sans confirmation
    `);
    process.exit(0);
  }
  
  cleanDatabase();
}

module.exports = {
  cleanDatabase,
  cleanAllCollections,
  cleanTestData,
  showStats
};
