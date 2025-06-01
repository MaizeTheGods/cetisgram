const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// Configurar Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configurar almacenamiento para imágenes de posts
const postsStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'cetisgram_posts',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [{ width: 1000, height: 1000, crop: 'limit' }]
  }
});

// Configurar almacenamiento para fotos de perfil
const profileStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'cetisgram_profiles',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [
      // Versión para avatar (pequeño y cuadrado)
      { width: 150, height: 150, crop: 'fill', gravity: 'face' },
      // También guardar una versión original recortada
      { width: 500, height: 500, crop: 'limit' }
    ]
  }
});

// Configurar multer para posts
const uploadPost = multer({ 
  storage: postsStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

// Configurar multer para fotos de perfil
const uploadProfile = multer({ 
  storage: profileStorage,
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB (menor límite para avatares)
  }
});

module.exports = { cloudinary, upload: uploadPost, uploadProfile };
