# 🚀 Guide de Démarrage Rapide - PARTENAIRE MAGB Backend

Ce guide vous permettra de configurer et démarrer le backend en quelques minutes.

## ⚡ Démarrage Express (5 minutes)

### 1. Configuration de Base
```bash
# Cloner et naviguer dans le projet
cd PartenaireMAGB-backend

# Installer les dépendances
npm install

# Copier le fichier de configuration
cp config.example.env .env
```

### 2. Configuration MongoDB
```bash
# Option A: MongoDB local (recommandé pour développement)
# Assurez-vous que MongoDB est installé et démarré
mongod

# Option B: MongoDB Atlas (cloud)
# Remplacez l'URL dans .env avec votre chaîne de connexion Atlas
```

### 3. Configuration Minimale du .env
Éditez le fichier `.env` et configurez au minimum :
```env
# Base de données (obligatoire)
MONGODB_URI=mongodb://localhost:27017/partenaire-magb

# JWT (obligatoire - utilisez des chaînes de 32+ caractères)
JWT_SECRET=votre-cle-secrete-jwt-32-caracteres-minimum
JWT_REFRESH_SECRET=votre-cle-refresh-jwt-32-caracteres-minimum

# URLs Frontend (optionnel pour développement)
FRONTEND_URL=http://localhost:3000
```

### 4. Initialisation et Test
```bash
# Tester la connexion MongoDB
npm run check

# Initialiser avec des données de test
npm run setup

# Démarrer le serveur
npm run dev
```

## ✅ Vérification

Si tout fonctionne, vous devriez voir :
```
✅ MongoDB connecté: localhost:27017
🚀 Serveur démarré sur le port 5000
📖 Documentation API: http://localhost:5000/api-docs
🏥 Health check: http://localhost:5000/health
```

Testez l'API : http://localhost:5000/health

## 👥 Comptes de Test Créés

Le setup crée automatiquement ces comptes :

### Administrateurs
- **Admin**: `admin@partenairemagb.com` / `Admin123456!`
- **Trésorier**: `tresorier@partenairemagb.com` / `Tresorier123!`
- **Support**: `support@partenairemagb.com` / `Support123!`

### Utilisateurs
- **Jean**: `jean.kouassi@example.com` / `User123456!`
- **Marie**: `marie.kouadio@example.com` / `User123456!`
- **Paul**: `paul.brou@example.com` / `User123456!`

## 🛠️ Commandes Utiles

```bash
# Développement
npm run dev              # Serveur avec rechargement automatique
npm run start            # Serveur en production

# Base de données
npm run check            # Tester la connexion MongoDB
npm run seed             # Réinitialiser avec données de test
npm run reset            # Nettoyer et réinitialiser
npm run db:backup        # Créer une sauvegarde

# Tests
npm test                 # Lancer les tests
npm run test:watch       # Tests en mode watch
```

## 🚨 Dépannage

### Erreur de connexion MongoDB
```bash
# Vérifier si MongoDB est démarré
sudo systemctl status mongod    # Linux
brew services list | grep mongo # macOS

# Démarrer MongoDB
sudo systemctl start mongod     # Linux
brew services start mongodb     # macOS
```

### Erreur JWT_SECRET
```
Error: JWT_SECRET must be at least 32 characters
```
**Solution**: Générez une clé de 32+ caractères dans votre .env

### Port déjà utilisé
```
Error: listen EADDRINUSE :::5000
```
**Solution**: Changez le PORT dans .env ou arrêtez l'autre processus

### Problème de permissions
```bash
# Réinitialiser les permissions npm
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

## 📁 Structure Importante

```
PartenaireMAGB-backend/
├── .env                    # Configuration (à créer)
├── server.js              # Point d'entrée
├── models/                # Modèles MongoDB
├── routes/                # Routes API
├── middleware/            # Middlewares Express
├── services/              # Services métier
└── scripts/               # Scripts utilitaires
    ├── seed.js            # Données de test
    ├── cleanDatabase.js   # Nettoyage DB
    └── testConnection.js  # Test connexion
```

## 🔧 Configuration Avancée

### Variables d'Environnement Importantes

```env
# Sécurité
JWT_SECRET=32-chars-minimum
JWT_EXPIRE=7d

# Email (pour notifications)
EMAIL_HOST=smtp.gmail.com
EMAIL_USER=votre-email@gmail.com
EMAIL_PASS=mot-de-passe-app

# SMS (optionnel)
TWILIO_ACCOUNT_SID=votre-sid
TWILIO_AUTH_TOKEN=votre-token

# Upload d'images (optionnel)
CLOUDINARY_CLOUD_NAME=votre-nom
CLOUDINARY_API_KEY=votre-cle
CLOUDINARY_API_SECRET=votre-secret
```

### Paiements (Production)
Pour activer les paiements, configurez au moins un provider :
- **Mobile Money**: Orange Money, MTN, etc.
- **Cartes**: Stripe, CinetPay
- **Autres**: PayPal, FusionPay

## 📞 Support

### Ressources
- **Documentation complète**: `scripts/README.md`
- **Tests API**: `http://localhost:5000/api-docs`
- **Health Check**: `http://localhost:5000/health`

### En cas de problème
1. Vérifiez MongoDB : `npm run check`
2. Vérifiez les logs du serveur
3. Réinitialisez : `npm run reset`
4. Consultez la documentation

## 🎯 Prochaines Étapes

1. **Frontend**: Configurez le frontend React
2. **Production**: Configurez les services de paiement
3. **Sécurité**: Changez toutes les clés par défaut
4. **Monitoring**: Configurez les logs et monitoring

## ⚡ Commandes Rapides

```bash
# Setup complet en une commande
npm run setup && npm run dev

# Reset complet si problème
npm run reset && npm run dev

# Test complet de la DB
npm run db:test:full
```

---

🎉 **Félicitations !** Votre backend PARTENAIRE MAGB est maintenant configuré et prêt à l'utilisation.
