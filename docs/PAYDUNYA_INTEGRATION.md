# Intégration PayDunya

## Vue d'ensemble

PayDunya est une plateforme de paiement qui permet d'accepter des paiements en ligne et mobile money à travers l'Afrique de l'Ouest. Ce guide explique comment intégrer PayDunya dans la plateforme Partenaire MAGB.

## Fonctionnalités supportées

### Opérateurs Mobile Money supportés

PayDunya supporte de nombreux opérateurs Mobile Money à travers l'Afrique de l'Ouest :

#### Sénégal
- `orange-money-senegal` - Orange Money Sénégal
- `wave-senegal` - Wave Sénégal
- `free-money-senegal` - Free Money Sénégal
- `expresso-sn` - Expresso Sénégal
- `wizall-senegal` - Wizall Sénégal

#### Bénin
- `mtn-benin` - MTN Bénin
- `moov-benin` - Moov Bénin

#### Côte d'Ivoire
- `orange-money-ci` - Orange Money Côte d'Ivoire
- `wave-ci` - Wave Côte d'Ivoire
- `mtn-ci` - MTN Côte d'Ivoire
- `moov-ci` - Moov Côte d'Ivoire

#### Togo
- `t-money-togo` - T-Money Togo
- `moov-togo` - Moov Togo

#### Mali
- `orange-money-mali` - Orange Money Mali
- `moov-ml` - Moov Mali

#### Burkina Faso
- `orange-money-burkina` - Orange Money Burkina Faso
- `moov-burkina-faso` - Moov Burkina Faso

#### Cartes bancaires
- `card` - Cartes Visa/Mastercard

## Configuration

### 1. Obtenir les clés API PayDunya

1. Créez un compte PayDunya Business sur [paydunya.com](https://paydunya.com)
2. Connectez-vous à votre tableau de bord
3. Cliquez sur "Intégrez notre API" dans le menu
4. Créez une nouvelle application
5. Choisissez "MODE TEST" pour les tests
6. Récupérez vos clés :
   - **Master Key** : Clé principale d'authentification
   - **Private Key** : Clé privée pour les requêtes sensibles
   - **Public Key** : Clé publique pour les requêtes client
   - **Token** : Token d'authentification

### 2. Configuration des variables d'environnement

Ajoutez les variables suivantes à votre fichier `.env` :

```env
# Configuration PayDunya (paydunya.com)
PAYDUNYA_MASTER_KEY=your-paydunya-master-key
PAYDUNYA_PRIVATE_KEY=your-paydunya-private-key
PAYDUNYA_PUBLIC_KEY=your-paydunya-public-key
PAYDUNYA_TOKEN=your-paydunya-token
PAYDUNYA_MODE=test  # 'test' ou 'live'
PAYDUNYA_WEBHOOK_URL=https://your-domain.com/api/webhooks/paydunya
```

### 3. Configuration des URLs de callback

PayDunya utilise plusieurs types d'URLs :

- **Return URL** : URL vers laquelle l'utilisateur est redirigé après paiement
- **Cancel URL** : URL en cas d'annulation
- **Callback URL (IPN)** : URL de notification instantanée pour les webhooks

Notre intégration gère automatiquement ces URLs.

## Utilisation

### 1. Initialiser un paiement

```javascript
const paydunyaService = require('../services/paydunyaService');

const result = await paydunyaService.initializePayment({
  amount: 5000,
  currency: 'XOF',
  customerInfo: {
    name: 'Jean Dupont',
    email: 'jean.dupont@example.com',
    phone: '+225XXXXXXXX',
    userId: 'user_123'
  },
  donationId: 'donation_456',
  paymentMethod: 'orange-money-ci', // Ou tout autre opérateur supporté
  description: 'DON PARTENAIRE MAGB'
});

// result contient :
// - paymentUrl : URL de paiement PayDunya
// - transactionId : Notre ID de transaction
// - paydunyaToken : Token PayDunya
// - expiresAt : Date d'expiration
```

### 2. Vérifier le statut d'un paiement

```javascript
const status = await paydunyaService.checkPaymentStatus(paydunyaToken);

console.log(status);
// {
//   success: true,
//   status: 'completed', // 'pending', 'completed', 'failed'
//   transactionId: 'PAYDUNYA_xxx',
//   amount: 5000,
//   currency: 'XOF'
// }
```

### 3. Calcul des frais

```javascript
const fees = paydunyaService.calculateFees(5000, 'XOF', 'orange-money-ci');

console.log(fees);
// {
//   percentageFee: 100,    // 2% de 5000
//   fixedFee: 50,          // Frais fixe
//   totalFee: 150,         // Total des frais
//   netAmount: 4850,       // Montant net après frais
//   paymentMethod: 'orange-money-ci'
// }
```

## Webhooks

PayDunya envoie des notifications instantanées (IPN) à votre endpoint webhook quand le statut d'un paiement change.

### Configuration du webhook

L'URL webhook est configurée automatiquement lors de l'initialisation du paiement : 
`https://your-domain.com/api/webhooks/paydunya`

### Structure du webhook

PayDunya envoie un POST avec les données suivantes :

```json
{
  "response_code": "00",  // "00" = succès
  "response_text": "Transaction successful",
  "token": "paydunya-token-123",
  "invoice": {
    "total_amount": 5000,
    "description": "DON PARTENAIRE MAGB",
    "currency": "XOF"
  },
  "custom_data": {
    "donation_id": "donation_456",
    "customer_id": "user_123",
    "transaction_id": "PAYDUNYA_xxx",
    "platform": "partenaire-magb"
  }
}
```

### Traitement automatique

Notre système traite automatiquement les webhooks PayDunya :

1. **Paiement réussi** (`response_code: "00"`)
   - Met à jour le statut du paiement à `completed`
   - Marque la donation comme complétée
   - Envoie un email de confirmation
   - Notifie via WebSocket

2. **Paiement échoué** (autre `response_code`)
   - Met à jour le statut du paiement à `failed`
   - Garde la donation en `pending` pour permettre un nouvel essai

## Gestion des erreurs

### Erreurs courantes

1. **Configuration manquante**
   ```
   Configuration PayDunya manquante: masterKey
   ```
   → Vérifiez vos variables d'environnement

2. **Opérateur non supporté**
   ```
   Opérateur de paiement non supporté: invalid-operator
   ```
   → Utilisez un opérateur de la liste supportée

3. **Erreur API PayDunya**
   ```
   PayDunya API Error: Invoice creation failed
   ```
   → Vérifiez vos clés API et les paramètres envoyés

4. **Transaction non trouvée**
   ```
   PayDunya Status Check Error: Transaction not found
   ```
   → Le token PayDunya est invalide ou expiré

### Gestion des timeouts

Les requêtes vers PayDunya ont un timeout de 30 secondes. En cas de timeout :

1. Le paiement reste en statut `pending`
2. Le statut peut être vérifié manuellement via `checkPaymentStatus()`
3. Le webhook PayDunya mettra à jour le statut automatiquement

## Tests

### Mode Sandbox

En mode `test`, PayDunya utilise un environnement sandbox :

```env
PAYDUNYA_MODE=test
```

### Comptes fictifs

Créez des comptes fictifs dans votre dashboard PayDunya pour tester les paiements :

1. Connectez-vous à votre compte PayDunya
2. Allez dans "Intégrez notre API" > "Clients fictifs"
3. Créez un client fictif avec un solde de test
4. Utilisez les informations de ce client pour vos tests

### Passage en production

Pour passer en production :

1. Changez `PAYDUNYA_MODE=live`
2. Remplacez vos clés de test par les clés de production
3. Dans votre dashboard PayDunya, activez le mode production pour votre application

## Frais de transaction

Les frais PayDunya varient selon l'opérateur :

- **Cartes bancaires** : 3.5%
- **Orange Money** : 2.0% + 50 XOF
- **Wave** : 1.5% + 25 XOF
- **MTN/Moov** : 2.5% + 50 XOF
- **Autres opérateurs** : 3.0% + 50 XOF

*Ces frais sont indicatifs et peuvent varier selon votre contrat PayDunya*

## Support

### Documentation officielle
- [Documentation PayDunya](https://developers.paydunya.com/doc/FR/introduction)
- [Dashboard PayDunya](https://app.paydunya.com)

### Support technique
- Email : support@paydunya.com
- Documentation API : [https://developers.paydunya.com](https://developers.paydunya.com)

### Logs et debugging

Notre intégration inclut des logs détaillés :

```javascript
// Initialisation d'un paiement
console.log('🔄 PayDunya: Initialisation du paiement:', { transactionId, amount, paymentMethod });

// Succès
console.log('✅ PayDunya: Paiement initialisé avec succès:', { transactionId, paydunyaToken });

// Erreur
console.error('❌ PayDunya: Erreur lors de l\'initialisation:', error);

// Webhook reçu
console.log('🔔 PayDunya webhook reçu:', webhookData);
```

Ces logs vous aideront à diagnostiquer les problèmes d'intégration.