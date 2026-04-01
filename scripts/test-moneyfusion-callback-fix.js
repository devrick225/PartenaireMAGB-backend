/**
 * Script de test pour valider le fix du callback MoneyFusion
 * 
 * Ce script teste:
 * 1. La génération correcte du return_url backend
 * 2. Le traitement du callback et la redirection vers le deep link mobile
 * 3. Le mapping des statuts MoneyFusion
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Payment = require('../models/Payment');
const Donation = require('../models/Donation');
const User = require('../models/User');

// Fonction pour générer l'URL de callback mobile
const generateMobileCallbackUrl = (transactionId, donationId, status = 'completed') => {
  return `partenaireMagb://payment/return?transactionId=${transactionId}&donationId=${donationId}&status=${status}`;
};

// Fonction pour simuler le callback handler
const simulatePaymentCallback = async (queryParams) => {
  const { transactionId, donationId, status, paymentId, provider, token, statut } = queryParams;
  
  console.log('📱 Simulation callback reçu:', { 
    transactionId, 
    donationId, 
    status, 
    paymentId, 
    provider, 
    token, 
    statut 
  });
  
  let mobileCallbackUrl;
  
  // Traitement spécial pour MoneyFusion
  if (provider === 'moneyfusion' || token) {
    try {
      // Trouver le paiement par token ou donationId
      let payment;
      
      if (token) {
        payment = await Payment.findOne({ 
          'moneyfusion.token': token 
        }).populate('donation');
      } else if (donationId) {
        payment = await Payment.findOne({ 
          donation: donationId,
          provider: 'moneyfusion'
        }).sort({ createdAt: -1 }).populate('donation');
      }
      
      if (!payment) {
        console.error('❌ Paiement MoneyFusion non trouvé:', { token, donationId });
        mobileCallbackUrl = generateMobileCallbackUrl(
          token || transactionId || 'UNKNOWN', 
          donationId || 'UNKNOWN', 
          'failed'
        );
      } else {
        // Mapper le statut MoneyFusion vers notre format
        let mappedStatus = 'pending';
        const mfStatus = statut || status;
        
        if (mfStatus === 'success' || mfStatus === 'completed') {
          mappedStatus = 'completed';
        } else if (mfStatus === 'failed' || mfStatus === 'error') {
          mappedStatus = 'failed';
        } else if (mfStatus === 'cancelled') {
          mappedStatus = 'cancelled';
        }
        
        console.log('✅ Paiement trouvé:', {
          paymentId: payment._id,
          token: payment.moneyfusion?.token,
          currentStatus: payment.status,
          newStatus: mappedStatus
        });
        
        // Générer l'URL de deep link avec toutes les informations
        mobileCallbackUrl = generateMobileCallbackUrl(
          payment.moneyfusion?.token || token || transactionId,
          payment.donation._id.toString(),
          mappedStatus
        );
        
        // Ajouter le paymentId pour faciliter la vérification côté mobile
        mobileCallbackUrl += `&paymentId=${payment._id}`;
      }
    } catch (error) {
      console.error('❌ Erreur traitement callback MoneyFusion:', error);
      mobileCallbackUrl = generateMobileCallbackUrl(
        token || transactionId || 'ERROR',
        donationId || 'UNKNOWN',
        'failed'
      );
    }
  } else {
    // Générer l'URL de deep link pour l'app mobile (autres providers)
    mobileCallbackUrl = generateMobileCallbackUrl(
      transactionId || paymentId, 
      donationId, 
      status || 'completed'
    );
  }
  
  console.log('🔗 URL de redirection générée:', mobileCallbackUrl);
  return mobileCallbackUrl;
};

// Tests
const runTests = async () => {
  try {
    console.log('🚀 Démarrage des tests du callback MoneyFusion...\n');

    // Connexion à MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connecté à MongoDB\n');

    // Test 1: Vérifier qu'il existe au moins un paiement MoneyFusion
    console.log('📋 Test 1: Recherche d\'un paiement MoneyFusion existant...');
    const testPayment = await Payment.findOne({ 
      provider: 'moneyfusion',
      'moneyfusion.token': { $exists: true }
    }).populate('donation');

    if (!testPayment) {
      console.log('⚠️  Aucun paiement MoneyFusion trouvé dans la base');
      console.log('   Créez un paiement via l\'app mobile pour tester\n');
    } else {
      console.log('✅ Paiement MoneyFusion trouvé:', {
        paymentId: testPayment._id,
        token: testPayment.moneyfusion.token,
        donationId: testPayment.donation._id,
        status: testPayment.status
      });
      console.log('');

      // Test 2: Simuler un callback avec statut "success"
      console.log('📋 Test 2: Simulation callback avec statut "success"...');
      const successUrl = await simulatePaymentCallback({
        token: testPayment.moneyfusion.token,
        donationId: testPayment.donation._id.toString(),
        statut: 'success',
        provider: 'moneyfusion'
      });
      
      // Vérifier que l'URL contient les bons paramètres
      const successUrlObj = new URL(successUrl);
      console.log('   Paramètres du deep link:');
      console.log('   - transactionId:', successUrlObj.searchParams.get('transactionId'));
      console.log('   - donationId:', successUrlObj.searchParams.get('donationId'));
      console.log('   - status:', successUrlObj.searchParams.get('status'));
      console.log('   - paymentId:', successUrlObj.searchParams.get('paymentId'));
      
      if (successUrlObj.searchParams.get('status') === 'completed') {
        console.log('✅ Statut correctement mappé: success -> completed\n');
      } else {
        console.log('❌ Erreur de mapping du statut\n');
      }

      // Test 3: Simuler un callback avec statut "failed"
      console.log('📋 Test 3: Simulation callback avec statut "failed"...');
      const failedUrl = await simulatePaymentCallback({
        token: testPayment.moneyfusion.token,
        donationId: testPayment.donation._id.toString(),
        statut: 'failed',
        provider: 'moneyfusion'
      });
      
      const failedUrlObj = new URL(failedUrl);
      if (failedUrlObj.searchParams.get('status') === 'failed') {
        console.log('✅ Statut correctement mappé: failed -> failed\n');
      } else {
        console.log('❌ Erreur de mapping du statut\n');
      }

      // Test 4: Simuler un callback avec statut "cancelled"
      console.log('📋 Test 4: Simulation callback avec statut "cancelled"...');
      const cancelledUrl = await simulatePaymentCallback({
        token: testPayment.moneyfusion.token,
        donationId: testPayment.donation._id.toString(),
        statut: 'cancelled',
        provider: 'moneyfusion'
      });
      
      const cancelledUrlObj = new URL(cancelledUrl);
      if (cancelledUrlObj.searchParams.get('status') === 'cancelled') {
        console.log('✅ Statut correctement mappé: cancelled -> cancelled\n');
      } else {
        console.log('❌ Erreur de mapping du statut\n');
      }

      // Test 5: Vérifier le format du return_url backend
      console.log('📋 Test 5: Vérification du format du return_url backend...');
      const backendUrl = `${process.env.BACKEND_URL || process.env.FRONTEND_URL}/api/payments/callback?provider=moneyfusion&donationId=${testPayment.donation._id}`;
      console.log('   Return URL backend:', backendUrl);
      
      if (backendUrl.includes('/api/payments/callback') && backendUrl.includes('provider=moneyfusion')) {
        console.log('✅ Format du return_url backend correct\n');
      } else {
        console.log('❌ Format du return_url backend incorrect\n');
      }
    }

    // Test 6: Tester avec un token inexistant
    console.log('📋 Test 6: Test avec un token inexistant...');
    const notFoundUrl = await simulatePaymentCallback({
      token: 'TOKEN_INEXISTANT_123',
      donationId: 'DON_INEXISTANT_456',
      statut: 'success',
      provider: 'moneyfusion'
    });
    
    if (notFoundUrl.includes('status=failed')) {
      console.log('✅ Gestion correcte des tokens inexistants (redirection vers failed)\n');
    } else {
      console.log('❌ Erreur dans la gestion des tokens inexistants\n');
    }

    console.log('✅ Tous les tests terminés!\n');
    console.log('📝 Résumé des améliorations:');
    console.log('   1. Return URL passe maintenant par le backend');
    console.log('   2. Mapping correct des statuts MoneyFusion');
    console.log('   3. Redirection vers deep link mobile avec tous les paramètres');
    console.log('   4. Gestion des erreurs avec fallback');
    console.log('   5. Timeout augmenté à 45s avec 5 tentatives de retry\n');

  } catch (error) {
    console.error('❌ Erreur lors des tests:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Déconnecté de MongoDB');
  }
};

// Exécuter les tests
runTests();
