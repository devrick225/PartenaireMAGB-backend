# Guide de démarrage rapide - Backend PARTENAIRE MAGB

## 🚀 Installation rapide

### 1. Prérequis
```bash
# Vérifier les versions
node --version    # v18+
npm --version     # v8+
mongod --version  # v5.0+
```

### 2. Installation
```bash
# Cloner le projet
git clone https://github.com/votre-org/partenaire-magb-backend.git
cd partenaire-magb-backend

# Installer les dépendances
npm install

# Configurer les variables d'environnement
cp config.example.env .env
# Éditer le fichier .env avec vos configurations
```

### 3. Configuration minimale du .env
```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://localhost:27017/partenaire-magb
JWT_SECRET=your-secret-key-minimum-32-chars
JWT_EXPIRE=7d
JWT_REFRESH_SECRET=your-refresh-secret-key-32-chars
JWT_REFRESH_EXPIRE=30d
```

### 4. Démarrage
```bash
# Démarrer MongoDB (si local)
mongod

# Démarrer le serveur en développement
npm run dev
```

## 🧪 Test de l'API

### 1. Vérification du serveur
```bash
curl http://localhost:5000/health
```
**Réponse attendue :**
```json
{
  "status": "OK",
  "timestamp": "2023-12-XX...",
  "uptime": 123.456,
  "environment": "development"
}
```

### 2. Inscription d'un utilisateur
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Jean",
    "lastName": "Dupont",
    "email": "jean.dupont@example.com",
    "phone": "+225012345678",
    "password": "MonMotDePasse123",
    "country": "Côte d'\''Ivoire",
    "city": "Abidjan"
  }'
```

### 3. Connexion
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "jean.dupont@example.com",
    "password": "MonMotDePasse123"
  }'
```
**Sauvegardez le token JWT retourné pour les prochaines requêtes !**

### 4. Accéder au profil (avec token)
```bash
curl -X GET http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer VOTRE_TOKEN_JWT"
```

### 5. Créer un don
```bash
curl -X POST http://localhost:5000/api/donations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer VOTRE_TOKEN_JWT" \
  -d '{
    "amount": 10000,
    "currency": "XOF",
    "category": "tithe",
    "type": "one_time",
    "paymentMethod": "mobile_money",
    "message": "Dîme du mois"
  }'
```

## 📚 Endpoints principaux à tester

### Authentification
- `POST /api/auth/register` - Inscription
- `POST /api/auth/login` - Connexion  
- `GET /api/auth/me` - Profil utilisateur
- `POST /api/auth/logout` - Déconnexion

### Dons
- `GET /api/donations` - Liste des dons
- `POST /api/donations` - Créer un don
- `GET /api/donations/:id` - Détails d'un don

### Paiements
- `POST /api/payments/initialize` - Initialiser un paiement
- `GET /api/payments/:id` - Détails d'un paiement

### Support
- `GET /api/tickets` - Liste des tickets
- `POST /api/tickets` - Créer un ticket

### Utilisateurs
- `GET /api/users/profile` - Profil complet
- `PUT /api/users/profile` - Mettre à jour le profil

## 🔧 Tests avec Postman

### Collection Postman
Créez une collection avec les variables :
- `baseUrl`: `http://localhost:5000`
- `token`: `{{token}}` (à remplir après connexion)

### Variables d'environnement
```json
{
  "baseUrl": "http://localhost:5000",
  "token": "",
  "userId": ""
}
```

### Script pré-requête pour l'auth
```javascript
// Dans les requêtes nécessitant l'auth
pm.request.headers.add({
  key: 'Authorization',
  value: 'Bearer ' + pm.environment.get('token')
});
```

## 🐛 Debugging

### Logs du serveur
Les logs s'affichent dans la console avec :
- ✅ Requêtes réussies en vert
- ⚠️ Erreurs 4xx en jaune  
- ❌ Erreurs 5xx en rouge
- 🐌 Requêtes lentes > 2s

### Erreurs courantes

#### 1. Erreur de connexion MongoDB
```
Error: connect ECONNREFUSED 127.0.0.1:27017
```
**Solution :** Démarrer MongoDB avec `mongod`

#### 2. Token invalide
```json
{
  "success": false,
  "error": "Token invalide",
  "code": "INVALID_TOKEN"
}
```
**Solution :** Vérifier que le token JWT est correct et non expiré

#### 3. Validation échouée
```json
{
  "success": false,
  "error": "Données invalides",
  "details": [...]
}
```
**Solution :** Vérifier les champs requis selon la documentation

## 📊 Monitoring

### Métriques de base
- **Health check :** `GET /health`
- **Statistiques dons :** `GET /api/donations/stats` (auth requise)
- **Stats paiements :** `GET /api/payments/stats` (admin)

### Documentation Swagger
Une fois le serveur démarré, accédez à :
`http://localhost:5000/api-docs`

## 🔒 Sécurité en développement

### Tokens JWT
- Les tokens expirent après 7 jours par défaut
- Utilisez les refresh tokens pour renouveler
- Stockez les tokens de façon sécurisée côté client

### Rate Limiting
- 100 requêtes par 15 minutes par IP
- Applicable sur toutes les routes `/api/`

### Validation
- Tous les endpoints valident les données d'entrée
- Les mots de passe doivent contenir min. 8 caractères + majuscule + chiffre

## 🚀 Prochaines étapes

1. **Implémenter la logique métier :** Remplacer les TODO dans les controllers
2. **Configurer les paiements :** Ajouter les clés API CinetPay/Stripe
3. **Setup des emails :** Configurer Nodemailer pour les notifications
4. **Tests unitaires :** Lancer `npm test` 
5. **Déploiement :** Suivre le guide dans le README principal

## 🆘 Support

- **Issues GitHub :** Pour les bugs et améliorations
- **Documentation :** README.md principal
- **API Docs :** `/api-docs` endpoint

---

**Happy coding! 🎉** 