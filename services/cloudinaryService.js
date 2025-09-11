const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

class CloudinaryService {
  constructor() {
    // Configuration Cloudinary
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dhtdo41o2' ,
      api_key: process.env.CLOUDINARY_API_KEY || '356816498247719',
      api_secret: process.env.CLOUDINARY_API_SECRET || 'Ql2t_hvQugWgqpiSX1KCyU8n7FM'
    });

    this.isConfigured = !!(
      process.env.CLOUDINARY_CLOUD_NAME && 
      process.env.CLOUDINARY_API_KEY && 
      process.env.CLOUDINARY_API_SECRET
    );

    if (!this.isConfigured) {
      console.warn('⚠️ Cloudinary not configured - Image uploads will fail');
    } else {
      console.log('✅ Cloudinary service initialized successfully');
    }
  }

  /**
   * Configuration du stockage Cloudinary pour avatars
   */
  getAvatarStorage() {
    if (!this.isConfigured) {
      throw new Error('Cloudinary not configured');
    }

    return new CloudinaryStorage({
      cloudinary: cloudinary,
      params: {
        folder: 'partenaire-magb/avatars',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [
          { width: 400, height: 400, crop: 'fill', gravity: 'face' },
          { quality: 'auto:good' },
          { format: 'webp' }
        ],
        public_id: (req, file) => {
          const userId = req.user?.id || 'anonymous';
          const timestamp = Date.now();
          return `avatar_${userId}_${timestamp}`;
        }
      }
    });
  }

  /**
   * Configuration du stockage Cloudinary pour documents/attachments
   */
  getDocumentStorage() {
    if (!this.isConfigured) {
      throw new Error('Cloudinary not configured');
    }

    return new CloudinaryStorage({
      cloudinary: cloudinary,
      params: {
        folder: 'partenaire-magb/documents',
        allowed_formats: ['jpg', 'jpeg', 'png', 'pdf', 'doc', 'docx'],
        resource_type: 'auto',
        public_id: (req, file) => {
          const userId = req.user?.id || 'anonymous';
          const timestamp = Date.now();
          const originalName = file.originalname.split('.')[0];
          return `${originalName}_${userId}_${timestamp}`;
        }
      }
    });
  }

  /**
   * Configuration Multer pour upload d'avatar
   */
  getAvatarUploader() {
    if (!this.isConfigured) {
      // Mode développement - pas d'upload réel
      return multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
        fileFilter: this.avatarFileFilter
      });
    }

    return multer({
      storage: this.getAvatarStorage(),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
      fileFilter: this.avatarFileFilter
    });
  }

  /**
   * Configuration Multer pour upload de documents
   */
  getDocumentUploader() {
    if (!this.isConfigured) {
      return multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
        fileFilter: this.documentFileFilter
      });
    }

    return multer({
      storage: this.getDocumentStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
      fileFilter: this.documentFileFilter
    });
  }

  /**
   * Filtre pour les fichiers d'avatar
   */
  avatarFileFilter(req, file, cb) {
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format de fichier non supporté. Utilisez JPG, PNG ou WebP.'), false);
    }
  }

  /**
   * Filtre pour les documents
   */
  documentFileFilter(req, file, cb) {
    const allowedMimes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format de fichier non supporté.'), false);
    }
  }

  /**
   * Upload direct d'une image (en base64 ou buffer)
   */
  async uploadImage(imageData, options = {}) {
    if (!this.isConfigured) {
      console.log('📷 Mode développement - simulation upload image');
      return {
        url: 'https://via.placeholder.com/400x400/007bff/ffffff?text=Avatar',
        public_id: `dev_${Date.now()}`,
        secure_url: 'https://via.placeholder.com/400x400/007bff/ffffff?text=Avatar',
        format: 'jpg',
        width: 400,
        height: 400
      };
    }

    try {
      const defaultOptions = {
        folder: options.folder || 'partenaire-magb/uploads',
        transformation: options.transformation || [
          { width: 400, height: 400, crop: 'fill' },
          { quality: 'auto:good' }
        ]
      };

      const result = await cloudinary.uploader.upload(imageData, defaultOptions);
      
      console.log(`✅ Image uploadée sur Cloudinary: ${result.public_id}`);
      return result;
    } catch (error) {
      console.error('❌ Erreur upload Cloudinary:', error);
      throw new Error('Erreur lors de l\'upload de l\'image');
    }
  }

  /**
   * Supprimer une image de Cloudinary
   */
  async deleteImage(publicId) {
    if (!this.isConfigured) {
      console.log('🗑️ Mode développement - simulation suppression image');
      return { result: 'ok' };
    }

    try {
      const result = await cloudinary.uploader.destroy(publicId);
      console.log(`🗑️ Image supprimée de Cloudinary: ${publicId}`);
      return result;
    } catch (error) {
      console.error('❌ Erreur suppression Cloudinary:', error);
      throw new Error('Erreur lors de la suppression de l\'image');
    }
  }

  /**
   * Générer une URL transformée pour une image existante
   */
  getTransformedUrl(publicId, transformations = []) {
    if (!this.isConfigured) {
      return 'https://via.placeholder.com/400x400/007bff/ffffff?text=Avatar';
    }

    return cloudinary.url(publicId, {
      transformation: transformations
    });
  }

  /**
   * Optimiser une image existante
   */
  async optimizeImage(publicId, transformations = []) {
    if (!this.isConfigured) {
      return 'https://via.placeholder.com/400x400/007bff/ffffff?text=Avatar';
    }

    const defaultTransformations = [
      { quality: 'auto:best' },
      { format: 'auto' }
    ];

    return cloudinary.url(publicId, {
      transformation: [...defaultTransformations, ...transformations]
    });
  }

  /**
   * Obtenir les informations d'une image
   */
  async getImageInfo(publicId) {
    if (!this.isConfigured) {
      return { 
        public_id: publicId,
        format: 'jpg',
        width: 400,
        height: 400,
        bytes: 50000
      };
    }

    try {
      const result = await cloudinary.api.resource(publicId);
      return result;
    } catch (error) {
      console.error('❌ Erreur récupération info image:', error);
      throw new Error('Image non trouvée');
    }
  }

  /**
   * Vérifier si Cloudinary est configuré
   */
  isAvailable() {
    return this.isConfigured;
  }

  /**
   * Obtenir le statut du service
   */
  getStatus() {
    return {
      configured: this.isConfigured,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME || 'Not configured',
      mode: process.env.NODE_ENV,
      provider: 'Cloudinary'
    };
  }

  /**
   * Nettoyer le nom du fichier
   */
  sanitizeFileName(filename) {
    return filename
      .toLowerCase()
      .replace(/[^a-z0-9.-]/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_+|_+$/g, '');
  }
}

// Créer une instance singleton
const cloudinaryService = new CloudinaryService();

module.exports = cloudinaryService; 