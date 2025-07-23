const moneyFusionService = require('../services/moneyFusionService');

/**
 * Script de test pour les callbacks MoneyFusion
 * Simule différents scénarios de callback et vérifie la redirection mobile
 */

async function testMoneyFusionCallbacks() {
  console.log('🧪 Test des callbacks MoneyFusion\n');

  const testCases = [
    {
      name: 'Paiement réussi',
      data: {
        token: 'MF_TEST_SUCCESS_123',
        statut: 'paid',
        donation_id: '507f1f77bcf86cd799439011',
        transaction_id: 'TRX_SUCCESS_456',
        numeroTransaction: 'NUM_TRX_789',
        Montant: '5000'
      }
    },
    {
      name: 'Paiement échoué',
      data: {
        token: 'MF_TEST_FAILED_123',
        statut: 'failed',
        donation_id: '507f1f77bcf86cd799439012',
        transaction_id: 'TRX_FAILED_456',
        numeroTransaction: 'NUM_TRX_790',
        Montant: '2500'
      }
    },
    {
      name: 'Paiement en attente',
      data: {
        token: 'MF_TEST_PENDING_123',
        statut: 'pending',
        donation_id: '507f1f77bcf86cd799439013',
        transaction_id: 'TRX_PENDING_456',
        numeroTransaction: 'NUM_TRX_791',
        Montant: '10000'
      }
    },
    {
      name: 'Paiement annulé',
      data: {
        token: 'MF_TEST_CANCELLED_123',
        statut: 'cancelled',
        donation_id: '507f1f77bcf86cd799439014',
        transaction_id: 'TRX_CANCELLED_456',
        numeroTransaction: 'NUM_TRX_792',
        Montant: '7500'
      }
    },
    {
      name: 'Données minimales',
      data: {
        token: 'MF_MINIMAL_123',
        statut: 'paid'
      }
    }
  ];

  for (const testCase of testCases) {
    console.log(`\n📋 Test: ${testCase.name}`);
    console.log('Données d\'entrée:', testCase.data);
    
    try {
      const result = await moneyFusionService.processCallback(testCase.data);
      
      console.log('✅ Résultat:');
      console.log('  - Succès:', result.success);
      console.log('  - URL de redirection:', result.redirectUrl);
      console.log('  - Statut:', result.status);
      console.log('  - Transaction ID:', result.transactionId);
      console.log('  - Donation ID:', result.donationId);
      
      if (result.originalStatus) {
        console.log('  - Statut original:', result.originalStatus);
      }
      
      if (result.amount) {
        console.log('  - Montant:', result.amount);
      }
      
    } catch (error) {
      console.log('❌ Erreur:', error.message);
    }
    
    console.log('─'.repeat(50));
  }
}

async function testMobileCallbackUrlGeneration() {
  console.log('\n🔗 Test de génération des URLs de callback mobile\n');
  
  const testParams = [
    { transactionId: 'TEST_123', donationId: 'DON_456', status: 'completed' },
    { transactionId: 'TEST_789', donationId: 'DON_012', status: 'failed' },
    { transactionId: 'TEST_345', donationId: 'DON_678', status: 'pending' }
  ];
  
  for (const params of testParams) {
    const url = moneyFusionService.generateMobileCallbackUrl(
      params.transactionId,
      params.donationId,
      params.status
    );
    
    console.log(`📱 URL générée pour ${params.status}:`);
    console.log(`   ${url}`);
    console.log('');
  }
}

async function testWebhookProcessing() {
  console.log('\n🔔 Test de traitement des webhooks MoneyFusion\n');
  
  const webhookData = {
    tokenPay: 'WEBHOOK_TOKEN_123',
    statut: 'paid',
    numeroTransaction: 'WEBHOOK_TRX_456',
    Montant: '15000',
    frais: '375',
    nomclient: 'John Doe',
    numeroSend: '+22501234567',
    personal_Info: [
      { key: 'donation_id', value: '507f1f77bcf86cd799439015' },
      { key: 'platform', value: 'partenaire-magb' }
    ],
    moyen: 'mobile_money',
    createdAt: new Date().toISOString()
  };
  
  try {
    const result = await moneyFusionService.processWebhook(webhookData);
    
    console.log('✅ Webhook traité avec succès:');
    console.log('  - Type:', result.type);
    console.log('  - Transaction ID:', result.transactionId);
    console.log('  - Statut:', result.status);
    console.log('  - Données:', result.data);
    
  } catch (error) {
    console.log('❌ Erreur traitement webhook:', error.message);
  }
}

// Fonction principale
async function runTests() {
  try {
    await testMoneyFusionCallbacks();
    await testMobileCallbackUrlGeneration();
    await testWebhookProcessing();
    
    console.log('\n🎉 Tous les tests terminés avec succès !');
    
  } catch (error) {
    console.error('❌ Erreur lors des tests:', error);
  }
}

// Exécuter les tests si le script est appelé directement
if (require.main === module) {
  runTests();
}

module.exports = {
  testMoneyFusionCallbacks,
  testMobileCallbackUrlGeneration,
  testWebhookProcessing,
  runTests
}; 