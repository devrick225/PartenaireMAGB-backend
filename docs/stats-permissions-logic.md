# Logique des Permissions pour les Statistiques

## Philosophie
Chaque utilisateur peut voir ses propres statistiques, tandis que les administrateurs peuvent voir les statistiques globales de tous les utilisateurs.

## Permissions par Endpoint

### `/api/payments/stats`
- **Accès** : Tous les utilisateurs authentifiés
- **Logique de filtrage** :
  - **Utilisateur normal** : Voit uniquement ses propres paiements
  - **Admin/Treasurer** : Voit tous les paiements du système

### `/api/tickets/stats` 
- **Accès** : Tous les utilisateurs authentifiés
- **Logique de filtrage** :
  - **Utilisateur normal** : Voit uniquement ses propres tickets
  - **Admin/Moderator/Support Agent** : Voit tous les tickets du système

## Réponse API

Chaque réponse inclut un champ `isPersonalStats` qui indique si les statistiques affichées sont personnelles ou globales :

```json
{
  "success": true,
  "data": {
    "stats": {
      "totalVolume": 5000,
      "totalTransactions": 10,
      "successRate": 90,
      "isPersonalStats": true // true = stats personnelles, false = stats globales
    }
  }
}
```

## Exemples d'usage

### Utilisateur normal (Jean)
```bash
# Voit uniquement ses propres paiements/tickets
GET /api/payments/stats?period=month
GET /api/tickets/stats?period=week
```

### Administrateur
```bash
# Voit toutes les statistiques du système
GET /api/payments/stats?period=month
GET /api/tickets/stats?period=year
```

## Sécurité
- Les filtres sont appliqués au niveau de la base de données
- Aucune donnée d'autres utilisateurs n'est exposée aux utilisateurs normaux
- Les administrateurs voient plus de détails (plus de transactions récentes, etc.) 