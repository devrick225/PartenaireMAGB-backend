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
        
        // Utiliser une agrégation MongoDB au lieu d'une boucle N+1
        // Une seule requête pour calculer les stats de tous les utilisateurs
        const donationStats = await Donation.aggregate([
          { $match: { status: 'completed' } },
          {
            $group: {
              _id: '$user',
              totalAmount: { $sum: '$amount' },
              donationCount: { $sum: 1 }
            }
          }
        ]);

        // Construire un map pour accès O(1)
        const statsMap = new Map();
        donationStats.forEach(stat => {
          statsMap.set(stat._id.toString(), {
            totalAmount: isNaN(stat.totalAmount) ? 0 : stat.totalAmount,
            donationCount: isNaN(stat.donationCount) ? 0 : stat.donationCount
          });
        });

        // Mettre à jour en bulk avec bulkWrite
        const bulkOps = [];
        const users = await User.find({}).select('_id totalDonations donationCount points level');
        
        for (const user of users) {
          const stats = statsMap.get(user._id.toString()) || { totalAmount: 0, donationCount: 0 };
          const currentTotal = isNaN(user.totalDonations) ? 0 : user.totalDonations;
          const currentCount = isNaN(user.donationCount) ? 0 : user.donationCount;

          if (currentTotal !== stats.totalAmount || currentCount !== stats.donationCount) {
            bulkOps.push({
              updateOne: {
                filter: { _id: user._id },
                update: {
                  $set: {
                    totalDonations: stats.totalAmount,
                    donationCount: stats.donationCount,
                    points: isNaN(user.points) ? 0 : user.points,
                    level: isNaN(user.level) ? 1 : user.level
                  }
                }
              }
            });
          }
        }

        let updatedUsers = 0;
        if (bulkOps.length > 0) {
          const result = await User.bulkWrite(bulkOps);
          updatedUsers = result.modifiedCount;
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
        
        // NE PAS supprimer les paiements échoués — ils font partie de l'audit trail financier.
        // À la place, on les archive en ajoutant un flag pour les exclure des rapports actifs.
        const sixMonthsAgo = new Date(Date.now() - (6 * 30 * 24 * 60 * 60 * 1000));
        
        const archivedPayments = await Payment.updateMany(
          {
            status: 'failed',
            createdAt: { $lt: sixMonthsAgo },
            archived: { $ne: true }
          },
          { $set: { archived: true } }
        );

        console.log(`🧹 [CRON] Nettoyage terminé - ${archivedPayments.modifiedCount} paiements échoués archivés (non supprimés)`);

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