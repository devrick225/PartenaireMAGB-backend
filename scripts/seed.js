const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Import des modèles
const User = require('../models/User');
const Ministry = require('../models/Ministry');
const Donation = require('../models/Donation');
const Payment = require('../models/Payment');

console.log('🌱 Démarrage du script de seed...');

// Connexion à la base de données
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/partenaire-magb');
    console.log(`✅ MongoDB connecté: ${conn.connection.host}`);
  } catch (error) {
    console.error('❌ Erreur de connexion MongoDB:', error);
    process.exit(1);
  }
};

// Fonction pour nettoyer la base de données
const cleanDatabase = async () => {
  try {
    console.log('🧹 Nettoyage de la base de données...');
    
    // Supprimer toutes les collections
    await User.deleteMany({});
    await Ministry.deleteMany({});
    await Donation.deleteMany({});
    await Payment.deleteMany({});
    
    console.log('✅ Base de données nettoyée');
  } catch (error) {
    console.error('❌ Erreur lors du nettoyage:', error);
    throw error;
  }
};

// Fonction pour générer un ID partenaire unique
const generatePartnerId = async () => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let partnerId;
  let isUnique = false;
  let attempts = 0;
  const maxAttempts = 10;

  while (!isUnique && attempts < maxAttempts) {
    // Générer un ID de 10 caractères : 2 lettres + 8 chiffres/lettres
    let id = '';
    
    // Les 2 premiers caractères sont des lettres (pour faciliter la lecture)
    for (let i = 0; i < 2; i++) {
      id += characters.charAt(Math.floor(Math.random() * 26)); // Lettres seulement (A-Z)
    }
    
    // Les 8 caractères suivants sont alphanumériques
    for (let i = 0; i < 8; i++) {
      id += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    
    partnerId = id;
    
    // Vérifier l'unicité
    const existingUser = await User.findOne({ partnerId });
    if (!existingUser) {
      isUnique = true;
    }
    
    attempts++;
  }
  
  if (!isUnique) {
    throw new Error('Impossible de générer un ID partenaire unique après plusieurs tentatives');
  }
  
  return partnerId;
};

// Créer les utilisateurs par défaut
const createUsers = async () => {
  try {
    console.log('👥 Création des utilisateurs...');
    
    const usersData = [
      {
        firstName: 'Administrateur',
        lastName: 'Système',
        email: 'admin@partenairemagb.com',
        phone: '+225070000001',
        password: 'Admin123456!',
        role: 'admin',
        country: 'Côte d\'Ivoire',
        city: 'Abidjan',
        isEmailVerified: true,
        isPhoneVerified: true,
        language: 'fr',
        currency: 'XOF',
        timezone: 'Africa/Abidjan'
      },
      {
        firstName: 'Trésorier',
        lastName: 'Principal',
        email: 'tresorier@partenairemagb.com',
        phone: '+225070000002',
        password: 'Tresorier123!',
        role: 'treasurer',
        country: 'Côte d\'Ivoire',
        city: 'Abidjan',
        isEmailVerified: true,
        isPhoneVerified: true,
        language: 'fr',
        currency: 'XOF'
      },
      {
        firstName: 'Support',
        lastName: 'Agent',
        email: 'support@partenairemagb.com',
        phone: '+225070000003',
        password: 'Support123!',
        role: 'support_agent',
        country: 'Côte d\'Ivoire',
        city: 'Abidjan',
        isEmailVerified: true,
        isPhoneVerified: true,
        language: 'fr',
        currency: 'XOF'
      },
      {
        firstName: 'Jean',
        lastName: 'Kouassi',
        email: 'jean.kouassi@example.com',
        phone: '+225070000004',
        password: 'User123456!',
        role: 'user',
        country: 'Côte d\'Ivoire',
        city: 'Abidjan',
        isEmailVerified: true,
        isPhoneVerified: true,
        language: 'fr',
        currency: 'XOF',
        totalDonations: 150000,
        donationCount: 5,
        points: 150,
        level: 1,
        partnerLevel: 'classique'
      },
      {
        firstName: 'Marie',
        lastName: 'Kouadio',
        email: 'marie.kouadio@example.com',
        phone: '+225070000005',
        password: 'User123456!',
        role: 'user',
        country: 'Côte d\'Ivoire',
        city: 'Yamoussoukro',
        isEmailVerified: true,
        isPhoneVerified: true,
        language: 'fr',
        currency: 'XOF',
        totalDonations: 500000,
        donationCount: 8,
        points: 500,
        level: 1,
        partnerLevel: 'bronze'
      },
      {
        firstName: 'Paul',
        lastName: 'Brou',
        email: 'paul.brou@example.com',
        phone: '+225070000006',
        password: 'User123456!',
        role: 'user',
        country: 'Côte d\'Ivoire',
        city: 'Bouaké',
        isEmailVerified: true,
        isPhoneVerified: true,
        language: 'fr',
        currency: 'XOF',
        totalDonations: 1500000,
        donationCount: 12,
        points: 1500,
        level: 2,
        partnerLevel: 'argent'
      }
    ];

    const createdUsers = [];
    for (const userData of usersData) {
      try {
        // Générer un partnerId unique pour chaque utilisateur
        const partnerId = await generatePartnerId();
        userData.partnerId = partnerId;
        
        console.log(`🔄 Création utilisateur: ${userData.email} avec partnerId: ${partnerId}`);
        
        const user = new User(userData);
        const savedUser = await user.save();
        createdUsers.push(savedUser);
        
        console.log(`✅ Utilisateur créé: ${userData.email} (ID Partenaire: ${savedUser.partnerId})`);
      } catch (userError) {
        console.error(`❌ Erreur création utilisateur ${userData.email}:`, userError.message);
        // Continuer avec les autres utilisateurs
      }
    }

    console.log(`✅ ${createdUsers.length} utilisateurs créés sur ${usersData.length} tentatives`);
    return createdUsers;
  } catch (error) {
    console.error('❌ Erreur lors de la création des utilisateurs:', error);
    throw error;
  }
};

// Créer les ministères par défaut
const createMinistries = async () => {
  try {
    console.log('⛪ Création des ministères...');
    
    const ministries = [
      {
        title: 'Ministère des Enfants',
        description: 'Ministère dédié à l\'évangélisation et à l\'encadrement des enfants de 3 à 12 ans. Nous organisons des activités ludiques et éducatives pour leur enseigner la parole de Dieu.',
        category: 'children',
        order: 1,
        isActive: true,
        contactInfo: {
          name: 'Sœur Marie Kouadio',
          phone: '+225070000010',
          email: 'enfants@partenairemagb.com'
        },
        meetingInfo: {
          day: 'dimanche',
          time: '09:00',
          location: 'Salle des enfants'
        }
      },
      {
        title: 'Ministère des Jeunes',
        description: 'Ministère pour les jeunes de 13 à 35 ans. Notre mission est de former des leaders spirituels et d\'accompagner les jeunes dans leur développement personnel et spirituel.',
        category: 'youth',
        order: 2,
        isActive: true,
        contactInfo: {
          name: 'Frère Jean-Paul Assi',
          phone: '+225070000011',
          email: 'jeunes@partenairemagb.com'
        },
        meetingInfo: {
          day: 'samedi',
          time: '15:00',
          location: 'Salle de conférence'
        }
      },
      {
        title: 'Ministère des Femmes',
        description: 'Ministère féminin axé sur l\'autonomisation des femmes, l\'éducation biblique et les projets sociaux. Nous organisons également le Concert annuel des Femmes.',
        category: 'women',
        order: 3,
        isActive: true,
        contactInfo: {
          name: 'Madame Adjoua Koffi',
          phone: '+225070000012',
          email: 'femmes@partenairemagb.com'
        },
        meetingInfo: {
          day: 'mercredi',
          time: '18:00',
          location: 'Salle principale'
        }
      },
      {
        title: 'Ministère des Hommes',
        description: 'Ministère masculin pour le développement du leadership spirituel et familial. Focus sur la paternité responsable et l\'engagement communautaire.',
        category: 'men',
        order: 4,
        isActive: true,
        contactInfo: {
          name: 'Pasteur André Konan',
          phone: '+225070000013',
          email: 'hommes@partenairemagb.com'
        },
        meetingInfo: {
          day: 'samedi',
          time: '08:00',
          location: 'Bureau pastoral'
        }
      },
      {
        title: 'Ministère de Louange',
        description: 'Ministère musical responsable de l\'animation des cultes et événements spéciaux. Formation de choristes et musiciens.',
        category: 'music',
        order: 5,
        isActive: true,
        contactInfo: {
          name: 'Frère David Yao',
          phone: '+225070000014',
          email: 'louange@partenairemagb.com'
        },
        meetingInfo: {
          day: 'jeudi',
          time: '19:00',
          location: 'Studio de musique'
        }
      },
      {
        title: 'Ministère de Prière',
        description: 'Ministère d\'intercession et de prière. Organisation de veillées de prière, chaînes de prière et accompagnement spirituel.',
        category: 'prayer',
        order: 6,
        isActive: true,
        contactInfo: {
          name: 'Sœur Grace N\'Guessan',
          phone: '+225070000015',
          email: 'priere@partenairemagb.com'
        },
        meetingInfo: {
          day: 'mardi',
          time: '19:00',
          location: 'Salle de prière'
        }
      },
      {
        title: 'Ministère d\'Évangélisation',
        description: 'Ministère chargé de l\'évangélisation et des missions. Organisation de campagnes d\'évangélisation et formation d\'évangélistes.',
        category: 'evangelism',
        order: 7,
        isActive: true,
        contactInfo: {
          name: 'Évangéliste Pierre Kouakou',
          phone: '+225070000016',
          email: 'evangelisation@partenairemagb.com'
        },
        meetingInfo: {
          day: 'vendredi',
          time: '18:30',
          location: 'Salle de formation'
        }
      },
      {
        title: 'Ministère Social',
        description: 'Ministère d\'action sociale et caritative. Aide aux démunis, visites aux malades, projets communautaires.',
        category: 'social',
        order: 8,
        isActive: true,
        contactInfo: {
          name: 'Diacre Aya Koné',
          phone: '+225070000017',
          email: 'social@partenairemagb.com'
        },
        meetingInfo: {
          day: 'lundi',
          time: '17:00',
          location: 'Bureau administratif'
        }
      }
    ];

    const createdMinistries = [];
    for (const ministryData of ministries) {
      const ministry = new Ministry(ministryData);
      const savedMinistry = await ministry.save();
      createdMinistries.push(savedMinistry);
      console.log(`✅ Ministère créé: ${ministryData.title}`);
    }

    console.log(`✅ ${createdMinistries.length} ministères créés`);
    return createdMinistries;
  } catch (error) {
    console.error('❌ Erreur lors de la création des ministères:', error);
    throw error;
  }
};

// Créer des donations d'exemple
const createDonations = async (users) => {
  try {
    console.log('💰 Création des donations d\'exemple...');
    
    // Vérifier qu'on a des utilisateurs
    if (!users || users.length === 0) {
      console.log('⚠️ Aucun utilisateur trouvé, skip des donations');
      return [];
    }
    
    // Obtenir les utilisateurs non-admin
    const regularUsers = users.filter(user => user.role === 'user');
    
    if (regularUsers.length === 0) {
      console.log('⚠️ Aucun utilisateur régulier trouvé, skip des donations');
      return [];
    }
    
    console.log(`📊 ${regularUsers.length} utilisateurs réguliers trouvés pour créer des donations`);

    // Créer les donations en fonction du nombre d'utilisateurs disponibles
    const donations = [];
    
    // Donations de base (nécessite au moins 1 utilisateur)
    if (regularUsers.length >= 1) {
      donations.push({
        user: regularUsers[0]._id,
        amount: 50000,
        currency: 'XOF',
        category: 'don_ponctuel',
        type: 'one_time',
        status: 'completed',
        paymentMethod: 'mobile_money',
        message: 'Don pour les œuvres de l\'église',
        isAnonymous: false
      });
      
      donations.push({
        user: regularUsers[0]._id,
        amount: 25000,
        currency: 'XOF',
        category: 'don_libre',
        type: 'one_time',
        status: 'completed',
        paymentMethod: 'card',
        message: 'Que Dieu bénisse cette œuvre',
        isAnonymous: false
      });
      
      // Don récurrent pour le premier utilisateur
      donations.push({
        user: regularUsers[0]._id,
        amount: 25000,
        currency: 'XOF',
        category: 'don_mensuel',
        type: 'recurring',
        status: 'completed',
        paymentMethod: 'mobile_money',
        message: 'Don mensuel régulier',
        recurring: {
          frequency: 'monthly',
          interval: 1,
          dayOfMonth: 15,
          startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Il y a 30 jours
          isActive: true,
          nextPaymentDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // Dans 15 jours
          totalExecutions: 1
        }
      });
    }
    
    // Donations supplémentaires (nécessite au moins 2 utilisateurs)
    if (regularUsers.length >= 2) {
      donations.push({
        user: regularUsers[1]._id,
        amount: 100000,
        currency: 'XOF',
        category: 'don_concert_femmes',
        type: 'one_time',
        status: 'completed',
        paymentMethod: 'mobile_money',
        message: 'Participation au Concert des Femmes 2024',
        isAnonymous: false
      });
      
      donations.push({
        user: regularUsers[1]._id,
        amount: 75000,
        currency: 'XOF',
        category: 'don_ponctuel',
        type: 'one_time',
        status: 'completed',
        paymentMethod: 'bank_transfer',
        isAnonymous: true
      });
      
      // Don récurrent pour le deuxième utilisateur
      donations.push({
        user: regularUsers[1]._id,
        amount: 50000,
        currency: 'XOF',
        category: 'don_mensuel',
        type: 'recurring',
        status: 'completed',
        paymentMethod: 'card',
        message: 'Partenariat mensuel',
        recurring: {
          frequency: 'monthly',
          interval: 1,
          dayOfMonth: 1,
          startDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // Il y a 60 jours
          isActive: true,
          nextPaymentDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // Dans 1 jour
          totalExecutions: 2
        }
      });
    }
    
    // Donations avancées (nécessite au moins 3 utilisateurs)
    if (regularUsers.length >= 3) {
      donations.push({
        user: regularUsers[2]._id,
        amount: 200000,
        currency: 'XOF',
        category: 'don_ria_2025',
        type: 'one_time',
        status: 'completed',
        paymentMethod: 'card',
        message: 'Pour le projet RIA 2025',
        isAnonymous: false
      });
      
      // Don récurrent pour le troisième utilisateur
      donations.push({
        user: regularUsers[2]._id,
        amount: 100000,
        currency: 'XOF',
        category: 'don_mensuel',
        type: 'recurring',
        status: 'completed',
        paymentMethod: 'bank_transfer',
        message: 'Soutien mensuel aux ministères',
        recurring: {
          frequency: 'monthly',
          interval: 1,
          dayOfMonth: 5,
          startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // Il y a 90 jours
          isActive: true,
          nextPaymentDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // Dans 5 jours
          totalExecutions: 3
        }
      });
    }

    const createdDonations = [];
    for (const donationData of donations) {
      const donation = new Donation(donationData);
      
      // Ajouter une entrée d'historique
      donation.addToHistory('created', 'Donation créée lors du seed');
      if (donation.status === 'completed') {
        donation.addToHistory('completed', 'Donation complétée automatiquement');
      }
      
      const savedDonation = await donation.save();
      createdDonations.push(savedDonation);
      
      console.log(`✅ Donation créée: ${donationData.amount} ${donationData.currency} (${donationData.type})`);
    }

    console.log(`✅ ${createdDonations.length} donations créées`);
    return createdDonations;
  } catch (error) {
    console.error('❌ Erreur lors de la création des donations:', error);
    throw error;
  }
};

// Créer des paiements d'exemple
const createPayments = async (donations) => {
  try {
    console.log('💳 Création des paiements d\'exemple...');
    
    // Vérifier qu'on a des donations
    if (!donations || donations.length === 0) {
      console.log('⚠️ Aucune donation trouvée, skip des paiements');
      return [];
    }
    
    const payments = [];
    
    for (const donation of donations) {
      if (donation.status === 'completed') {
        // Déterminer le provider en fonction de la méthode de paiement
        let provider = 'manual';
        switch (donation.paymentMethod) {
          case 'card':
            provider = 'stripe';
            break;
          case 'mobile_money':
            provider = 'cinetpay';
            break;
          case 'bank_transfer':
            provider = 'manual';
            break;
          case 'paypal':
            provider = 'paypal';
            break;
          case 'moneyfusion':
            provider = 'moneyfusion';
            break;
          default:
            provider = 'manual';
        }
        
        const payment = new Payment({
          donation: donation._id,
          user: donation.user,
          amount: donation.amount,
          currency: donation.currency,
          paymentMethod: donation.paymentMethod,
          provider: provider,
          status: 'completed',
          transactionId: `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
          providerResponse: {
            status: 'success',
            message: 'Paiement traité avec succès',
            timestamp: new Date()
          },
          processedAt: new Date()
        });
        
        const savedPayment = await payment.save();
        payments.push(savedPayment);
        
        // Mettre à jour la donation avec la référence du paiement
        donation.payment = savedPayment._id;
        await donation.save();
      }
    }
    
    console.log(`✅ ${payments.length} paiements créés`);
    return payments;
  } catch (error) {
    console.error('❌ Erreur lors de la création des paiements:', error);
    throw error;
  }
};

// Fonction principale
const seedDatabase = async () => {
  try {
    console.log('🚀 Démarrage du processus de seed...');
    
    // Connexion à la base de données
    await connectDB();
    
    // Nettoyer la base de données
    await cleanDatabase();
    
    // Créer les données de seed
    const users = await createUsers();
    const ministries = await createMinistries();
    
    // Créer les donations seulement si on a des utilisateurs
    let donations = [];
    let payments = [];
    
    if (users && users.length > 0) {
      donations = await createDonations(users);
      if (donations && donations.length > 0) {
        payments = await createPayments(donations);
      }
    } else {
      console.log('⚠️ Aucun utilisateur créé, skip des donations et paiements');
    }
    
    // Résumé final
    console.log('\n🎉 Seed terminé avec succès !');
    console.log('================================');
    console.log(`👥 Utilisateurs créés: ${users.length}`);
    console.log(`⛪ Ministères créés: ${ministries.length}`);
    console.log(`💰 Donations créées: ${donations.length}`);
    console.log(`💳 Paiements créés: ${payments.length}`);
    console.log('================================');
    
    console.log('\n📋 Comptes de test créés:');
    console.log('Admin: admin@partenairemagb.com / Admin123456!');
    console.log('Trésorier: tresorier@partenairemagb.com / Tresorier123!');
    console.log('Support: support@partenairemagb.com / Support123!');
    console.log('Utilisateur 1: jean.kouassi@example.com / User123456!');
    console.log('Utilisateur 2: marie.kouadio@example.com / User123456!');
    console.log('Utilisateur 3: paul.brou@example.com / User123456!');
    
    console.log('\n✅ Base de données initialisée et prête à l\'utilisation !');
    
  } catch (error) {
    console.error('❌ Erreur lors du seed:', error);
    process.exit(1);
  } finally {
    // Fermer la connexion
    await mongoose.connection.close();
    console.log('🔌 Connexion MongoDB fermée');
    process.exit(0);
  }
};

// Exécuter le seed si le script est appelé directement
if (require.main === module) {
  seedDatabase();
}

module.exports = {
  seedDatabase,
  cleanDatabase,
  createUsers,
  createMinistries,
  createDonations,
  createPayments
};
