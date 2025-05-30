const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { collection, query, orderBy, limit, getDocs } = require('firebase/firestore');

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
        querySnapshot.forEach(doc => {
            posts.push({
                id: doc.id,
                ...doc.data(),
                // Formatear la fecha para visualización
                createdAt: doc.data().createdAt ? new Date(doc.data().createdAt.seconds * 1000).toLocaleString() : 'Fecha desconocida'
            });
        });

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
