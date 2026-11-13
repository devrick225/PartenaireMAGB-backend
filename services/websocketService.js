const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

class WebSocketService {
  constructor() {
    this.wss = null;
    this.clients = new Map(); // userId -> Set of WebSocket connections
    this.channels = new Map(); // channel -> Set of WebSocket connections
  }

  // Initialiser le serveur WebSocket
  initialize(server) {
    this.wss = new WebSocket.Server({ 
      server,
      path: '/ws'
    });

    console.log('🔌 Serveur WebSocket initialisé sur /ws');

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    this.wss.on('error', (error) => {
      console.error('❌ Erreur serveur WebSocket:', error);
    });

    return this.wss;
  }

  // Gérer une nouvelle connexion
  async handleConnection(ws, req) {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const token = url.searchParams.get('token');
      const userId = url.searchParams.get('userId');

      if (!token || !userId) {
        console.warn('⚠️ Connexion WebSocket sans token/userId, fermeture');
        ws.close(1008, 'Token ou userId manquant');
        return;
      }

      // Vérifier le token JWT
      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
      } catch (jwtError) {
        console.warn('⚠️ Token JWT invalide pour WebSocket:', jwtError.message);
        ws.close(1008, 'Token invalide');
        return;
      }

      // Vérifier que l'utilisateur existe
      const user = await User.findById(userId).select('+sessions +passwordChangedAt');
      if (!user || user._id.toString() !== decoded.id || !user.isActive || !user.acceptsToken(decoded)) {
        console.warn('⚠️ Utilisateur invalide pour WebSocket:', userId);
        ws.close(1008, 'Utilisateur invalide');
        return;
      }

      console.log(`✅ Nouvelle connexion WebSocket: ${user.firstName} ${user.lastName} (${userId})`);

      // Associer l'utilisateur à la connexion
      ws.userId = userId;
      ws.user = user;
      ws.isAlive = true;

      // Ajouter aux clients connectés
      if (!this.clients.has(userId)) {
        this.clients.set(userId, new Set());
      }
      this.clients.get(userId).add(ws);

      // Envoyer message de confirmation
      this.sendToSocket(ws, {
        type: 'connected',
        payload: {
          message: 'Connexion WebSocket établie',
          userId: userId,
          timestamp: new Date().toISOString()
        }
      });

      // Gestionnaires d'événements
      ws.on('message', (message) => {
        this.handleMessage(ws, message);
      });

      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.on('close', (code, reason) => {
        console.log(`❌ Connexion WebSocket fermée: ${userId} (${code}: ${reason})`);
        this.removeClient(ws);
      });

      ws.on('error', (error) => {
        console.error(`❌ Erreur connexion WebSocket ${userId}:`, error);
        this.removeClient(ws);
      });

    } catch (error) {
      console.error('❌ Erreur gestion connexion WebSocket:', error);
      ws.close(1011, 'Erreur serveur');
    }
  }

  // Gérer les messages reçus
  handleMessage(ws, message) {
    try {
      const data = JSON.parse(message.toString());
      console.log(`📨 Message WebSocket reçu de ${ws.userId}:`, data.type);

      switch (data.type) {
        case 'subscribe':
          this.handleSubscribe(ws, data);
          break;
        
        case 'unsubscribe':
          this.handleUnsubscribe(ws, data);
          break;
        
        case 'ping':
          this.sendToSocket(ws, { type: 'pong', timestamp: new Date().toISOString() });
          break;
        
        default:
          console.warn(`⚠️ Type de message WebSocket non géré: ${data.type}`);
      }

    } catch (error) {
      console.error('❌ Erreur traitement message WebSocket:', error);
      this.sendToSocket(ws, {
        type: 'error',
        payload: { message: 'Format de message invalide' }
      });
    }
  }

  // Gérer l'abonnement à un canal
  async handleSubscribe(ws, data) {
    const { channel, paymentId, donationId } = data;

    if (!channel) {
      this.sendToSocket(ws, {
        type: 'error',
        payload: { message: 'Canal requis pour l\'abonnement' }
      });
      return;
    }

    // Vérifier les permissions selon le canal
    let allowed = false;
    try {
      allowed = await this.checkChannelPermissions(ws, channel, data);
    } catch (error) {
      console.error('❌ Erreur vérification permissions canal:', error.message);
    }

    if (!allowed) {
      this.sendToSocket(ws, {
        type: 'error',
        payload: { message: 'Permissions insuffisantes pour ce canal' }
      });
      return;
    }

    // Ajouter au canal
    if (!this.channels.has(channel)) {
      this.channels.set(channel, new Set());
    }
    this.channels.get(channel).add(ws);

    // Ajouter le canal à la liste des abonnements de cette connexion
    if (!ws.subscriptions) {
      ws.subscriptions = new Set();
    }
    ws.subscriptions.add(channel);

    console.log(`📺 ${ws.userId} s'abonne au canal: ${channel}`);

    this.sendToSocket(ws, {
      type: 'subscribed',
      payload: { 
        channel,
        message: `Abonné au canal ${channel}`,
        timestamp: new Date().toISOString()
      }
    });
  }

  // Gérer le désabonnement d'un canal
  handleUnsubscribe(ws, data) {
    const { channel } = data;

    if (this.channels.has(channel)) {
      this.channels.get(channel).delete(ws);
      
      // Supprimer le canal s'il n'y a plus d'abonnés
      if (this.channels.get(channel).size === 0) {
        this.channels.delete(channel);
      }
    }

    if (ws.subscriptions) {
      ws.subscriptions.delete(channel);
    }

    console.log(`📺 ${ws.userId} se désabonne du canal: ${channel}`);

    this.sendToSocket(ws, {
      type: 'unsubscribed',
      payload: { 
        channel,
        message: `Désabonné du canal ${channel}`,
        timestamp: new Date().toISOString()
      }
    });
  }

  // Vérifier les permissions d'accès à un canal
  async checkChannelPermissions(ws, channel, data) {
    const userId = ws.userId;
    const userRole = ws.user.role;

    // Canal général des paiements de l'utilisateur
    if (channel === `payments:${userId}`) {
      return true;
    }

    // Canal spécifique à un paiement
    if (channel.startsWith('payment:')) {
      // Le canal est identifié par l'id du paiement ou par la référence du fournisseur
      // (token MoneyFusion, référence GeniusPay…) : seul le propriétaire ou le staff y a accès.
      const key = channel.slice('payment:'.length);
      if (!key) return false;
      if (['admin', 'moderator', 'treasurer'].includes(userRole)) return true;

      const mongoose = require('mongoose');
      const Payment = require('../models/Payment');
      const conditions = [
        { 'moneyfusion.token': key },
        { 'geniuspay.reference': key },
        { 'fusionpay.transactionId': key },
        { 'cinetpay.transactionId': key },
        { 'paydunya.token': key },
        { 'transaction.externalId': key }
      ];
      if (mongoose.Types.ObjectId.isValid(key)) conditions.push({ _id: key });

      return !!(await Payment.exists({ user: userId, $or: conditions }));
    }

    // Canaux administrateurs
    if (channel.startsWith('admin:')) {
      return ['admin', 'moderator', 'treasurer', 'support_agent'].includes(userRole);
    }

    return false;
  }

  // Supprimer un client
  removeClient(ws) {
    if (ws.userId && this.clients.has(ws.userId)) {
      this.clients.get(ws.userId).delete(ws);
      
      // Supprimer l'utilisateur s'il n'a plus de connexions
      if (this.clients.get(ws.userId).size === 0) {
        this.clients.delete(ws.userId);
      }
    }

    // Supprimer des canaux
    if (ws.subscriptions) {
      ws.subscriptions.forEach(channel => {
        if (this.channels.has(channel)) {
          this.channels.get(channel).delete(ws);
          
          if (this.channels.get(channel).size === 0) {
            this.channels.delete(channel);
          }
        }
      });
    }
  }

  // Envoyer un message à une connexion spécifique
  sendToSocket(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(data));
      } catch (error) {
        console.error('❌ Erreur envoi message WebSocket:', error);
      }
    }
  }

  // Envoyer un message à un utilisateur (toutes ses connexions)
  sendToUser(userId, data) {
    if (this.clients.has(userId)) {
      const connections = this.clients.get(userId);
      connections.forEach(ws => {
        this.sendToSocket(ws, data);
      });
      return connections.size;
    }
    return 0;
  }

  // Envoyer un message à un canal
  sendToChannel(channel, data) {
    if (this.channels.has(channel)) {
      const connections = this.channels.get(channel);
      connections.forEach(ws => {
        this.sendToSocket(ws, data);
      });
      return connections.size;
    }
    return 0;
  }

  // Diffuser à tous les utilisateurs connectés
  broadcast(data, filter = null) {
    let count = 0;
    this.clients.forEach((connections, userId) => {
      if (!filter || filter(userId)) {
        connections.forEach(ws => {
          this.sendToSocket(ws, data);
          count++;
        });
      }
    });
    return count;
  }

  // Notifications spécifiques aux paiements
  notifyPaymentStatusUpdate(payment, previousStatus, newStatus) {
    const data = {
      type: 'payment_status_update',
      paymentId: payment._id.toString(),
      payload: {
        payment: {
          id: payment._id,
          status: newStatus,
          amount: payment.amount,
          currency: payment.currency,
          transactionId: payment.transactionId
        },
        previousStatus,
        newStatus,
        timestamp: new Date().toISOString()
      }
    };

    // Notifier l'utilisateur propriétaire
    const notifiedUsers = this.sendToUser(payment.user.toString(), data);
    
    // Notifier le canal spécifique du paiement
    const notifiedChannels = this.sendToChannel(`payment:${payment._id}`, data);
    
    // Notifier les administrateurs
    const notifiedAdmins = this.sendToChannel('admin:payments', data);

    console.log(`📢 Notification paiement ${payment._id}: ${notifiedUsers} utilisateurs, ${notifiedChannels} canaux, ${notifiedAdmins} admins`);
    
    return notifiedUsers + notifiedChannels + notifiedAdmins;
  }

  // Notifier paiement complété
  notifyPaymentCompleted(payment, donation) {
    const data = {
      type: 'payment_completed',
      paymentId: payment._id.toString(),
      donationId: donation._id.toString(),
      payload: {
        payment: {
          id: payment._id,
          status: payment.status,
          amount: payment.amount,
          currency: payment.currency,
          transactionId: payment.transactionId,
          provider: payment.provider
        },
        donation: {
          id: donation._id,
          amount: donation.amount,
          currency: donation.currency,
          category: donation.category,
          formattedAmount: donation.formattedAmount,
          receiptNumber: donation.receipt?.number
        },
        timestamp: new Date().toISOString()
      }
    };

    const notifiedUsers = this.sendToUser(payment.user.toString(), data);
    const notifiedChannels = this.sendToChannel(`payment:${payment._id}`, data);
    
    console.log(`🎉 Notification paiement complété ${payment._id}: ${notifiedUsers} utilisateurs, ${notifiedChannels} canaux`);
    
    return notifiedUsers + notifiedChannels;
  }

  // Notifier paiement échoué
  notifyPaymentFailed(payment, donation, error) {
    const data = {
      type: 'payment_failed',
      paymentId: payment._id.toString(),
      donationId: donation._id.toString(),
      payload: {
        payment: {
          id: payment._id,
          status: payment.status,
          amount: payment.amount,
          currency: payment.currency,
          transactionId: payment.transactionId
        },
        donation: {
          id: donation._id,
          amount: donation.amount,
          currency: donation.currency,
          category: donation.category,
          formattedAmount: donation.formattedAmount
        },
        error: {
          message: error?.message || 'Erreur de paiement',
          code: error?.code || 'PAYMENT_FAILED'
        },
        timestamp: new Date().toISOString()
      }
    };

    const notifiedUsers = this.sendToUser(payment.user.toString(), data);
    const notifiedChannels = this.sendToChannel(`payment:${payment._id}`, data);
    
    console.log(`❌ Notification paiement échoué ${payment._id}: ${notifiedUsers} utilisateurs, ${notifiedChannels} canaux`);
    
    return notifiedUsers + notifiedChannels;
  }

  // Notifier nouveau webhook reçu
  notifyWebhookReceived(paymentId, provider, status, data) {
    const message = {
      type: 'webhook_received',
      paymentId: paymentId,
      payload: {
        provider,
        status,
        data: data,
        timestamp: new Date().toISOString()
      }
    };

    // Notifier le canal admin
    const notifiedAdmins = this.sendToChannel('admin:webhooks', message);
    
    console.log(`🔔 Notification webhook ${provider}: ${notifiedAdmins} admins`);
    
    return notifiedAdmins;
  }

  // Ping périodique pour maintenir les connexions
  startHeartbeat() {
    const interval = setInterval(() => {
      this.clients.forEach((connections, userId) => {
        connections.forEach(ws => {
          if (!ws.isAlive) {
            console.log(`💔 Connexion WebSocket morte détectée: ${userId}`);
            ws.terminate();
            return;
          }
          
          ws.isAlive = false;
          ws.ping();
        });
      });
    }, 30000); // Toutes les 30 secondes

    return interval;
  }

  // Obtenir les statistiques
  getStats() {
    const totalConnections = Array.from(this.clients.values())
      .reduce((sum, connections) => sum + connections.size, 0);
    
    return {
      connectedUsers: this.clients.size,
      totalConnections: totalConnections,
      channels: this.channels.size,
      channelDetails: Array.from(this.channels.entries()).map(([channel, connections]) => ({
        channel,
        subscribers: connections.size
      }))
    };
  }

  // Fermer toutes les connexions
  closeAll() {
    this.clients.forEach((connections) => {
      connections.forEach(ws => {
        ws.close(1001, 'Serveur fermé');
      });
    });
    
    this.clients.clear();
    this.channels.clear();
    
    if (this.wss) {
      this.wss.close();
    }
  }
}

// Instance singleton
const websocketService = new WebSocketService();

module.exports = websocketService; 