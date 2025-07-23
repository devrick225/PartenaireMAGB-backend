# Configuration des Callbacks MoneyFusion

## Vue d'ensemble

MoneyFusion est le processeur de paiement principal utilisé par PartenaireMAGB. Ce document explique comment configurer les callbacks pour rediriger automatiquement les utilisateurs vers l'application mobile après un paiement.

## URLs de Callback MoneyFusion

### Format de l'URL de Callback

```
partenaireMagb://payment/return?transactionId={TRANSACTION_ID}&donationId={DONATION_ID}&status={STATUS}
```

### Paramètres MoneyFusion

- `token` : Le token de transaction MoneyFusion
- `statut` : Le statut du paiement (`paid`, `failed`, `cancelled`, `pending`)
- `donation_id` : L'ID de la donation dans le système PartenaireMAGB
- `transaction_id` : L'ID de transaction (optionnel)

## Configuration dans MoneyFusion

### 1. URL de Retour

Dans votre tableau de bord MoneyFusion, configurez :

**URL de retour :**
```
https://votre-domaine.com/api/payments/callback?provider=moneyfusion
```

### 2. URL de Notification (Webhook)

**URL de notification :**
```
https://votre-domaine.com/api/webhooks/moneyfusion
```

## Fonctionnement du Callback

### 1. Initialisation du Paiement

Quand un utilisateur initie un paiement MoneyFusion :

1. Le backend génère une URL de callback avec le deep link
2. Cette URL est envoyée à MoneyFusion via l'API
3. L'utilisateur est redirigé vers la page de paiement MoneyFusion

### 2. Retour après Paiement

Après le paiement MoneyFusion :

1. MoneyFusion appelle l'URL de callback avec les paramètres
2. Le backend reçoit les paramètres (token, statut, donation_id)
3. Le backend traite les données MoneyFusion
4. Le backend redirige vers l'app mobile avec le deep link
5. L'app mobile s'ouvre automatiquement sur la page de vérification

### 3. Vérification Automatique

Dans l'app mobile :

1. La page de vérification reçoit les paramètres
2. Elle vérifie automatiquement le statut du paiement via l'API
3. Elle affiche le résultat à l'utilisateur

## Mapping des Statuts

| Statut MoneyFusion | Statut App Mobile | Description |
|-------------------|------------------|-------------|
| `paid` | `completed` | Paiement réussi |
| `failed` | `failed` | Paiement échoué |
| `cancelled` | `cancelled` | Paiement annulé |
| `pending` | `pending` | Paiement en attente |

## Exemples d'URLs de Callback

### Paiement Réussi
```
partenaireMagb://payment/return?transactionId=MF123456789&donationId=64f8a1b2c3d4e5f6a7b8c9d0&status=completed
```

### Paiement Échoué
```
partenaireMagb://payment/return?transactionId=MF123456789&donationId=64f8a1b2c3d4e5f6a7b8c9d0&status=failed
```

### Paiement Annulé
```
partenaireMagb://payment/return?transactionId=MF123456789&donationId=64f8a1b2c3d4e5f6a7b8c9d0&status=cancelled
```

## Configuration Backend

### Variables d'Environnement

```env
# URL de l'API MoneyFusion
MONEYFUSION_API_URL=https://www.pay.moneyfusion.net/PartenaireMAGB/f8a52ddfb11ee657/pay/

# URL de base pour les callbacks
BACKEND_URL=https://votre-domaine.com
FRONTEND_URL=https://partenairemagb.com

# Scheme de l'app mobile
MOBILE_APP_SCHEME=partenaireMagb
```

### Routes Backend

- `GET /api/payments/callback` : Route de callback publique (gère MoneyFusion)
- `POST /api/webhooks/moneyfusion` : Webhook MoneyFusion pour notifications
- `POST /api/payments/initialize` : Initialisation de paiement MoneyFusion

## Test des Callbacks MoneyFusion

### Test Manuel

1. Ouvrez l'app mobile
2. Utilisez un navigateur pour tester l'URL de callback
3. Vérifiez que l'app s'ouvre sur la page de vérification

### Test avec Curl

```bash
# Test callback MoneyFusion réussi
curl "https://votre-domaine.com/api/payments/callback?provider=moneyfusion&token=TEST123&statut=paid&donation_id=64f8a1b2c3d4e5f6a7b8c9d0"

# Test callback MoneyFusion échoué
curl "https://votre-domaine.com/api/payments/callback?provider=moneyfusion&token=TEST123&statut=failed&donation_id=64f8a1b2c3d4e5f6a7b8c9d0"
```

### Test dans MoneyFusion

1. Connectez-vous à votre tableau de bord MoneyFusion
2. Allez dans les paramètres de paiement
3. Configurez les URLs de callback
4. Testez un paiement en mode sandbox
5. Vérifiez que l'app mobile s'ouvre correctement

## Gestion des Erreurs

### Erreurs de Callback

En cas d'erreur dans le callback MoneyFusion :

```
partenaireMagb://payment/return?transactionId=ERROR&donationId=UNKNOWN&status=failed
```

### Logs de Débogage

Le système enregistre des logs détaillés :

```
📱 Callback MoneyFusion reçu: { token: 'MF123456789', statut: 'paid', donation_id: '64f8a1b2c3d4e5f6a7b8c9d0' }
🔗 Redirection MoneyFusion vers: partenaireMagb://payment/return?transactionId=MF123456789&donationId=64f8a1b2c3d4e5f6a7b8c9d0&status=completed
```

## Sécurité

- Les URLs de callback sont publiques mais ne contiennent pas d'informations sensibles
- La vérification du paiement se fait côté serveur via l'API MoneyFusion
- Les paramètres sont validés avant traitement
- Les logs sont conservés pour le débogage
- Les webhooks MoneyFusion sont sécurisés avec signature

## Support

Pour toute question sur la configuration des callbacks MoneyFusion, contactez l'équipe technique.

### Contacts

- **Support Technique** : tech@partenairemagb.com
- **Documentation MoneyFusion** : https://docs.moneyfusion.net
- **Support MoneyFusion** : support@moneyfusion.net 