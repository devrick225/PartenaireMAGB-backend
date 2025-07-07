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
      // Options supprimées car dépréciées dans les versions récentes du driver MongoDB
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
    log(`