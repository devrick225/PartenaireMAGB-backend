const logger = (req, res, next) => {
  const start = Date.now();

  // Champs sensibles à masquer dans les logs
  const SENSITIVE_FIELDS = [
    'password', 'currentPassword', 'newPassword', 'confirmPassword',
    'token', 'refreshToken', 'accessToken', 'secret',
    'code', 'resetCode', 'verificationCode',
    'cardNumber', 'cvv', 'pin'
  ];

  const sanitizeBody = (body) => {
    if (!body || typeof body !== 'object') return body;
    const sanitized = { ...body };
    SENSITIVE_FIELDS.forEach(field => {
      if (sanitized[field] !== undefined) {
        sanitized[field] = '[REDACTED]';
      }
    });
    return sanitized;
  };
  
  // Capturer la méthode originale res.end pour log le temps de réponse
  const originalEnd = res.end;
  
  res.end = function(chunk, encoding) {
    const duration = Date.now() - start;
    
    // Déterminer la couleur selon le status code
    const getStatusColor = (statusCode) => {
      if (statusCode >= 500) return '\x1b[31m'; // Rouge
      if (statusCode >= 400) return '\x1b[33m'; // Jaune
      if (statusCode >= 300) return '\x1b[36m'; // Cyan
      if (statusCode >= 200) return '\x1b[32m'; // Vert
      return '\x1b[0m'; // Défaut
    };

    const statusColor = getStatusColor(res.statusCode);
    const resetColor = '\x1b[0m';
    
    // Log de base
    const logMessage = `${req.method} ${req.originalUrl} ${statusColor}${res.statusCode}${resetColor} - ${duration}ms`;
    
    // Informations additionnelles en mode développement
    if (process.env.NODE_ENV === 'development') {
      const userInfo = req.user ? ` [User: ${req.user.email}]` : ' [Anonymous]';
      const ipInfo = ` [IP: ${req.ip || req.connection.remoteAddress}]`;
      console.log(`${new Date().toISOString()} - ${logMessage}${userInfo}${ipInfo}`);
    } else {
      console.log(`${new Date().toISOString()} - ${logMessage}`);
    }
    
    // Log des erreurs 4xx et 5xx avec plus de détails
    if (res.statusCode >= 400) {
      console.error(`❌ Error ${res.statusCode} on ${req.method} ${req.originalUrl}`);
      if (req.body && Object.keys(req.body).length > 0) {
        // Masquer les champs sensibles avant de logger
        console.error('Request body:', JSON.stringify(sanitizeBody(req.body), null, 2));
      }
      if (req.query && Object.keys(req.query).length > 0) {
        console.error('Query params:', JSON.stringify(req.query, null, 2));
      }
    }
    
    // Log des requêtes lentes (> 2 secondes)
    if (duration > 2000) {
      console.warn(`🐌 Slow request: ${req.method} ${req.originalUrl} took ${duration}ms`);
    }
    
    // Appeler la méthode originale
    originalEnd.call(this, chunk, encoding);
  };

  next();
};

module.exports = logger;