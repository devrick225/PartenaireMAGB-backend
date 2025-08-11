const mongoose = require('mongoose');
const Ministry = require('../models/Ministry');
require('dotenv').config();

const ministriesData = [
  {
    title: 'Ministère de la Jeunesse',
    description: 'Un ministère dédié à l\'accompagnement spirituel et au développement des jeunes. Nous organisons des activités, des retraites et des événements pour aider les jeunes à grandir dans leur foi et à développer leurs talents.',
    imageUrl: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2071&q=80',
    category: 'youth',
    order: 1,
    contactInfo: {
      name: 'Pasteur Jean Dupont',
      phone: '+2250701234567',
      email: 'jeunesse@partenairemagb.org'
    },
    meetingInfo: {
      day: 'samedi',
      time: '14h00 - 16h00',
      location: 'Salle de réunion principale'
    }
  },
  {
    title: 'Ministère des Enfants',
    description: 'Nous nous engageons à enseigner la parole de Dieu aux enfants de manière ludique et adaptée à leur âge. Notre équipe propose des activités créatives, des histoires bibliques et des jeux éducatifs.',
    imageUrl: 'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2074&q=80',
    category: 'children',
    order: 2,
    contactInfo: {
      name: 'Marie Konan',
      phone: '+2250701234568',
      email: 'enfants@partenairemagb.org'
    },
    meetingInfo: {
      day: 'dimanche',
      time: '09h00 - 11h00',
      location: 'Salle des enfants'
    }
  },
  {
    title: 'Ministère des Femmes',
    description: 'Un espace de communion et d\'encouragement pour les femmes. Nous organisons des études bibliques, des moments de prière et des activités sociales pour renforcer les liens entre sœurs en Christ.',
    imageUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2076&q=80',
    category: 'women',
    order: 3,
    contactInfo: {
      name: 'Sarah Traoré',
      phone: '+2250701234569',
      email: 'femmes@partenairemagb.org'
    },
    meetingInfo: {
      day: 'mardi',
      time: '19h00 - 21h00',
      location: 'Salle de prière'
    }
  },
  {
    title: 'Ministère de la Musique',
    description: 'Notre équipe de louange et d\'adoration utilise les talents musicaux pour glorifier Dieu et créer une atmosphère propice à la prière. Nous accueillons tous ceux qui souhaitent servir Dieu par la musique.',
    imageUrl: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80',
    category: 'music',
    order: 4,
    contactInfo: {
      name: 'David Kouassi',
      phone: '+2250701234570',
      email: 'musique@partenairemagb.org'
    },
    meetingInfo: {
      day: 'jeudi',
      time: '20h00 - 22h00',
      location: 'Salle de répétition'
    }
  },
  {
    title: 'Ministère de Prière',
    description: 'Nous nous réunissons régulièrement pour intercéder en faveur de l\'église, de nos familles et du monde. La prière est le fondement de notre vie spirituelle et nous encourageons tous à y participer.',
    imageUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80',
    category: 'prayer',
    order: 5,
    contactInfo: {
      name: 'Pasteur Paul Yao',
      phone: '+2250701234571',
      email: 'priere@partenairemagb.org'
    },
    meetingInfo: {
      day: 'mercredi',
      time: '18h00 - 19h30',
      location: 'Chapelle de prière'
    }
  },
  {
    title: 'Ministère d\'Évangélisation',
    description: 'Nous partageons l\'amour de Christ avec ceux qui ne le connaissent pas encore. Notre équipe organise des campagnes d\'évangélisation, des distributions de tracts et des témoignages personnels.',
    imageUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2071&q=80',
    category: 'evangelism',
    order: 6,
    contactInfo: {
      name: 'Marc N\'Guessan',
      phone: '+2250701234572',
      email: 'evangelisation@partenairemagb.org'
    },
    meetingInfo: {
      day: 'samedi',
      time: '08h00 - 12h00',
      location: 'Devant l\'église'
    }
  },
  {
    title: 'Ministère Social',
    description: 'Nous manifestons l\'amour de Christ par des actions concrètes envers les plus démunis. Nous organisons des distributions alimentaires, des visites aux malades et des soutiens aux familles dans le besoin.',
    imageUrl: 'https://images.unsplash.com/photo-1559027615-cd4628902d4a?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80',
    category: 'social',
    order: 7,
    contactInfo: {
      name: 'Lucie Bamba',
      phone: '+2250701234573',
      email: 'social@partenairemagb.org'
    },
    meetingInfo: {
      day: 'vendredi',
      time: '15h00 - 17h00',
      location: 'Centre social'
    }
  },
  {
    title: 'Ministère des Hommes',
    description: 'Un espace de fraternité et de responsabilité pour les hommes. Nous nous encourageons mutuellement à être des leaders spirituels dans nos familles et des modèles dans la société.',
    imageUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2071&q=80',
    category: 'men',
    order: 8,
    contactInfo: {
      name: 'Pierre Koffi',
      phone: '+2250701234574',
      email: 'hommes@partenairemagb.org'
    },
    meetingInfo: {
      day: 'lundi',
      time: '20h00 - 22h00',
      location: 'Salle des hommes'
    }
  },
  {
    title: 'Ministère de Formation',
    description: 'Nous proposons des formations bibliques, théologiques et pratiques pour équiper les membres de l\'église. Notre objectif est de former des disciples matures et engagés.',
    imageUrl: 'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80',
    category: 'general',
    order: 9,
    contactInfo: {
      name: 'Dr. Emmanuel Ouattara',
      phone: '+2250701234575',
      email: 'formation@partenairemagb.org'
    },
    meetingInfo: {
      day: 'dimanche',
      time: '14h00 - 16h00',
      location: 'Salle de formation'
    }
  },
  {
    title: 'Ministère de la Famille',
    description: 'Nous accompagnons les familles dans leur vie spirituelle et relationnelle. Nous proposons des conseils conjugaux, des ateliers parentaux et des activités familiales.',
    imageUrl: 'https://images.unsplash.com/photo-1511895426328-dc8714191300?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80',
    category: 'general',
    order: 10,
    contactInfo: {
      name: 'Famille Kone',
      phone: '+2250701234576',
      email: 'famille@partenairemagb.org'
    },
    meetingInfo: {
      day: 'samedi',
      time: '16h00 - 18h00',
      location: 'Salle familiale'
    }
  }
];

const seedMinistries = async () => {
  try {
    // Connexion à MongoDB
    await mongoose.connect("mongodb+srv://erickoffi29:6IFIAtSRHAKrN7mt@cluster0.xc89w77.mongodb.net/magb", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connecté à MongoDB');

    // Supprimer les ministères existants
    await Ministry.deleteMany({});
    console.log('🗑️ Anciens ministères supprimés');

    // Insérer les nouveaux ministères
    const ministries = await Ministry.insertMany(ministriesData);
    console.log(`✅ ${ministries.length} ministères créés avec succès`);

    // Afficher les ministères créés
    console.log('\n📋 Ministères créés :');
    ministries.forEach((ministry, index) => {
      console.log(`${index + 1}. ${ministry.title} (${ministry.category})`);
    });

    console.log('\n🎉 Script terminé avec succès !');
  } catch (error) {
    console.error('❌ Erreur lors de l\'exécution du script:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Déconnecté de MongoDB');
  }
};

// Exécuter le script si appelé directement
if (require.main === module) {
  seedMinistries();
}

module.exports = seedMinistries; 