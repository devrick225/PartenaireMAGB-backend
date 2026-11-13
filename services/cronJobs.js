const cron = require('node-cron');
const moneyFusionService = require('./moneyFusionService');
const fusionPayService = require('./fusionPayService');
const geniusPayService = require('./geniusPayService');
const paymentService = require('./paymentService');
const { amountInXofExpr } = require('../utils/currency');
const { processDueRecurringDonations, remindUnpaidOccurrences } = require('./recurringDonationService');

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
    this.setupRecurringDonationsJob();
    this.setupReconciliationJob();
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
          geniuspay: { checked: 0, completed: 0, failed: 0, errors: 0 },
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

        // Vérifier GeniusPay (si disponible)
        try {
          if (geniusPayService && typeof geniusPayService.checkPendingPayments === 'function') {
            const gpResults = await geniusPayService.checkPendingPayments(2); // 2 heures
            results.geniuspay = gpResults;
            console.log('✅ GeniusPay vérification terminée:', gpResults);
          }
        } catch (error) {
          console.error('❌ Erreur vérification GeniusPay:', error.message);
          results.geniuspay.errors++;
        }

        // Calculer totaux
        results.total.checked = results.moneyfusion.checked + results.fusionpay.checked + results.geniuspay.checked;
        results.total.completed = results.moneyfusion.completed + results.fusionpay.completed + results.geniuspay.completed;
        results.total.failed = results.moneyfusion.failed + results.fusionpay.failed + results.geniuspay.failed;
        results.total.errors = results.moneyfusion.errors + results.fusionpay.errors + results.geniuspay.errors;

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
              totalAmount: { $sum: amountInXofExpr() },
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
        const users = await User.find({}).select('_id totalDonations donationCount points level partnerLevel');
        
        for (const user of users) {
          const stats = statsMap.get(user._id.toString()) || { totalAmount: 0, donationCount: 0 };
          const currentTotal = isNaN(user.totalDonations) ? 0 : user.totalDonations;
          const currentCount = isNaN(user.donationCount) ? 0 : user.donationCount;

          // Le niveau de partenaire dépend du total : le recalculer avec lui
          const partnerLevel = User.partnerLevelFor(stats.totalAmount);

          if (currentTotal !== stats.totalAmount || currentCount !== stats.donationCount || user.partnerLevel !== partnerLevel) {
            bulkOps.push({
              updateOne: {
                filter: { _id: user._id },
                update: {
                  $set: {
                    totalDonations: stats.totalAmount,
                    donationCount: stats.donationCount,
                    partnerLevel,
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

  // Échéances des dons récurrents (quotidien à 8h) : création du don à régler + rappel au donateur
  setupRecurringDonationsJob() {
    const job = cron.schedule('0 8 * * *', async () => {
      try {
        console.log('📅 [CRON] Début traitement des dons récurrents...');
        const results = await processDueRecurringDonations();
        console.log('📅 [CRON] Dons récurrents traités:', results);

        const reminders = await remindUnpaidOccurrences();
        console.log('📅 [CRON] Relances d\'échéances impayées:', reminders);
      } catch (error) {
        console.error('❌ [CRON] Erreur dons récurrents:', error);
      }
    }, {
      scheduled: false,
      timezone: "Africa/Abidjan"
    });

    this.jobs.set('recurringDonations', job);
    job.start();
    console.log('✅ Tâche cron dons récurrents activée (quotidien 8h)');
  }

  // Déclenchement manuel (admin, ou planificateur externe si l'hébergement n'a pas de processus permanent)
  async runRecurringDonationsNow() {
    const occurrences = await processDueRecurringDonations();
    const reminders = await remindUnpaidOccurrences();
    return { ...occurrences, reminders };
  }

  // Rapprochement quotidien (6h) : journalise les anomalies et prévient la trésorerie
  // par email si RECONCILIATION_EMAIL est défini
  setupReconciliationJob() {
    const job = cron.schedule('0 6 * * *', async () => {
      try {
        const report = await require('./reconciliationService').buildReport({ days: 1 });
        const { anomalies } = report;
        console.log(`🧾 [CRON] Rapprochement: ${anomalies.count} anomalie(s)`, {
          paidWithoutDonation: anomalies.paidWithoutDonation.length,
          donationsWithoutPayment: anomalies.donationsWithoutPayment.length,
          stuckPayments: anomalies.stuckPayments.count,
          userTotalMismatches: anomalies.userTotalMismatches.count
        });

        if (anomalies.count > 0 && process.env.RECONCILIATION_EMAIL) {
          await require('./emailService').sendEmail(
            process.env.RECONCILIATION_EMAIL,
            `Rapprochement des paiements : ${anomalies.count} anomalie(s) - PARTENAIRE MAGB`,
            `<p>Le contrôle quotidien a relevé ${anomalies.count} anomalie(s) :</p><ul>
              <li>Paiements complétés dont le don ne l'est pas : ${anomalies.paidWithoutDonation.length}</li>
              <li>Dons complétés sans paiement abouti : ${anomalies.donationsWithoutPayment.length}</li>
              <li>Paiements en attente depuis plus de 24 h : ${anomalies.stuckPayments.count}</li>
              <li>Donateurs dont le total diffère de leurs dons : ${anomalies.userTotalMismatches.count}</li>
            </ul><p>Détail : GET /api/payments/reconciliation</p>`
          );
        }
      } catch (error) {
        console.error('❌ [CRON] Erreur rapprochement:', error);
      }
    }, {
      scheduled: false,
      timezone: "Africa/Abidjan"
    });

    this.jobs.set('reconciliation', job);
    job.start();
    console.log('✅ Tâche cron rapprochement activée (quotidien 6h)');
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
      // 0 = vérifier tous les paiements en attente, quel que soit leur âge
      const mfResults = await moneyFusionService.checkPendingPayments(0);
      console.log('✅ Vérification manuelle MoneyFusion terminée:', mfResults);

      let gpResults = { checked: 0, completed: 0, failed: 0, errors: 0 };
      try {
        gpResults = await geniusPayService.checkPendingPayments(0);
        console.log('✅ Vérification manuelle GeniusPay terminée:', gpResults);
      } catch (error) {
        console.error('❌ Erreur vérification manuelle GeniusPay:', error.message);
        gpResults.errors++;
      }

      return {
        checked: mfResults.checked + gpResults.checked,
        completed: mfResults.completed + gpResults.completed,
        failed: mfResults.failed + gpResults.failed,
        errors: mfResults.errors + gpResults.errors,
        moneyfusion: mfResults,
        geniuspay: gpResults
      };
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