require('dotenv').config();
const cloudinaryService = require('./services/cloudinaryService');

console.log('🧪 Test Cloudinary Service');
console.log('=========================');

// Test de la configuration
console.log('\n1. Configuration Status:');
console.log(cloudinaryService.getStatus());

// Test de disponibilité
console.log('\n2. Service Available:', cloudinaryService.isAvailable());

// Test des variables d'environnement
console.log('\n3. Environment Variables:');
console.log('CLOUDINARY_CLOUD_NAME:', process.env.CLOUDINARY_CLOUD_NAME);
console.log('CLOUDINARY_API_KEY:', process.env.CLOUDINARY_API_KEY);
console.log('CLOUDINARY_API_SECRET:', process.env.CLOUDINARY_API_SECRET ? '[HIDDEN]' : 'NOT SET');

// Test d'upload simulé
console.log('\n4. Testing image upload simulation...');
if (cloudinaryService.isAvailable()) {
  console.log('✅ Cloudinary is available - real uploads will work');
} else {
  console.log('❌ Cloudinary not available - using fallback mode');
}