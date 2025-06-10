const mongoose = require('mongoose');
require('dotenv').config();

async function testTicket() {
  try {
    // Connexion à MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/partenaire-magb-test');
    console.log('✅ MongoDB connecté');
    
    const Ticket = require('./models/Ticket');
    
    // Créer un ticket test
    const testTicket = new Ticket({
      user: new mongoose.Types.ObjectId(),
      subject: 'Test ticket MoneyFusion',
      description: 'Test de création de ticket avec le nouveau middleware après correction',
      category: 'general',
      priority: 'medium'
    });
    
    console.log('📝 Création du ticket...');
    await testTicket.save();
    
    console.log('✅ Ticket créé avec succès!');
    console.log('📋 Numéro de ticket:', testTicket.ticketNumber);
    console.log('📋 Détails:', {
      id: testTicket._id,
      subject: testTicket.subject,
      status: testTicket.status,
      priority: testTicket.priority,
      category: testTicket.category
    });
    
    // Nettoyage
    await testTicket.deleteOne();
    console.log('🧹 Ticket de test supprimé');
    
    await mongoose.disconnect();
    console.log('📡 Connexion fermée');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    if (error.errors) {
      console.error('Détails:', Object.keys(error.errors).map(key => ({
        field: key,
        message: error.errors[key].message
      })));
    }
    process.exit(1);
  }
}

console.log('🧪 Test de création de ticket...');
testTicket(); 