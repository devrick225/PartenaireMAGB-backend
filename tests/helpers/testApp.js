/**
 * Environnement de test : base MongoDB en mémoire, aucun appel externe.
 *
 * - le fichier .env n'est pas chargé (dotenv est neutralisé dans api.test.js) ;
 * - les emails sont capturés dans `emails` au lieu d'être envoyés ;
 * - toute connexion réseau hors de la machine locale est refusée, pour qu'un
 *   oubli de simulation ne puisse jamais joindre un vrai fournisseur de paiement.
 */
const net = require('net');
const crypto = require('crypto');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;
const emails = [];
const sms = [];

const blockExternalNetwork = () => {
  const originalConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function(...args) {
    const options = typeof args[0] === 'object' && !Array.isArray(args[0]) ? args[0] : { port: args[0], host: args[1] };
    const host = options.host || 'localhost';
    if (options.path || ['localhost', '127.0.0.1', '::1'].includes(host)) {
      return originalConnect.apply(this, args);
    }
    throw new Error(`Appel réseau externe interdit pendant les tests: ${host}`);
  };
};

const start = async () => {
  mongod = await MongoMemoryServer.create();

  Object.assign(process.env, {
    NODE_ENV: 'test',
    MONGODB_URI: mongod.getUri(),
    JWT_SECRET: 'test-secret',
    JWT_REFRESH_SECRET: 'test-refresh-secret',
    JWT_EXPIRE: '1h',
    JWT_REFRESH_EXPIRE: '30d',
    FRONTEND_URL: 'https://front.example',
    BACKEND_URL: 'https://api.example',
    GENIUSPAY_WEBHOOK_SECRET: 'whsec_test',
    STRIPE_SECRET_KEY: 'sk_test_dummy',
    STRIPE_WEBHOOK_SECRET: 'whsec_stripe_test',
    RATE_LIMIT_MAX_REQUESTS: '100000'
  });

  blockExternalNetwork();

  const mongoose = require('mongoose');
  const app = require('../../server');
  await mongoose.connect(process.env.MONGODB_URI);

  const User = require('../../models/User');
  const Donation = require('../../models/Donation');
  const Payment = require('../../models/Payment');
  await Promise.all([User.init(), Donation.init(), Payment.init()]);

  const emailService = require('../../services/emailService');
  emailService.sendEmail = async (to, subject) => {
    emails.push({ to, subject });
    return { success: true };
  };

  const smsService = require('../../services/smsService');
  smsService.sendSms = async (to, message) => {
    sms.push({ to, message });
    return { success: true };
  };

  return { app, mongoose, User, Donation, Payment };
};

const stop = async () => {
  await require('mongoose').disconnect();
  if (mongod) await mongod.stop();
};

let phoneCounter = 10000000;

const createUser = (User, email, extra = {}) => User.create({
  firstName: 'Jean',
  lastName: 'Kouassi',
  email,
  phone: `07${phoneCounter++}`,
  password: 'Abcdefg1',
  country: 'CI',
  city: 'Abidjan',
  isEmailVerified: true,
  ...extra
});

const createDonation = (Donation, user, extra = {}) => Donation.create({
  user: user._id,
  amount: 5000,
  currency: 'XOF',
  category: 'don_ponctuel',
  type: 'one_time',
  paymentMethod: 'moneyfusion',
  ...extra
});

const createMoneyFusionPayment = (Payment, user, donation, extra = {}) => Payment.create({
  user: user._id,
  donation: donation._id,
  amount: donation.amount,
  currency: donation.currency,
  paymentMethod: 'moneyfusion',
  provider: 'moneyfusion',
  status: 'processing',
  moneyfusion: { token: `tok_${crypto.randomBytes(4).toString('hex')}`, status: 'pending' },
  ...extra
});

module.exports = {
  start,
  stop,
  emails,
  sms,
  createUser,
  createDonation,
  createMoneyFusionPayment
};
