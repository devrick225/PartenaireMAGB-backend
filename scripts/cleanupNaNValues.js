const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/User');
const Payment = require('../models/Payment');

async function cleanupNaNValues() {
  try {
    console.log('🧹 Début du nettoyage des valeurs NaN...');

    // Connexion à la base de données
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/partenaire-magb');
    console.log('✅ Connecté à MongoDB');

    // 1. Nettoyer les utilisateurs
    console.log('\n📊 Nettoyage des utilisateurs...');
    
    const users = await User.find({});
    let usersUpdated = 0;

    for (const user of users) {
      let needsUpdate = false;
      const updates = {};

      // Vérifier totalDonations
      if (isNaN(user.totalDonations) || !isFinite(user.totalDonations)) {
        updates.totalDonations = 0;
        needsUpdate = true;
        console.log(`❌ Utilisateur ${user._id}: totalDonations NaN -> 0`);
      }

      // Vérifier donationCount
      if (isNaN(user.donationCount) || !isFinite(user.donationCount)) {
        updates.donationCount = 0;
        needsUpdate = true;
        console.log(`❌ Utilisateur ${user._id}: donationCount NaN -> 0`);
      }

      // Vérifier points
      if (isNaN(user.points) || !isFinite(user.points)) {
        updates.points = 0;
        needsUpdate = true;
        console.log(`❌ Utilisateur ${user._id}: points NaN -> 0`);
      }

      // Vérifier level
      if (isNaN(user.level) || !isFinite(user.level) || user.level < 1) {
        updates.level = 1;
        needsUpdate = true;
        console.log(`❌ Utilisateur ${user._id}: level NaN -> 1`);
      }

      if (needsUpdate) {
        await User.findByIdAndUpdate(user._id, updates);
        usersUpdated++;
      }
    }

    console.log(`✅ ${usersUpdated} utilisateurs nettoyés sur ${users.length}`);

    // 2. Nettoyer les paiements
    console.log('\n💳 Nettoyage des paiements...');
    
    const payments = await Payment.find({});
    let paymentsUpdated = 0;

    for (const payment of payments) {
      let needsUpdate = false;
      const updates = {};

      // Vérifier amount
      if (isNaN(payment.amount) || !isFinite(payment.amount)) {
        // Pour les paiements, nous devons récupérer le montant depuis la donation
        try {
          await payment.populate('donation');
          if (payment.donation && payment.donation.amount && !isNaN(payment.donation.amount)) {
            updates.amount = payment.donation.amount;
            needsUpdate = true;
            console.log(`❌ Paiement ${payment._id}: amount NaN -> ${payment.donation.amount}`);
          } else {
            // Si on ne peut pas récupérer le montant, marquer comme échoué
            updates.status = 'failed';
            updates.amount = 0;
            needsUpdate = true;
            console.log(`❌ Paiement ${payment._id}: amount NaN et donation invalide -> failed`);
          }
        } catch (error) {
          updates.status = 'failed';
          updates.amount = 0;
          needsUpdate = true;
          console.log(`❌ Paiement ${payment._id}: erreur récupération donation -> failed`);
        }
      }

      // Vérifier les frais
      if (payment.fees) {
        if (isNaN(payment.fees.processingFee) || !isFinite(payment.fees.processingFee)) {
          updates['fees.processingFee'] = 0;
          needsUpdate = true;
        }
        if (isNaN(payment.fees.platformFee) || !isFinite(payment.fees.platformFee)) {
          updates['fees.platformFee'] = 0;
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        await Payment.findByIdAndUpdate(payment._id, updates);
        paymentsUpdated++;
      }
    }

    console.log(`✅ ${paymentsUpdated} paiements nettoyés sur ${payments.length}`);

    // 3. Recalculer les statistiques utilisateur
    console.log('\n🔄 Recalcul des statistiques utilisateur...');
    
    const Donation = require('../models/Donation');
    let statsUpdated = 0;

    for (const user of users) {
      try {
        // Recalculer les statistiques depuis les donations complétées
        const userDonations = await Donation.find({ 
          user: user._id, 
          status: 'completed' 
        });

        const totalAmount = userDonations.reduce((sum, donation) => {
          const amount = Number(donation.amount);
          return sum + (isNaN(amount) ? 0 : amount);
        }, 0);
        const donationCount = userDonations.length;
        const points = Math.floor(totalAmount / 1000);
        const level = Math.floor(points / 1000) + 1;

        // Mettre à jour si différent
        if (user.totalDonations !== totalAmount || 
            user.donationCount !== donationCount ||
            user.points !== points ||
            user.level !== level) {
          
          await User.findByIdAndUpdate(user._id, {
            totalDonations: totalAmount,
            donationCount: donationCount,
            points: points,
            level: level
          });
          
          statsUpdated++;
          console.log(`📊 Utilisateur ${user._id}: Stats recalculées - ${totalAmount} XOF, ${donationCount} dons, ${points} points, niveau ${level}`);
        }
      } catch (error) {
        console.error(`❌ Erreur recalcul stats utilisateur ${user._id}:`, error.message);
      }
    }

    console.log(`✅ ${statsUpdated} utilisateurs avec statistiques recalculées`);

    // Résumé final
    console.log('\n🎉 Nettoyage terminé !');
    console.log(`- ${usersUpdated} utilisateurs nettoyés`);
    console.log(`- ${paymentsUpdated} paiements nettoyés`);
    console.log(`- ${statsUpdated} statistiques recalculées`);

  } catch (error) {
    console.error('❌ Erreur lors du nettoyage:', error);
  } finally {
    await mongoose.disconnect();
    console.log('✅ Déconnecté de MongoDB');
  }
}

// Exécuter le script si appelé directement
if (require.main === module) {
  cleanupNaNValues()
    .then(() => {
      console.log('✅ Script de nettoyage terminé');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Erreur script de nettoyage:', error);
      process.exit(1);
    });
}

module.exports = cleanupNaNValues; 