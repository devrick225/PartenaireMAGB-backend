# Nettoyage du Modèle Profile - PartenaireMAGB

## 📝 Résumé des Modifications

Ce document liste les champs supprimés du modèle Profile backend pour maintenir la cohérence avec l'interface mobile.

## 🗑️ Champs Supprimés

### 1. Informations Professionnelles
- ❌ `employer` (String) - Employeur
- ❌ `monthlyIncome` (Number) - Revenu mensuel

### 2. Informations Ecclésiastiques Détaillées
- ❌ `churchMembership.churchName` (String) - Nom de l'église
- ❌ `churchMembership.membershipDate` (Date) - Date d'adhésion
- ❌ `churchMembership.baptismDate` (Date) - Date de baptême
- ❌ `churchMembership.ministry` (String) - Ministère
- ❌ `churchMembership.churchRole` (Enum) - Rôle dans l'église

### 3. Préférences de Communication (Section Complète)
- ❌ `communicationPreferences` (Object) - Toute la section
  - `language` (Enum)
  - `preferredContactMethod` (Enum)
  - `receiveNewsletters` (Boolean)
  - `receiveEventNotifications` (Boolean)
  - `receiveDonationReminders` (Boolean)

### 4. Bénévolat (Section Complète)
- ❌ `volunteer` (Object) - Toute la section
  - `isAvailable` (Boolean)
  - `skills` (Array)
  - `availability` (Object)
  - `interests` (Array)

### 5. Informations du Conjoint
- ❌ `familyInfo.spouse` (Object) - Toutes les informations du conjoint
  - `name` (String)
  - `dateOfBirth` (Date)
  - `isChurchMember` (Boolean)

## ✅ Champs Conservés

### Informations Personnelles
- ✅ `dateOfBirth` - Date de naissance
- ✅ `gender` - Genre
- ✅ `maritalStatus` - Statut matrimonial
- ✅ `occupation` - Profession

### Informations Ecclésiastiques (Simplifiées)
- ✅ `churchMembership.isChurchMember` - Membre d'église (oui/non seulement)

### Informations Familiales (Simplifiées)
- ✅ `familyInfo.numberOfChildren` - Nombre d'enfants
- ✅ `familyInfo.children` - Détails des enfants

### Autres Sections Conservées
- ✅ `address` - Adresse complète
- ✅ `emergencyContact` - Contact d'urgence
- ✅ `donationPreferences` - Préférences de donation
- ✅ `financialInfo` - Informations financières

## 🔧 Fichiers Modifiés

### 1. Modèle de Données
- `models/Profile.js` - Suppression des champs du schéma
- `models/Profile.js` - Mise à jour de `calculateCompletionPercentage()`

### 2. Contrôleurs
- `controllers/userController.js` - Suppression dans `getProfile()` et `updateProfile()`
- `controllers/authController.js` - Suppression dans la création de profil par défaut

### 3. Routes et Validations
- `routes/users.js` - Suppression des validations pour `employer` et `monthlyIncome`

### 4. Script de Migration
- `scripts/cleanupRemovedProfileFields.js` - Script pour nettoyer les données existantes

## 🚀 Migration des Données

Pour nettoyer les données existantes dans la base de données, exécuter :

```bash
cd PartenaireMAGB-backend
node scripts/cleanupRemovedProfileFields.js
```

Ce script :
- ✅ Supprime tous les champs obsolètes de la collection `profiles`
- ✅ Affiche un rapport de nettoyage
- ✅ Vérifie que le nettoyage a bien été effectué

## 🎯 Impact

### Avantages
- ✅ Cohérence entre frontend mobile et backend
- ✅ Modèle de données simplifié
- ✅ Interface mobile plus rapide et focalisée
- ✅ Moins de champs à valider et maintenir

### Considérations
- ⚠️ Les données supprimées ne sont plus accessibles
- ⚠️ Backup recommandé avant migration
- ⚠️ Les applications existantes utilisant ces champs doivent être mises à jour

## 📊 Statistiques

- **Champs supprimés** : 15 champs/sous-champs
- **Sections supprimées** : 2 sections complètes
- **Réduction du modèle** : ~40% de champs en moins
- **Performance** : Amélioration des requêtes et validations

## 🔍 Vérification

Pour vérifier que le nettoyage a été effectué correctement :

```bash
# Dans MongoDB shell
use partenaire-magb
db.profiles.findOne({}, {
  employer: 1,
  monthlyIncome: 1,
  communicationPreferences: 1,
  volunteer: 1,
  "familyInfo.spouse": 1,
  "churchMembership.churchName": 1
})
```

Le résultat ne devrait contenir aucun de ces champs. 