const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const path = require('path'); // Necesario para fileFilter para obtener la extensión del archivo

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
      allowed_formats_list = ['mp4', 'webm', 'ogg', 'mov']; // 'mov' es común también
      // Para videos, Cloudinary puede generar un poster automáticamente.
      // Podemos solicitar una transformación específica para el poster si es necesario,
      // o dejar que Cloudinary elija. Por ahora, no aplicaremos transformaciones de imagen.
      transformations = []; // No aplicar transformaciones de imagen a videos directamente aquí
                            // Cloudinary puede generar un poster. Solicitaremos eager transformation para el poster.
    }

    return {
      folder: 'cetisgram_posts',
      allowed_formats: allowed_formats_list,
      resource_type: resource_type,
      // Eager transformation para generar un poster para videos
      // Esto crea una imagen jpg del primer frame del video
      eager: resource_type === 'video' ? [{ width: 400, crop: 'pad', format: 'jpg' }] : [],
      transformation: transformations // Aplicar solo a imágenes
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
    fileSize: 50 * 1024 * 1024 // Aumentado a 50MB para videos (ajustar según necesidad)
  },
  fileFilter: (req, file, cb) => {
    const allowedImageTypes = /jpeg|jpg|png|gif|webp/;
    const allowedVideoTypes = /mp4|webm|ogg|mov/;
    
    const isImage = allowedImageTypes.test(path.extname(file.originalname).toLowerCase()) && allowedImageTypes.test(file.mimetype);
    const isVideo = allowedVideoTypes.test(path.extname(file.originalname).toLowerCase()) && (file.mimetype.startsWith('video/') || allowedVideoTypes.test(file.mimetype));

    if (isImage || isVideo) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no soportado. Solo se permiten imágenes (jpg, png, gif, webp) y videos (mp4, webm, ogg, mov).'), false);
    }
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
