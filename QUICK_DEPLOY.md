# ⚡ Déploiement Rapide sur Vercel (5 minutes)

## 🚀 Étapes simplifiées

### 1. **Préparation (1 minute)**
```bash
# Installer Vercel CLI
npm install -g vercel

# Se connecter
vercel login
```

### 2. **Configuration MongoDB Atlas (2 minutes)**
1. Créer un compte sur [MongoDB Atlas](https://cloud.mongodb.com)
2. Créer un cluster gratuit
3. Créer un utilisateur de base de données
4. Obtenir la chaîne de connexion
5. Whitelister toutes les IPs (0.0.0.0/0)

### 3. **Déploiement automatique (1 minute)**
```bash
# Rendre le script exécutable (macOS/Linux)
chmod +x deploy.sh

# Déployer en mode preview
./deploy.sh

# OU déployer en production
./deploy.sh prod
```

### 4. **Configuration des variables (1 minute)**
Via l'interface web Vercel ou en CLI :

```bash
# Variables ESSENTIELLES minimum
vercel env add MONGODB_URI production
vercel env add JWT_SECRET production
vercel env add EMAIL_HOST production
vercel env add EMAIL_USER production
vercel env add EMAIL_PASS production
vercel env add FRONTEND_URL production
```

**Valeurs minimales pour tester :**
- `MONGODB_URI`: Votre chaîne MongoDB Atlas
- `JWT_SECRET`: Une chaîne aléatoire longue (32+ caractères)
- `EMAIL_HOST`: smtp.gmail.com (pour test)
- `EMAIL_USER`: votre email Gmail
- `EMAIL_PASS`: mot de passe d'application Gmail
- `FRONTEND_URL`: https://localhost:3000 (temporaire)

### 5. **Test (30 secondes)**
```bash
# Tester l'API
curl https://your-api.vercel.app/health

# Réponse attendue:
# {"status":"OK","timestamp":"...","uptime":0,"environment":"production"}
```

## 🎯 Déploiement express via GitHub

### Option alternative (plus simple)

1. **Push sur GitHub**
```bash
git add .
git commit -m "Initial deployment"
git push origin main
```

2. **Connecter à Vercel**
- Aller sur [vercel.com](https://vercel.com)
- "Import Project" → Sélectionner votre repo GitHub
- Configurer les variables d'environnement
- Déployer !

## 🔧 Variables d'environnement minimales

| Variable | Valeur exemple | Obligatoire |
|----------|----------------|-------------|
| `MONGODB_URI` | `mongodb+srv://user:pass@cluster.mongodb.net/db` | ✅ |
| `JWT_SECRET` | `super-secret-key-32-chars-min` | ✅ |
| `EMAIL_HOST` | `smtp.gmail.com` | ✅ |
| `EMAIL_USER` | `your-email@gmail.com` | ✅ |
| `EMAIL_PASS` | `your-app-password` | ✅ |
| `FRONTEND_URL` | `https://your-frontend.vercel.app` | ✅ |
| `NODE_ENV` | `production` | ✅ |

## 🚨 Dépannage rapide

### Erreur de connexion MongoDB
```bash
# Vérifier la chaîne de connexion
echo $MONGODB_URI

# Format correct:
# mongodb+srv://username:password@cluster.mongodb.net/database
```

### Erreur de timeout
- Les fonctions Vercel ont un timeout de 30s max
- Optimiser les requêtes MongoDB
- Utiliser des indexes appropriés

### Erreur de variables d'environnement
```bash
# Lister les variables configurées
vercel env ls

# Ajouter une variable manquante
vercel env add VARIABLE_NAME production
```

### Logs de debugging
```bash
# Voir les logs en temps réel
vercel logs --follow

# Logs de la dernière heure
vercel logs --since=1h
```

## ✅ Checklist finale

- [ ] MongoDB Atlas configuré et accessible
- [ ] Variables d'environnement configurées sur Vercel
- [ ] API deployée et accessible
- [ ] Health check fonctionne
- [ ] Test d'authentification réussi
- [ ] Emails de test envoyés

## 🎉 Félicitations !

Votre API PARTENAIRE MAGB est maintenant en ligne !

**URL de base :** `https://your-project.vercel.app`

**Endpoints principaux :**
- `GET /health` - Status de l'API
- `POST /api/auth/register` - Inscription
- `POST /api/auth/login` - Connexion
- `GET /api/donations` - Liste des dons

📚 **Documentation complète :** Voir `DEPLOYMENT.md` 