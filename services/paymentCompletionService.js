/**
 * Finalisation des paiements — point d'entrée unique.
 *
 * Un même paiement peut être confirmé par plusieurs chemins quasi simultanés :
 * webhook du fournisseur, appel POST /payments/:id/verify du client au retour
 * du paiement, et tâche cron de rattrapage. Chacun de ces chemins mettait à jour
 * le paiement, le don et les statistiques du donateur de son côté, ce qui
 * comptait le don plusieurs fois et envoyait plusieurs reçus.
 *
 * Ici la transition de statut est « réclamée » de façon atomique en base :
 * seul le premier appelant applique les effets de bord, les suivants ne font rien.
 */
const Payment = require('../models/Payment');
const Donation = require('../models/Donation');
const User = require('../models/User');
const { toXOF } = require('../utils/currency');

// Statuts qu'aucune notification tardive ne doit écraser
const FINAL_PAID_STATUSES = ['completed', 'refunded', 'partially_refunded'];

const PROVIDER_LABELS = {
  cinetpay: 'CinetPay',
  stripe: 'Stripe',
  paypal: 'PayPal',
  fusionpay: 'FusionPay',
  moneyfusion: 'MoneyFusion',
  paydunya: 'PayDunya',
  geniuspay: 'GeniusPay'
};

const idOf = (ref) => (ref && ref._id ? ref._id : ref);

const isDocument = (ref) => !!ref && typeof ref.save === 'function';

// Applique des données fournisseur champ par champ (les clés hors schéma sont ignorées par Mongoose)
const applyProviderData = (payment, providerData = {}) => {
  Object.entries(providerData).forEach(([provider, data]) => {
    if (!data || typeof data !== 'object') return;
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) payment.set(`${provider}.${key}`, value);
    });
  });
};

const loadDonation = async (payment) => {
  if (isDocument(payment.donation)) return payment.donation;
  return payment.donation ? Donation.findById(payment.donation) : null;
};

const loadUser = async (payment) => {
  const userId = idOf(payment.user);
  return userId ? User.findById(userId) : null;
};

/**
 * Marquer un paiement comme complété et propager au don / au donateur.
 * Idempotent : sans effet si le paiement est déjà complété ou remboursé.
 *
 * @returns {{ completed: boolean, alreadyCompleted: boolean }}
 */
const completePayment = async (payment, { providerData = {}, transactionId = null, source = 'webhook' } = {}) => {
  const completedAt = new Date();

  const claim = await Payment.updateOne(
    { _id: payment._id, status: { $nin: FINAL_PAID_STATUSES } },
    { $set: { status: 'completed', 'transaction.completedAt': completedAt } }
  );

  if (claim.modifiedCount === 0) {
    return { completed: true, alreadyCompleted: true };
  }

  // Synchroniser le document local sans réécrire le statut au prochain save()
  payment.status = 'completed';
  payment.set('transaction.completedAt', completedAt);
  payment.unmarkModified('status');
  payment.unmarkModified('transaction.completedAt');

  applyProviderData(payment, providerData);
  payment.addToHistory('completed', 'Paiement complété avec succès', null, { source, transactionId });
  await payment.save();

  // Le don ne passe à « complété » qu'une seule fois, même si deux paiements aboutissent
  const donation = await loadDonation(payment);
  let donationNewlyCompleted = false;

  if (donation) {
    const donationClaim = await Donation.updateOne(
      { _id: donation._id, status: { $ne: 'completed' } },
      {
        $set: { status: 'completed', payment: payment._id },
        $push: {
          history: {
            action: 'completed',
            description: `Don complété via paiement ${PROVIDER_LABELS[payment.provider] || payment.provider}`,
            performedAt: completedAt,
            metadata: { paymentId: payment._id, transactionId, source }
          }
        }
      }
    );
    donationNewlyCompleted = donationClaim.modifiedCount === 1;
    donation.status = 'completed';
    donation.payment = payment._id;
    donation.unmarkModified('status');
    donation.unmarkModified('payment');
  }

  // Sans don rattaché on compte quand même le paiement
  const shouldCountStats = donation ? donationNewlyCompleted : true;
  let user = null;

  if (shouldCountStats) {
    try {
      user = await loadUser(payment);
      // Les totaux du donateur sont tenus en XOF, quelle que soit la devise du don
      const source = donation || payment;
      if (user) await user.updateDonationStats(toXOF(source.amount, source.currency));
    } catch (statsError) {
      // Le paiement est encaissé : une erreur de statistiques ne doit pas le faire échouer.
      // La tâche cron quotidienne recalcule les totaux à partir des dons complétés.
      console.error(`❌ Erreur mise à jour stats donateur (paiement ${payment._id}):`, statsError.message);
    }
  }

  try {
    require('./websocketService').notifyPaymentCompleted(payment, donation);
  } catch (wsError) {
    console.warn('⚠️ WebSocket notifyPaymentCompleted:', wsError.message);
  }

  if (donation && donationNewlyCompleted) {
    try {
      user = user || await loadUser(payment);
      if (user && user.email) {
        await require('./emailService').sendDonationReceiptEmail(user.email, user.firstName, {
          receiptNumber: donation.receipt?.number,
          donorName: `${user.firstName} ${user.lastName}`,
          formattedAmount: payment.formattedAmount,
          donationDate: donation.createdAt,
          paymentMethod: PROVIDER_LABELS[payment.provider] || payment.paymentMethod,
          category: donation.category,
          transactionId
        });
        await Donation.updateOne({ _id: donation._id }, { $set: { 'notifications.receiptSent': true } });
      }
    } catch (emailError) {
      console.error(`❌ Erreur envoi reçu (paiement ${payment._id}):`, emailError.message);
    }
  }

  return { completed: true, alreadyCompleted: false };
};

/**
 * Marquer un paiement comme échoué / annulé / expiré.
 * Sans effet si le paiement est déjà complété ou remboursé : un don encaissé
 * ne doit jamais repasser en échec à cause d'une notification tardive.
 *
 * @returns {{ changed: boolean }}
 */
const failPayment = async (payment, reason, { code = null, status = 'failed', source = 'webhook' } = {}) => {
  const failureReason = reason || 'Paiement échoué';

  const claim = await Payment.updateOne(
    { _id: payment._id, status: { $nin: [...FINAL_PAID_STATUSES, status] } },
    { $set: { status, 'transaction.failureReason': failureReason } }
  );

  if (claim.modifiedCount === 0) {
    return { changed: false };
  }

  payment.status = status;
  payment.set('transaction.failureReason', failureReason);
  payment.unmarkModified('status');
  payment.unmarkModified('transaction.failureReason');

  payment.addAttempt(status, code, failureReason);
  payment.addToHistory(status === 'cancelled' ? 'cancelled' : 'failed', failureReason, null, { source, code });
  await payment.save();

  // Le don n'échoue que s'il n'a aucun autre paiement abouti ou encore en cours
  const donation = await loadDonation(payment);
  if (donation && ['pending', 'processing'].includes(donation.status)) {
    const otherLivePayments = await Payment.countDocuments({
      donation: donation._id,
      _id: { $ne: payment._id },
      status: { $in: ['pending', 'processing', 'completed'] }
    });

    if (otherLivePayments === 0) {
      const donationClaim = await Donation.updateOne(
        { _id: donation._id, status: { $in: ['pending', 'processing'] } },
        {
          $set: { status: 'failed' },
          $push: {
            history: {
              action: 'failed',
              description: `Don échoué suite au paiement ${PROVIDER_LABELS[payment.provider] || payment.provider}`,
              performedAt: new Date(),
              metadata: { paymentId: payment._id, reason: failureReason, source }
            }
          }
        }
      );
      if (donationClaim.modifiedCount === 1) {
        donation.status = 'failed';
        donation.unmarkModified('status');
      }
    }
  }

  try {
    require('./websocketService').notifyPaymentFailed(payment, donation, { message: failureReason, code });
  } catch (wsError) {
    console.warn('⚠️ WebSocket notifyPaymentFailed:', wsError.message);
  }

  return { changed: true };
};

module.exports = {
  completePayment,
  failPayment,
  FINAL_PAID_STATUSES,
  PROVIDER_LABELS
};
