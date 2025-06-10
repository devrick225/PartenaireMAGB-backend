# 🚀 Guide de déploiement PARTENAIRE MAGB sur Vercel

## Variables d'environnement requises

Configurez ces variables dans l'interface Vercel ou via la CLI :

### 🗄️ Base de données
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/partenaire-magb
```

### 🔐 JWT Configuration
```
JWT_SECRET=your_super_secret_jwt_key_for_production
JWT_EXPIRE=24h
JWT_REFRESH_SECRET=your_refresh_token_secret_for_production
JWT_REFRESH_EXPIRE=7d
```

### 🌐 URLs Frontend
```
FRONTEND_URL=https://your-frontend-app.vercel.app
ADMIN_URL=https://your-admin-app.vercel.app
```

### 📧 Configuration Email
```
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_USER=your_sendgrid_username
EMAIL_PASS=your_sendgrid_password
EMAIL_FROM=noreply@partenaire-magb.com
```

### 💳 Fournisseurs de paiement
```
# CinetPay (Afrique de l'Ouest) - Documentation officielle
CINETPAY_API_KEY=your_cinetpay_api_key
CINETPAY_SITE_ID=your_cinetpay_site_id
CINETPAY_SECRET_KEY=your_cinetpay_secret_key
CINETPAY_ENVIRONMENT=sandbox # ou production

# Stripe (International)
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret

# PayPal (International)
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret
PAYPAL_ENVIRONMENT=sandbox # ou production

# FusionPay (fusionpay.io)
FUSIONPAY_API_URL=https://api.fusionpay.io/v1
FUSIONPAY_PUBLIC_KEY=your_fusionpay_public_key
FUSIONPAY_SECRET_KEY=your_fusionpay_secret_key
FUSIONPAY_WEBHOOK_SECRET=your_fusionpay_webhook_secret
FUSIONPAY_ENVIRONMENT=sandbox

# MoneyFusion (moneyfusion.net)
MONEYFUSION_API_URL=https://www.pay.moneyfusion.net/api/v1/payment
MONEYFUSION_ENVIRONMENT=production

# Mobile Money (optionnel)
ORANGE_MONEY_API_KEY=your_orange_money_api_key
MTN_API_KEY=your_mtn_api_key
MTN_SUBSCRIPTION_KEY=your_mtn_subscription_key
MTN_ENVIRONMENT=sandbox
```

### ⚡ Rate Limiting
```
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
NODE_ENV=production
```

## 📋 Étapes de déploiement

### Option 1: Déploiement via CLI Vercel

1. **Installer Vercel CLI**
```bash
npm install -g vercel
```

2. **Se connecter à Vercel**
```bash
vercel login
```

3. **Déployer l'application**
```bash
vercel --prod
```

### Option 2: Déploiement via GitHub

1. **Connecter le repository à Vercel**
   - Aller sur [vercel.com](https://vercel.com)
   - Importer le projet depuis GitHub
   - Configurer les variables d'environnement
   - Déployer automatiquement

### Option 3: Déploiement avec configuration automatique

1. **Configuration des variables via CLI**
```bash
# Configurer les variables d'environnement
vercel env add MONGODB_URI production
vercel env add JWT_SECRET production
vercel env add EMAIL_HOST production
# ... répéter pour toutes les variables
```

2. **Déployer**
```bash
vercel --prod
```

## 🔧 Configuration MongoDB Atlas

1. **Créer un cluster MongoDB Atlas**
2. **Whitelist les IPs Vercel (ou utiliser 0.0.0.0/0 pour tous)**
3. **Créer un utilisateur de base de données**
4. **Obtenir la chaîne de connexion**

## 📧 Configuration Email (SendGrid recommandé)

1. **Créer un compte SendGrid**
2. **Obtenir une clé API**
3. **Configurer un domaine d'envoi**
4. **Utiliser les credentials dans les variables d'environnement**

## 💳 Configuration des paiements

### CinetPay
1. Créer un compte sur [cinetpay.com](https://cinetpay.com)
2. Obtenir API Key et Site ID depuis le dashboard

### Stripe
1. Créer un compte sur [stripe.com](https://stripe.com)
2. Obtenir les clés depuis le dashboard

### FusionPay
1. Créer un compte sur [fusionpay.io](https://fusionpay.io)
2. Obtenir les clés API depuis le dashboard
3. Configurer l'URL webhook: `https://your-api.vercel.app/api/webhooks/fusionpay`
4. Tester la connexion via `/api/webhooks/fusionpay/test`

### PayPal
1. Créer une application sur [developer.paypal.com](https://developer.paypal.com)
2. Obtenir Client ID et Client Secret

## 🔍 Vérification du déploiement

Après déploiement, testez :

1. **Health check**
```
GET https://your-api.vercel.app/health
```

2. **Test d'authentification**
```
POST https://your-api.vercel.app/api/auth/register
```

3. **Logs Vercel**
```bash
vercel logs
```

## ⚠️ Limitations Vercel

- **Timeout**: 30 secondes max par fonction
- **Taille**: 50MB max par déploiement
- **Mémoire**: 1024MB max
- **Exécutions**: Serverless (pas de processus persistants)

## 🔄 CI/CD Automatique

Configurez GitHub Actions pour les tests automatiques avant déploiement :

```yaml
# .github/workflows/deploy.yml
name: Deploy to Vercel
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID}}
          vercel-project-id: ${{ secrets.PROJECT_ID}}
          vercel-args: '--prod'
```

## 🎯 Notes importantes pour CinetPay

Selon la documentation officielle de CinetPay :

### API Endpoint
- **URL de production** : `https://api-checkout.cinetpay.com/v2/payment`
- **URL de test** : `https://api-checkout.cinetpay.com/v2/payment` (même endpoint)

### Montants autorisés
- **Règle importante** : Le montant doit être un multiple de 5 (sauf pour USD)
- **Devises supportées** : XOF, XAF, CDF, GNF, USD

### Canaux de paiement
- `ALL` : Tous les canaux (par défaut)
- `MOBILE_MONEY` : Mobile Money uniquement
- `CREDIT_CARD` : Cartes bancaires uniquement
- `WALLET` : Portefeuilles électroniques

### Webhook CinetPay
L'URL de webhook sera automatiquement configurée à :
```
https://your-domain.vercel.app/api/webhooks/cinetpay
```

### Codes de statut CinetPay
- `ACCEPTED` / `COMPLETED` : Paiement réussi
- `REFUSED` / `CANCELLED` / `FAILED` : Paiement échoué
- `PENDING` / `WAITING` : Paiement en attente 