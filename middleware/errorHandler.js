const mongoose = require('mongoose');

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log des erreurs
  console.error('Error:', err);

  // Erreur de validation Mongoose
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = {
      statusCode: 400,
      message: `Erreur de validation: ${message}`
    };
  }

  // Erreur de duplication MongoDB (code 11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const value = err.keyValue[field];
    error = {
      statusCode: 400,
      message: `${field} '${value}' existe déjà`
    };
  }

  // Erreur ObjectId Mongoose
  if (err.name === 'CastError') {
    error = {
      statusCode: 400,
      message: 'Ressource non trouvée - ID invalide'
    };
  }

  // Erreur JWT
  if (err.name === 'JsonWebTokenError') {
    error = {
      statusCode: 401,
      message: 'Token invalide'
    };
  }

  if (err.name === 'TokenExpiredError') {
    error = {
      statusCode: 401,
      message: 'Token expiré'
    };
  }

  // Erreur de timeout MongoDB
  if (err.name === 'MongoNetworkTimeoutError') {
    error = {
      statusCode: 503,
      message: 'Erreur de connexion à la base de données'
    };
  }

  // Erreurs personnalisées avec statusCode
  if (err.statusCode) {
    error = {
      statusCode: err.statusCode,
      message: err.message
    };
  }

  // Erreur par défaut
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Erreur serveur interne';

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      details: err
    })
  });
};

module.exports = errorHandler; 