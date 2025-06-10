# 🚀 Système MoneyFusion Amélioré - Guide d'Utilisation

## 📋 Vue d'Ensemble

Le système MoneyFusion a été considérablement amélioré avec les fonctionnalités suivantes :

### ✨ Nouvelles Fonctionnalités

1. **🔄 Vérification Automatique des Paiements**
   - Tâches cron automatiques toutes les 30 minutes
   - Retry intelligent avec backoff exponentiel
   - Marquage automatique des paiements échoués

2. **📡 Notifications WebSocket Temps Réel**
   - Notifications instantanées des changements de statut
   - Suivi en temps réel des paiements
   - Alertes sonores pour succès/échec

3. **📊 Filtrage Intelligent des Donations**
   - Affichage par défaut des donations complétées uniquement
   - Option pour voir toutes les donations
   - Protection contre les erreurs de calculs financiers

4. **⚙️ Outils d'Administration Avancés**
   - Vérification manuelle des paiements
   - Monitoring des tâches cron
   - Statistiques en temps réel

## 🛠️ Installation et Configuration

### 1. Vérification des Dépendances

```bash
# Vérifier que toutes les dépendances sont installées
cd PartenaireMAGB-backend
npm install

# Les nouvelles dépendances requises (déjà dans package.json)
# - node-cron: ^3.0.3
# - ws: ^8.18.2
```

### 2. Variables d'Environnement

Ajoutez ces variables à votre fichier `.env` :

```bash
# MoneyFusion Configuration
MONEYFUSION_API_URL=https://www.pay.moneyfusion.net/PartenaireMAGB/f8a52ddfb11ee657/pay/

# URLs de callback
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:5000

# MongoDB (existant)
MONGODB_URI=mongodb://localhost:27017/partenaire-magb

# JWT (existant)
JWT_SECRET=your-secret-key
```

## 🚀 Démarrage du Système

### 1. Démarrer le Backend

```bash
cd PartenaireMAGB-backend
npm run dev
```

**Lors du démarrage, vous devriez voir :**
```
🚀 Serveur démarré sur le port 5000
✅ Service WebSocket initialisé
✅ Tâches cron initialisées
✅ Tâche cron vérification paiements activée (toutes les 30min)
✅ Tâche cron statistiques activée (quotidien 3h)
✅ Tâche cron nettoyage activée (hebdomadaire)
```

### 2. Démarrer le Frontend

```bash
cd PartenaireMAGB-frontend
npm start
```

## 🧪 Tests et Vérification

### 1. Script de Test Automatique

```bash
cd PartenaireMAGB-backend
node scripts/test-moneyfusion.js
```

Ce script teste :
- ✅ Connexion MoneyFusion
- ✅ Initialisation de paiement
- ✅ Traitement des webhooks
- ✅ Calcul des frais
- ✅ Tâches cron

### 2. Test Manuel depuis l'Interface

#### A. Créer une Donation
1. Connectez-vous à l'interface admin
2. Allez dans "Donations" 
3. Cliquez "Nouvelle Donation"
4. Remplissez le formulaire et sélectionnez "MoneyFusion"
5. Procédez au paiement

#### B. Tester la Vérification Manuelle
1. En tant qu'admin/trésorier, cliquez sur "Vérifier Paiements"
2. Observez les notifications en temps réel
3. Vérifiez que les statuts sont mis à jour

#### C. Tester l'Affichage Filtré
1. Observez que seules les donations complétées s'affichent par défaut
2. Cliquez sur "Toutes les donations" pour voir l'historique complet
3. Notez l'alerte explicative sur le filtrage

## 🔧 Fonctionnalités Techniques

### 1. Tâches Cron Automatiques

#### Vérification des Paiements (Toutes les 30 min)
```javascript
// Vérifie automatiquement les paiements en attente
// Marque comme échoués ceux en attente depuis plus de 2h
// Envoie des notifications WebSocket en temps réel
```

#### Mise à Jour des Statistiques (Quotidien - 3h)
```javascript
// Recalcule les statistiques utilisateur
// Traite les dons récurrents dus
// Nettoie les données incohérentes
```

#### Nettoyage (Hebdomadaire - Dimanche 2h)
```javascript
// Supprime les paiements échoués anciens (6 mois+)
// Optimise la base de données
```

### 2. API Endpoints Administratifs

#### POST `/api/donations/verify-payments`
```javascript
// Déclenche une vérification manuelle immédiate
// Réservé aux admin/trésoriers
// Retourne les résultats de vérification
```

#### GET `/api/donations/cron-status`
```javascript
// Récupère le statut des tâches cron
// Réservé aux administrateurs
// Affiche les prochaines exécutions
```

### 3. WebSocket Events

#### Événements Émis
```javascript
'payment_status_update'  // Changement de statut
'payment_completed'      // Paiement réussi
'payment_failed'         // Paiement échoué
'webhook_received'       // Webhook reçu
```

#### Canaux WebSocket
```javascript
`payments:${userId}`     // Notifications utilisateur
`payment:${paymentId}`   // Suivi d'un paiement spécifique
`admin:payments`         // Monitoring administrateur
`admin:webhooks`         // Webhooks en temps réel
```

## 🎯 Interface Utilisateur Améliorée

### 1. Indicateurs Visuels

- **🟢 Badge "Donations Complétées"** : Affichage filtré actif
- **🔵 Badge "Toutes les donations"** : Affichage complet
- **⚡ Alerte informative** : Explication du filtrage
- **🔄 Bouton "Vérifier Paiements"** : Pour admin/trésorier

### 2. Notifications Temps Réel

- **🔊 Sons personnalisés** : Succès (notes ascendantes), Échec (notes descendantes)
- **📱 Notifications visuelles** : Avec Ant Design notifications
- **📊 Indicateur de connexion** : Statut WebSocket visible

### 3. Pages de Retour de Paiement

#### Page de Succès (`/payment/success`)
- ✅ Confirmation visuelle
- 📄 Détails de la transaction
- 📧 Génération automatique du reçu
- 🔗 Actions rapides (télécharger, partager)

#### Page d'Échec (`/payment/failure`)
- ❌ Diagnostic intelligent des erreurs
- 💡 Solutions suggérées
- 🔄 Retry automatique avec données préservées
- 📞 Contact support intégré

#### Page d'Annulation (`/payment/cancel`)
- ⏸️ Préservation des données de donation
- 🔄 Reprise de paiement simplifiée
- 💡 Conseils pour éviter les annulations

## 📈 Monitoring et Analytics

### 1. Métriques de Performance

```javascript
// Disponibles via l'API et interface
- Taux de succès des paiements
- Temps moyen de traitement
- Fréquence des échecs par type
- Utilisation des méthodes de paiement
```

### 2. Logs Détaillés

```javascript
// Console côté serveur
🔍 [CRON] Début vérification paiements
✅ MoneyFusion vérification terminée
📊 Paiement mis à jour: {id} -> {status}
🔔 Webhook reçu: {provider} -> {status}
```

### 3. Alertes Automatiques

- 🚨 Paiements bloqués depuis plus de 24h
- ⚠️ Taux d'échec anormalement élevé
- 📊 Notifications admin en temps réel

## 🔒 Sécurité et Fiabilité

### 1. Gestion d'Erreurs Robuste
- Retry automatique avec backoff exponentiel
- Fallback gracieux en cas d'indisponibilité
- Logging détaillé des erreurs

### 2. Validation des Données
- Vérification des signatures webhook
- Validation des montants et devises
- Protection contre la duplication

### 3. Permissions et Accès
- Vérification manuelle réservée aux admin/trésoriers
- Monitoring des tâches cron pour admin uniquement
- WebSocket avec authentification JWT

## 🆘 Dépannage

### Problèmes Courants

#### 1. Tâches Cron ne Démarrent Pas
```bash
# Vérifier les logs au démarrage
✅ Tâches cron initialisées

# Si absent, vérifier :
- npm install node-cron
- Permissions fichier cronJobs.js
```

#### 2. WebSocket Ne Se Connecte Pas
```bash
# Vérifier :
- Port 5000 accessible
- JWT token valide
- URL WebSocket correcte (ws://localhost:5000)
```

#### 3. Paiements Restent en Attente
```bash
# Solutions :
1. Cliquer "Vérifier Paiements" manuellement
2. Vérifier les logs MoneyFusion
3. Tester la connectivité API
```

### Commandes de Debug

```bash
# Test complet du système
node scripts/test-moneyfusion.js

# Vérifier les tâches cron
curl http://localhost:5000/api/donations/cron-status

# Déclencher vérification manuelle
curl -X POST http://localhost:5000/api/donations/verify-payments \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 📞 Support

En cas de problème persistant :

1. **Vérifiez les logs** du serveur et des tâches cron
2. **Testez la connectivité** MoneyFusion avec le script
3. **Contactez l'équipe** avec les logs détaillés

---

**🎉 Le système MoneyFusion est maintenant prêt pour la production avec toutes les fonctionnalités professionnelles !** 