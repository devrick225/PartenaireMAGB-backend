const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Import des routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const donationRoutes = require('./routes/donations');
const paymentRoutes = require('./routes/payments');
const ticketRoutes = require('./routes/tickets');
const webhookRoutes = require('./routes/webhooks');
const ministryRoutes = require('./routes/ministries');
const documentsRoutes = require('./routes/documents');
const notificationsRoutes = require('./routes/notifications');
const linksRoutes = require('./routes/links');

// Import des middlewares
const errorHandler = require('./middleware/errorHandler');
const logger = require('./middleware/logger');

// Import des services
const websocketService = require('./services/websocketService');
const cronJobsService = require('./services/cronJobs');

const app = express();

// Configuration CORS
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:3000',
  process.env.ADMIN_URL || 'http://localhost:3001',
  process.env.FRONTEND_NEW_URL || 'http://localhost:8080',
  'https://partenairemagb-frontend.onrender.com'
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Autorise les appels serveur-à-serveur et outils sans Origin
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin non autorisée par CORS'));
  },
  credentials: true,
  optionsSuccessStatus: 200
};

// Middlewares globaux
app.use(helmet());
app.use(cors(corsOptions));
app.use(logger);

// Rate limiting
/*
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    error: 'Trop de requêtes, veuillez réessayer plus tard.'
  }
});
app.use('/api/', limiter);
*/

// Parsing des données
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes principales
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/donations', donationRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/ministries', ministryRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/links', linksRoutes);

// Route de santé
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  });
});

// Documentation Swagger (en développement)
/*if (process.env.NODE_ENV === 'development') {
  const swaggerUi = require('swagger-ui-express');
  const swaggerDocument = require('./swagger.json');
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
}*/

// Gestion des erreurs 404
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route non trouvée'
  });
});

// Middleware de gestion d'erreurs
app.use(errorHandler);

// Connexion à MongoDB
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // Options supprimées car dépréciées dans les versions récentes du driver MongoDB
    });
    console.log(`MongoDB connecté: ${conn.connection.host}`);
  } catch (error) {
    console.error('Erreur de connexion MongoDB:', error);
    process.exit(1);
  }
};

// Démarrage du serveur
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();
  
  const server = app.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur le port ${PORT}`);
    console.log(`📖 Documentation API: http://localhost:${PORT}/api-docs`);
    console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  });

  // Initialiser le service WebSocket
  try {
    websocketService.initialize(server);
    websocketService.startHeartbeat();
    console.log('✅ Service WebSocket initialisé');
  } catch (error) {
    console.error('❌ Erreur initialisation WebSocket:', error);
  }

  // Initialiser les tâches cron
  try {
    cronJobsService.initialize();
    console.log('✅ Tâches cron initialisées');
  } catch (error) {
    console.error('❌ Erreur initialisation tâches cron:', error);
  }

  // Gestion gracieuse de l'arrêt
  const gracefulShutdown = (signal) => {
    console.log(`${signal} reçu. Arrêt gracieux du serveur...`);
    
    // Arrêter les tâches cron
    cronJobsService.stopAll();
    
    // Fermer les connexions WebSocket
    websocketService.closeAll();
    
    server.close(() => {
      mongoose.connection.close(false, () => {
        console.log('Connexion MongoDB fermée.');
        process.exit(0);
      });
    });
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
};

if (require.main === module) {
  startServer();
}

module.exports = app; 