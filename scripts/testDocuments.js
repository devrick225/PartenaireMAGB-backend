const mongoose = require('mongoose');
const User = require('../models/User');
const Donation = require('../models/Donation');
// const RecurringDonation = require('../models/RecurringDonation'); // supprimé: on utilise Donation(type='recurring')
const pdfService = require('../services/pdfService');
const excelService = require('../services/excelService');
const fs = require('fs');
const path = require('path');

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

// Test de génération d'un reçu PDF
const testDonationReceiptPDF = async (donationId) => {
  try {
    console.log('\n🧪 Test génération reçu PDF...');
    
    const donation = await Donation.findById(donationId)
      .populate('user', 'firstName lastName email phone partnerId')
      .populate('payment');

    if (!donation) {
      console.error('❌ Donation non trouvée');
      return false;
    }

    console.log('📊 Donation trouvée:', {
      id: donation._id,
      amount: donation.amount,
      currency: donation.currency,
      status: donation.status,
      user: `${donation.user.firstName} ${donation.user.lastName}`
    });

    const startTime = Date.now();
    const pdfBuffer = await pdfService.generateDonationReceipt(donation, donation.user);
    const generationTime = Date.now() - startTime;

    console.log('✅ PDF généré avec succès');
    console.log(`📏 Taille: ${(pdfBuffer.length / 1024).toFixed(2)} KB`);
    console.log(`⏱️ Temps de génération: ${generationTime}ms`);

    // Sauvegarder pour vérification
    const filename = `test_recu_${donation._id}.pdf`;
    const filepath = path.join(__dirname, '../temp/', filename);
    
    // Créer le dossier temp s'il n'existe pas
    const tempDir = path.dirname(filepath);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    fs.writeFileSync(filepath, pdfBuffer);
    console.log(`💾 Fichier sauvegardé: ${filepath}`);

    return true;
  } catch (error) {
    console.error('❌ Erreur test reçu PDF:', error.message);
    return false;
  }
};

// Test de génération d'un échéancier PDF
const testSchedulePDF = async (recurringDonationId) => {
  try {
    console.log('\n🧪 Test génération échéancier PDF...');
    
    // Utiliser Donation avec type='recurring'
    const donation = await Donation.findById(recurringDonationId)
      .populate('user', 'firstName lastName email phone partnerId');

    if (!donation || donation.type !== 'recurring') {
      console.error('❌ Don récurrent non trouvé ou type invalide');
      return false;
    }

    console.log('📊 Don récurrent trouvé:', {
      id: donation._id,
      amount: donation.amount,
      frequency: donation.recurring?.frequency,
      user: `${donation.user.firstName} ${donation.user.lastName}`
    });

    // Générer des occurrences de test
    const upcomingOccurrences = generateTestOccurrences(donation, 12);

    const startTime = Date.now();
    const pdfBuffer = await pdfService.generateDonationSchedule(
      donation, 
      upcomingOccurrences, 
      donation.user
    );
    const generationTime = Date.now() - startTime;

    console.log('✅ PDF échéancier généré avec succès');
    console.log(`📏 Taille: ${(pdfBuffer.length / 1024).toFixed(2)} KB`);
    console.log(`⏱️ Temps de génération: ${generationTime}ms`);

    // Sauvegarder pour vérification
    const filename = `test_echeancier_${donation._id}.pdf`;
    const filepath = path.join(__dirname, '../temp/', filename);
    
    const tempDir = path.dirname(filepath);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    fs.writeFileSync(filepath, pdfBuffer);
    console.log(`💾 Fichier sauvegardé: ${filepath}`);

    return true;
  } catch (error) {
    console.error('❌ Erreur test échéancier PDF:', error.message);
    return false;
  }
};

// Test de génération d'un échéancier Excel
const testScheduleExcel = async (recurringDonationId) => {
  try {
    console.log('\n🧪 Test génération échéancier Excel...');
    
    const donation = await Donation.findById(recurringDonationId)
      .populate('user', 'firstName lastName email phone partnerId');

    if (!donation || donation.type !== 'recurring') {
      console.error('❌ Don récurrent non trouvé ou type invalide');
      return false;
    }

    const upcomingOccurrences = generateTestOccurrences(donation, 24);

    const startTime = Date.now();
    const workbook = await excelService.generateDonationScheduleExcel(
      donation, 
      upcomingOccurrences, 
      donation.user
    );
    const generationTime = Date.now() - startTime;

    console.log('✅ Excel échéancier généré avec succès');
    console.log(`⏱️ Temps de génération: ${generationTime}ms`);

    // Sauvegarder pour vérification
    const filename = `test_echeancier_${donation._id}.xlsx`;
    const filepath = path.join(__dirname, '../temp/', filename);
    
    const tempDir = path.dirname(filepath);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    await workbook.xlsx.writeFile(filepath);
    
    // Vérifier la taille du fichier
    const stats = fs.statSync(filepath);
    console.log(`📏 Taille: ${(stats.size / 1024).toFixed(2)} KB`);
    console.log(`💾 Fichier sauvegardé: ${filepath}`);

    return true;
  } catch (error) {
    console.error('❌ Erreur test échéancier Excel:', error.message);
    return false;
  }
};

// Test de génération d'un rapport Excel
const testDonationsReportExcel = async (userId) => {
  try {
    console.log('\n🧪 Test génération rapport donations Excel...');
    
    const user = await User.findById(userId);
    const donations = await Donation.find({ user: userId })
      .populate('payments', 'provider status completedAt')
      .sort({ createdAt: -1 })
      .limit(100);

    if (!user) {
      console.error('❌ Utilisateur non trouvé');
      return false;
    }

    console.log('📊 Données trouvées:', {
      user: `${user.firstName} ${user.lastName}`,
      donations: donations.length
    });

    const startTime = Date.now();
    const workbook = await excelService.generateDonationsReportExcel(
      donations,
      user,
      { period: 'all' }
    );
    const generationTime = Date.now() - startTime;

    console.log('✅ Rapport Excel généré avec succès');
    console.log(`⏱️ Temps de génération: ${generationTime}ms`);

    // Sauvegarder pour vérification
    const filename = `test_rapport_${userId}.xlsx`;
    const filepath = path.join(__dirname, '../temp/', filename);
    
    const tempDir = path.dirname(filepath);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    await workbook.xlsx.writeFile(filepath);
    
    const stats = fs.statSync(filepath);
    console.log(`📏 Taille: ${(stats.size / 1024).toFixed(2)} KB`);
    console.log(`💾 Fichier sauvegardé: ${filepath}`);

    return true;
  } catch (error) {
    console.error('❌ Erreur test rapport Excel:', error.message);
    return false;
  }
};

// Test de performance avec plusieurs documents
const testPerformance = async (count = 5) => {
  try {
    console.log(`\n🧪 Test de performance (${count} documents)...`);
    
    const donations = await Donation.find({ status: 'completed' })
      .populate('user')
      .limit(count);

    if (donations.length === 0) {
      console.error('❌ Aucune donation complétée trouvée');
      return false;
    }

    const startTime = Date.now();
    const results = [];

    for (let i = 0; i < donations.length; i++) {
      const donation = donations[i];
      const docStartTime = Date.now();
      
      try {
        const pdfBuffer = await pdfService.generateDonationReceipt(donation, donation.user);
        const docTime = Date.now() - docStartTime;
        
        results.push({
          success: true,
          time: docTime,
          size: pdfBuffer.length
        });
        
        console.log(`✅ Document ${i + 1}/${count} - ${docTime}ms - ${(pdfBuffer.length / 1024).toFixed(2)}KB`);
      } catch (error) {
        results.push({
          success: false,
          error: error.message
        });
        console.log(`❌ Document ${i + 1}/${count} - Erreur: ${error.message}`);
      }
    }

    const totalTime = Date.now() - startTime;
    const successCount = results.filter(r => r.success).length;
    const avgTime = results.filter(r => r.success).reduce((sum, r) => sum + r.time, 0) / successCount;
    const avgSize = results.filter(r => r.success).reduce((sum, r) => sum + r.size, 0) / successCount;

    console.log('\n📈 Résultats de performance:');
    console.log(`⏱️ Temps total: ${totalTime}ms`);
    console.log(`✅ Succès: ${successCount}/${count}`);
    console.log(`📊 Temps moyen: ${avgTime.toFixed(2)}ms`);
    console.log(`📏 Taille moyenne: ${(avgSize / 1024).toFixed(2)}KB`);
    console.log(`🚀 Débit: ${(successCount / (totalTime / 1000)).toFixed(2)} docs/sec`);

    return successCount === count;
  } catch (error) {
    console.error('❌ Erreur test performance:', error.message);
    return false;
  }
};

// Générer des occurrences de test
const generateTestOccurrences = (donation, count) => {
  const occurrences = [];
  const startOrNext = donation.recurring?.nextPaymentDate || donation.recurring?.startDate;
  let currentDate = new Date(startOrNext || Date.now());
  const frequency = donation.recurring?.frequency;
  
  for (let i = 0; i < count; i++) {
    occurrences.push({
      _id: `${donation._id}_${i + 1}`,
      dueDate: new Date(currentDate),
      amount: donation.amount,
      currency: donation.currency,
      category: donation.category,
      description: donation.description,
      status: currentDate < new Date() ? 'due' : 'pending',
      reference: `${donation._id}_${currentDate.toISOString().split('T')[0]}`
    });

    // Prochaine occurrence selon la fréquence
    switch (frequency) {
      case 'daily':
        currentDate.setDate(currentDate.getDate() + 1);
        break;
      case 'weekly':
        currentDate.setDate(currentDate.getDate() + 7);
        break;
      case 'monthly':
        currentDate.setMonth(currentDate.getMonth() + 1);
        break;
      case 'quarterly':
        currentDate.setMonth(currentDate.getMonth() + 3);
        break;
      case 'yearly':
        currentDate.setFullYear(currentDate.getFullYear() + 1);
        break;
      default:
        currentDate.setMonth(currentDate.getMonth() + 1);
    }
  }

  return occurrences;
};

// Fonction principale de test
const runDocumentTests = async (testDonationId = null, testRecurringId = null, testUserId = null) => {
  try {
    console.log('🚀 Début des tests du système de documents');
    console.log('===========================================\n');
    
    // Trouver des IDs de test si non fournis
    if (!testDonationId) {
      const donation = await Donation.findOne({ status: 'completed' }).limit(1);
      testDonationId = donation?._id;
    }

    if (!testRecurringId) {
      const recurring = await Donation.findOne({ type: 'recurring', 'recurring.isActive': true }).limit(1);
      testRecurringId = recurring?._id;
    }

    if (!testUserId) {
      const user = await User.findOne().limit(1);
      testUserId = user?._id;
    }

    const results = [];

    // Test 1: Reçu PDF
    if (testDonationId) {
      results.push(await testDonationReceiptPDF(testDonationId));
    } else {
      console.log('⚠️ Aucune donation trouvée pour le test PDF');
      results.push(false);
    }

    // Test 2: Échéancier PDF
    if (testRecurringId) {
      results.push(await testSchedulePDF(testRecurringId));
    } else {
      console.log('⚠️ Aucun don récurrent trouvé pour le test PDF');
      results.push(false);
    }

    // Test 3: Échéancier Excel
    if (testRecurringId) {
      results.push(await testScheduleExcel(testRecurringId));
    } else {
      console.log('⚠️ Aucun don récurrent trouvé pour le test Excel');
      results.push(false);
    }

    // Test 4: Rapport Excel
    if (testUserId) {
      results.push(await testDonationsReportExcel(testUserId));
    } else {
      console.log('⚠️ Aucun utilisateur trouvé pour le test rapport');
      results.push(false);
    }

    // Test 5: Performance
    results.push(await testPerformance(3));

    // Résumé des tests
    console.log('\n📈 Résumé des tests:');
    console.log(`Test 1 - Reçu PDF: ${results[0] ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Test 2 - Échéancier PDF: ${results[1] ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Test 3 - Échéancier Excel: ${results[2] ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Test 4 - Rapport Excel: ${results[3] ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Test 5 - Performance: ${results[4] ? '✅ PASS' : '❌ FAIL'}`);
    
    const passedTests = results.filter(r => r).length;
    const totalTests = results.length;
    
    if (passedTests === totalTests) {
      console.log('\n🎉 Tous les tests passés avec succès !');
      console.log('✅ Le système de documents fonctionne correctement');
    } else {
      console.log(`\n⚠️ ${passedTests}/${totalTests} tests réussis`);
      console.log('❌ Vérifiez les erreurs ci-dessus');
    }
    
  } catch (error) {
    console.error('❌ Erreur fatale lors des tests:', error);
  }
};

// Fonction de nettoyage
const cleanupTempFiles = () => {
  try {
    const tempDir = path.join(__dirname, '../temp/');
    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir);
      files.forEach(file => {
        if (file.startsWith('test_')) {
          fs.unlinkSync(path.join(tempDir, file));
          console.log(`🗑️ Fichier supprimé: ${file}`);
        }
      });
    }
  } catch (error) {
    console.log('⚠️ Erreur nettoyage fichiers temporaires:', error.message);
  }
};

// Fonction principale
const main = async () => {
  require('dotenv').config();
  
  try {
    await connectDB();
    
    // Récupérer les IDs depuis les arguments
    const donationId = process.argv[2];
    const recurringId = process.argv[3];
    const userId = process.argv[4];
    
    if (donationId || recurringId || userId) {
      console.log('🎯 Tests avec IDs spécifiques');
    }
    
    await runDocumentTests(donationId, recurringId, userId);
    
    // Option de nettoyage
    if (process.argv.includes('--cleanup')) {
      console.log('\n🧹 Nettoyage des fichiers temporaires...');
      cleanupTempFiles();
    }
    
  } catch (error) {
    console.error('❌ Erreur fatale:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Connexion MongoDB fermée');
    process.exit(0);
  }
};

// Gestion des signaux
process.on('SIGINT', async () => {
  console.log('\n⏹️ Tests interrompus...');
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
  }
  process.exit(0);
});

// Exécuter si appelé directement
if (require.main === module) {
  main();
}

module.exports = {
  testDonationReceiptPDF,
  testSchedulePDF,
  testScheduleExcel,
  testDonationsReportExcel,
  testPerformance,
  runDocumentTests
};