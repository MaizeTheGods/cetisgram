const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { collection, query, orderBy, limit, getDocs, doc, getDoc } = require('firebase/firestore');

// Middleware para verificar si el usuario está autenticado
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    }
    // Si no está autenticado pero permite acceso
    res.locals.user = null;
    return next();
};

// Ruta principal - Página de inicio
router.get('/', async (req, res) => {
    try {
        // Obtener los posts más recientes
        const postsRef = collection(db, 'posts');
        const q = query(postsRef, orderBy('createdAt', 'desc'), limit(10));
        const querySnapshot = await getDocs(q);
        
        const posts = [];
        
        // Procesar cada post y obtener la foto de perfil del autor
        for (const docSnapshot of querySnapshot.docs) {
            const postData = {
                id: docSnapshot.id,
                ...docSnapshot.data(),
                // Formatear la fecha para visualización
                createdAt: docSnapshot.data().createdAt ? new Date(docSnapshot.data().createdAt.seconds * 1000).toLocaleString() : 'Fecha desconocida'
            };
            
            // Obtener la foto de perfil del autor
            if (postData.authorId) {
                try {
                    const userRef = doc(db, 'users', postData.authorId);
                    const userDoc = await getDoc(userRef);
                    if (userDoc.exists()) {
                        const userData = userDoc.data();
                        postData.authorPhotoURL = userData.photoURL || null;
                        console.log(`Home: Foto de perfil para ${postData.authorName}: ${postData.authorPhotoURL}`);
                    } else {
                        console.log(`Usuario no encontrado para post ${postData.id}`);
                    }
                } catch (error) {
                    console.error(`Error al obtener foto de perfil para post ${docSnapshot.id}:`, error);
                }
            }
            
            posts.push(postData);
        }

        res.render('home', { 
            title: 'Cetisgram - Inicio',
            posts,
            user: req.session.user || null
        });
    } catch (error) {
        console.error('Error obteniendo posts:', error);
        res.status(500).render('error', { 
            title: 'Error', 
            message: 'Error al cargar los posts recientes',
            error
        });
    }
});

// Ruta de about/acerca de
router.get('/about', (req, res) => {
    res.render('about', { 
        title: 'Cetisgram - Acerca de',
        user: req.session.user || null
    });
});

module.exports = router;
