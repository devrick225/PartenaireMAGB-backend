# Configuration Callback Mobile MoneyFusion

## Vue d'ensemble

Cette documentation explique comment configurer MoneyFusion pour rediriger automatiquement vers l'application mobile PartenaireMAGB après un paiement.

## Architecture du Callback

```
MoneyFusion → Backend API → Deep Link → App Mobile
```

### Flux de paiement

1. **Initialisation** : L'utilisateur initie un paiement dans l'app mobile
2. **Redirection** : L'utilisateur est redirigé vers MoneyFusion
3. **Paiement** : L'utilisateur effectue le paiement sur MoneyFusion
4. **Callback** : MoneyFusion redirige vers notre backend
5. **Deep Link** : Le backend redirige vers l'app mobile via deep link
6. **Vérification** : L'app mobile affiche la page de vérification du paiement

## Configuration Backend

### 1. Service MoneyFusion

Le service `moneyFusionService.js` gère automatiquement les callbacks :

```javascript
// Génération de l'URL de callback mobile
generateMobileCallbackUrl(transactionId, donationId, status) {
  return `partenaireMagb://payment/return?transactionId=${transactionId}&donationId=${donationId}&status=${status}`;
}

// Traitement du callback
async processCallback(callbackData) {
  // Traite les données MoneyFusion et génère l'URL de redirection mobile
}
```

### 2. Contrôleur de Paiement

Le contrôleur `paymentController.js` utilise directement les URLs de callback mobile :

```javascript
case 'moneyfusion':
  // Générer directement l'URL de callback mobile
  const mobileCallbackUrl = generateMobileCallbackUrl('MONEYFUSION_' + Date.now(), donationId);
  
  initializationResult = await moneyFusionService.initializePayment({
    // ... autres paramètres
    callbackUrl: mobileCallbackUrl
  });
```

### 3. Route de Callback

La route `/api/payments/callback` traite les callbacks et redirige vers l'app mobile :

```javascript
const paymentCallback = async (req, res) => {
  // Traitement spécial pour MoneyFusion
  if (provider === 'moneyfusion' || token) {
    const callbackResult = await moneyFusionService.processCallback({
      token, statut, donation_id, transaction_id
    });
    res.redirect(callbackResult.redirectUrl);
  }
};
```

## Configuration MoneyFusion

### URL de Callback

Dans votre dashboard MoneyFusion, configurez l'URL de callback :

```
https://votre-domaine.com/api/payments/callback
```

### Paramètres de Callback

MoneyFusion envoie les paramètres suivants :

| Paramètre | Description | Exemple |
|-----------|-------------|---------|
| `token` | Token de transaction MoneyFusion | `MF_123456789` |
| `statut` | Statut du paiement | `paid`, `failed`, `pending` |
| `donation_id` | ID de la donation (si disponible) | `507f1f77bcf86cd799439011` |
| `transaction_id` | ID de transaction personnalisé | `TRX_123456` |
| `numeroTransaction` | Numéro de transaction MoneyFusion | `NUM_TRX_789` |
| `Montant` | Montant du paiement | `5000` |

### Mapping des Statuts

| Statut MoneyFusion | Statut App Mobile | Description |
|-------------------|------------------|-------------|
| `paid` | `completed` | Paiement réussi |
| `failed` | `failed` | Paiement échoué |
| `cancelled` | `failed` | Paiement annulé |
| `no paid` | `failed` | Paiement non effectué |
| `pending` | `pending` | Paiement en attente |
| Autres | `pending` | Statut par défaut |

## Deep Link Mobile

### Format de l'URL

```
partenaireMagb://payment/return?transactionId=XXX&donationId=XXX&status=XXX
```

### Paramètres du Deep Link

| Paramètre | Description | Exemple |
|-----------|-------------|---------|
| `transactionId` | ID de la transaction | `MF_123456789` |
| `donationId` | ID de la donation | `507f1f77bcf86cd799439011` |
| `status` | Statut du paiement | `completed`, `failed`, `pending` |

## Configuration App Mobile

### 1. Deep Link Handler

L'app mobile doit gérer les deep links avec le schéma `partenaireMagb://` :

```javascript
// Dans App.tsx ou navigation principale
const linking = {
  prefixes: ['partenaireMagb://'],
  config: {
    screens: {
      PaymentVerification: {
        path: 'payment/return',
        parse: {
          transactionId: (transactionId) => transactionId,
          donationId: (donationId) => donationId,
          status: (status) => status
        }
      }
    }
  }
};
```

### 2. Écran de Vérification

L'écran `PaymentVerificationScreen` reçoit les paramètres et affiche le statut :

```javascript
const PaymentVerificationScreen = ({ route }) => {
  const { transactionId, donationId, status } = route.params;
  
  // Afficher le statut du paiement
  // Vérifier le paiement si nécessaire
  // Rediriger vers le dashboard
};
```

## Tests

### Script de Test

Utilisez le script de test pour vérifier la configuration :

```bash
cd PartenaireMAGB-backend
node scripts/test-moneyfusion-callback.js
```

### Tests Manuels

1. **Test de paiement réussi** :
   - Effectuez un paiement test
   - Vérifiez que l'app mobile s'ouvre automatiquement
   - Vérifiez que le statut est correct

2. **Test de paiement échoué** :
   - Annulez un paiement
   - Vérifiez que l'app mobile affiche l'erreur

3. **Test de deep link direct** :
   - Ouvrez : `partenaireMagb://payment/return?transactionId=TEST&donationId=TEST&status=completed`
   - Vérifiez que l'app mobile s'ouvre

## Dépannage

### Problèmes Courants

1. **L'app mobile ne s'ouvre pas** :
   - Vérifiez que le deep link est configuré correctement
   - Vérifiez que l'app mobile est installée
   - Testez avec un deep link direct

2. **Statut incorrect** :
   - Vérifiez le mapping des statuts
   - Vérifiez les logs du backend
   - Testez avec le script de test

3. **Callback non reçu** :
   - Vérifiez l'URL de callback dans MoneyFusion
   - Vérifiez que le backend est accessible
   - Vérifiez les logs MoneyFusion

### Logs de Debug

Activez les logs détaillés dans le backend :

```javascript
// Dans moneyFusionService.js
console.log('📱 Callback MoneyFusion reçu:', callbackData);
console.log('🔗 Redirection vers:', mobileCallbackUrl);
```

## Sécurité

### Validation des Callbacks

- Vérifiez toujours les paramètres reçus
- Validez les statuts avant redirection
- Enregistrez les callbacks pour audit

### Protection contre les Abus

- Limitez le nombre de tentatives de callback
- Validez les tokens de transaction
- Surveillez les patterns suspects

## Support

Pour toute question ou problème :

1. Consultez les logs du backend
2. Utilisez le script de test
3. Vérifiez la configuration MoneyFusion
4. Contactez l'équipe technique

---

**Note** : Cette configuration garantit une expérience utilisateur fluide avec redirection automatique vers l'app mobile après paiement MoneyFusion. 