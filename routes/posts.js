const express = require('express');
const router = express.Router();
const path = require('path');
const { db } = require('../config/firebase');
const { cloudinary, upload } = require('../config/cloudinary');
const { 
    collection, doc, addDoc, getDoc, getDocs, 
    updateDoc, deleteDoc, query, where, orderBy, 
    limit, increment, startAfter
} = require('firebase/firestore');

// Middleware para verificar autenticación
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    }
    // Si no hay sesión, redirigir al login
    res.redirect('/auth/login');
};

// Middleware que permite usuarios anónimos y autenticados
const allowAnyUser = (req, res, next) => {
    // Si es usuario autenticado o anónimo con sesión, permitir
    if (req.session.user) {
        return next();
    }
    // Si no hay sesión, crear una sesión anónima
    const anonymousId = 'anon_' + Math.random().toString(36).substring(2, 15);
    req.session.user = {
        uid: anonymousId,
        isAnonymous: true,
        username: 'Anónimo_' + anonymousId.substring(5, 10)
    };
    return next();
};

// La configuración de multer ahora viene de config/cloudinary.js

// Listar todos los posts (con paginación)
router.get('/', async (req, res) => {
    try {
        const postsPerPage = 10;
        let lastVisible = null;
        let nextPosts = [];
        
        // Obtener el cursor de paginación
        const page = parseInt(req.query.page) || 1;
        const cursor = req.query.cursor;
        
        let postsRef = collection(db, 'posts');
        let q;
        
        if (cursor) {
            // Obtener el documento de referencia para startAfter
            const cursorDocRef = doc(db, 'posts', cursor);
            const cursorDocSnapshot = await getDoc(cursorDocRef);
            
            q = query(
                postsRef, 
                orderBy('createdAt', 'desc'), 
                startAfter(cursorDocSnapshot),
                limit(postsPerPage)
            );
        } else {
            q = query(
                postsRef, 
                orderBy('createdAt', 'desc'), 
                limit(postsPerPage)
            );
        }
        
        const querySnapshot = await getDocs(q);
        
        // Procesar los resultados
        const posts = [];
        querySnapshot.forEach(doc => {
            posts.push({
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt ? new Date(doc.data().createdAt.seconds * 1000).toLocaleString() : 'Fecha desconocida'
            });
            
            // Guardar el último documento para paginación
            lastVisible = doc;
        });
        
        // Verificar si hay más posts para la próxima página
        if (lastVisible) {
            const nextQuery = query(
                postsRef,
                orderBy('createdAt', 'desc'),
                startAfter(lastVisible),
                limit(1)
            );
            const nextQuerySnapshot = await getDocs(nextQuery);
            nextPosts = [];
            nextQuerySnapshot.forEach(doc => {
                nextPosts.push(doc.id);
            });
        }
        
        res.render('posts/index', {
            title: 'Cetisgram - Posts',
            posts,
            nextCursor: nextPosts.length > 0 ? lastVisible.id : null,
            prevPage: page > 1 ? page - 1 : null,
            nextPage: nextPosts.length > 0 ? page + 1 : null,
            currentPage: page,
            user: req.session.user || null
        });
    } catch (error) {
        console.error('Error al obtener posts:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error al cargar los posts',
            error
        });
    }
});

// Formulario para crear un nuevo post
router.get('/new', allowAnyUser, (req, res) => {
    res.render('posts/new', {
        title: 'Crear nuevo post',
        user: req.session.user
    });
});

// Crear un nuevo post
router.post('/new', allowAnyUser, upload.single('image'), async (req, res) => {
    try {
        const { title, content } = req.body;
        
        if (!title || !content) {
            return res.render('posts/new', {
                title: 'Crear nuevo post',
                error: 'El título y contenido son obligatorios',
                user: req.session.user
            });
        }
        
        // Datos base del post
        const postData = {
            title,
            content,
            authorId: req.session.user.uid,
            authorName: req.session.user.username || 'Anónimo',
            createdAt: new Date(),
            updatedAt: new Date(),
            likes: 0,
            views: 0
        };
        
        // Si hay imagen, ya fue procesada por Cloudinary a través de multer
        if (req.file) {
            // Cloudinary ya ha subido la imagen y guardado la información en req.file
            postData.imageUrl = req.file.path; // URL de Cloudinary
        }
        
        // Guardar el post en Firestore
        const docRef = await addDoc(collection(db, 'posts'), postData);
        
        res.redirect(`/posts/${docRef.id}`);
    } catch (error) {
        console.error('Error al crear post:', error);
        res.render('posts/new', {
            title: 'Crear nuevo post',
            error: 'Error al crear el post: ' + error.message,
            user: req.session.user
        });
    }
});

// Ver un post específico
router.get('/:id', async (req, res) => {
    try {
        const postId = req.params.id;
        console.log('Obteniendo post con ID:', postId);
        
        // Intentar obtener el post
        try {
            const postRef = doc(db, 'posts', postId);
            const postSnap = await getDoc(postRef);
            
            if (!postSnap.exists()) {
                console.log('Post no encontrado');
                return res.status(404).render('404', {
                    title: 'Post no encontrado',
                    user: req.session.user || null
                });
            }
            
            // Intentar incrementar vistas (si falla, continuamos sin incrementar)
            try {
                await updateDoc(postRef, {
                    views: increment(1)
                });
                console.log('Vistas incrementadas');
            } catch (viewError) {
                console.error('Error al incrementar vistas (continuando):', viewError);
            }
            
            const postData = {
                id: postSnap.id,
                ...postSnap.data(),
                createdAt: postSnap.data().createdAt ? new Date(postSnap.data().createdAt.seconds * 1000).toLocaleString() : 'Fecha desconocida'
            };
            
            console.log('Post obtenido correctamente');
            
            // Obtener comentarios del post
            let comments = [];
            try {
                const commentsRef = collection(db, 'comments');
                const commentsQuery = query(
                    commentsRef,
                    where('postId', '==', postId),
                    orderBy('createdAt', 'desc')
                );
                const commentsSnap = await getDocs(commentsQuery);
                
                commentsSnap.forEach(doc => {
                    comments.push({
                        id: doc.id,
                        ...doc.data(),
                        createdAt: doc.data().createdAt ? new Date(doc.data().createdAt.seconds * 1000).toLocaleString() : 'Fecha desconocida'
                    });
                });
                console.log(`${comments.length} comentarios obtenidos`);
            } catch (commentsError) {
                console.error('Error al obtener comentarios (continuando):', commentsError);
                // Continuamos sin comentarios si hay error
            }
            
            return res.render('posts/show', {
                title: postData.title,
                post: postData,
                comments,
                user: req.session.user || null
            });
        } catch (postError) {
            console.error('Error específico al obtener post:', postError);
            throw postError; // Relanzar para el manejador global
        }
    } catch (error) {
        console.error('Error al obtener post:', error);
        
        // Mensaje de error más descriptivo
        let errorMessage = 'Error al cargar el post';
        if (error.code === 'permission-denied') {
            errorMessage = 'Error de permisos. Por favor, actualiza las reglas de seguridad en Firebase.';
        }
        
        res.status(500).render('error', {
            title: 'Error',
            message: errorMessage,
            error
        });
    }
});

// Dar like a un post
router.post('/:id/like', isAuthenticated, async (req, res) => {
    try {
        const postId = req.params.id;
        const userId = req.session.user.uid;
        
        // Verificar si ya dio like
        const likesRef = collection(db, 'likes');
        const q = query(
            likesRef,
            where('postId', '==', postId),
            where('userId', '==', userId)
        );
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            // No ha dado like, agregarlo
            await addDoc(collection(db, 'likes'), {
                postId,
                userId,
                createdAt: new Date()
            });
            
            // Incrementar contador de likes
            const postRef = doc(db, 'posts', postId);
            await updateDoc(postRef, {
                likes: increment(1)
            });
            
            res.json({ success: true, action: 'liked' });
        } else {
            // Ya dio like, quitarlo
            const likeDoc = querySnapshot.docs[0];
            await deleteDoc(doc(db, 'likes', likeDoc.id));
            
            // Decrementar contador de likes
            const postRef = doc(db, 'posts', postId);
            await updateDoc(postRef, {
                likes: increment(-1)
            });
            
            res.json({ success: true, action: 'unliked' });
        }
    } catch (error) {
        console.error('Error al dar like:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error al procesar el like'
        });
    }
});

module.exports = router;
