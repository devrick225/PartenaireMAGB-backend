# 🚀 Guide d'intégration FusionPay

## 📋 Vue d'ensemble

FusionPay est intégré dans PARTENAIRE MAGB pour supporter:
- **Cartes bancaires** (Visa, Mastercard)
- **Mobile Money** (Orange, MTN, Moov)
- **Virements bancaires**
- **Cryptomonnaies** (Bitcoin, Ethereum, USDT)

## 🔧 Configuration

### Variables d'environnement
```bash
FUSIONPAY_API_URL=https://api.fusionpay.io/v1
FUSIONPAY_PUBLIC_KEY=fp_pub_live_xxxxx  # ou fp_pub_test_xxxxx pour test
FUSIONPAY_SECRET_KEY=fp_sec_live_xxxxx  # ou fp_sec_test_xxxxx pour test
FUSIONPAY_WEBHOOK_SECRET=fp_wh_xxxxx
```

### Configuration Vercel
```bash
vercel env add FUSIONPAY_PUBLIC_KEY production
vercel env add FUSIONPAY_SECRET_KEY production
vercel env add FUSIONPAY_WEBHOOK_SECRET production
```

## 💻 Utilisation Frontend

### 1. Initialiser un paiement

```javascript
// Exemple d'appel depuis le frontend
const initializeFusionPayPayment = async (donationData) => {
  try {
    const response = await fetch('/api/payments/initialize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({
        donationId: donationData.donationId,
        provider: 'fusionpay',
        paymentMethod: 'card', // 'card', 'mobile_money', 'crypto', 'bank_transfer'
        customerPhone: '+225xxxxxxxx' // Requis pour mobile money
      })
    });

    const result = await response.json();

    if (result.success) {
      // Rediriger vers l'URL de paiement
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
// Page de succès/callback
const handlePaymentReturn = async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const paymentId = urlParams.get('payment_id');
  const status = urlParams.get('status');

  if (status === 'success') {
    // Vérifier le paiement côté serveur
    await verifyPayment(paymentId);
  } else if (status === 'cancelled') {
    // Gérer l'annulation
    showMessage('Paiement annulé', 'warning');
  } else {
    // Gérer l'échec
    showMessage('Paiement échoué', 'error');
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
      showMessage('Paiement confirmé avec succès!', 'success');
      // Rediriger vers la page de remerciement
      window.location.href = '/donations/success';
    }
  } catch (error) {
    console.error('Erreur vérification:', error);
  }
};
```

### 3. Interface utilisateur

```jsx
// Composant React pour sélection de méthode de paiement
const FusionPayPaymentMethods = ({ onMethodSelect }) => {
  const [methods, setMethods] = useState([]);
  const [selectedMethod, setSelectedMethod] = useState(null);

  useEffect(() => {
    // Récupérer les méthodes disponibles
    fetchPaymentMethods();
  }, []);

  const fetchPaymentMethods = async () => {
    try {
      const response = await fetch('/api/webhooks/fusionpay/payment-methods?currency=XOF&country=CI');
      const result = await response.json();
      
      if (result.success) {
        setMethods(result.data.methods);
      }
    } catch (error) {
      console.error('Erreur récupération méthodes:', error);
    }
  };

  return (
    <div className="payment-methods">
      <h3>Choisir une méthode de paiement</h3>
      
      {methods.map(method => (
        <div 
          key={method.id}
          className={`method-card ${selectedMethod === method.id ? 'selected' : ''}`}
          onClick={() => setSelectedMethod(method.id)}
        >
          <img src={method.logo} alt={method.name} />
          <span>{method.name}</span>
          <span className="fee">Frais: {method.fee}%</span>
        </div>
      ))}

      <button 
        onClick={() => onMethodSelect(selectedMethod)}
        disabled={!selectedMethod}
        className="btn-primary"
      >
        Continuer le paiement
      </button>
    </div>
  );
};
```

## 🔄 Webhooks

### Configuration automatique
Les webhooks sont automatiquement configurés lors de l'initialisation du paiement.

**URL webhook**: `https://your-api.vercel.app/api/webhooks/fusionpay`

### Types d'événements traités
- `payment.completed` - Paiement réussi
- `payment.failed` - Paiement échoué
- `payment.pending` - Paiement en attente
- `refund.completed` - Remboursement complété

## 🧪 Tests

### 1. Test de connexion
```bash
curl -X GET "https://your-api.vercel.app/api/webhooks/fusionpay/test" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 2. Test de méthodes de paiement
```bash
curl -X GET "https://your-api.vercel.app/api/webhooks/fusionpay/payment-methods?currency=XOF&country=CI" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 3. Test d'initialisation de paiement
```bash
curl -X POST "https://your-api.vercel.app/api/payments/initialize" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "donationId": "60f7b1234567890123456789",
    "provider": "fusionpay",
    "paymentMethod": "card"
  }'
```

### 4. Données de test FusionPay

#### Cartes de test
```
Visa: 4111111111111111
Mastercard: 5555555555554444
CVV: 123
Date expiration: 12/25
```

#### Mobile Money de test
```
Orange Money: +225 07 00 00 00 00
MTN Money: +225 05 00 00 00 00
Moov Money: +225 01 00 00 00 00
```

## 📊 Frais de transaction

| Méthode | Frais | Frais fixes |
|---------|-------|-------------|
| Carte bancaire | 2.9% | 150 XOF |
| Mobile Money | 2.5% | 100 XOF |
| Virement bancaire | 1.5% | 200 XOF |
| Cryptomonnaie | 1.0% | 0 XOF |

## 🔐 Sécurité

### Validation des signatures
Tous les webhooks sont automatiquement validés avec HMAC-SHA256.

### Chiffrement
- Communications TLS 1.3
- Clés API chiffrées
- Tokens JWT signés

## 🚨 Dépannage

### Erreur "Provider not supported"
```bash
# Vérifier que FusionPay est dans les providers autorisés
# Mettre à jour routes/payments.js si nécessaire
```

### Erreur de signature webhook
```bash
# Vérifier FUSIONPAY_WEBHOOK_SECRET
echo $FUSIONPAY_WEBHOOK_SECRET

# Régénérer le secret si nécessaire
```

### Timeout de paiement
```bash
# Les paiements FusionPay expirent après 30 minutes
# Vérifier payment.fusionpay.expiresAt
```

## 📞 Support

- **Documentation API**: [docs.fusionpay.io](https://docs.fusionpay.io)
- **Support FusionPay**: support@fusionpay.io
- **Status API**: [status.fusionpay.io](https://status.fusionpay.io)

## 🎯 Intégration complète

### Flux complet de paiement

1. **Frontend**: Utilisateur sélectionne FusionPay
2. **Backend**: Initialise le paiement
3. **FusionPay**: Présente l'interface de paiement
4. **Utilisateur**: Effectue le paiement
5. **Webhook**: Notification de statut
6. **Backend**: Traite la notification
7. **Email**: Reçu envoyé automatiquement

### Code d'exemple complet

```javascript
// Service de paiement FusionPay côté frontend
class FusionPayService {
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
        provider: 'fusionpay',
        paymentMethod: donationData.paymentMethod,
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

  async getPaymentMethods(currency = 'XOF', country = 'CI') {
    const response = await fetch(
      `${this.apiBaseUrl}/api/webhooks/fusionpay/payment-methods?currency=${currency}&country=${country}`,
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
const fusionPay = new FusionPayService('https://your-api.vercel.app', userToken);

// Initialiser un paiement
const result = await fusionPay.initializePayment({
  donationId: 'donation_id_here',
  paymentMethod: 'card',
  customerPhone: '+225xxxxxxxx'
});

if (result.success) {
  window.location.href = result.data.paymentUrl;
}
```

Votre intégration FusionPay est maintenant complète et prête à traiter les paiements! 🎉 