require('dotenv').config();
const cloudinaryService = require('./services/cloudinaryService');

async function testAvatarUpload() {
  console.log('🧪 Test Avatar Upload');
  console.log('====================');

  try {
    // Test avec une image base64 simple (1x1 pixel transparent)
    const testImageBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI9jU77zgAAAABJRU5ErkJggg==';
    
    console.log('1. Testing Cloudinary availability...');
    console.log('Available:', cloudinaryService.isAvailable());
    
    if (cloudinaryService.isAvailable()) {
      console.log('\n2. Testing image upload...');
      
      const result = await cloudinaryService.uploadImage(testImageBase64, {
        folder: 'partenaire-magb/avatars',
        transformation: [
          { width: 400, height: 400, crop: 'fill' },
          { quality: 'auto:good' }
        ]
      });
      
      console.log('✅ Upload successful!');
      console.log('URL:', result.secure_url);
      console.log('Public ID:', result.public_id);
      
      // Test de suppression
      console.log('\n3. Testing image deletion...');
      await cloudinaryService.deleteImage(result.public_id);
      console.log('✅ Deletion successful!');
      
    } else {
      console.log('❌ Cloudinary not available - check configuration');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testAvatarUpload();