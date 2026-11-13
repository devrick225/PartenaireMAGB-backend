/**
 * Dons récurrents.
 *
 * Le mobile money ne permet pas de prélever sans action du donateur : chaque
 * échéance donne donc lieu à un don distinct, « en attente », que le donateur
 * règle par le parcours de paiement habituel (POST /api/payments/initialize).
 * Il est prévenu par email (et par SMS s'il l'a activé).
 *
 * Le don récurrent d'origine joue le rôle d'abonnement : il porte la fréquence
 * et la prochaine échéance ; ses échéances pointent vers lui via `recurringParent`.
 * Chaque échéance payée est ainsi comptée dans les statistiques et a son reçu.
 */
const Donation = require('../models/Donation');

// Garde-fou : nombre d'échéances rattrapées au plus par exécution pour un même don
const MAX_CATCH_UP = 3;

const paymentLink = () => {
  const base = process.env.FRONTEND_URL_PROD || process.env.FRONTEND_URL;
  return base ? `${base.replace(/\/$/, '')}/donations` : null;
};

const notifyDonor = async (parent, occurrence) => {
  const user = parent.user;
  if (!user || !user.email) return;

  if (user.emailNotifications?.reminders !== false) {
    try {
      await require('./emailService').sendRecurringDonationReminder(user.email, user.firstName, {
        formattedAmount: occurrence.formattedAmount,
        frequency: parent.recurring.frequency,
        nextPaymentDate: occurrence.createdAt,
        category: parent.category,
        paymentUrl: paymentLink()
      });
    } catch (emailError) {
      console.error(`❌ Erreur rappel email don récurrent ${parent._id}:`, emailError.message);
    }
  }

  if (user.smsNotifications?.reminders && user.phone) {
    try {
      const smsService = require('./smsService');
      if (smsService.isAvailable()) {
        await smsService.sendSms(
          user.phone,
          `Bonjour ${user.firstName},\n\nVotre DON PARTENAIRE MAGB de ${occurrence.amount} ${occurrence.currency} est arrivé à échéance. Connectez-vous à l'application pour le régler. Merci pour votre fidélité !`
        );
      }
    } catch (smsError) {
      console.error(`❌ Erreur rappel SMS don récurrent ${parent._id}:`, smsError.message);
    }
  }
};

/**
 * Créer les échéances arrivées à terme et prévenir les donateurs.
 * Rattrape aussi les échéances manquées (serveur arrêté, tâche non exécutée).
 */
const processDueRecurringDonations = async (now = new Date()) => {
  const results = { due: 0, created: 0, deactivated: 0, errors: 0 };

  const dueDonations = await Donation.find({
    type: 'recurring',
    'recurring.isActive': true,
    'recurring.nextPaymentDate': { $lte: now },
    // Un abonnement dont le premier don n'a jamais été payé ne génère pas d'échéances
    status: 'completed'
  }).populate('user');

  results.due = dueDonations.length;

  for (const parent of dueDonations) {
    try {
      let created = 0;

      while (
        parent.recurring.isActive &&
        parent.recurring.nextPaymentDate &&
        parent.recurring.nextPaymentDate <= now &&
        created < MAX_CATCH_UP
      ) {
        const dueDate = parent.recurring.nextPaymentDate;
        const occurrenceNumber = (parent.recurring.totalExecutions || 0) + 1;

        // Avancer l'abonnement de façon atomique : si deux exécutions se chevauchent
        // (cron + déclenchement manuel), une seule crée l'échéance.
        parent.recurring.totalExecutions = occurrenceNumber;
        const nextDate = parent.calculateNextPaymentDate();
        const stillActive = !!nextDate && parent.recurring.isActive;

        // Sécurité : une prochaine date qui n'avance pas créerait des échéances en boucle
        if (nextDate && nextDate <= dueDate) {
          throw new Error(`Prochaine échéance incohérente (${nextDate.toISOString()})`);
        }

        const claim = await Donation.updateOne(
          { _id: parent._id, 'recurring.nextPaymentDate': dueDate, 'recurring.isActive': true },
          {
            $set: {
              'recurring.totalExecutions': occurrenceNumber,
              'recurring.isActive': stillActive,
              ...(nextDate ? { 'recurring.nextPaymentDate': nextDate } : {})
            },
            $push: {
              history: {
                action: 'processed',
                description: `Échéance n°${occurrenceNumber} générée`,
                performedAt: now,
                metadata: { dueDate }
              }
            }
          }
        );

        if (claim.modifiedCount === 0) break; // déjà traité par une autre exécution

        const occurrence = await Donation.create({
          user: parent.user._id || parent.user,
          amount: parent.amount,
          currency: parent.currency,
          category: parent.category,
          type: 'one_time',
          paymentMethod: parent.paymentMethod,
          isAnonymous: parent.isAnonymous,
          status: 'pending',
          recurringParent: parent._id,
          occurrenceNumber,
          message: parent.message
        });

        created++;
        results.created++;
        if (!stillActive) results.deactivated++;

        await notifyDonor(parent, occurrence);
        console.log(`📅 Échéance n°${occurrenceNumber} créée pour le don récurrent ${parent._id} (don ${occurrence._id})`);

        if (!stillActive) break;
      }
    } catch (error) {
      results.errors++;
      console.error(`❌ Erreur traitement don récurrent ${parent._id}:`, error.message);
    }
  }

  return results;
};

module.exports = {
  processDueRecurringDonations
};
