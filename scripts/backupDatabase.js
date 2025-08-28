const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// Import des modèles
const User = require('../models/User');
const Ministry = require('../models/Ministry');
const Donation = require('../models/Donation');
const Payment = require('../models/Payment');
const Profile = require('../models/Profile');
const Ticket = require('../models/Ticket');

console.log('💾 Script de sauvegarde de la base de données');

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

// Fonction pour créer le dossier de backup
const createBackupDir = async () => {
  const backupDir = path.join(__dirname, '..', 'backups');
  try {
    await fs.mkdir(backupDir, { recursive: true });
    return backupDir;
  } catch (error) {
    console.error('❌ Erreur lors de la création du dossier backup:', error);
    throw error;
  }
};

// Fonction pour exporter une collection
const exportCollection = async (Model, collectionName) => {
  try {
    console.log(`📤 Export de la collection ${collectionName}...`);
    
    const data = await Model.find({}).lean();
    console.log(`✅ ${data.length} documents trouvés dans ${collectionName}`);
    
    return {
      collection: collectionName,
      count: data.length,
      data: data
    };
  } catch (error) {
    console.error(`❌ Erreur lors de l'export de ${collectionName}:`, error);
    throw error;
  }
};

// Fonction pour créer un backup complet
const createFullBackup = async () => {
  try {
    console.log('🗂️ Création du backup complet...');
    
    const collections = [
      { model: User, name: 'users' },
      { model: Ministry, name: 'ministries' },
      { model: Donation, name: 'donations' },
      { model: Payment, name: 'payments' },
      { model: Profile, name: 'profiles' },
      { model: Ticket, name: 'tickets' }
    ];
    
    const backup = {
      metadata: {
        createdAt: new Date().toISOString(),
        version: '1.0.0',
        database: process.env.MONGODB_URI || 'mongodb://localhost:27017/partenaire-magb',
        environment: process.env.NODE_ENV || 'development'
      },
      collections: {}
    };
    
    let totalDocuments = 0;
    
    for (const { model, name } of collections) {
      const collectionData = await exportCollection(model, name);
      backup.collections[name] = collectionData;
      totalDocuments += collectionData.count;
    }
    
    backup.metadata.totalDocuments = totalDocuments;
    
    console.log(`✅ Backup créé avec ${totalDocuments} documents au total`);
    return backup;
    
  } catch (error) {
    console.error('❌ Erreur lors de la création du backup:', error);
    throw error;
  }
};

// Fonction pour sauvegarder dans un fichier
const saveBackupToFile = async (backup, filename) => {
  try {
    const backupDir = await createBackupDir();
    const filePath = path.join(backupDir, filename);
    
    console.log(`💾 Sauvegarde vers ${filePath}...`);
    
    await fs.writeFile(filePath, JSON.stringify(backup, null, 2), 'utf8');
    
    const stats = await fs.stat(filePath);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    
    console.log(`✅ Backup sauvegardé: ${filename} (${fileSizeMB} MB)`);
    
    return filePath;
  } catch (error) {
    console.error('❌ Erreur lors de la sauvegarde:', error);
    throw error;
  }
};

// Fonction pour générer le nom du fichier de backup
const generateBackupFilename = (prefix = 'backup') => {
  const now = new Date();
  const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const time = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
  const env = process.env.NODE_ENV || 'dev';
  
  return `${prefix}_${env}_${date}_${time}.json`;
};

// Fonction pour nettoyer les anciens backups
const cleanOldBackups = async (keepCount = 10) => {
  try {
    const backupDir = path.join(__dirname, '..', 'backups');
    
    const files = await fs.readdir(backupDir);
    const backupFiles = files
      .filter(file => file.endsWith('.json') && file.startsWith('backup_'))
      .map(file => ({
        name: file,
        path: path.join(backupDir, file)
      }));
    
    if (backupFiles.length <= keepCount) {
      console.log(`📁 ${backupFiles.length} backups trouvés, aucun nettoyage nécessaire`);
      return;
    }
    
    // Trier par date de modification (plus récent en premier)
    const filesWithStats = await Promise.all(
      backupFiles.map(async (file) => {
        const stats = await fs.stat(file.path);
        return { ...file, mtime: stats.mtime };
      })
    );
    
    filesWithStats.sort((a, b) => b.mtime - a.mtime);
    
    // Supprimer les anciens fichiers
    const filesToDelete = filesWithStats.slice(keepCount);
    
    for (const file of filesToDelete) {
      await fs.unlink(file.path);
      console.log(`🗑️ Ancien backup supprimé: ${file.name}`);
    }
    
    console.log(`✅ ${filesToDelete.length} anciens backups supprimés`);
    
  } catch (error) {
    console.error('❌ Erreur lors du nettoyage des anciens backups:', error);
    // Ne pas faire échouer le processus principal
  }
};

// Fonction pour afficher les statistiques du backup
const showBackupStats = (backup) => {
  console.log('\n📊 Statistiques du backup:');
  console.log('============================');
  console.log(`📅 Date: ${backup.metadata.createdAt}`);
  console.log(`🏷️ Environnement: ${backup.metadata.environment}`);
  console.log(`📝 Total documents: ${backup.metadata.totalDocuments}`);
  console.log('');
  
  Object.entries(backup.collections).forEach(([name, data]) => {
    console.log(`${getCollectionIcon(name)} ${name}: ${data.count} documents`);
  });
  console.log('============================\n');
};

// Fonction pour obtenir l'icône d'une collection
const getCollectionIcon = (collectionName) => {
  const icons = {
    users: '👥',
    ministries: '⛪',
    donations: '💰',
    payments: '💳',
    profiles: '📋',
    tickets: '🎫'
  };
  return icons[collectionName] || '📄';
};

// Fonction principale
const backupDatabase = async () => {
  try {
    console.log('🚀 Démarrage du processus de backup...');
    
    // Connexion à la base de données
    await connectDB();
    
    // Créer le backup
    const backup = await createFullBackup();
    
    // Afficher les statistiques
    showBackupStats(backup);
    
    // Générer le nom du fichier
    const filename = generateBackupFilename();
    
    // Sauvegarder dans un fichier
    const filePath = await saveBackupToFile(backup, filename);
    
    // Nettoyer les anciens backups
    const keepCount = parseInt(process.argv[3]) || 10;
    await cleanOldBackups(keepCount);
    
    console.log('🎉 Backup terminé avec succès !');
    console.log(`📁 Fichier: ${filePath}`);
    
    return filePath;
    
  } catch (error) {
    console.error('❌ Erreur lors du backup:', error);
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
Usage: node scripts/backupDatabase.js [options]

Options:
  --help, -h          Affiche cette aide
  [keepCount]         Nombre de backups à conserver (défaut: 10)

Exemples:
  node scripts/backupDatabase.js           # Backup avec 10 fichiers conservés
  node scripts/backupDatabase.js 5        # Backup avec 5 fichiers conservés
    `);
    process.exit(0);
  }
  
  backupDatabase();
}

module.exports = {
  backupDatabase,
  createFullBackup,
  saveBackupToFile,
  cleanOldBackups
};
