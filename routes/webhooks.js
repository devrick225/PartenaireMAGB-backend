const express = require('express');
const paymentService = require('../services/paymentService');

const router = express.Router();

// Middleware pour parser le body en raw pour les webhooks
const rawBodyParser = express.raw({ type: 'application/json' });

// POST /api/webhooks/cinetpay - Webhook CinetPay
router.post('/cinetpay', express.json(), async (req, res) => {
  try {
    const payload = req.body;
    const signature = req.headers['x-cinetpay-signature'];

    // Vérifier la signature du webhook
    const isValid = paymentService.verifyCinetPayWebhook(payload, signature);
    
    if (!isValid) {
      console.error('Invalid CinetPay webhook signature');
      return res.status(400).json({
        success: false,
        error: 'Invalid signature'
      });
    }

    // TODO: Traiter le webhook CinetPay
    console.log('CinetPay webhook received:', payload);

    // Répondre rapidement à CinetPay
    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully'
    });

    // Traitement asynchrone du webhook
    // processWebhookAsync('cinetpay', payload);

  } catch (error) {
    console.error('Error processing CinetPay webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// POST /api/webhooks/stripe - Webhook Stripe
router.post('/stripe', rawBodyParser, async (req, res) => {
  try {
    const payload = req.body;
    const signature = req.headers['stripe-signature'];

    // Vérifier la signature du webhook Stripe
    const verification = paymentService.verifyStripeWebhook(payload, signature);
    
    if (!verification.success) {
      console.error('Invalid Stripe webhook signature:', verification.error);
      return res.status(400).json({
        success: false,
        error: 'Invalid signature'
      });
    }

    const event = verification.event;
    console.log('Stripe webhook received:', event.type);

    // Traiter selon le type d'événement
    switch (event.type) {
      case 'payment_intent.succeeded':
        // TODO: Marquer le paiement comme réussi
        console.log('Payment succeeded:', event.data.object.id);
        break;
      
      case 'payment_intent.payment_failed':
        // TODO: Marquer le paiement comme échoué
        console.log('Payment failed:', event.data.object.id);
        break;
      
      case 'charge.dispute.created':
        // TODO: Gérer la contestation
        console.log('Dispute created:', event.data.object.id);
        break;
      
      default:
        console.log('Unhandled Stripe event type:', event.type);
    }

    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully'
    });

  } catch (error) {
    console.error('Error processing Stripe webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// POST /api/webhooks/paypal - Webhook PayPal
router.post('/paypal', express.json(), async (req, res) => {
  try {
    const payload = req.body;
    const headers = req.headers;

    console.log('PayPal webhook received:', payload.event_type);

    // TODO: Vérifier la signature PayPal si nécessaire
    // PayPal utilise un système de vérification différent

    // Traiter selon le type d'événement
    switch (payload.event_type) {
      case 'CHECKOUT.ORDER.APPROVED':
        // TODO: Capturer le paiement
        console.log('PayPal order approved:', payload.resource.id);
        break;
      
      case 'PAYMENT.CAPTURE.COMPLETED':
        // TODO: Marquer le paiement comme complété
        console.log('PayPal payment completed:', payload.resource.id);
        break;
      
      case 'PAYMENT.CAPTURE.DENIED':
        // TODO: Marquer le paiement comme refusé
        console.log('PayPal payment denied:', payload.resource.id);
        break;
      
      default:
        console.log('Unhandled PayPal event type:', payload.event_type);
    }

    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully'
    });

  } catch (error) {
    console.error('Error processing PayPal webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// POST /api/webhooks/orange-money - Webhook Orange Money
router.post('/orange-money', express.json(), async (req, res) => {
  try {
    const payload = req.body;
    
    console.log('Orange Money webhook received:', payload);

    // TODO: Implémenter la vérification et le traitement Orange Money
    
    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully'
    });

  } catch (error) {
    console.error('Error processing Orange Money webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// POST /api/webhooks/mtn-mobile-money - Webhook MTN Mobile Money
router.post('/mtn-mobile-money', express.json(), async (req, res) => {
  try {
    const payload = req.body;
    
    console.log('MTN Mobile Money webhook received:', payload);

    // TODO: Implémenter la vérification et le traitement MTN Mobile Money
    
    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully'
    });

  } catch (error) {
    console.error('Error processing MTN Mobile Money webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Fonction utilitaire pour traitement asynchrone des webhooks
async function processWebhookAsync(provider, payload) {
  try {
    // TODO: Implémenter le traitement asynchrone
    // - Mettre à jour le statut du paiement en base
    // - Envoyer des notifications
    // - Mettre à jour les statistiques de gamification
    // - Générer les reçus
    
    console.log(`Processing ${provider} webhook asynchronously:`, payload);
    
  } catch (error) {
    console.error(`Error in async webhook processing for ${provider}:`, error);
  }
}

// GET /api/webhooks/test - Endpoint de test (développement seulement)
if (process.env.NODE_ENV === 'development') {
  router.get('/test', (req, res) => {
    res.json({
      success: true,
      message: 'Webhooks endpoint is working',
      timestamp: new Date(),
      environment: process.env.NODE_ENV
    });
  });
}

module.exports = router; 