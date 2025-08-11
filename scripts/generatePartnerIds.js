require('dotenv').config({ path: '../.env' });
// Fallback si le fichier .env n'existe pas dans le répertoire parent
if (!process.env.MONGODB_URI) {
  require('dotenv').config({ path: '../../.env' });
}
const mongoose = require('mongoose');
const User = require('../models/User');

// Configuration de la base de données
const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      console.error('❌ Variable d\'environnement MONGODB_URI non définie');
      console.error('Veuillez vérifier votre fichier .env');
      process.exit(1);
    }
    
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

// Fonction pour générer un ID de partenaire unique
const generatePartnerId = async () => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let partnerId;
  let isUnique = false;
  let attempts = 0;
  const maxAttempts = 10;

  while (!isUnique && attempts < maxAttempts) {
    // Générer un ID de 10 caractères : 2 lettres + 8 chiffres/lettres
    let id = '';
    
    // Les 2 premiers caractères sont des lettres (pour faciliter la lecture)
    for (let i = 0; i < 2; i++) {
      id += characters.charAt(Math.floor(Math.random() * 26)); // Lettres seulement (A-Z)
    }
    
    // Les 8 caractères suivants sont alphanumériques
    for (let i = 0; i < 8; i++) {
      id += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    
    partnerId = id;
    
    // Vérifier l'unicité
    const existingUser = await User.findOne({ partnerId });
    if (!existingUser) {
      isUnique = true;
    }
    
    attempts++;
  }
  
  if (!isUnique) {
    throw new Error('Impossible de générer un ID partenaire unique après plusieurs tentatives');
  }
  
  return partnerId;
};

// Script principal de migration
const migratePartnerIds = async () => {
  try {
    console.log('🚀 Début de la migration des ID de partenaire...');
    
    // Trouver tous les utilisateurs sans ID de partenaire
    const usersWithoutPartnerId = await User.find({
      $or: [
        { partnerId: { $exists: false } },
        { partnerId: null },
        { partnerId: '' }
      ]
    });
    
    console.log(`📊 ${usersWithoutPartnerId.length} utilisateur(s) trouvé(s) sans ID de partenaire`);
    
    if (usersWithoutPartnerId.length === 0) {
      console.log('✅ Tous les utilisateurs ont déjà un ID de partenaire');
      return;
    }
    
    let successCount = 0;
    let errorCount = 0;
    
    // Traiter chaque utilisateur
    for (const user of usersWithoutPartnerId) {
      try {
        // Générer un nouvel ID de partenaire
        const partnerId = await generatePartnerId();
        
        // Mettre à jour l'utilisateur (en évitant le hook pre-save)
        await User.updateOne(
          { _id: user._id },
          { $set: { partnerId: partnerId } }
        );
        
        console.log(`✅ ID généré pour ${user.email}: ${partnerId}`);
        successCount++;
        
        // Petit délai pour éviter la surcharge
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`❌ Erreur pour ${user.email}:`, error.message);
        errorCount++;
      }
    }
    
    console.log('\n📈 Résumé de la migration:');
    console.log(`✅ Succès: ${successCount} utilisateur(s)`);
    console.log(`❌ Erreurs: ${errorCount} utilisateur(s)`);
    console.log(`📊 Total traité: ${successCount + errorCount} utilisateur(s)`);
    
    if (errorCount > 0) {
      console.log('\n⚠️ Certains utilisateurs n\'ont pas pu être traités. Vérifiez les erreurs ci-dessus.');
    } else {
      console.log('\n🎉 Migration terminée avec succès !');
    }
    
  } catch (error) {
    console.error('❌ Erreur lors de la migration:', error);
  }
};

// Fonction de validation post-migration
const validateMigration = async () => {
  try {
    console.log('\n🔍 Validation post-migration...');
    
    // Vérifier que tous les utilisateurs ont un ID de partenaire
    const usersWithoutPartnerId = await User.countDocuments({
      $or: [
        { partnerId: { $exists: false } },
        { partnerId: null },
        { partnerId: '' }
      ]
    });
    
    const totalUsers = await User.countDocuments();
    const usersWithPartnerId = await User.countDocuments({
      partnerId: { $exists: true, $ne: null, $ne: '' }
    });
    
    console.log(`📊 Total utilisateurs: ${totalUsers}`);
    console.log(`✅ Avec ID partenaire: ${usersWithPartnerId}`);
    console.log(`❌ Sans ID partenaire: ${usersWithoutPartnerId}`);
    
    // Vérifier l'unicité des ID
    const duplicateIds = await User.aggregate([
      {
        $match: {
          partnerId: { $exists: true, $ne: null, $ne: '' }
        }
      },
      {
        $group: {
          _id: '$partnerId',
          count: { $sum: 1 },
          users: { $push: { id: '$_id', email: '$email' } }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      }
    ]);
    
    if (duplicateIds.length > 0) {
      console.log('⚠️ ID de partenaire dupliqués trouvés:');
      duplicateIds.forEach(dup => {
        console.log(`  - ID: ${dup._id} (${dup.count} utilisateurs)`);
        dup.users.forEach(user => {
          console.log(`    - ${user.email}`);
        });
      });
    } else {
      console.log('✅ Tous les ID de partenaire sont uniques');
    }
    
    if (usersWithoutPartnerId === 0 && duplicateIds.length === 0) {
      console.log('\n🎉 Validation réussie ! La migration est complète et correcte.');
    } else {
      console.log('\n⚠️ La validation a détecté des problèmes. Vérifiez les détails ci-dessus.');
    }
    
  } catch (error) {
    console.error('❌ Erreur lors de la validation:', error);
  }
};

// Fonction principale
const main = async () => {
  // Charger les variables d'environnement
  require('dotenv').config();
  
  try {
    await connectDB();
    
    console.log('🔧 Script de Migration des ID de Partenaire');
    console.log('==========================================\n');
    
    // Exécuter la migration
    await migratePartnerIds();
    
    // Valider les résultats
    await validateMigration();
    
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
  console.log('\n⏹️ Arrêt demandé...');
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n⏹️ Terminaison demandée...');
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
  generatePartnerId,
  migratePartnerIds,
  validateMigration
};