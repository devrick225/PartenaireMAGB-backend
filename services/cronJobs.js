const cron = require('node-cron');
const moneyFusionService = require('./moneyFusionService');
const fusionPayService = require('./fusionPayService');
const paymentService = require('./paymentService');

class CronJobsService {
  constructor() {
    this.jobs = new Map();
    this.isInitialized = false;
  }

  // Initialiser toutes les tâches cron
  initialize() {
    if (this.isInitialized) {
      console.log('⚠️ Tâches cron déjà initialisées');
      return;
    }

    console.log('🚀 Initialisation des tâches cron...');

    this.setupPaymentVerificationJob();
    this.setupDonationStatsJob();
    this.setupCleanupJob();
    
    this.isInitialized = true;
    console.log('✅ Tâches cron initialisées avec succès');
  }

  // Vérification automatique des paiements en attente (toutes les 30 minutes)
  setupPaymentVerificationJob() {
    const job = cron.schedule('*/30 * * * *', async () => {
      try {
        console.log('🔍 [CRON] Début vérification paiements en attente...');
        
        const results = {
          moneyfusion: { checked: 0, completed: 0, failed: 0, errors: 0 },
          fusionpay: { checked: 0, completed: 0, failed: 0, errors: 0 },
          total: { checked: 0, completed: 0, failed: 0, errors: 0 }
        };

        // Vérifier MoneyFusion
        try {
          const mfResults = await moneyFusionService.checkPendingPayments(2); // 2 heures
          results.moneyfusion = mfResults;
          console.log('✅ MoneyFusion vérification terminée:', mfResults);
        } catch (error) {
          console.error('❌ Erreur vérification MoneyFusion:', error.message);
          results.moneyfusion.errors++;
        }

        // Vérifier FusionPay (si disponible)
        try {
          if (fusionPayService && typeof fusionPayService.checkPendingPayments === 'function') {
            const fpResults = await fusionPayService.checkPendingPayments(2); // 2 heures
            results.fusionpay = fpResults;
            console.log('✅ FusionPay vérification terminée:', fpResults);
          }
        } catch (error) {
          console.error('❌ Erreur vérification FusionPay:', error.message);
          results.fusionpay.errors++;
        }

        // Calculer totaux
        results.total.checked = results.moneyfusion.checked + results.fusionpay.checked;
        results.total.completed = results.moneyfusion.completed + results.fusionpay.completed;
        results.total.failed = results.moneyfusion.failed + results.fusionpay.failed;
        results.total.errors = results.moneyfusion.errors + results.fusionpay.errors;

        console.log('🔍 [CRON] Vérification paiements terminée - Total:', results.total);

      } catch (error) {
        console.error('❌ [CRON] Erreur vérification paiements:', error);
      }
    }, {
      scheduled: false,
      timezone: "Africa/Abidjan"
    });

    this.jobs.set('paymentVerification', job);
    job.start();
    console.log('✅ Tâche cron vérification paiements activée (toutes les 30min)');
  }

  // Nettoyage et mise à jour des statistiques (quotidien à 3h du matin)
  setupDonationStatsJob() {
    const job = cron.schedule('0 3 * * *', async () => {
      try {
        console.log('📊 [CRON] Début mise à jour statistiques donations...');
        
        const User = require('../models/User');
        const Donation = require('../models/Donation');
        
        // Recalculer les statistiques pour tous les utilisateurs
        const users = await User.find({});
        let updatedUsers = 0;

        for (const user of users) {
          try {
            // Recalculer les statistiques de donation de l'utilisateur
            const userDonations = await Donation.find({ 
              user: user._id, 
              status: 'completed' 
            });

            // Calculer les statistiques avec validation
            const totalAmount = userDonations.reduce((sum, donation) => {
              const amount = Number(donation.amount);
              return sum + (isNaN(amount) ? 0 : amount);
            }, 0);
            const donationCount = userDonations.length;

            // Valider les valeurs calculées
            const validTotalAmount = isNaN(totalAmount) ? 0 : totalAmount;
            const validDonationCount = isNaN(donationCount) ? 0 : donationCount;

            // S'assurer que les valeurs actuelles de l'utilisateur sont valides
            const currentTotal = isNaN(user.totalDonations) ? 0 : user.totalDonations;
            const currentCount = isNaN(user.donationCount) ? 0 : user.donationCount;

            // Mettre à jour si nécessaire
            if (currentTotal !== validTotalAmount || currentCount !== validDonationCount) {
              user.totalDonations = validTotalAmount;
              user.donationCount = validDonationCount;
              
              // Nettoyer aussi les autres champs numériques
              user.points = isNaN(user.points) ? 0 : user.points;
              user.level = isNaN(user.level) ? 1 : user.level;
              
              await user.save();
              updatedUsers++;
              console.log(`📊 Utilisateur ${user._id} mis à jour: ${currentTotal} -> ${validTotalAmount} (${currentCount} -> ${validDonationCount} dons)`);
            }
          } catch (error) {
            console.error(`❌ Erreur mise à jour stats utilisateur ${user._id}:`, error.message);
          }
        }

        // Traiter les dons récurrents dus
        try {
          const dueToday = await Donation.getDueToday();
          console.log(`📅 ${dueToday.length} dons récurrents dus aujourd'hui`);
          
          // TODO: Traiter les dons récurrents
        } catch (error) {
          console.error('❌ Erreur traitement dons récurrents:', error.message);
        }

        console.log(`📊 [CRON] Statistiques mises à jour - ${updatedUsers} utilisateurs modifiés`);

      } catch (error) {
        console.error('❌ [CRON] Erreur mise à jour statistiques:', error);
      }
    }, {
      scheduled: false,
      timezone: "Africa/Abidjan"
    });

    this.jobs.set('donationStats', job);
    job.start();
    console.log('✅ Tâche cron statistiques activée (quotidien 3h)');
  }

  // Nettoyage des données anciennes (hebdomadaire)
  setupCleanupJob() {
    const job = cron.schedule('0 2 * * 0', async () => { // Dimanche 2h du matin
      try {
        console.log('🧹 [CRON] Début nettoyage données...');
        
        const Payment = require('../models/Payment');
        
        // Supprimer les paiements échoués très anciens (plus de 6 mois)
        const sixMonthsAgo = new Date(Date.now() - (6 * 30 * 24 * 60 * 60 * 1000));
        
        const deletedPayments = await Payment.deleteMany({
          status: 'failed',
          createdAt: { $lt: sixMonthsAgo }
        });

        console.log(`🧹 [CRON] Nettoyage terminé - ${deletedPayments.deletedCount} paiements échoués supprimés`);

      } catch (error) {
        console.error('❌ [CRON] Erreur nettoyage:', error);
      }
    }, {
      scheduled: false,
      timezone: "Africa/Abidjan"
    });

    this.jobs.set('cleanup', job);
    job.start();
    console.log('✅ Tâche cron nettoyage activée (hebdomadaire)');
  }

  // Vérification manuelle immédiate
  async runPaymentVerificationNow() {
    console.log('🔍 Vérification manuelle des paiements...');
    
    try {
      const mfResults = await moneyFusionService.checkPendingPayments(24);
      console.log('✅ Vérification manuelle MoneyFusion terminée:', mfResults);
      return mfResults;
    } catch (error) {
      console.error('❌ Erreur vérification manuelle:', error);
      throw error;
    }
  }

  // Arrêter toutes les tâches
  stopAll() {
    console.log('🛑 Arrêt de toutes les tâches cron...');
    
    this.jobs.forEach((job, name) => {
      job.stop();
      console.log(`🛑 Tâche ${name} arrêtée`);
    });
    
    this.jobs.clear();
    this.isInitialized = false;
    console.log('✅ Toutes les tâches cron arrêtées');
  }

  // Obtenir le statut des tâches
  getStatus() {
    const status = {};
    
    this.jobs.forEach((job, name) => {
      status[name] = {
        running: job.running,
        scheduled: job.scheduled,
        lastRun: job.lastDate ? job.lastDate.toISOString() : null,
        nextRun: job.nextDate ? job.nextDate.toISOString() : null
      };
    });

    return {
      initialized: this.isInitialized,
      totalJobs: this.jobs.size,
      jobs: status
    };
  }
}

// Instance singleton
const cronJobsService = new CronJobsService();

module.exports = cronJobsService; 