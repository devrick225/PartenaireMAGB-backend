/**
 * Modifications manuelles d'un don par le staff (montant, devise, statut…).
 *
 * Les totaux du donateur (total des dons, nombre de dons, points, niveau de
 * partenaire) dépendent du montant et du statut de ses dons : toute modification
 * manuelle doit donc leur appliquer la différence, sinon ils restent faux jusqu'au
 * recalcul nocturne — et un don passé à « complété » à la main n'était pas
 * converti en XOF ni suivi d'un reçu.
 */
const User = require('../models/User');
const { toXOF } = require('../utils/currency');

// Ce qu'un don apporte aux totaux du donateur : son montant net en XOF s'il est complété
const contributionOf = (donation) => {
  if (donation.status !== 'completed') return { amount: 0, count: 0 };
  const net = Math.max((donation.amount || 0) - (donation.refundedAmount || 0), 0);
  return { amount: toXOF(net, donation.currency), count: 1 };
};

/**
 * Appliquer des modifications à un don et répercuter l'écart sur le donateur.
 *
 * @param {Document} donation  don à modifier (document Mongoose complet)
 * @param {Object}   updates   champs à modifier (déjà filtrés par l'appelant)
 * @param {Object}   options   { performedBy, description, metadata }
 * @returns {{ donation, oldStatus, newlyCompleted }}
 */
const applyDonationChange = async (donation, updates, { performedBy = null, description, metadata = {} } = {}) => {
  const before = contributionOf(donation);
  const oldStatus = donation.status;

  Object.entries(updates).forEach(([field, value]) => {
    donation[field] = value;
  });

  donation.addToHistory(
    'updated',
    description || 'Don modifié par un administrateur',
    performedBy,
    { ...metadata, updates, oldStatus, newStatus: donation.status }
  );

  if (donation.status === 'completed' && oldStatus !== 'completed') {
    donation.processedBy = performedBy;
    donation.processedAt = new Date();
  }

  await donation.save();

  const after = contributionOf(donation);
  const amountDelta = after.amount - before.amount;
  const countDelta = after.count - before.count;
  const userId = donation.user?._id || donation.user;

  if ((amountDelta !== 0 || countDelta !== 0) && userId) {
    const user = await User.findById(userId);
    if (user) await user.applyDonationDelta(amountDelta, countDelta);
  }

  const newlyCompleted = donation.status === 'completed' && oldStatus !== 'completed';

  // Un don validé à la main (espèces, virement…) donne droit à un reçu comme les autres
  if (newlyCompleted && userId && !donation.notifications?.receiptSent) {
    try {
      const user = await User.findById(userId);
      if (user?.email) {
        await require('./emailService').sendDonationReceiptEmail(user.email, user.firstName, {
          receiptNumber: donation.receipt?.number,
          donorName: `${user.firstName} ${user.lastName}`,
          formattedAmount: donation.formattedAmount,
          donationDate: donation.createdAt,
          paymentMethod: 'Enregistrement manuel',
          category: donation.category
        });
        donation.notifications.receiptSent = true;
        await donation.save();
      }
    } catch (emailError) {
      console.error(`❌ Erreur envoi reçu (don ${donation._id}):`, emailError.message);
    }
  }

  return { donation, oldStatus, newlyCompleted };
};

module.exports = {
  applyDonationChange,
  contributionOf
};
