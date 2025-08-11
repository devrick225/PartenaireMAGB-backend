# Guide de Dépannage - URL MoneyFusion Non Enrichie

## 🐛 Problème Identifié

L'URL de paiement MoneyFusion n'est pas enrichie avec les paramètres du don dans l'application mobile.

## 🔍 Diagnostic

### 1. Vérifier si le Serveur Backend Utilise les Nouvelles Modifications

**Étape 1 : Redémarrer le serveur backend**
```bash
# Arrêter le serveur actuel (Ctrl+C)
# Puis redémarrer
cd PartenaireMAGB-backend
npm start
# ou
node server.js
```

**Étape 2 : Vérifier les logs du serveur**
Lors d'un nouveau paiement, vous devriez voir ces logs :
```
🔍 DEBUG - customerInfo: {...}
🔍 DEBUG - Nom client envoyé à MoneyFusion: "John Doe"
🔍 DEBUG - Nom client nettoyé: "John Doe"
🔍 DEBUG - Réponse MoneyFusion complète: {...}
🔍 DEBUG - URL avant enrichissement: https://payin.moneyfusion.net/payment/...
🔧 DEBUG - Fonction enrichPaymentUrl appelée avec: {...}
🔍 DEBUG - URL après enrichissement: https://payin.moneyfusion.net/payment/...?donationId=...
🔍 DEBUG - URL a-t-elle changé? OUI
```

### 2. Tester la Fonction d'Enrichissement

**Exécuter le script de test :**
```bash
cd PartenaireMAGB-backend
node scripts/testUrlEnrichment.js
```

**Résultat attendu :**
```
✅ SUCCÈS: L'URL a été enrichie !
📋 Paramètres ajoutés:
- donationId: test_donation_123
- amount: 200
- currency: XOF
- description: DON PARTENAIRE MAGB
- customerName: John Doe
- customerEmail: john@example.com
- platform: partenaire-magb
- timestamp: 1703123456789
```

### 3. Vérifier l'Application Mobile

**Étape 1 : Vider le cache de l'app**
- Fermer complètement l'application mobile
- La rouvrir
- Faire un nouveau test de paiement

**Étape 2 : Vérifier la version de l'app**
- S'assurer que l'app mobile utilise la dernière version
- Vérifier qu'elle se connecte au bon serveur backend

## 🚨 Solutions par Étape

### Solution 1 : Redémarrage du Serveur
```bash
# 1. Arrêter le serveur (Ctrl+C)
# 2. Redémarrer
cd PartenaireMAGB-backend
npm start
```

### Solution 2 : Vérification des Logs
1. Faire un nouveau paiement MoneyFusion
2. Vérifier les logs du serveur backend
3. Chercher les messages de debug commençant par `🔍 DEBUG` et `🔧 DEBUG`

### Solution 3 : Test Manuel
```bash
# Tester la fonction d'enrichissement
cd PartenaireMAGB-backend
node scripts/testUrlEnrichment.js
```

### Solution 4 : Vérification du Code
Vérifier que le fichier `services/moneyFusionService.js` contient bien :
```javascript
// Enrichir l'URL avec toutes les informations du don
if (paymentUrl) {
  console.log('🔍 DEBUG - URL avant enrichissement:', paymentUrl);
  
  const donationData = {
    donationId,
    amount,
    currency,
    description,
    customerInfo
  };
  
  const originalUrl = paymentUrl;
  paymentUrl = this.enrichPaymentUrl(paymentUrl, donationData);
  
  console.log('🔍 DEBUG - URL après enrichissement:', paymentUrl);
  console.log('🔍 DEBUG - URL a-t-elle changé?', originalUrl !== paymentUrl ? 'OUI' : 'NON');
}
```

## 📊 Vérification des Résultats

### URL Attendue
L'URL enrichie devrait ressembler à :
```
https://payin.moneyfusion.net/payment/fCOLcQFNIYCICQV0jUqr/200/John Doe?donationId=test_donation_123&amount=200&currency=XOF&description=DON%20PARTENAIRE%20MAGB&customerName=John%20Doe&customerEmail=john@example.com&platform=partenaire-magb&timestamp=1703123456789
```

### Logs Attendus
```
🔍 DEBUG - URL avant enrichissement: https://payin.moneyfusion.net/payment/...
🔧 DEBUG - Fonction enrichPaymentUrl appelée avec: {...}
🔧 URL enrichie générée: https://payin.moneyfusion.net/payment/...?donationId=...
🔍 DEBUG - URL après enrichissement: https://payin.moneyfusion.net/payment/...?donationId=...
🔍 DEBUG - URL a-t-elle changé? OUI
```

## 🔄 Prochaines Étapes

1. **Redémarrer le serveur backend**
2. **Faire un nouveau test de paiement**
3. **Vérifier les logs du serveur**
4. **Exécuter le script de test**
5. **Vérifier l'URL dans l'app mobile**

## 📞 Support

Si le problème persiste après ces étapes :
1. Vérifier que tous les fichiers ont été sauvegardés
2. Vérifier que le serveur backend est bien redémarré
3. Vérifier les logs d'erreur du serveur
4. Contacter le support technique 