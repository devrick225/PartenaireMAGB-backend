/**
 * Conversion des montants vers le franc CFA (XOF), devise de référence des
 * statistiques : additionner des XOF, des EUR et des USD sans conversion
 * donnait des totaux et des niveaux de partenaire faux.
 *
 * - EUR : parité fixe du franc CFA (1 EUR = 655,957 XOF).
 * - USD : taux indicatif, ajustable avec la variable d'environnement USD_TO_XOF_RATE.
 */
const RATES_TO_XOF = {
  XOF: 1,
  EUR: 655.957,
  USD: Number(process.env.USD_TO_XOF_RATE) > 0 ? Number(process.env.USD_TO_XOF_RATE) : 600
};

const toXOF = (amount, currency = 'XOF') => {
  const value = Number(amount);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * (RATES_TO_XOF[currency] || 1));
};

/**
 * Expression d'agrégation MongoDB donnant le montant d'un document en XOF,
 * net des remboursements partiels (champ `refundedAmount` des dons).
 * Usage : { $sum: amountInXofExpr() }
 */
const amountInXofExpr = (amountField = '$amount', currencyField = '$currency') => ({
  $multiply: [
    { $max: [0, { $subtract: [amountField, { $ifNull: ['$refundedAmount', 0] }] }] },
    {
      $switch: {
        branches: Object.entries(RATES_TO_XOF)
          .filter(([currency]) => currency !== 'XOF')
          .map(([currency, rate]) => ({ case: { $eq: [currencyField, currency] }, then: rate })),
        default: 1
      }
    }
  ]
});

module.exports = {
  RATES_TO_XOF,
  toXOF,
  amountInXofExpr
};
