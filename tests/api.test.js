/**
 * Tests d'intégration de l'API sur une base MongoDB en mémoire.
 * Lancer avec : npm test
 */

// Ne jamais charger le vrai .env pendant les tests (identifiants de production)
jest.mock('dotenv', () => ({ config: () => ({}) }));

const crypto = require('crypto');
const request = require('supertest');
const helpers = require('./helpers/testApp');

let app, User, Donation, Payment;
let moneyFusionService, geniusPayService, paydunyaService, paymentService, completion, recurring, websocketService;

// Réponses simulées des fournisseurs
const providers = {
  moneyFusionConfirmed: true,   // réponse de confirmPaid (validation des webhooks)
  moneyFusionStatut: 'paid',    // statut renvoyé par l'API de vérification ('THROW' = injoignable)
  paydunyaStatus: 'completed',
  paypalOrderStatus: 'COMPLETED'
};

const silence = () => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
};

beforeAll(async () => {
  silence();
  ({ app, User, Donation, Payment } = await helpers.start());

  moneyFusionService = require('../services/moneyFusionService');
  geniusPayService = require('../services/geniusPayService');
  paydunyaService = require('../services/paydunyaService');
  paymentService = require('../services/paymentService');
  completion = require('../services/paymentCompletionService');
  recurring = require('../services/recurringDonationService');
  websocketService = require('../services/websocketService');

  moneyFusionService.retryDelay = 1;
  moneyFusionService.confirmPaid = async () => ({
    confirmed: providers.moneyFusionConfirmed,
    statut: providers.moneyFusionConfirmed ? 'paid' : 'pending',
    data: {}
  });
  require('fusionpay').FusionPay.prototype.checkPaymentStatus = async function(token) {
    if (providers.moneyFusionStatut === 'THROW') throw new Error('network down');
    return {
      statut: true,
      message: 'ok',
      data: { statut: providers.moneyFusionStatut, tokenPay: token, Montant: 5000, numeroTransaction: 'TX1', moyen: 'orange' }
    };
  };
  require('fusionpay').FusionPay.prototype.makePayment = async function() {
    throw new Error('makePayment ne doit pas être appelé dans les tests');
  };

  geniusPayService.webhookSecret = 'whsec_test';
  paydunyaService.checkPaymentStatus = async () => ({ success: true, status: providers.paydunyaStatus });
  paymentService.verifyPayPalWebhook = async () => null;
  paymentService.getPayPalOrder = async (orderId) => ({
    id: orderId,
    status: providers.paypalOrderStatus,
    payer: { payer_id: 'PAYER1' },
    purchase_units: [{ payments: { captures: [{ id: 'CAP1' }] } }]
  });
});

afterAll(async () => {
  await helpers.stop();
});

beforeEach(() => {
  providers.moneyFusionConfirmed = true;
  providers.moneyFusionStatut = 'paid';
  providers.paydunyaStatus = 'completed';
  providers.paypalOrderStatus = 'COMPLETED';
});

let userCounter = 0;
const newUser = (extra = {}) => helpers.createUser(User, `user${++userCounter}@example.com`, extra);
const login = async (email, password = 'Abcdefg1') => {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.data;
};
const as = (token, req) => req.set('Authorization', `Bearer ${token}`);
const moneyFusionWebhook = (payment, event = 'payin.session.completed') => request(app)
  .post('/api/webhooks/moneyfusion')
  .send({ event, tokenPay: payment.moneyfusion.token, Montant: 5000, frais: 100, numeroTransaction: 'TX1' });

// ---------------------------------------------------------------------------
describe('Authentification', () => {
  test('inscription avec un email à extension longue et alias +tag', async () => {
    const res = await request(app).post('/api/auth/register').send({
      firstName: 'Awa', lastName: 'Traore', email: 'awa+don@eglise.church',
      phone: '0700000001', password: 'Abcdefg1', country: 'CI', city: 'Abidjan'
    });
    expect(res.status).toBe(201);
    expect(res.body.data.token).toBeTruthy();
  });

  test('connexion Gmail quelle que soit la forme enregistrée (avec ou sans points)', async () => {
    await helpers.createUser(User, 'john.doe@gmail.com');
    await helpers.createUser(User, 'janedoe@gmail.com');

    const dotted = await request(app).post('/api/auth/login').send({ email: 'John.Doe@gmail.com', password: 'Abcdefg1' });
    const undotted = await request(app).post('/api/auth/login').send({ email: 'jane.doe@gmail.com', password: 'Abcdefg1' });

    expect(dotted.status).toBe(200);
    expect(undotted.status).toBe(200);
  });

  test('/auth/me n\'est pas soumis au limiteur de connexion et ne renvoie rien de sensible', async () => {
    const user = await newUser();
    const { token } = await login(user.email);

    let last;
    for (let i = 0; i < 30; i++) {
      last = await as(token, request(app).get('/api/auth/me'));
      expect(last.status).toBe(200);
    }
    const body = JSON.stringify(last.body);
    expect(body).not.toContain('$2');        // hash bcrypt
    expect(body).not.toContain('sessions');
  });

  test('le code de réinitialisation est invalidé après 5 essais erronés', async () => {
    const user = await newUser();
    await request(app).post('/api/auth/request-password-reset-code').send({ email: user.email });
    const stored = await User.findById(user._id).select('+passwordResetCode');
    const good = stored.passwordResetCode;
    expect(good).toMatch(/^\d{6}$/);

    const wrong = good === '111111' ? '222222' : '111111';
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth/reset-password-with-code').send({ email: user.email, code: wrong, newPassword: 'Nouveau123' });
    }
    const res = await request(app).post('/api/auth/reset-password-with-code').send({ email: user.email, code: good, newPassword: 'Nouveau123' });
    expect(res.status).toBe(400);

    const unknown = await request(app).post('/api/auth/reset-password-with-code').send({ email: 'personne@example.com', code: '123456', newPassword: 'Nouveau123' });
    expect(unknown.status).toBe(400);
  });

  test('le lien de réinitialisation est stocké haché et fonctionne', async () => {
    const user = await newUser();
    const emailService = require('../services/emailService');
    let sentToken;
    const original = emailService.sendPasswordResetEmail;
    emailService.sendPasswordResetEmail = async (email, firstName, token) => { sentToken = token; };

    await request(app).post('/api/auth/forgot-password').send({ email: user.email });
    emailService.sendPasswordResetEmail = original;

    const stored = await User.findById(user._id).select('+passwordResetToken');
    expect(sentToken).toBeTruthy();
    expect(stored.passwordResetToken).not.toBe(sentToken);

    const res = await request(app).post(`/api/auth/reset-password/${sentToken}`).send({ password: 'Nouveau123' });
    expect(res.status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email: user.email, password: 'Nouveau123' })).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
describe('Sessions', () => {
  test('la déconnexion invalide l\'access token et le refresh token', async () => {
    const user = await newUser();
    const { token, refreshToken } = await login(user.email);

    expect((await as(token, request(app).get('/api/auth/me'))).status).toBe(200);
    expect((await as(token, request(app).post('/api/auth/logout'))).status).toBe(200);

    expect((await as(token, request(app).get('/api/auth/me'))).status).toBe(401);
    expect((await request(app).post('/api/auth/refresh').send({ refreshToken })).status).toBe(401);
  });

  test('rotation du refresh token : un ancien token rejoué ferme la session', async () => {
    const user = await newUser();
    const first = await login(user.email);

    const rotated = await request(app).post('/api/auth/refresh').send({ refreshToken: first.refreshToken });
    expect(rotated.status).toBe(200);
    expect(rotated.body.data.refreshToken).not.toBe(first.refreshToken);

    // Requête concurrente de la même application : tolérée pendant le délai de grâce
    const concurrent = await request(app).post('/api/auth/refresh').send({ refreshToken: first.refreshToken });
    expect(concurrent.status).toBe(200);

    // Passé ce délai, rejouer l'ancien token est traité comme un vol
    await User.updateOne({ _id: user._id }, { $set: { 'sessions.$[].rotatedAt': new Date(Date.now() - 5 * 60 * 1000) } });
    const replay = await request(app).post('/api/auth/refresh').send({ refreshToken: first.refreshToken });
    expect(replay.status).toBe(401);
    expect((await as(rotated.body.data.token, request(app).get('/api/auth/me'))).status).toBe(401);
  });

  test('changer de mot de passe déconnecte les autres appareils', async () => {
    const user = await newUser();
    const phone = await login(user.email);
    const laptop = await login(user.email);

    const res = await as(laptop.token, request(app).put('/api/auth/change-password'))
      .send({ currentPassword: 'Abcdefg1', newPassword: 'Nouveau123' });
    expect(res.status).toBe(200);

    expect((await as(phone.token, request(app).get('/api/auth/me'))).status).toBe(401);
    expect((await as(res.body.data.token, request(app).get('/api/auth/me'))).status).toBe(200);
  });

  test('les tokens émis avant la mise en place des sessions restent acceptés', async () => {
    const user = await newUser();
    const legacyToken = user.generateAuthToken();
    const legacyRefresh = user.generateRefreshToken();

    expect((await as(legacyToken, request(app).get('/api/auth/me'))).status).toBe(200);
    const refreshed = await request(app).post('/api/auth/refresh').send({ refreshToken: legacyRefresh });
    expect(refreshed.status).toBe(200);
    expect((await as(refreshed.body.data.token, request(app).get('/api/auth/me'))).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
describe('Création de dons', () => {
  let token;
  beforeAll(async () => {
    token = (await newUser()).generateAuthToken();
  });

  test('montant inférieur au minimum : 400', async () => {
    const res = await as(token, request(app).post('/api/donations'))
      .send({ amount: 150, currency: 'XOF', category: 'don_ponctuel', type: 'one_time', paymentMethod: 'moneyfusion' });
    expect(res.status).toBe(400);
  });

  test('le minimum dépend de la devise : 50 USD est accepté', async () => {
    const res = await as(token, request(app).post('/api/donations'))
      .send({ amount: 50, currency: 'USD', category: 'don_ponctuel', type: 'one_time', paymentMethod: 'card' });
    expect(res.status).toBe(201);
  });

  test('don récurrent mensuel sans jour précisé : accepté', async () => {
    const res = await as(token, request(app).post('/api/donations')).send({
      amount: 5000, currency: 'XOF', category: 'don_mensuel', type: 'recurring', paymentMethod: 'moneyfusion',
      recurring: { frequency: 'monthly', startDate: new Date().toISOString() }
    });
    expect(res.status).toBe(201);
    expect(res.body.data.donation.recurring.nextPaymentDate).toBeTruthy();
  });

  test('une échéance du 31 est ramenée à la fin du mois', () => {
    const donation = new Donation({
      user: new (require('mongoose').Types.ObjectId)(), amount: 500, category: 'don_mensuel',
      type: 'recurring', paymentMethod: 'card',
      recurring: { frequency: 'monthly', dayOfMonth: 31, startDate: new Date('2030-01-31T10:00:00Z'), nextPaymentDate: new Date('2030-02-10T10:00:00Z') }
    });
    expect(donation.calculateNextPaymentDate().getUTCMonth()).toBe(1); // février
  });
});

// ---------------------------------------------------------------------------
describe('Finalisation des paiements (MoneyFusion)', () => {
  let donor, token, donation, payment;

  beforeAll(async () => {
    donor = await newUser();
    token = donor.generateAuthToken();
    donation = await helpers.createDonation(Donation, donor);
    payment = await helpers.createMoneyFusionPayment(Payment, donor, donation);
  });

  const donorEmails = () => helpers.emails.filter(e => e.to === donor.email).length;

  test('un webhook "completed" non confirmé par MoneyFusion est ignoré', async () => {
    providers.moneyFusionConfirmed = false;
    const res = await moneyFusionWebhook(payment);
    expect(res.status).toBe(200);
    expect((await Payment.findById(payment._id)).status).toBe('processing');
  });

  test('un webhook confirmé complète le paiement, le don et les statistiques', async () => {
    await moneyFusionWebhook(payment);

    const p = await Payment.findById(payment._id);
    const d = await Donation.findById(donation._id);
    const u = await User.findById(donor._id);

    expect(p.status).toBe('completed');
    expect(p.moneyfusion.status).toBe('paid');
    expect(p.moneyfusion.token).toBe(payment.moneyfusion.token);
    expect(d.status).toBe('completed');
    expect(String(d.payment)).toBe(String(p._id));
    expect([u.totalDonations, u.donationCount]).toEqual([5000, 1]);
    expect(donorEmails()).toBe(1);
  });

  test('rejouer le webhook et vérifier plusieurs fois ne recompte pas le don', async () => {
    await moneyFusionWebhook(payment);
    const verify = await as(token, request(app).post(`/api/payments/${payment._id}/verify`));
    await as(token, request(app).post(`/api/payments/${payment._id}/verify`));

    const u = await User.findById(donor._id);
    expect([u.totalDonations, u.donationCount]).toEqual([5000, 1]);
    expect(donorEmails()).toBe(1);
    // Le client reçoit toujours la structure brute de MoneyFusion
    expect(verify.body.statut).toBe(true);
    expect(verify.body.data.statut).toBe('paid');
  });

  test('l\'échec tardif d\'un ancien paiement ne rétrograde pas un don payé', async () => {
    const abandoned = await helpers.createMoneyFusionPayment(Payment, donor, donation);
    providers.moneyFusionStatut = 'no paid';
    await as(token, request(app).post(`/api/payments/${abandoned._id}/verify`));
    await moneyFusionWebhook(payment, 'payin.session.cancelled');

    expect((await Payment.findById(abandoned._id)).status).toBe('failed');
    expect((await Payment.findById(payment._id)).status).toBe('completed');
    expect((await Donation.findById(donation._id)).status).toBe('completed');
  });

  test('fournisseur injoignable : le paiement reste en attente', async () => {
    const d = await helpers.createDonation(Donation, donor);
    const p = await helpers.createMoneyFusionPayment(Payment, donor, d);
    providers.moneyFusionStatut = 'THROW';
    await as(token, request(app).post(`/api/payments/${p._id}/verify`));
    expect((await Payment.findById(p._id)).status).toBe('processing');
  });

  test('confirmations simultanées : une seule est comptée', async () => {
    const user = await newUser();
    const d = await helpers.createDonation(Donation, user);
    const p = await helpers.createMoneyFusionPayment(Payment, user, d);

    const results = await Promise.all([1, 2, 3, 4, 5].map(async () =>
      completion.completePayment(await Payment.findById(p._id).populate('user donation'), { source: 'test' })
    ));

    const u = await User.findById(user._id);
    expect(results.filter(r => !r.alreadyCompleted)).toHaveLength(1);
    expect([u.totalDonations, u.donationCount]).toEqual([5000, 1]);
  });

  test('les statistiques résistent à un document utilisateur chargé partiellement', async () => {
    const user = await newUser();
    await user.updateDonationStats(400000);
    const partial = await User.findById(user._id).select('firstName lastName email');
    await partial.updateDonationStats(1000);

    const u = await User.findById(user._id);
    expect([u.totalDonations, u.donationCount]).toEqual([401000, 2]);
    expect(u.partnerLevel).toBe('bronze');
  });

  test('un don en euros est compté en XOF', async () => {
    const user = await newUser();
    const d = await helpers.createDonation(Donation, user, { amount: 200, currency: 'EUR' });
    const p = await helpers.createMoneyFusionPayment(Payment, user, d);
    await completion.completePayment(await Payment.findById(p._id).populate('user donation'), { source: 'test' });

    expect((await User.findById(user._id)).totalDonations).toBe(Math.round(200 * 655.957));
  });

  test('cron : expire les paiements abandonnés et complète une seule fois les paiements payés', async () => {
    const user = await newUser();
    const oldDonation = await helpers.createDonation(Donation, user);
    const oldPayment = await helpers.createMoneyFusionPayment(Payment, user, oldDonation);
    await Payment.collection.updateOne({ _id: oldPayment._id }, { $set: { createdAt: new Date(Date.now() - 30 * 3600 * 1000) } });

    providers.moneyFusionStatut = 'pending';
    await moneyFusionService.checkPendingPayments(2);
    expect((await Payment.findById(oldPayment._id)).status).toBe('expired');
    expect((await Donation.findById(oldDonation._id)).status).toBe('failed');

    const paidDonation = await helpers.createDonation(Donation, user);
    const paidPayment = await helpers.createMoneyFusionPayment(Payment, user, paidDonation);
    await Payment.collection.updateOne({ _id: paidPayment._id }, { $set: { createdAt: new Date(Date.now() - 3 * 3600 * 1000) } });

    providers.moneyFusionStatut = 'paid';
    await moneyFusionService.checkPendingPayments(2);
    expect((await Payment.findById(paidPayment._id)).status).toBe('completed');
    expect((await User.findById(user._id)).donationCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
describe('Webhooks des autres fournisseurs', () => {
  let donor;
  beforeAll(async () => { donor = await newUser(); });

  test('GeniusPay : signature vérifiée sur le body brut', async () => {
    const donation = await helpers.createDonation(Donation, donor, { paymentMethod: 'geniuspay' });
    const payment = await Payment.create({
      user: donor._id, donation: donation._id, amount: 5000, currency: 'XOF', paymentMethod: 'geniuspay',
      provider: 'geniuspay', status: 'processing', geniuspay: { reference: 'GP-REF-1', status: 'pending' }
    });
    const body = JSON.stringify({ id: 'evt_1', event: 'payment.success', data: { reference: 'GP-REF-1', amount: 5000, currency: 'XOF', fees: 150, net_amount: 4850, status: 'completed' } });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = crypto.createHmac('sha256', 'whsec_test').update(`${timestamp}.${body}`).digest('hex');
    const post = (sig) => request(app).post('/api/webhooks/geniuspay')
      .set('Content-Type', 'application/json').set('X-Webhook-Signature', sig).set('X-Webhook-Timestamp', timestamp).send(body);

    expect((await post('ab'.repeat(32))).status).toBe(401);
    expect((await Payment.findById(payment._id)).status).toBe('processing');

    expect((await post(signature)).status).toBe(200);
    expect((await Payment.findById(payment._id)).status).toBe('completed');
  });

  test('PayDunya : confirmation auprès de l\'API, formats JSON et formulaire', async () => {
    const donation = await helpers.createDonation(Donation, donor, { paymentMethod: 'paydunya' });
    const payment = await Payment.create({
      user: donor._id, donation: donation._id, amount: 5000, currency: 'XOF', paymentMethod: 'orange-money-ci',
      provider: 'paydunya', status: 'processing', paydunya: { token: 'pd_tok_1', transactionId: 'PDTX1' }
    });

    const intermediate = await request(app).post('/api/webhooks/paydunya').send({ token: 'pd_tok_1', response_code: '42', response_text: 'en cours' });
    expect(intermediate.status).toBe(200);

    providers.paydunyaStatus = 'pending';
    await request(app).post('/api/webhooks/paydunya').send({ token: 'pd_tok_1', response_code: '00' });
    expect((await Payment.findById(payment._id)).status).toBe('processing');

    providers.paydunyaStatus = 'completed';
    const form = await request(app).post('/api/webhooks/paydunya').type('form').send('data[token]=pd_tok_1&data[response_code]=00');
    expect(form.status).toBe(200);
    expect((await Payment.findById(payment._id)).status).toBe('completed');
    expect((await Donation.findById(donation._id)).status).toBe('completed');
  });

  test('Stripe : payment_intent.succeeded complète le paiement, signature obligatoire', async () => {
    const donation = await helpers.createDonation(Donation, donor, { paymentMethod: 'card' });
    const payment = await Payment.create({
      user: donor._id, donation: donation._id, amount: 5000, currency: 'XOF', paymentMethod: 'card',
      provider: 'stripe', status: 'processing', stripe: { paymentIntentId: 'pi_test_1' }
    });
    const body = JSON.stringify({
      id: 'evt_stripe_1', object: 'event', type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_test_1', object: 'payment_intent', status: 'succeeded', latest_charge: 'ch_1', payment_method: 'pm_1' } }
    });
    const stripe = require('stripe')('sk_test_dummy');
    const header = stripe.webhooks.generateTestHeaderString({ payload: body, secret: 'whsec_stripe_test' });
    const post = (sig) => request(app).post('/api/webhooks/stripe').set('Content-Type', 'application/json').set('Stripe-Signature', sig).send(body);

    expect((await post('t=1,v1=deadbeef')).status).toBe(400);
    expect((await Payment.findById(payment._id)).status).toBe('processing');

    expect((await post(header)).status).toBe(200);
    const p = await Payment.findById(payment._id);
    expect(p.status).toBe('completed');
    expect(p.stripe.chargeId).toBe('ch_1');
    expect((await Donation.findById(donation._id)).status).toBe('completed');
  });

  test('PayPal : la commande est relue chez PayPal avant validation', async () => {
    const donation = await helpers.createDonation(Donation, donor, { paymentMethod: 'paypal' });
    const payment = await Payment.create({
      user: donor._id, donation: donation._id, amount: 5000, currency: 'XOF', paymentMethod: 'paypal',
      provider: 'paypal', status: 'processing', paypal: { orderId: 'ORDER1' }
    });
    const event = {
      id: 'WH-1', event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: { id: 'CAP1', status: 'COMPLETED', supplementary_data: { related_ids: { order_id: 'ORDER1' } } }
    };

    providers.paypalOrderStatus = 'CREATED';
    await request(app).post('/api/webhooks/paypal').send(event);
    expect((await Payment.findById(payment._id)).status).toBe('processing');

    providers.paypalOrderStatus = 'COMPLETED';
    const res = await request(app).post('/api/webhooks/paypal').send(event);
    expect(res.status).toBe(200);
    const p = await Payment.findById(payment._id);
    expect(p.status).toBe('completed');
    expect(p.paypal.captureId).toBe('CAP1');
  });
});

// ---------------------------------------------------------------------------
describe('Dons récurrents', () => {
  test('une échéance due crée un don à régler, prévient le donateur et n\'est créée qu\'une fois', async () => {
    const user = await newUser({ smsNotifications: { donations: false, reminders: true } });
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
    const parent = await helpers.createDonation(Donation, user, {
      type: 'recurring', category: 'don_mensuel', status: 'completed',
      recurring: { frequency: 'monthly', dayOfMonth: yesterday.getDate(), startDate: yesterday, nextPaymentDate: yesterday, isActive: true }
    });
    const emailsBefore = helpers.emails.filter(e => e.to === user.email).length;

    const first = await recurring.processDueRecurringDonations();
    const second = await recurring.processDueRecurringDonations();

    const occurrences = await Donation.find({ recurringParent: parent._id });
    const refreshed = await Donation.findById(parent._id);

    expect(first.created).toBe(1);
    expect(second.created).toBe(0);
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].status).toBe('pending');
    expect(occurrences[0].type).toBe('one_time');
    expect(occurrences[0].occurrenceNumber).toBe(1);
    expect(refreshed.recurring.nextPaymentDate.getTime()).toBeGreaterThan(Date.now());
    expect(refreshed.recurring.totalExecutions).toBe(1);
    expect(helpers.emails.filter(e => e.to === user.email).length).toBe(emailsBefore + 1);

    // Payer l'échéance la compte dans les statistiques
    const payment = await helpers.createMoneyFusionPayment(Payment, user, occurrences[0]);
    await completion.completePayment(await Payment.findById(payment._id).populate('user donation'), { source: 'test' });
    expect((await User.findById(user._id)).donationCount).toBe(1);
  });

  test('l\'abonnement s\'arrête au nombre maximal d\'échéances', async () => {
    const user = await newUser();
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
    const parent = await helpers.createDonation(Donation, user, {
      type: 'recurring', category: 'don_mensuel', status: 'completed',
      recurring: { frequency: 'daily', startDate: yesterday, nextPaymentDate: yesterday, isActive: true, maxOccurrences: 1 }
    });

    await recurring.processDueRecurringDonations();

    expect((await Donation.findById(parent._id)).recurring.isActive).toBe(false);
    expect(await Donation.countDocuments({ recurringParent: parent._id })).toBe(1);
  });

  test('un abonnement jamais payé ne génère pas d\'échéance', async () => {
    const user = await newUser();
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
    const parent = await helpers.createDonation(Donation, user, {
      type: 'recurring', category: 'don_mensuel', status: 'pending',
      recurring: { frequency: 'daily', startDate: yesterday, nextPaymentDate: yesterday, isActive: true }
    });

    await recurring.processDueRecurringDonations();
    expect(await Donation.countDocuments({ recurringParent: parent._id })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('Accès et garde-fous', () => {
  let owner, ownerToken, other, otherToken, donation, payment;

  beforeAll(async () => {
    owner = await newUser();
    other = await newUser();
    ownerToken = owner.generateAuthToken();
    otherToken = other.generateAuthToken();
    donation = await helpers.createDonation(Donation, owner);
    payment = await helpers.createMoneyFusionPayment(Payment, owner, donation);
    await completion.completePayment(await Payment.findById(payment._id).populate('user donation'), { source: 'test' });
  });

  test('les statistiques personnelles ne sont plus à zéro', async () => {
    const payments = await as(ownerToken, request(app).get('/api/payments/stats?period=year'));
    const donations = await as(ownerToken, request(app).get(`/api/users/${owner._id}/donations`));

    expect(payments.body.data.stats.totalTransactions).toBeGreaterThan(0);
    expect(donations.body.data.stats.totalCount).toBeGreaterThan(0);
  });

  test('le paiement d\'un autre utilisateur n\'est pas lisible', async () => {
    expect((await as(otherToken, request(app).get(`/api/payments/donation/${donation._id}`))).status).toBe(403);
    expect((await as(ownerToken, request(app).get(`/api/payments/donation/${donation._id}`))).status).toBe(200);
  });

  test('un don déjà payé ne peut pas être repayé ni son paiement réinitialisé', async () => {
    const again = await as(ownerToken, request(app).post('/api/payments/initialize'))
      .send({ donationId: String(donation._id), provider: 'moneyfusion', paymentMethod: 'moneyfusion' });
    expect(again.status).toBe(409);

    const pending = await helpers.createDonation(Donation, owner);
    const reuse = await as(ownerToken, request(app).post('/api/payments/initialize'))
      .send({ donationId: String(pending._id), provider: 'moneyfusion', paymentMethod: 'moneyfusion', existingPaymentId: String(payment._id) });
    expect([400, 409]).toContain(reuse.status);
    expect((await Payment.findById(payment._id)).status).toBe('completed');
  });

  test('le classement masque les noms et ignore les dons anonymes', async () => {
    const anonymous = await newUser({ lastName: 'Secret' });
    const d = await helpers.createDonation(Donation, anonymous, { amount: 900000, isAnonymous: true, status: 'completed' });
    expect(d.isAnonymous).toBe(true);

    const res = await as(ownerToken, request(app).get('/api/users/leaderboard?period=all&limit=50'));
    expect(res.status).toBe(200);

    const entries = res.body.data.leaderboard;
    expect(entries.some(e => String(e._id) === String(anonymous._id))).toBe(false);
    const mine = entries.find(e => String(e._id) === String(owner._id));
    expect(mine.lastName).toBe('K.');
    expect(JSON.stringify(entries)).not.toContain('Kouassi');
  });

  test('un utilisateur ne peut pas s\'abonner au canal WebSocket du paiement d\'un autre', async () => {
    const socket = (user) => ({ userId: String(user._id), user });
    const channel = `payment:${payment._id}`;

    expect(await websocketService.checkChannelPermissions(socket(owner), channel, {})).toBe(true);
    expect(await websocketService.checkChannelPermissions(socket(other), channel, {})).toBe(false);
    expect(await websocketService.checkChannelPermissions(socket(owner), `payment:${payment.moneyfusion.token}`, {})).toBe(true);
  });

  test('la mise à jour du profil ignore les champs réservés', async () => {
    const res = await as(ownerToken, request(app).put('/api/users/profile'))
      .send({ occupation: 'Enseignant', notes: [{ content: 'injecté' }], isComplete: true });
    expect(res.status).toBe(200);

    const Profile = require('../models/Profile');
    const profile = await Profile.findOne({ user: owner._id });
    expect(profile.occupation).toBe('Enseignant');
    expect(profile.notes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe('Remboursements', () => {
  let treasurerToken;

  const paidDonation = async (extra = {}) => {
    const user = await newUser();
    const donation = await helpers.createDonation(Donation, user, extra);
    const payment = await helpers.createMoneyFusionPayment(Payment, user, donation);
    await completion.completePayment(await Payment.findById(payment._id).populate('user donation'), { source: 'test' });
    return { user, donation, payment };
  };
  const refund = (payment, body) => as(treasurerToken, request(app).post(`/api/payments/${payment._id}/refund`)).send(body);

  beforeAll(async () => {
    treasurerToken = (await newUser({ role: 'treasurer' })).generateAuthToken();
  });

  test('remboursement total : le don passe à « remboursé » et sort des statistiques', async () => {
    const { user, donation, payment } = await paidDonation();
    expect((await User.findById(user._id)).totalDonations).toBe(5000);

    const res = await refund(payment, { reason: 'Erreur de montant', manual: true, reference: 'OM-123' });
    expect(res.status).toBe(200);
    expect(res.body.data.paymentStatus).toBe('refunded');

    const u = await User.findById(user._id);
    expect((await Payment.findById(payment._id)).status).toBe('refunded');
    expect((await Donation.findById(donation._id)).status).toBe('refunded');
    expect([u.totalDonations, u.donationCount]).toEqual([0, 0]);
  });

  test('remboursement partiel : le montant net reste compté, puis le solde est remboursable', async () => {
    const { user, donation, payment } = await paidDonation();

    const partial = await refund(payment, { amount: 2000, reason: 'Geste commercial', manual: true });
    expect(partial.status).toBe(200);
    expect(partial.body.data.paymentStatus).toBe('partially_refunded');

    let u = await User.findById(user._id);
    let d = await Donation.findById(donation._id);
    expect([u.totalDonations, u.donationCount]).toEqual([3000, 1]);
    expect([d.status, d.refundedAmount]).toEqual(['completed', 2000]);

    // Les statistiques calculées par agrégation comptent aussi le montant net
    const stats = await as(user.generateAuthToken(), request(app).get('/api/donations/stats'));
    expect(stats.body.data.stats.totalAmount).toBe(3000);

    const tooMuch = await refund(payment, { amount: 4000, reason: 'Trop élevé', manual: true });
    expect(tooMuch.status).toBe(400);

    const rest = await refund(payment, { reason: 'Solde restant', manual: true });
    expect(rest.status).toBe(200);
    u = await User.findById(user._id);
    d = await Donation.findById(donation._id);
    expect([u.totalDonations, u.donationCount]).toEqual([0, 0]);
    expect(d.status).toBe('refunded');
    expect((await Payment.findById(payment._id)).status).toBe('refunded');
  });

  test('fournisseur sans remboursement automatique : rien n\'est modifié', async () => {
    const { user, payment } = await paidDonation();

    const res = await refund(payment, { reason: 'Demande du donateur' });
    expect(res.status).toBe(400);

    const p = await Payment.findById(payment._id);
    expect(p.status).toBe('completed');
    expect(p.refund.amount).toBe(0);
    expect((await User.findById(user._id)).totalDonations).toBe(5000);
  });

  test('deux remboursements simultanés ne dépassent pas le montant payé', async () => {
    const { user, payment } = await paidDonation();

    const results = await Promise.all([
      refund(payment, { amount: 3000, reason: 'Double clic', manual: true }),
      refund(payment, { amount: 3000, reason: 'Double clic', manual: true })
    ]);

    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    expect((await Payment.findById(payment._id)).refund.amount).toBe(3000);
    expect((await User.findById(user._id)).totalDonations).toBe(2000);
  });

  test('un utilisateur simple ne peut pas rembourser', async () => {
    const { user, payment } = await paidDonation();
    const res = await as(user.generateAuthToken(), request(app).post(`/api/payments/${payment._id}/refund`))
      .send({ reason: 'Je veux mon argent', manual: true });
    expect(res.status).toBe(403);
  });

  test('le montant remboursé chez Stripe / PayPal suit la conversion de l\'encaissement', () => {
    expect(paymentService.toStripeAmount(6550, 'XOF')).toBe(1000);   // 10,00 EUR en centimes
    expect(paymentService.toStripeAmount(10, 'EUR')).toBe(1000);
    expect(paymentService.toPayPalAmount(6000, 'XOF')).toEqual({ value: '10.00', currency_code: 'USD' });
    expect(paymentService.toPayPalAmount(10, 'USD')).toEqual({ value: '10.00', currency_code: 'USD' });
  });
});

// ---------------------------------------------------------------------------
describe('Modifications d\'un don par un administrateur', () => {
  let adminToken;

  beforeAll(async () => {
    adminToken = (await newUser({ role: 'admin' })).generateAuthToken();
  });

  test('valider un don à la main : compté en XOF, reçu envoyé, une seule fois', async () => {
    const user = await newUser();
    const donation = await helpers.createDonation(Donation, user, { amount: 100, currency: 'EUR', paymentMethod: 'cash' });
    const emailsBefore = helpers.emails.filter(e => e.to === user.email).length;
    const setStatus = (status) => as(adminToken, request(app).patch(`/api/donations/${donation._id}/status`)).send({ status });

    expect((await setStatus('completed')).status).toBe(200);
    await setStatus('completed');

    const u = await User.findById(user._id);
    expect([u.totalDonations, u.donationCount]).toEqual([Math.round(100 * 655.957), 1]);
    expect(helpers.emails.filter(e => e.to === user.email).length).toBe(emailsBefore + 1);

    // Revenir en arrière retire le don des statistiques
    expect((await setStatus('cancelled')).status).toBe(200);
    const after = await User.findById(user._id);
    expect([after.totalDonations, after.donationCount]).toEqual([0, 0]);
  });

  test('corriger le montant d\'un don complété ajuste le total du donateur', async () => {
    const user = await newUser();
    const donation = await helpers.createDonation(Donation, user);
    const payment = await helpers.createMoneyFusionPayment(Payment, user, donation);
    await completion.completePayment(await Payment.findById(payment._id).populate('user donation'), { source: 'test' });

    const res = await as(adminToken, request(app).put(`/api/donations/${donation._id}`)).send({ amount: 8000 });
    expect(res.status).toBe(200);

    const u = await User.findById(user._id);
    expect([u.totalDonations, u.donationCount]).toEqual([8000, 1]);

    const invalid = await as(adminToken, request(app).put(`/api/donations/${donation._id}`)).send({ amount: 50 });
    expect(invalid.status).toBe(400);
    expect((await User.findById(user._id)).totalDonations).toBe(8000);
  });

  test('franchir un seuil par correction met à jour le niveau de partenaire', async () => {
    const user = await newUser();
    const donation = await helpers.createDonation(Donation, user, { amount: 200000, status: 'pending' });

    await as(adminToken, request(app).patch(`/api/donations/${donation._id}/status`)).send({ status: 'completed' });
    expect((await User.findById(user._id)).partnerLevel).toBe('classique');

    await as(adminToken, request(app).put(`/api/donations/${donation._id}`)).send({ amount: 400000 });
    expect((await User.findById(user._id)).partnerLevel).toBe('bronze');

    await as(adminToken, request(app).put(`/api/donations/${donation._id}`)).send({ status: 'cancelled' });
    expect((await User.findById(user._id)).partnerLevel).toBe('classique');
  });
});

// ---------------------------------------------------------------------------
describe('Callback mobile et erreurs', () => {
  test('le deep link est limité aux schémas de l\'application', async () => {
    const evil = await request(app).get('/api/payments/mobile-callback')
      .query({ donationId: 'abc', statut: 'paid', deepLink: 'javascript:alert(document.cookie)//' });
    expect(evil.text).not.toContain('javascript:alert');

    const injected = await request(app).get('/api/payments/mobile-callback')
      .query({ donationId: "x';alert(1);//</script><script>alert(2)</script>", statut: 'paid' });
    expect(injected.text).not.toContain("';alert(1)");
    expect(injected.text).not.toContain('<script>alert(2)');

    const expo = await request(app).get('/api/payments/mobile-callback')
      .query({ donationId: 'abc', statut: 'paid', token: 'tok9', deepLink: 'exp://192.168.1.10:8081/--/payment/return?donationId=abc' });
    expect(expo.text).toContain('exp://192.168.1.10:8081/--/payment/return?donationId=abc\\u0026status=completed\\u0026transactionId=tok9');
  });

  test('JSON invalide : 400 ; origine CORS refusée : 403', async () => {
    const badJson = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{bad json');
    const badOrigin = await request(app).get('/api/payments').set('Origin', 'https://evil.example');

    expect(badJson.status).toBe(400);
    expect(badOrigin.status).toBe(403);
  });
});
