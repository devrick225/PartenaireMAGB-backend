/**
 * Script de test pour le service MoneyFusion
 * Usage: node scripts/test-moneyfusion.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const moneyFusionService = require('../services/moneyFusionService');
const cronJobsService = require('../services/cronJobs');

// Couleurs pour la console
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

const log = (message, color = 'reset') => {
  console.log(`${colors[color]}${message}${colors.reset}`);
};

async function connectToDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    log('✅ Connexion MongoDB réussie', 'green');
  } catch (error) {
    log(`❌ Erreur connexion MongoDB: ${error.message}`, 'red');
    throw error;
  }
}

async function testMoneyFusionConnection() {
  log('\n🔧 Test de connexion MoneyFusion...', 'blue');
  
  try {
    const config = moneyFusionService.validateConfiguration();
    log(`✅ Configuration valide:`, 'green');
    log(`   - API URL: ${config.apiUrl}`, 'blue');
    log(`   - Webhook URL: ${config.webhookCheckUrl}`, 'blue');

    const connectionTest = await moneyFusionService.testConnection();
    if (connectionTest.success) {
      log(`✅ Test de connexion réussi: ${connectionTest.message}`, 'green');
    } else {
      log(`❌ Test de connexion échoué: ${connectionTest.message}`, 'red');
    }
  } catch (error) {
    log(`❌ Erreur test MoneyFusion: ${error.message}`, 'red');
  }
}

async function testPaymentInitialization() {
  log('\n💳 Test d\'initialisation de paiement...', 'blue');
  
  try {
    const testPayment = {
      amount: 1000,
      currency: 'XOF',
      customerInfo: {
        name: 'Test',
        surname: 'User',
        phone: '+22500000000',
        email: 'test@example.com'
      },
      donationId: 'test-donation-123',
      callbackUrl: 'http://localhost:3000/payment/success',
      description: 'Test donation PARTENAIRE MAGB'
    };

    const result = await moneyFusionService.initializePayment(testPayment);
    
    if (result.success) {
      log(`✅ Paiement initialisé avec succès:`, 'green');
      log(`   - Transaction ID: ${result.transactionId}`, 'blue');
      log(`   - URL de paiement: ${result.paymentUrl}`, 'blue');
      log(`   - Token: ${result.token}`, 'blue');
      
      // Test de vérification
      log('\n🔍 Test de vérification du paiement...', 'blue');
      const verification = await moneyFusionService.verifyPayment(result.token);
      log(`📊 Statut de vérification: ${verification.status}`, 'yellow');
      log(`📝 Message: ${verification.message}`, 'yellow');
      
    } else {
      log(`❌ Échec initialisation paiement: ${result.message}`, 'red');
    }
  } catch (error) {
    log(`❌ Erreur test paiement: ${error.message}`, 'red');
  }
}

async function testWebhookProcessing() {
  log('\n🔔 Test de traitement webhook...', 'blue');
  
  try {
    // Simuler un webhook MoneyFusion
    const mockWebhook = {
      tokenPay: 'test-token-123',
      statut: 'paid',
      numeroTransaction: 'TX-123456789',
      Montant: 1000,
      frais: 25,
      nomclient: 'Test User',
      numeroSend: '+22500000000',
      moyen: 'mobile_money',
      personal_Info: [
        { key: 'donation_id', value: 'test-donation-123' },
        { key: 'customer_email', value: 'test@example.com' }
      ],
      createdAt: new Date().toISOString()
    };

    const webhookResult = await moneyFusionService.processWebhook(mockWebhook);
    
    log(`✅ Webhook traité avec succès:`, 'green');
    log(`   - Type: ${webhookResult.type}`, 'blue');
    log(`   - Statut: ${webhookResult.status}`, 'blue');
    log(`   - Montant: ${webhookResult.data.amount} XOF`, 'blue');
    log(`   - Frais: ${webhookResult.data.fees} XOF`, 'blue');
    log(`   - Méthode: ${webhookResult.data.paymentMethod}`, 'blue');
    
  } catch (error) {
    log(`❌ Erreur test webhook: ${error.message}`, 'red');
  }
}

async function testFeesCalculation() {
  log('\n💰 Test de calcul des frais...', 'blue');
  
  try {
    const amounts = [500, 1000, 5000, 10000, 50000];
    
    amounts.forEach(amount => {
      const fees = moneyFusionService.calculateFees(amount);
      log(`💵 Montant: ${amount} XOF`, 'yellow');
      log(`   - Frais pourcentage: ${fees.percentageFee} XOF (${fees.feePercentage}%)`, 'blue');
      log(`   - Frais fixes: ${fees.fixedFee} XOF`, 'blue');
      log(`   - Total frais: ${fees.totalFee} XOF`, 'blue');
      log(`   - Montant net: ${fees.netAmount} XOF`, 'green');
      log('');
    });
  } catch (error) {
    log(`❌ Erreur calcul frais: ${error.message}`, 'red');
  }
}

async function testCronJobs() {
  log('\n⏰ Test des tâches cron...', 'blue');
  
  try {
    // Vérifier le statut des tâches cron
    const status = cronJobsService.getStatus();
    log(`📊 Statut des tâches cron:`, 'green');
    log(`   - Initialisées: ${status.initialized}`, 'blue');
    log(`   - Nombre de tâches: ${status.totalJobs}`, 'blue');
    
    Object.entries(status.jobs).forEach(([name, job]) => {
      log(`   - ${name}:`, 'yellow');
      log(`     • En cours: ${job.running}`, 'blue');
      log(`     • Programmée: ${job.scheduled}`, 'blue');
      log(`     • Prochaine exécution: ${job.nextRun || 'N/A'}`, 'blue');
    });

    // Test de vérification manuelle
    log('\n🔍 Test de vérification manuelle des paiements...', 'blue');
    const verificationResult = await cronJobsService.runPaymentVerificationNow();
    log(`✅ Vérification terminée:`, 'green');
    log(`   - Paiements vérifiés: ${verificationResult.checked}`, 'blue');
    log(`   - Complétés: ${verificationResult.completed}`, 'green');
    log(`   - Échoués: ${verificationResult.failed}`, 'red');
    log(`   - Erreurs: ${verificationResult.errors}`, 'yellow');
    
  } catch (error) {
    log(`❌ Erreur test cron: ${error.message}`, 'red');
  }
}

async function runTests() {
  log(`${colors.bold}🚀 DÉBUT DES TESTS MONEYFUSION${colors.reset}`, 'green');
  log(`${colors.bold}======================================${colors.reset}`, 'green');
  
  try {
    await connectToDatabase();
    
    await testMoneyFusionConnection();
    await testPaymentInitialization();
    await testWebhookProcessing();
    await testFeesCalculation();
    
    // Initialiser les cron jobs pour les tests
    cronJobsService.initialize();
    await testCronJobs();
    
    log(`\n${colors.bold}✅ TOUS LES TESTS TERMINÉS AVEC SUCCÈS${colors.reset}`, 'green');
    log(`${colors.bold}=======================================${colors.reset}`, 'green');
    
  } catch (error) {
    log(`\n${colors.bold}❌ ÉCHEC DES TESTS: ${error.message}${colors.reset}`, 'red');
    log(`${colors.bold}=======================================${colors.reset}`, 'red');
  } finally {
    // Nettoyer
    cronJobsService.stopAll();
    await mongoose.connection.close();
    log('\n👋 Connexion fermée. Au revoir !', 'blue');
    process.exit(0);
  }
}

// Gestion des erreurs non capturées
process.on('unhandledRejection', (reason, promise) => {
  log(`❌ Rejection non gérée: ${reason}`, 'red');
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  log(`❌ Exception non capturée: ${error.message}`, 'red');
  process.exit(1);
});

// Lancer les tests
if (require.main === module) {
  runTests();
}

module.exports = {
  runTests,
  testMoneyFusionConnection,
  testPaymentInitialization,
  testWebhookProcessing,
  testFeesCalculation,
  testCronJobs
}; 