# Système de Téléchargement de Documents - PARTENAIRE MAGB

## 📋 Vue d'Ensemble

Le système de téléchargement de documents permet aux utilisateurs de télécharger leurs documents financiers sous forme de PDF et Excel, incluant :

- **Reçus de donation** (PDF)
- **Échéanciers de dons récurrents** (PDF et Excel)
- **Rapports de donations** (Excel)

## 🛠️ Architecture Technique

### **Backend**

#### **Services**
- `services/pdfService.js` - Génération de documents PDF
- `services/excelService.js` - Génération de fichiers Excel

#### **Contrôleurs**
- `controllers/documentsController.js` - Gestion des téléchargements

#### **Routes**
- `routes/documents.js` - Endpoints API

#### **Dépendances**
```json
{
  "pdfkit": "^0.14.0",
  "exceljs": "^4.4.0"
}
```

### **Mobile**

#### **Services**
- `store/services/documentsService.ts` - Client API et gestion des téléchargements

#### **Écrans**
- `screens/DocumentsScreen.tsx` - Interface principale de téléchargement

#### **Navigation**
- Intégré dans `AppNavigator.js`
- Accessible depuis `ProfileScreen.tsx` et `DonationDetailScreen.tsx`

## 📄 Types de Documents

### **1. Reçus de Donation (PDF)**

**Contenu :**
- Informations du donateur
- Détails de la donation
- Montant et devise
- Statut de paiement
- Note de remerciement

**Endpoint :** `GET /api/documents/donation-receipt/:donationId`

**Génération :** Service `pdfService.generateDonationReceipt()`

### **2. Échéanciers de Dons Récurrents**

#### **Format PDF**
- Header professionnel
- Informations du donateur
- Détails du don récurrent
- Tableau des prochaines occurrences
- Résumé financier

**Endpoint :** `GET /api/documents/schedule-pdf/:recurringDonationId`

#### **Format Excel**
- Feuille de calcul structurée
- Données exportables
- Formules de calcul
- Mise en forme conditionnelle

**Endpoint :** `GET /api/documents/schedule-excel/:recurringDonationId`

### **3. Rapports de Donations (Excel)**

**Contenu :**
- Liste complète des donations
- Filtres appliqués
- Résumé financier
- Données analytiques

**Endpoint :** `GET /api/documents/donations-report`

**Paramètres de filtrage :**
- `startDate` - Date de début
- `endDate` - Date de fin
- `category` - Catégorie de don
- `status` - Statut de don
- `period` - Période prédéfinie (week, month, year)

## 🔐 Sécurité et Autorisations

### **Authentification**
- Token JWT requis pour tous les endpoints
- Middleware `authenticateToken` appliqué

### **Autorisation**
- Les utilisateurs ne peuvent accéder qu'à leurs propres documents
- Les administrateurs ont accès à tous les documents
- Vérification `userId` pour chaque requête

### **Validation**
- Validation des paramètres avec `express-validator`
- Contrôle des types de données
- Gestion des erreurs robuste

## 📱 Interface Mobile

### **Écran Documents**

#### **Fonctionnalités :**
- Liste des documents disponibles
- Téléchargement avec barre de progression
- Partage automatique après téléchargement
- Gestion des erreurs

#### **Sections :**
1. **Résumé** - Compteurs de documents disponibles
2. **Reçus de Donation** - Liste des donations complétées
3. **Échéanciers** - Dons récurrents actifs (PDF et Excel)
4. **Rapports** - Rapport complet des donations

### **Points d'Accès**

#### **ProfileScreen**
```tsx
// Bouton dans la section Actions
{renderActionItem(
  'description',
  'Mes Documents',
  'Télécharger reçus et échéanciers',
  () => navigation.navigate('Documents')
)}
```

#### **DonationDetailScreen**
```tsx
// Section visible seulement pour donations complétées
{donation?.status === 'completed' && (
  <TouchableOpacity onPress={() => navigation.navigate('Documents')}>
    {/* Bouton télécharger reçu */}
  </TouchableOpacity>
)}
```

## 💻 Utilisation API

### **Obtenir les Documents Disponibles**

```http
GET /api/documents/available
Authorization: Bearer {token}
```

**Réponse :**
```json
{
  "success": true,
  "data": {
    "summary": {
      "donationsCount": 5,
      "recurringDonationsCount": 2,
      "documentsAvailable": true
    },
    "donationReceipts": [...],
    "schedules": [...],
    "reports": {...}
  }
}
```

### **Télécharger un Reçu**

```http
GET /api/documents/donation-receipt/64f123...
Authorization: Bearer {token}
```

**Réponse :** Fichier PDF en stream

### **Télécharger un Échéancier Excel**

```http
GET /api/documents/schedule-excel/64f456...
Authorization: Bearer {token}
```

**Réponse :** Fichier Excel en stream

### **Télécharger un Rapport**

```http
GET /api/documents/donations-report?period=month&category=soutien
Authorization: Bearer {token}
```

**Réponse :** Fichier Excel en stream

## 🔄 Gestion des Fichiers Mobile

### **Téléchargement**
```typescript
const result = await documentsService.downloadDonationReceipt(
  donationId,
  (progress) => {
    console.log(`Progression: ${progress.progress * 100}%`);
  }
);
```

### **Partage Automatique**
- Utilisation d'`expo-sharing`
- Détection automatique du type MIME
- Fallback en cas d'erreur de partage

### **Stockage Local**
- Sauvegarde dans `FileSystem.documentDirectory`
- Nommage standardisé des fichiers
- Gestion de l'espace disque

### **Utilitaires**
```typescript
// Lister les fichiers téléchargés
const files = await documentsService.getDownloadedFiles();

// Supprimer un fichier
await documentsService.deleteFile(filePath);

// Formater la taille
const size = documentsService.formatFileSize(bytes);
```

## 🎨 Design et UX

### **Composants Visuels**
- Cards avec icônes thématiques
- Barres de progression animées
- États de chargement clairs
- Messages d'erreur informatifs

### **Icônes par Type**
- 📄 `receipt` - Reçus de donation
- 📅 `schedule` - Échéanciers PDF
- 📊 `table-chart` - Échéanciers Excel
- 📈 `assessment` - Rapports

### **Couleurs et Thèmes**
- Adaptation thème sombre/clair
- Couleurs primaires de l'application
- Feedback visuel pour les états

## ⚠️ Gestion d'Erreurs

### **Backend**
```javascript
try {
  const pdfBuffer = await pdfService.generateDonationReceipt(donation, user);
  res.send(pdfBuffer);
} catch (error) {
  console.error('Erreur génération PDF:', error);
  res.status(500).json({
    success: false,
    error: 'Erreur lors de la génération du document'
  });
}
```

### **Mobile**
```typescript
try {
  const result = await documentsService.downloadDonationReceipt(donationId);
  if (result.success) {
    Alert.alert('Succès', 'Document téléchargé avec succès');
  } else {
    Alert.alert('Erreur', result.error);
  }
} catch (error) {
  Alert.alert('Erreur', 'Impossible de télécharger le document');
}
```

## 📊 Formats de Documents

### **PDF - Styling**
```javascript
const colors = {
  primary: '#2E7D32',
  secondary: '#1976D2',
  accent: '#FF6F00',
  text: '#212121',
  lightGray: '#F5F5F5'
};
```

### **Excel - Mise en Forme**
```javascript
// Headers
cell.fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF2E7D32' }
};

// Données alternées
cell.fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: isAlternate ? 'FFF5F5F5' : 'FFFFFFFF' }
};
```

## 🔧 Configuration et Déploiement

### **Variables d'Environnement**
Aucune configuration spéciale requise. Les services utilisent les configurations existantes.

### **Permissions Mobile**
```json
{
  "expo": {
    "ios": {
      "NSDocumentsFolderUsageDescription": "Cette app a besoin d'accéder aux documents pour sauvegarder les téléchargements"
    },
    "android": {
      "permissions": [
        "WRITE_EXTERNAL_STORAGE",
        "READ_EXTERNAL_STORAGE"
      ]
    }
  }
}
```

### **Limites de Performance**
- PDF : ~150 KB par document
- Excel : ~50 KB par document
- Limite : 1000 donations par rapport
- Timeout : 30 secondes par téléchargement

## 🧪 Tests

### **Tests Backend**
```bash
# Tester la génération PDF
npm run test -- --grep "PDF generation"

# Tester les endpoints
npm run test -- --grep "documents endpoints"
```

### **Tests Mobile**
```bash
# Tester le service de téléchargement
npm test -- DocumentsService

# Tester l'interface
npm test -- DocumentsScreen
```

## 📈 Monitoring et Métriques

### **Logs Backend**
- Temps de génération des documents
- Erreurs de génération
- Taille des fichiers produits

### **Analytics Mobile**
- Taux de téléchargement par type
- Erreurs de téléchargement
- Performance des téléchargements

## 🚀 Évolutions Futures

### **Fonctionnalités Prévues**
- [ ] Téléchargement par lot
- [ ] Envoi par email automatique
- [ ] Templates personnalisables
- [ ] Signature numérique
- [ ] Archivage automatique
- [ ] Export comptable

### **Optimisations**
- [ ] Cache de documents générés
- [ ] Compression des PDFs
- [ ] Génération asynchrone
- [ ] Notifications push de disponibilité

## 📞 Support

### **Codes d'Erreur**
- `404` - Document non trouvé
- `403` - Accès non autorisé
- `500` - Erreur de génération
- `400` - Paramètres invalides

### **Diagnostic**
```bash
# Vérifier les packages
npm list pdfkit exceljs

# Tester la génération
node -e "require('./services/pdfService').generateDonationReceipt(...)"
```

La fonctionnalité de téléchargement de documents offre une expérience complète et professionnelle pour la gestion des documents financiers des utilisateurs ! 📄✨