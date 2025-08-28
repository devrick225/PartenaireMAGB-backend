# Scripts de Gestion de la Base de Données

Ce dossier contient tous les scripts pour gérer la base de données MongoDB de l'application PARTENAIRE MAGB.

## 📁 Scripts Disponibles

### 🌱 Script de Seed (`seed.js`)

Initialise la base de données avec des données par défaut pour développement et test.

**Utilisation :**
```bash
# Seed complet (recommandé pour le développement)
npm run seed

# Seed avec environnement spécifique
npm run seed:dev
npm run seed:prod

# Ou directement
node scripts/seed.js
```

**Données créées :**
- **6 utilisateurs** avec différents rôles :
  - Administrateur système
  - Trésorier principal  
  - Agent de support
  - 3 utilisateurs réguliers avec différents niveaux de partenaire

- **8 ministères** représentant les différentes catégories :
  - Ministère des Enfants
  - Ministère des Jeunes
  - Ministère des Femmes
  - Ministère des Hommes
  - Ministère de Louange
  - Ministère de Prière
  - Ministère d'Évangélisation
  - Ministère Social

- **Donations d'exemple** :
  - Donations ponctuelles complétées
  - Donations récurrentes actives
  - Différentes catégories (libre, mensuel, concert des femmes, RIA 2025)

### 🧹 Script de Nettoyage (`cleanDatabase.js`)

Supprime les données de la base de données de manière sélective ou complète.

**Utilisation :**
```bash
# Nettoyer toutes les données (avec confirmation)
npm run db:clean

# Ou directement avec options
node scripts/cleanDatabase.js [mode]
```

**Modes disponibles :**
- `all` (défaut) : Supprime toutes les données
- `test` : Supprime seulement les données de test
- `force` : Supprime sans demander confirmation

**Exemples :**
```bash
# Supprime tout avec confirmation
node scripts/cleanDatabase.js

# Supprime seulement les données de test
node scripts/cleanDatabase.js test

# Supprime tout sans confirmation
node scripts/cleanDatabase.js force
```

### 💾 Script de Sauvegarde (`backupDatabase.js`)

Crée une sauvegarde complète de la base de données au format JSON.

**Utilisation :**
```bash
# Créer un backup
npm run db:backup

# Ou directement
node scripts/backupDatabase.js [keepCount]
```

**Fonctionnalités :**
- Exporte toutes les collections
- Génère un fichier avec timestamp
- Nettoie automatiquement les anciens backups
- Garde par défaut 10 backups les plus récents

**Exemple :**
```bash
# Backup en gardant 5 fichiers
node scripts/backupDatabase.js 5
```

## 🚀 Scripts Combinés dans package.json

### Setup Complet
```bash
# Installation + seed pour nouveau projet
npm run setup
```

### Reset Complet
```bash
# Nettoyage + nouveau seed
npm run reset
```

## 📋 Comptes de Test Créés

Le script de seed crée les comptes suivants :

### 👨‍💼 Comptes Administratifs
```
Admin:      admin@partenairemagb.com      / Admin123456!
Trésorier:  tresorier@partenairemagb.com  / Tresorier123!
Support:    support@partenairemagb.com    / Support123!
```

### 👥 Comptes Utilisateurs
```
Jean Kouassi:   jean.kouassi@example.com    / User123456!    (Classique)
Marie Kouadio:  marie.kouadio@example.com   / User123456!    (Bronze)
Paul Brou:      paul.brou@example.com       / User123456!    (Argent)
```

## 🔧 Configuration Requise

### Variables d'Environnement
Assurez-vous d'avoir configuré votre fichier `.env` avec :

```env
# Base de données MongoDB
MONGODB_URI=mongodb://localhost:27017/partenaire-magb

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRE=7d

# Autres configurations selon vos besoins...
```

### Prérequis
- Node.js >= 16.x
- MongoDB en cours d'exécution
- Dépendances npm installées

## 📁 Structure des Backups

Les backups sont sauvegardés dans le dossier `backups/` avec la structure :

```
backups/
├── backup_dev_2024-01-15_14-30-25.json
├── backup_dev_2024-01-15_16-45-12.json
└── ...
```

Chaque fichier contient :
- Métadonnées (date, environnement, version)
- Toutes les collections avec leurs données
- Statistiques de sauvegarde

## 🛠️ Développement

### Workflow Recommandé

1. **Premier setup :**
   ```bash
   npm run setup
   ```

2. **Développement quotidien :**
   ```bash
   npm run dev
   ```

3. **Reset si besoin :**
   ```bash
   npm run reset
   ```

4. **Backup avant production :**
   ```bash
   npm run db:backup
   ```

### Debugging

Pour debug les scripts, vous pouvez utiliser :
```bash
DEBUG=* node scripts/seed.js
```

## ⚠️ Avertissements

- **ATTENTION** : `npm run reset` supprime TOUTES les données !
- Toujours faire un backup avant modifications importantes
- Les scripts de nettoyage demandent confirmation (sauf mode `force`)
- Vérifiez votre `MONGODB_URI` avant d'exécuter les scripts

## 📞 Support

En cas de problème avec les scripts :

1. Vérifiez la connexion MongoDB
2. Vérifiez les variables d'environnement
3. Consultez les logs d'erreur
4. Contactez l'équipe de développement

## 🔄 Mise à Jour

Pour mettre à jour les données de seed, modifiez directement le fichier `seed.js` en ajustant :
- Les utilisateurs par défaut
- Les ministères
- Les données d'exemple

Puis relancez `npm run reset` pour appliquer les changements.
