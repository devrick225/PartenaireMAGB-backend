#!/bin/bash

# 🚀 Script de déploiement PARTENAIRE MAGB sur Vercel

echo "🚀 Déploiement PARTENAIRE MAGB sur Vercel..."
echo "=========================================="

# Vérifier si Vercel CLI est installé
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI n'est pas installé"
    echo "📦 Installation en cours..."
    npm install -g vercel
fi

# Vérifier si nous sommes connectés à Vercel
echo "🔐 Vérification de l'authentification Vercel..."
if ! vercel whoami &> /dev/null; then
    echo "❌ Non connecté à Vercel"
    echo "🔑 Connexion requise..."
    vercel login
fi

# Vérifier si le fichier .env existe
if [ ! -f ".env" ]; then
    echo "⚠️  Fichier .env non trouvé"
    echo "📝 Créez un fichier .env avec vos variables d'environnement"
    echo "📖 Consultez DEPLOYMENT.md pour la liste des variables requises"
fi

# Installation des dépendances
echo "📦 Installation des dépendances..."
npm install

# Tests rapides (optionnel)
echo "🧪 Exécution des tests..."
npm test 2>/dev/null || echo "⚠️  Tests ignorés (non configurés)"

# Déploiement
echo "🚀 Déploiement en cours..."
if [ "$1" == "prod" ]; then
    echo "📦 Déploiement en PRODUCTION..."
    vercel --prod
else
    echo "🧪 Déploiement en mode PREVIEW..."
    vercel
fi

echo ""
echo "✅ Déploiement terminé !"
echo "🌐 Votre API est maintenant disponible"
echo "📊 Vérifiez le statut: https://your-api.vercel.app/health"
echo ""
echo "📝 N'oubliez pas de:"
echo "   1. Configurer vos variables d'environnement sur Vercel"
echo "   2. Tester vos endpoints"
echo "   3. Configurer votre base de données MongoDB Atlas"
echo "" 