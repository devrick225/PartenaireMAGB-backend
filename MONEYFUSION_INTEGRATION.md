# 🚀 Guide d'intégration MoneyFusion

## 📋 Vue d'ensemble

MoneyFusion est intégré dans PARTENAIRE MAGB en utilisant le package NPM officiel `fusionpay`. Cette intégration offre :
- **Interface fluide** avec méthodes chainées
- **Webhooks automatiques** pour les notifications
- **API simple** pour initialisation et vérification
- **Support multi-devises** (XOF, EUR, USD)

## 🔧 Configuration

### Package NPM installé
```bash
npm install fusionpay
```

### Variables d'environnement
```bash
MONEYFUSION_API_URL=https://www.pay.moneyfusion.net/api/v1/payment
MONEYFUSION_ENVIRONMENT=sandbox  # ou production
```

### Configuration Vercel
```bash
vercel env add MONEYFUSION_API_URL production
vercel env add MONEYFUSION_ENVIRONMENT production
```

## 💻 Utilisation Frontend

### 1. Initialiser un paiement MoneyFusion

```javascript
// Exemple d'appel depuis le frontend
const initializeMoneyFusionPayment = async (donationData) => {
  try {
    const response = await fetch('/api/payments/initialize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({
        donationId: donationData.donationId,
        provider: 'moneyfusion',
        paymentMethod: 'card', // Optionnel
        customerPhone: '+225xxxxxxxx' // Requis
      })
    });

    const result = await response.json();

    if (result.success) {
      // Rediriger vers l'URL de paiement MoneyFusion
      window.location.href = result.data.paymentUrl;
    } else {
      console.error('Erreur initialisation:', result.error);
    }
  } catch (error) {
    console.error('Erreur:', error);
  }
};
```

### 2. Gérer le retour de paiement

```javascript
// Page de succès/callback MoneyFusion
const handleMoneyFusionReturn = async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  const provider = urlParams.get('provider');

  if (provider === 'moneyfusion' && token) {
    // Vérifier le paiement côté serveur
    await verifyPayment(paymentId);
  } else {
    // Gérer l'échec ou l'annulation
    showMessage('Paiement annulé ou échoué', 'error');
  }
};

const verifyPayment = async (paymentId) => {
  try {
    const response = await fetch(`/api/payments/${paymentId}/verify`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userToken}`
      }
    });

    const result = await response.json();
    
    if (result.success) {
      showMessage('Paiement MoneyFusion confirmé!', 'success');
      window.location.href = '/donations/success';
    }
  } catch (error) {
    console.error('Erreur vérification:', error);
  }
};
```

### 3. Interface utilisateur MoneyFusion

```jsx
// Composant React pour MoneyFusion
const MoneyFusionPayment = ({ donationData, onSuccess, onError }) => {
  const [isLoading, setIsLoading] = useState(false);

  const handlePayment = async () => {
    setIsLoading(true);
    
    try {
      const result = await initializeMoneyFusionPayment(donationData);
      
      if (result.success) {
        // L'utilisateur sera redirigé vers MoneyFusion
        // Le retour se fera via webhook + returnUrl
      } else {
        onError(result.error);
      }
    } catch (error) {
      onError('Erreur lors de l\'initialisation du paiement');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="moneyfusion-payment">
      <div className="payment-provider">
        <img src="/icons/moneyfusion-logo.png" alt="MoneyFusion" />
        <h3>MoneyFusion</h3>
        <p>Paiement sécurisé via MoneyFusion</p>
      </div>

      <div className="payment-details">
        <p><strong>Montant:</strong> {donationData.formattedAmount}</p>
        <p><strong>Frais estimés:</strong> 2.5% + 125 XOF</p>
      </div>

      <button 
        onClick={handlePayment}
        disabled={isLoading}
        className="btn-moneyfusion"
      >
        {isLoading ? 'Redirection...' : 'Payer avec MoneyFusion'}
      </button>
    </div>
  );
};
```

## 🔄 Webhooks

### Configuration automatique
Les webhooks sont automatiquement configurés lors de l'initialisation du paiement.

**URL webhook**: `https://your-api.vercel.app/api/webhooks/moneyfusion`

### Événements traités
- `payment_completed` - Paiement réussi (statut: 'paid')
- `payment_failed` - Paiement échoué (statut: 'failed', 'no paid')
- `payment_pending` - Paiement en attente (statut: 'pending')
- `payment_cancelled` - Paiement annulé (statut: 'cancelled')

### Structure des données webhook
```json
{
  "tokenPay": "token_paiement_123",
  "statut": "paid",
  "numeroTransaction": "MF_TXN_123456",
  "Montant": 5000,
  "frais": 150,
  "nomclient": "Jean Dupont",
  "numeroSend": "+225xxxxxxxx",
  "personal_Info": [
    {
      "donation_id": "donation_id_here",
      "customer_email": "jean@example.com",
      "currency": "XOF"
    }
  ],
  "moyen": "mobile_money",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

## 🧪 Tests

### 1. Test de connexion
```bash
curl -X GET "https://your-api.vercel.app/api/webhooks/moneyfusion/test" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 2. Test d'initialisation de paiement
```bash
curl -X POST "https://your-api.vercel.app/api/payments/initialize" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "donationId": "60f7b1234567890123456789",
    "provider": "moneyfusion",
    "customerPhone": "+225xxxxxxxx"
  }'
```

### 3. Simulation de webhook
```bash
curl -X POST "https://your-api.vercel.app/api/webhooks/moneyfusion" \
  -H "Content-Type: application/json" \
  -d '{
    "tokenPay": "test_token_123",
    "statut": "paid",
    "numeroTransaction": "MF_TEST_123",
    "Montant": 1000,
    "frais": 50,
    "nomclient": "Test User",
    "numeroSend": "+225xxxxxxxx",
    "personal_Info": [{"test": true}],
    "moyen": "card",
    "createdAt": "2024-01-15T10:30:00Z"
  }'
```

## 📊 Frais de transaction

| Montant | Frais (2.5%) | Frais fixes | Total frais |
|---------|--------------|-------------|-------------|
| 1,000 XOF | 25 XOF | 125 XOF | 150 XOF |
| 5,000 XOF | 125 XOF | 125 XOF | 250 XOF |
| 10,000 XOF | 250 XOF | 125 XOF | 375 XOF |

## 🔐 Sécurité

### Protection des données
- **HTTPS obligatoire** pour tous les échanges
- **Validation côté serveur** des montants et données
- **Logs sécurisés** des transactions
- **Pas de stockage** des données de paiement sensibles

### Bonnes pratiques
- Toujours vérifier le paiement côté serveur
- Utiliser les webhooks pour la confirmation finale
- Implémenter une gestion d'erreurs robuste
- Logger les événements importants

## 🚨 Dépannage

### Erreur "Provider not supported"
```bash
# Vérifier que 'moneyfusion' est dans les providers autorisés
# Le provider a été ajouté dans routes/payments.js
```

### Problème de redirection
```bash
# Vérifier la configuration de FRONTEND_URL
echo $FRONTEND_URL

# S'assurer que les URLs de retour sont correctes
```

### Webhook non reçu
```bash
# Vérifier l'URL de webhook configurée
# Elle doit être accessible publiquement
# Format: https://your-api.vercel.app/api/webhooks/moneyfusion
```

### Erreur de montant
```bash
# MoneyFusion attend des montants en centimes pour certaines devises
# Notre intégration gère automatiquement la conversion
```

## 📞 Support

- **Documentation MoneyFusion**: [moneyfusion.net](https://moneyfusion.net)
- **Package NPM**: [fusionpay sur NPM](https://www.npmjs.com/package/fusionpay)
- **Repository GitHub**: [Yaya12085/fusionpay](https://github.com/Yaya12085/fusionpay)

## 🎯 Comparaison avec FusionPay

| Aspect | MoneyFusion | FusionPay |
|--------|-------------|-----------|
| **Package NPM** | ✅ Disponible | ❌ Intégration manuelle |
| **API Style** | Fluent (chainable) | REST classique |
| **Webhooks** | Simples | Avec signature HMAC |
| **Documentation** | Basique mais claire | Très détaillée |
| **Sécurité** | Standard HTTPS | HMAC + TLS 1.3 |
| **Courbe d'apprentissage** | Facile | Modérée |

## 💡 Exemple d'intégration complète

```javascript
// Service MoneyFusion côté frontend
class MoneyFusionService {
  constructor(apiBaseUrl, authToken) {
    this.apiBaseUrl = apiBaseUrl;
    this.authToken = authToken;
  }

  async initializePayment(donationData) {
    const response = await fetch(`${this.apiBaseUrl}/api/payments/initialize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.authToken}`
      },
      body: JSON.stringify({
        donationId: donationData.donationId,
        provider: 'moneyfusion',
        customerPhone: donationData.customerPhone
      })
    });

    return await response.json();
  }

  async verifyPayment(paymentId) {
    const response = await fetch(`${this.apiBaseUrl}/api/payments/${paymentId}/verify`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.authToken}`
      }
    });

    return await response.json();
  }

  async testConnection() {
    const response = await fetch(
      `${this.apiBaseUrl}/api/webhooks/moneyfusion/test`,
      {
        headers: {
          'Authorization': `Bearer ${this.authToken}`
        }
      }
    );

    return await response.json();
  }
}

// Utilisation
const moneyFusion = new MoneyFusionService('https://your-api.vercel.app', userToken);

// Initialiser un paiement
const result = await moneyFusion.initializePayment({
  donationId: 'donation_id_here',
  customerPhone: '+225xxxxxxxx'
});

if (result.success) {
  window.location.href = result.data.paymentUrl;
}
```

Votre intégration MoneyFusion est maintenant complète et prête à traiter les paiements! 🎉

## 🔗 Liens utiles

- [Documentation FusionPay](./FUSIONPAY_INTEGRATION.md) - Comparer avec l'autre intégration
- [Guide de déploiement](./DEPLOYMENT.md) - Configuration Vercel
- [Guide de démarrage rapide](./QUICK_DEPLOY.md) - Déploiement en 5 minutes 