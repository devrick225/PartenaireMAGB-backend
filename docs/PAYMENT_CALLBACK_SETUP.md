# Configuration des URLs de Callback de Paiement

## Vue d'ensemble

Le système de paiement de PartenaireMAGB utilise des URLs de callback pour rediriger automatiquement les utilisateurs vers l'application mobile après un paiement. Ces URLs utilisent le deep linking pour ouvrir directement la page de vérification du paiement.

## URLs de Callback

### Format de l'URL de Callback

```
partenaireMagb://payment/return?transactionId={TRANSACTION_ID}&donationId={DONATION_ID}&status={STATUS}
```

### Paramètres

- `transactionId` : L'ID de transaction du processeur de paiement
- `donationId` : L'ID de la donation dans le système PartenaireMAGB
- `paymentId` : L'ID du paiement (optionnel)
- `status` : Le statut du paiement (`completed`, `failed`, `cancelled`, `pending`)

## Configuration par Fournisseur

### 1. CinetPay

**URL de Callback :**
```
partenaireMagb://payment/return?transactionId=CINETPAY_{TIMESTAMP}&donationId={DONATION_ID}&status=completed
```

**Configuration dans CinetPay :**
- URL de retour : `https://votre-domaine.com/api/payments/callback`
- URL de notification : `https://votre-domaine.com/api/payments/callback`

### 2. MoneyFusion

**URL de Callback :**
```
partenaireMagb://payment/return?transactionId=MONEYFUSION_{TIMESTAMP}&donationId={DONATION_ID}&status=completed
```

**Configuration dans MoneyFusion :**
- URL de retour : `https://votre-domaine.com/api/payments/callback`
- URL de notification : `https://votre-domaine.com/api/payments/callback`

### 3. FusionPay

**URL de Callback :**
```
partenaireMagb://payment/return?transactionId=FUSIONPAY_{TIMESTAMP}&donationId={DONATION_ID}&status=completed
```

**Configuration dans FusionPay :**
- URL de retour : `https://votre-domaine.com/api/payments/callback`
- URL de notification : `https://votre-domaine.com/api/payments/callback`

### 4. PayPal

**URL de Callback :**
```
partenaireMagb://payment/return?transactionId=PAYPAL_{TIMESTAMP}&donationId={DONATION_ID}&status=completed
```

**Configuration dans PayPal :**
- URL de retour : `https://votre-domaine.com/api/payments/callback`
- URL d'annulation : `https://votre-domaine.com/api/payments/callback?status=cancelled`

## Fonctionnement

### 1. Initialisation du Paiement

Quand un utilisateur initie un paiement :

1. Le backend génère une URL de callback avec le deep link
2. Cette URL est envoyée au processeur de paiement
3. L'utilisateur est redirigé vers la page de paiement

### 2. Retour après Paiement

Après le paiement :

1. Le processeur de paiement appelle l'URL de callback
2. Le backend reçoit les paramètres (transactionId, donationId, status)
3. Le backend redirige vers l'app mobile avec le deep link
4. L'app mobile s'ouvre automatiquement sur la page de vérification

### 3. Vérification Automatique

Dans l'app mobile :

1. La page de vérification reçoit les paramètres
2. Elle vérifie automatiquement le statut du paiement
3. Elle affiche le résultat à l'utilisateur

## Configuration Backend

### Variables d'Environnement

```env
# URL de base pour les callbacks web (fallback)
FRONTEND_URL=https://partenairemagb.com

# Scheme de l'app mobile
MOBILE_APP_SCHEME=partenaireMagb
```

### Routes Backend

- `GET /api/payments/callback` : Route de callback publique
- `POST /api/payments/initialize` : Initialisation de paiement

## Exemples d'URLs

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

## Gestion des Erreurs

### Fallback Web

Si l'app mobile n'est pas installée, l'utilisateur sera redirigé vers :

```
https://partenairemagb.com/payment/callback?transactionId={ID}&donationId={ID}&status={STATUS}
```

### Erreurs de Callback

En cas d'erreur dans le callback :

```
partenaireMagb://payment/return?transactionId=ERROR&donationId=UNKNOWN&status=failed
```

## Test des Callbacks

### Test Manuel

1. Ouvrez l'app mobile
2. Utilisez un navigateur pour tester l'URL de callback
3. Vérifiez que l'app s'ouvre sur la page de vérification

### Test Automatique

```bash
# Test avec curl
curl "https://votre-domaine.com/api/payments/callback?transactionId=TEST123&donationId=64f8a1b2c3d4e5f6a7b8c9d0&status=completed"
```

## Sécurité

- Les URLs de callback sont publiques mais ne contiennent pas d'informations sensibles
- La vérification du paiement se fait côté serveur
- Les paramètres sont validés avant traitement
- Les logs sont conservés pour le débogage

## Support

Pour toute question sur la configuration des callbacks, contactez l'équipe technique. 