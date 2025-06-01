const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { cloudinary, uploadProfile } = require('../config/cloudinary');
const { 
    doc, getDoc, updateDoc
} = require('firebase/firestore');

// Middleware para verificar autenticación
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    }
    res.redirect('/auth/login');
};

// Ruta para ver perfil
router.get('/', isAuthenticated, async (req, res) => {
    try {
        console.log('=========== INICIO LOGS DEPURACIÓN PERFIL ===========');
        console.log('Accediendo a la ruta de perfil');
        console.log('Datos de sesión:', req.session);
        console.log('Usuario en sesión:', req.session.user);
        console.log('UID del usuario:', req.session.user.uid);
        
        const userId = req.session.user.uid;
        console.log('Intentando obtener documento de usuario con ID:', userId);
        
        const userRef = doc(db, 'users', userId);
        console.log('Referencia de documento creada');
        
        const userDoc = await getDoc(userRef);
        console.log('Documento obtenido de Firestore');
        console.log('¿El documento existe?', userDoc.exists());
        
        if (!userDoc.exists()) {
            console.log('ERROR: Documento de usuario no encontrado');
            return res.status(404).render('error', {
                title: 'Error',
                message: 'Usuario no encontrado',
                error: new Error('Usuario no encontrado')
            });
        }

        const userData = userDoc.data();
        console.log('Datos de usuario obtenidos:', JSON.stringify(userData));
        console.log('Intentando renderizar vista: profile/index');
        
        res.render('profile/index', {
            title: 'Mi Perfil - Cetisgram',
            user: req.session.user,
            userData: userData
        });
        console.log('Vista renderizada exitosamente');
        console.log('=========== FIN LOGS DEPURACIÓN PERFIL ===========');
    } catch (error) {
        console.error('ERROR CRÍTICO al obtener perfil:', error);
        console.error('Stack de error:', error.stack);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error al cargar el perfil',
            error
        });
    }
});

// Ruta de prueba simple sin acceso a Firestore
router.get('/test', isAuthenticated, (req, res) => {
    console.log('Accediendo a ruta de prueba de perfil');
    console.log('Usuario en sesión:', req.session.user);
    res.send(`
        <h1>Prueba de ruta de perfil</h1>
        <p>Esta ruta funciona correctamente.</p>
        <p>Usuario: ${req.session.user ? req.session.user.username : 'No hay sesión'}</p>
        <p>Email: ${req.session.user ? req.session.user.email : 'No hay sesión'}</p>
        <p><a href="/">Volver al inicio</a></p>
    `);
});

// Ruta para formulario de edición de perfil
router.get('/edit', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.uid;
        const userRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userRef);
        
        if (!userDoc.exists()) {
            return res.status(404).render('error', {
                title: 'Error',
                message: 'Usuario no encontrado',
                error: new Error('Usuario no encontrado')
            });
        }

        const userData = userDoc.data();
        
        res.render('profile/edit', {
            title: 'Editar Perfil - Cetisgram',
            user: req.session.user,
            userData: userData,
            error: null
        });
    } catch (error) {
        console.error('Error al cargar formulario de edición:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error al cargar el formulario de edición',
            error
        });
    }
});

// Ruta para actualizar foto de perfil
router.post('/update-photo', isAuthenticated, uploadProfile.single('profilePhoto'), async (req, res) => {
    try {
        const userId = req.session.user.uid;
        
        // Verificar si se subió una imagen
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No se seleccionó ninguna imagen'
            });
        }
        
        // La imagen ya fue subida a Cloudinary por multer
        const photoURL = req.file.path;
        
        // Actualizar el documento del usuario en Firestore
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, {
            photoURL: photoURL,
            updatedAt: new Date()
        });
        
        // Obtener los datos actualizados del usuario
        const userDoc = await getDoc(doc(db, 'users', userId));
        const userData = userDoc.data();
        
        // Actualizar completamente la sesión del usuario
        req.session.user = {
            ...req.session.user,  // Mantener los datos existentes
            photoURL: photoURL,
            username: userData.username || req.session.user.username,
            role: userData.role || req.session.user.role,
            isAdmin: (userData.role === 'admin') || req.session.user.isAdmin
        };
        
        // Guardar la sesión antes de enviar la respuesta
        req.session.save(err => {
            if (err) {
                console.error('Error al guardar la sesión:', err);
                return res.status(500).json({
                    success: false,
                    message: 'Error al actualizar la sesión'
                });
            }
            
            res.json({
                success: true,
                photoURL: photoURL,
                message: 'Foto de perfil actualizada correctamente'
            });
        });
    } catch (error) {
        console.error('Error al actualizar foto de perfil:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar la foto de perfil'
        });
    }
});

// Ruta para actualizar información del perfil
router.post('/update', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.uid;
        const { username, bio } = req.body;
        
        if (!username) {
            return res.render('profile/edit', {
                title: 'Editar Perfil - Cetisgram',
                user: req.session.user,
                userData: {
                    ...req.body,
                    photoURL: req.session.user.photoURL
                },
                error: 'El nombre de usuario es obligatorio'
            });
        }
        
        // Actualizar el documento del usuario en Firestore
        const userRef = doc(db, 'users', userId);
        const updateData = {
            username: username,
            updatedAt: new Date()
        };
        
        // Solo agregar bio si se proporcionó
        if (bio !== undefined) {
            updateData.bio = bio;
        }
        
        await updateDoc(userRef, updateData);
        
        // Actualizar la sesión del usuario
        req.session.user.username = username;
        
        // Redirigir al perfil
        res.redirect('/profile');
    } catch (error) {
        console.error('Error al actualizar perfil:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error al actualizar el perfil',
            error
        });
    }
});

module.exports = router;
