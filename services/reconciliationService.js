/**
 * Rapprochement : contrôle de cohérence entre paiements, dons et totaux des donateurs.
 *
 * Deux usages pour la trésorerie :
 *  - `totalsByProvider` se compare au relevé de chaque fournisseur (MoneyFusion,
 *    GeniusPay…) sur la même période ;
 *  - `anomalies` liste ce qui mérite une vérification manuelle.
 *
 * Lecture seule : ce service ne corrige rien.
 */
const Payment = require('../models/Payment');
const Donation = require('../models/Donation');
const User = require('../models/User');
const { amountInXofExpr } = require('../utils/currency');

const SAMPLE_SIZE = 50;

const buildReport = async ({ days = 1, now = new Date() } = {}) => {
  const periodDays = Math.min(Math.max(Number(days) || 1, 1), 90);
  const since = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
  const stuckBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // 1. Encaissements de la période par fournisseur et devise (à comparer aux relevés)
  const totalsByProvider = await Payment.aggregate([
    { $match: { status: { $in: ['completed', 'partially_refunded', 'refunded'] }, 'transaction.completedAt': { $gte: since, $lte: now } } },
    {
      $group: {
        _id: { provider: '$provider', currency: '$currency' },
        count: { $sum: 1 },
        collected: { $sum: '$amount' },
        refunded: { $sum: { $ifNull: ['$refund.amount', 0] } }
      }
    },
    { $project: { _id: 0, provider: '$_id.provider', currency: '$_id.currency', count: 1, collected: 1, refunded: 1, net: { $subtract: ['$collected', '$refunded'] } } },
    { $sort: { provider: 1, currency: 1 } }
  ]);

  // 2. Paiements complétés dont le don n'est pas complété / remboursé
  const paidWithoutDonation = await Payment.aggregate([
    { $match: { status: 'completed' } },
    { $lookup: { from: 'donations', localField: 'donation', foreignField: '_id', as: 'donationDoc' } },
    { $unwind: { path: '$donationDoc', preserveNullAndEmptyArrays: true } },
    { $match: { $or: [{ donationDoc: null }, { 'donationDoc.status': { $nin: ['completed', 'refunded'] } }] } },
    { $project: { paymentId: '$_id', _id: 0, donationId: '$donation', donationStatus: '$donationDoc.status', provider: 1, amount: 1, currency: 1, createdAt: 1 } },
    { $limit: SAMPLE_SIZE }
  ]);

  // 3. Dons complétés sans paiement abouti (hors validations manuelles par le staff)
  const donationsWithoutPayment = await Donation.aggregate([
    { $match: { status: 'completed', processedBy: null } },
    {
      $lookup: {
        from: 'payments',
        let: { donationId: '$_id' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$donation', '$$donationId'] }, { $in: ['$status', ['completed', 'partially_refunded']] }] } } },
          { $limit: 1 }
        ],
        as: 'paid'
      }
    },
    { $match: { paid: { $size: 0 } } },
    { $project: { donationId: '$_id', _id: 0, user: 1, amount: 1, currency: 1, createdAt: 1 } },
    { $limit: SAMPLE_SIZE }
  ]);

  // 4. Paiements bloqués en attente depuis plus de 24 h
  const stuckPayments = await Payment.find({ status: { $in: ['pending', 'processing'] }, createdAt: { $lt: stuckBefore } })
    .select('provider amount currency status createdAt donation')
    .sort({ createdAt: 1 })
    .limit(SAMPLE_SIZE)
    .lean();
  const stuckCount = await Payment.countDocuments({ status: { $in: ['pending', 'processing'] }, createdAt: { $lt: stuckBefore } });

  // 5. Donateurs dont le total enregistré diffère de la somme de leurs dons
  const donationTotals = await Donation.aggregate([
    { $match: { status: 'completed' } },
    { $group: { _id: '$user', total: { $sum: amountInXofExpr() }, count: { $sum: 1 } } }
  ]);
  const expected = new Map(donationTotals.map(row => [String(row._id), row]));
  const users = await User.find({ $or: [{ totalDonations: { $gt: 0 } }, { _id: { $in: donationTotals.map(row => row._id) } }] })
    .select('totalDonations donationCount partnerId')
    .lean();

  const userMismatches = [];
  users.forEach(user => {
    const row = expected.get(String(user._id)) || { total: 0, count: 0 };
    const expectedTotal = Math.round(row.total);
    if (Math.abs((user.totalDonations || 0) - expectedTotal) > 1 || (user.donationCount || 0) !== row.count) {
      userMismatches.push({
        userId: user._id,
        partnerId: user.partnerId,
        recorded: { total: user.totalDonations || 0, count: user.donationCount || 0 },
        expected: { total: expectedTotal, count: row.count }
      });
    }
  });

  const anomalyCount = paidWithoutDonation.length + donationsWithoutPayment.length + stuckCount + userMismatches.length;

  return {
    generatedAt: now,
    period: { from: since, to: now, days: periodDays },
    totalsByProvider,
    anomalies: {
      count: anomalyCount,
      paidWithoutDonation,
      donationsWithoutPayment,
      stuckPayments: { count: stuckCount, sample: stuckPayments },
      userTotalMismatches: { count: userMismatches.length, sample: userMismatches.slice(0, SAMPLE_SIZE) }
    }
  };
};

module.exports = { buildReport };
