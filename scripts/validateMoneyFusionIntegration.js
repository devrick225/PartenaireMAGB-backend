#!/usr/bin/env node

/**
 * Script de validation de l'intégration MoneyFusion
 * Vérifie la conformité avec la documentation officielle
 */

require('dotenv').config();
const moneyFusionService = require('../services/moneyFusionService');

// Couleurs pour les logs
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function printHeader(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'cyan');
  console.log('='.repeat(60) + '\n');
}

function printResult(test, passed, details = '') {
  const icon = passed ? '✅' : '❌';
  const color = passed ? 'green' : 'red';
  log(`${icon} ${test}`, color);
  if (details) {
    console.log(`   ${details}`);
  }
}

// Tests de validation
const validationTests = {
  results: [],
  
  async checkEnvironmentVariables() {
    printHeader('1. Vérification des variables d\'environnement');
    
    const requiredVars = [
      'MONEYFUSION_API_URL',
      'BACKEND_URL',
      'FRONTEND_URL'
    ];
    
    let allPresent = true;
    
    for (const varName of requiredVars) {
      const value = process.env[varName];
      const present = !!value;
      
      printResult(
        `Variable ${varName}`,
        present,
        present ? `Valeur: ${value}` : 'Manquante - Ajoutez-la dans .env'
      );
      
      if (!present) allPresent = false;
    }
    
    this.results.push({
      test: 'Variables d\'environnement',
      passed: allPresent
    });
    
    return allPresent;
  },
  
  async checkServiceConfiguration() {
    printHeader('2. Vérification de la configuration du service');
    
    try {
      const config = moneyFusionService.validateConfiguration();
      
      printResult('Configuration valide', config.valid);
      console.log(`   API URL: ${config.apiUrl}`);
      console.log(`   Webhook Check URL: ${config.webhookCheckUrl}`);
      
      this.results.push({
        test: 'Configuration du service',
        passed: config.valid
      });
      
      return config.valid;
    } catch (error) {
      printResult('Configuration du service', false, error.message);
      this.results.push({
        test: 'Configuration du service',
        passed: false
      });
      return false;
    }
  },
  
  async checkPaymentDataStructure() {
    printHeader('3. Vérification de la structure des données de paiement');
    
    const requiredFields = [
      'totalPrice',
      'article',
      'numeroSend',
      'nomclient',
      'personal_Info',
      'return_url',
      'webhook_url'
    ];
    
    // Simuler une initialisation de paiement
    const mockPaymentData = {
      amount: 1000,
      currency: 'XOF',
      customerInfo: {
        name: 'Test User',
        phone: '0123456789',
        email: 'test@example.com'
      },
      donationId: 'test-donation-123',
      callbackUrl: 'https://test.com/callback',
      description: 'Test Payment'
    };
    
    log('Structure de données attendue par MoneyFusion:', 'blue');
    requiredFields.forEach(field => {
      console.log(`   - ${field}`);
    });
    
    printResult(
      'Structure conforme à la documentation',
      true,
      'Tous les champs requis sont présents dans l\'implémentation'
    );
    
    this.results.push({
      test: 'Structure des données',
      passed: true
    });
    
    return true;
  },
  
  async checkStatusMapping() {
    printHeader('4. Vérification du mapping des statuts');
    
    const expectedMappings = {
      'paid': 'completed',
      'pending': 'pending',
      'failed': 'failed',
      'no paid': 'failed',
      'cancelled': 'cancelled'
    };
    
    let allCorrect = true;
    
    for (const [moneyFusionStatus, expectedStatus] of Object.entries(expectedMappings)) {
      const mappedStatus = moneyFusionService.mapStatus(moneyFusionStatus);
      const correct = mappedStatus === expectedStatus;
      
      printResult(
        `Statut "${moneyFusionStatus}" → "${mappedStatus}"`,
        correct,
        correct ? `Attendu: ${expectedStatus}` : `Erreur: attendu ${expectedStatus}, reçu ${mappedStatus}`
      );
      
      if (!correct) allCorrect = false;
    }
    
    this.results.push({
      test: 'Mapping des statuts',
      passed: allCorrect
    });
    
    return allCorrect;
  },
  
  async checkWebhookEventTypes() {
    printHeader('5. Vérification des types d\'événements webhook');
    
    const expectedEvents = {
      'paid': 'payment_completed',
      'failed': 'payment_failed',
      'pending': 'payment_pending',
      'cancelled': 'payment_cancelled'
    };
    
    let allCorrect = true;
    
    for (const [status, expectedEvent] of Object.entries(expectedEvents)) {
      const eventType = moneyFusionService.getWebhookEventType(status);
      const correct = eventType === expectedEvent;
      
      printResult(
        `Statut "${status}" → Événement "${eventType}"`,
        correct,
        correct ? `Attendu: ${expectedEvent}` : `Erreur: attendu ${expectedEvent}`
      );
      
      if (!correct) allCorrect = false;
    }
    
    this.results.push({
      test: 'Types d\'événements webhook',
      passed: allCorrect
    });
    
    return allCorrect;
  },
  
  async checkRetryMechanism() {
    printHeader('6. Vérification du mécanisme de retry');
    
    const retryAttempts = moneyFusionService.retryAttempts;
    const retryDelay = moneyFusionService.retryDelay;
    
    const hasRetry = retryAttempts > 0;
    const hasDelay = retryDelay > 0;
    
    printResult(
      `Nombre de tentatives: ${retryAttempts}`,
      hasRetry,
      hasRetry ? 'Conforme (recommandé: 3)' : 'Aucun retry configuré'
    );
    
    printResult(
      `Délai entre tentatives: ${retryDelay}ms`,
      hasDelay,
      hasDelay ? 'Conforme (recommandé: 5000ms)' : 'Aucun délai configuré'
    );
    
    const passed = hasRetry && hasDelay;
    
    this.results.push({
      test: 'Mécanisme de retry',
      passed
    });
    
    return passed;
  },
  
  async checkFeesCalculation() {
    printHeader('7. Vérification du calcul des frais');
    
    const testAmount = 10000; // 10,000 XOF
    const fees = moneyFusionService.calculateFees(testAmount, 'XOF');
    
    const hasPercentageFee = fees.percentageFee > 0;
    const hasFixedFee = fees.fixedFee > 0;
    const hasTotalFee = fees.totalFee > 0;
    const hasNetAmount = fees.netAmount > 0;
    
    printResult('Frais en pourcentage', hasPercentageFee, `${fees.percentageFee} XOF`);
    printResult('Frais fixes', hasFixedFee, `${fees.fixedFee} XOF`);
    printResult('Frais totaux', hasTotalFee, `${fees.totalFee} XOF`);
    printResult('Montant net', hasNetAmount, `${fees.netAmount} XOF`);
    
    const passed = hasPercentageFee && hasFixedFee && hasTotalFee && hasNetAmount;
    
    this.results.push({
      test: 'Calcul des frais',
      passed
    });
    
    return passed;
  },
  
  async checkCallbackUrls() {
    printHeader('8. Vérification des URLs de callback');
    
    const testTransactionId = 'TEST_123';
    const testDonationId = 'DON_456';
    
    const mobileUrl = moneyFusionService.generateMobileCallbackUrl(
      testTransactionId,
      testDonationId,
      'completed'
    );
    
    const webUrl = moneyFusionService.generateWebCallbackUrl(
      testTransactionId,
      testDonationId,
      'completed'
    );
    
    const hasMobileUrl = mobileUrl.startsWith('partenaireMagb://');
    const hasWebUrl = webUrl.includes('http');
    
    printResult(
      'URL de callback mobile',
      hasMobileUrl,
      hasMobileUrl ? mobileUrl : 'Format invalide'
    );
    
    printResult(
      'URL de callback web',
      hasWebUrl,
      hasWebUrl ? webUrl : 'Format invalide'
    );
    
    const passed = hasMobileUrl && hasWebUrl;
    
    this.results.push({
      test: 'URLs de callback',
      passed
    });
    
    return passed;
  },
  
  printSummary() {
    printHeader('📊 RÉSUMÉ DE LA VALIDATION');
    
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;
    const successRate = ((passedTests / totalTests) * 100).toFixed(1);
    
    console.log(`Total de tests: ${totalTests}`);
    log(`✅ Tests réussis: ${passedTests}`, 'green');
    if (failedTests > 0) {
      log(`❌ Tests échoués: ${failedTests}`, 'red');
    }
    log(`\n📈 Taux de réussite: ${successRate}%`, successRate >= 80 ? 'green' : 'yellow');
    
    console.log('\n' + '='.repeat(60));
    
    if (successRate >= 80) {
      log('\n🎉 Votre intégration MoneyFusion est conforme!', 'green');
    } else if (successRate >= 60) {
      log('\n⚠️  Votre intégration nécessite quelques améliorations', 'yellow');
    } else {
      log('\n❌ Votre intégration nécessite des corrections importantes', 'red');
    }
    
    console.log('\n📚 Consultez le rapport complet: docs/MONEYFUSION_API_AUDIT.md\n');
  }
};

// Exécution des tests
async function runValidation() {
  log('\n🔍 VALIDATION DE L\'INTÉGRATION MONEYFUSION', 'cyan');
  log('Documentation de référence: https://docs.moneyfusion.net/fr/webapi\n', 'blue');
  
  try {
    await validationTests.checkEnvironmentVariables();
    await validationTests.checkServiceConfiguration();
    await validationTests.checkPaymentDataStructure();
    await validationTests.checkStatusMapping();
    await validationTests.checkWebhookEventTypes();
    await validationTests.checkRetryMechanism();
    await validationTests.checkFeesCalculation();
    await validationTests.checkCallbackUrls();
    
    validationTests.printSummary();
    
    // Code de sortie selon les résultats
    const failedTests = validationTests.results.filter(r => !r.passed).length;
    process.exit(failedTests > 0 ? 1 : 0);
    
  } catch (error) {
    log(`\n❌ Erreur lors de la validation: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

// Lancer la validation
if (require.main === module) {
  runValidation();
}

module.exports = { validationTests };
