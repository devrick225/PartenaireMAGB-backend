const mongoose = require('mongoose');
const app = require('../server');

// Cache de connexion MongoDB pour les fonctions serverless
let cachedConnection = null;

const connectDB = async () => {
  if (cachedConnection && mongoose.connection.readyState === 1) {
    return cachedConnection;
  }

  try {
    const connection = await mongoose.connect(process.env.MONGODB_URI, {
      bufferCommands: false,
      bufferMaxEntries: 0,
      useFindAndModify: false,
      useCreateIndex: true
    });

    cachedConnection = connection;
    console.log('MongoDB connecté pour fonction serverless');
    return connection;
  } catch (error) {
    console.error('Erreur connexion MongoDB serverless:', error);
    throw error;
  }
};

// Handler principal pour Vercel
module.exports = async (req, res) => {
  try {
    // Assurer la connexion MongoDB avant chaque requête
    await connectDB();
    
    // Déléguer à l'app Express
    return app(req, res);
  } catch (error) {
    console.error('Erreur dans le handler Vercel:', error);
    return res.status(500).json({
      success: false,
      error: 'Erreur interne du serveur'
    });
  }
}; 