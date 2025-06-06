const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const path = require('path');

// Configurar Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configurar almacenamiento para posts (imágenes y videos)
const postsStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    let resource_type = 'image';
    let allowed_formats_list = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    let transformations = [{ width: 1000, height: 1000, crop: 'limit' }];

    if (file.mimetype.startsWith('video')) {
      resource_type = 'video';
      allowed_formats_list = ['mp4', 'webm', 'ogg', 'mov'];
      transformations = []; 
    }

    return {
      folder: 'cetisgram_posts',
      allowed_formats: allowed_formats_list,
      resource_type: resource_type,
      eager: resource_type === 'video' ? [{ width: 400, crop: 'pad', format: 'jpg' }] : [],
      transformation: transformations
    };
  }
});

// Configurar almacenamiento para fotos de perfil
const profileStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'cetisgram_profiles',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [
      { width: 150, height: 150, crop: 'fill', gravity: 'face' },
      { width: 70, height: 70, crop: 'fill', gravity: 'face', named: 'thumb_70' } // Para la vista de 70x70
    ]
  }
});

// Configurar almacenamiento para imágenes en comentarios
const commentsMediaStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'cetisgram_comments_media',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    resource_type: 'image',
    transformation: [{ width: 600, crop: 'limit' }] // Limitar ancho a 600px
  }
});

// Middleware de Multer para posts
const uploadPosts = multer({ 
  storage: postsStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB límite
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|webp|mp4|webm|ogg|mov/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error(`Error: Tipo de archivo no soportado. Solo se permiten: ${filetypes}`));
  }
});

// Middleware de Multer para fotos de perfil
const uploadProfilePic = multer({ 
  storage: profileStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB límite
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|webp/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error(`Error: Tipo de archivo no soportado. Solo se permiten: ${filetypes}`));
  }
});

// Middleware de Multer para imágenes en comentarios
const uploadCommentMedia = multer({
  storage: commentsMediaStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB límite para imágenes de comentarios
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|webp/; // Solo imágenes
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error(`Error: Tipo de archivo no soportado para imágenes de comentario. Solo se permiten: ${filetypes}`));
  }
});

module.exports = {
  cloudinary,
  uploadPosts,       // For posts (images/videos)
  uploadProfilePic,  // For user profile pictures
  uploadCommentMedia // For media in comments
};

