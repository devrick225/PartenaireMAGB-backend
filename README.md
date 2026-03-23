# Backend PARTENAIRE MAGB

Backend API pour l'application de gestion de dons thématiques pour église développée avec Node.js, Express, et MongoDB.

## 🚀 Fonctionnalités

### 👥 Gestion des utilisateurs
- Inscription et authentification JWT
- Profils utilisateurs complets avec données ecclésiastiques
- Système de rôles (user, admin, moderator, treasurer)
- Vérification email et 2FA
- Gestion des préférences et notifications

### 💰 Système de dons
- Dons ponctuels et récurrents (journalier, hebdomadaire, mensuel, trimestriel, annuel)
- Catégories de dons (dîme, offrande, construction, missions, etc.)
- Gestion des dédicaces et hommages
- Génération automatique de reçus
- Système de gamification avec points et badges

### 💳 Intégrations de paiement
- **CinetPay** - Paiements en Afrique de l'Ouest (conforme documentation officielle v2)
- **Stripe** - Cartes bancaires internationales
- **PayPal** - Paiements PayPal
- **Mobile Money** - Orange Money, MTN Mobile Money, Moov Money
- **FusionPay** - Cartes, Mobile Money, Crypto, Virements
- **MoneyFusion** - API fluide avec package NPM officiel
- **Wave** - Portefeuille mobile Wave
- Gestion des webhooks et vérifications de sécurité
- Système de remboursements

### 🎫 Support client
- Système de tickets avec SLA
- Gestion des priorités et assignations
- Métriques de performance
- Pièces jointes et historique complet

## 🛠 Stack technique

- **Runtime** : Node.js 18+
- **Framework** : Express.js
- **Base de données** : MongoDB avec Mongoose
- **Authentification** : JWT avec refresh tokens
- **Validation** : Express Validator
- **Sécurité** : Helmet, Rate limiting, CORS
- **Documentation** : Swagger/OpenAPI
- **Paiements** : Stripe, CinetPay, PayPal
- **Tests** : Jest + Supertest

## 📁 Architecture du projet

```
partenaire-magb-backend/
├── controllers/           # Logique métier
│   ├── authController.js
│   ├── donationController.js
│   ├── paymentController.js
│   └── ticketController.js
├── models/               # Modèles Mongoose
│   ├── User.js
│   ├── Profile.js
│   ├── Donation.js
│   ├── Payment.js
│   └── Ticket.js
├── routes/               # Routes Express
│   ├── auth.js
│   ├── donations.js
│   ├── payments.js
│   ├── tickets.js
│   └── webhooks.js
├── middleware/           # Middlewares
│   ├── auth.js
│   ├── errorHandler.js
│   └── logger.js
├── services/             # Services externes
│   └── paymentService.js
├── config/               # Configuration
├── tests/                # Tests
└── docs/                 # Documentation
```

## 🚀 Installation et démarrage

### Prérequis
- Node.js 18+
- MongoDB 5.0+
- NPM ou Yarn

### Installation

1. **Cloner le repository**
```bash
git clone https://github.com/votre-org/partenaire-magb-backend.git
cd partenaire-magb-backend
```

2. **Installer les dépendances**
```bash
npm install
```

3. **Configuration des variables d'environnement**
```bash
# Copier le fichier d'exemple
cp config.example.env .env

# Éditer le fichier .env avec vos configurations
nano .env
```

4. **Démarrage en développement**
```bash
npm run dev
```

5. **Démarrage en production**
```bash
npm start
```

## ⚙️ Configuration des variables d'environnement

Créer un fichier `.env` à la racine du projet :

```env
# Configuration serveur
NODE_ENV=development
PORT=5000
HOST=localhost
FRONTEND_URL=http://localhost:3000
FRONTEND_NEW_URL=http://localhost:8080

# Base de données MongoDB
MONGODB_URI=mongodb://localhost:27017/partenaire-magb

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRE=7d
JWT_REFRESH_SECRET=your-refresh-secret-key
JWT_REFRESH_EXPIRE=30d

# Configuration CinetPay
CINETPAY_API_KEY=your-cinetpay-api-key
CINETPAY_SITE_ID=your-cinetpay-site-id
CINETPAY_SECRET_KEY=your-cinetpay-secret-key
CINETPAY_ENVIRONMENT=sandbox

# Configuration Stripe
STRIPE_SECRET_KEY=sk_test_your-stripe-secret-key
STRIPE_WEBHOOK_SECRET=whsec_your-stripe-webhook-secret

# Configuration PayPal
PAYPAL_CLIENT_ID=your-paypal-client-id
PAYPAL_CLIENT_SECRET=your-paypal-client-secret
PAYPAL_ENVIRONMENT=sandbox

# Configuration Email
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
```

## 📚 Endpoints API principaux

### 🔐 Authentification (`/api/auth`)
```
POST   /register          - Inscription
POST   /login             - Connexion
POST   /refresh           - Refresh token
GET    /verify-email/:token - Vérification email
POST   /forgot-password   - Demande reset mot de passe
POST   /reset-password/:token - Reset mot de passe
GET    /me                - Profil utilisateur
PUT    /change-password   - Changer mot de passe
POST   /logout            - Déconnexion
```

### 💰 Dons (`/api/donations`)
```
GET    /                  - Liste des dons
POST   /                  - Créer un don
GET    /:id               - Détails d'un don
PUT    /:id               - Modifier un don
DELETE /:id               - Supprimer un don
POST   /:id/cancel        - Annuler un don récurrent
GET    /stats             - Statistiques des dons
```

### 💳 Paiements (`/api/payments`)
```
POST   /initialize        - Initialiser un paiement
GET    /:id               - Détails d'un paiement
POST   /:id/verify        - Vérifier un paiement
POST   /:id/refund        - Rembourser un paiement
GET    /stats             - Statistiques des paiements
```

### 🎫 Support (`/api/tickets`)
```
GET    /                  - Liste des tickets
POST   /                  - Créer un ticket
GET    /:id               - Détails d'un ticket
PUT    /:id               - Modifier un ticket
POST   /:id/assign        - Assigner un ticket
POST   /:id/close         - Fermer un ticket
```

### 🔔 Webhooks (`/api/webhooks`)
```
POST   /cinetpay          - Webhook CinetPay
POST   /stripe            - Webhook Stripe
POST   /paypal            - Webhook PayPal
```

## 🔒 Sécurité

### Authentification et autorisation
- JWT avec refresh tokens
- Système de rôles granulaires
- Vérification email obligatoire
- Protection contre les attaques par force brute
- Verrouillage temporaire des comptes

### Protection des données
- Chiffrement des mots de passe avec bcrypt
- Validation stricte des entrées
- Protection CORS configurée
- Rate limiting sur les endpoints sensibles
- Helmet pour les headers de sécurité

### Paiements sécurisés
- Vérification des signatures webhooks
- Conformité PCI DSS (via Stripe)
- Chiffrement des données sensibles
- Audit trail complet des transactions

## 📊 Modèles de données

### User (Utilisateur)
```javascript
{
  firstName: String,
  lastName: String,
  email: String (unique),
  phone: String (unique),
  password: String (hashed),
  role: Enum['user', 'admin', 'moderator', 'treasurer'],
  isEmailVerified: Boolean,
  totalDonations: Number,
  level: Number,
  points: Number,
  badges: [Object],
  // ... autres champs
}
```

### Donation (Don)
```javascript
{
  user: ObjectId (ref: User),
  amount: Number,
  currency: Enum['XOF', 'EUR', 'USD'],
  category: Enum['tithe', 'offering', 'building', ...],
  type: Enum['one_time', 'recurring'],
  recurring: {
    frequency: Enum['daily', 'weekly', 'monthly', ...],
    nextPaymentDate: Date,
    isActive: Boolean
  },
  status: Enum['pending', 'completed', 'failed', ...],
  // ... autres champs
}
```

### Payment (Paiement)
```javascript
{
  user: ObjectId (ref: User),
  donation: ObjectId (ref: Donation),
  amount: Number,
  provider: Enum['cinetpay', 'stripe', 'paypal', ...],
  status: Enum['pending', 'completed', 'failed', ...],
  cinetpay: { /* données spécifiques */ },
  stripe: { /* données spécifiques */ },
  paypal: { /* données spécifiques */ },
  // ... autres champs
}
```

## 🧪 Tests

```bash
# Lancer tous les tests
npm test

# Tests en mode watch
npm run test:watch

# Coverage des tests
npm run test:coverage
```

## 📈 Monitoring et logs

### Logs
- Logs structurés avec timestamps
- Différents niveaux de log (error, warn, info, debug)
- Logs des erreurs avec stack traces en développement
- Logs des requêtes lentes (> 2s)

### Métriques
- Temps de réponse des endpoints
- Taux d'erreur par endpoint
- Statistiques des paiements
- Performance des bases de données

## 🚀 Déploiement

### Variables d'environnement production
```env
NODE_ENV=production
MONGODB_URI=mongodb://your-prod-db-uri
JWT_SECRET=your-production-jwt-secret
# ... autres variables
```

### Docker (optionnel)
```bash
# Build de l'image
docker build -t partenaire-magb-backend .

# Lancement du container
docker run -p 5000:5000 --env-file .env partenaire-magb-backend
```

### Déploiement recommandé
- **Hébergement** : AWS EC2, Digital Ocean, Heroku
- **Base de données** : MongoDB Atlas
- **Monitoring** : PM2, New Relic
- **Load balancer** : Nginx

## 🤝 Contribution

1. Fork le projet
2. Créer une branche feature (`git checkout -b feature/AmazingFeature`)
3. Commit les changements (`git commit -m 'Add some AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

## 📝 Licence

Ce projet est sous licence MIT. Voir le fichier `LICENSE` pour plus de détails.

## 🆘 Support

Pour toute question ou problème :
- Créer une issue sur GitHub
- Contacter l'équipe de développement
- Consulter la documentation Swagger : `http://localhost:5000/api-docs`

## 🔄 Changelog

### Version 1.0.0
- ✅ Système d'authentification complet
- ✅ Gestion des dons ponctuels et récurrents
- ✅ Intégrations CinetPay, Stripe, PayPal
- ✅ Système de support client
- ✅ API RESTful documentée

## 🎯 Roadmap

### Version 1.1.0
- [ ] Notifications push
- [ ] Dashboard d'analytics
- [ ] Export des rapports PDF
- [ ] API mobile optimisée

### Version 1.2.0
- [ ] Intégration Wave
- [ ] Système de campagnes
- [ ] Multi-tenant (plusieurs églises)
- [ ] Chat en temps réel

---

**Développé avec ❤️ pour PARTENAIRE MAGB** 

## 💳 Fournisseurs de paiement supportés

- **CinetPay** - Paiements en Afrique de l'Ouest (conforme documentation officielle v2)
- **Stripe** - Cartes bancaires internationales  
- **PayPal** - Paiements PayPal
- **FusionPay** - Cartes, Mobile Money, Crypto, Virements
- **MoneyFusion** - API fluide avec package NPM officiel
- **Orange Money** - Mobile Money Orange
- **MTN Mobile Money** - Mobile Money MTN
- **Moov Money** - Mobile Money Moov
- **Wave** - Portefeuille mobile Wave

### 🎯 Spécificités CinetPay

L'intégration CinetPay est conforme à leur documentation officielle v2 :
- ✅ **API v2** : `https://api-checkout.cinetpay.com/v2/payment`
- ✅ **Validation des montants** : Multiple de 5 (sauf USD)
- ✅ **Devises supportées** : XOF, XAF, CDF, GNF, USD
- ✅ **Canaux multiples** : ALL, MOBILE_MONEY, CREDIT_CARD, WALLET
- ✅ **Webhooks complets** : Traitement de tous les statuts
- ✅ **Gestion d'erreurs** : Codes d'erreur selon documentation