const express = require('express');
const router = express.Router();
const path = require('path');
const { db } = require('../config/firebase');
const { cloudinary, uploadPosts } = require('../config/cloudinary');
const { isAuthenticated, isAdmin, allowAnyUser } = require('../middleware/authMiddleware');
const csrf = require('csurf');
const csrfProtection = csrf({ cookie: true });
const { getAuth } = require('firebase/auth');
const { 
    collection, 
    doc, 
    addDoc, 
    getDoc, 
    getDocs, 
    updateDoc, 
    deleteDoc, 
    query, 
    where, 
    orderBy, 
    limit, 
    startAfter, 
    increment, 
    setDoc 
} = require('firebase/firestore');

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
        
        // Primero, obtener los posts fijados (solo para la primera página)
        let pinnedPosts = [];
        try {
            if (!cursor) {
                const pinnedQuery = query(
                    postsRef,
                    where('isPinned', '==', true),
                    orderBy('createdAt', 'desc')
                );
                const pinnedSnapshot = await getDocs(pinnedQuery);
                pinnedSnapshot.forEach(doc => {
                    pinnedPosts.push({
                        id: doc.id,
                        ...doc.data(),
                        createdAt: doc.data().createdAt ? new Date(doc.data().createdAt.seconds * 1000).toLocaleString() : 'Fecha desconocida'
                    });
                });
            }
        } catch (e) {
            // Si falla, continuar sin posts fijados
            pinnedPosts = [];
        }
        
        // Luego, obtener los posts no fijados con paginación
        try {
            if (cursor) {
                // Obtener el documento de referencia para startAfter
                const cursorDocRef = doc(db, 'posts', cursor);
                const cursorDocSnapshot = await getDoc(cursorDocRef);
                
                q = query(
                    postsRef,
                    where('isPinned', '==', false),
                    orderBy('createdAt', 'desc'), 
                    startAfter(cursorDocSnapshot),
                    limit(postsPerPage)
                );
            } else {
                q = query(
                    postsRef,
                    where('isPinned', '==', false),
                    orderBy('createdAt', 'desc'), 
                    limit(postsPerPage)
                );
            }
        } catch (e) {
            // Si falla, obtener todos los posts sin filtrar por isPinned
            q = query(
                postsRef,
                orderBy('createdAt', 'desc'),
                limit(postsPerPage)
            );
        }
        
        const querySnapshot = await getDocs(q);
        
        // Procesar los resultados
        const posts = [];
        
        // Primero añadir los posts fijados (solo en la primera página)
        if (pinnedPosts.length > 0) {
            // Para cada post fijado, vamos a obtener la foto de perfil del autor
            for (const post of pinnedPosts) {
                try {
                    if (post.authorId) {
                        const userRef = doc(db, 'users', post.authorId);
                        const userDoc = await getDoc(userRef);
                        if (userDoc.exists()) {
                            const userData = userDoc.data();
                            post.authorPhotoURL = userData.photoURL || null;
                            console.log(`Post fijado: Foto de perfil para ${post.authorName}: ${post.authorPhotoURL}`);
                        }
                    }
                } catch (error) {
                    console.error('Error al obtener foto de perfil:', error);
                }
            }
            posts.push(...pinnedPosts);
        }
        
        // Luego añadir los posts regulares
        const regularPosts = [];
        
        for (const docSnapshot of querySnapshot.docs) {
            const postData = {
                id: docSnapshot.id,
                ...docSnapshot.data(),
                createdAt: docSnapshot.data().createdAt ? new Date(docSnapshot.data().createdAt.seconds * 1000).toLocaleString() : 'Fecha desconocida'
            };
            
            // Obtener la foto de perfil del autor directamente, sin usar promesas
            if (postData.authorId) {
                try {
                    const userRef = doc(db, 'users', postData.authorId);
                    const userDoc = await getDoc(userRef);
                    if (userDoc.exists()) {
                        const userData = userDoc.data();
                        postData.authorPhotoURL = userData.photoURL || null;
                        console.log(`Post regular: Foto de perfil para ${postData.authorName}: ${postData.authorPhotoURL}`);
                    } else {
                        console.log(`Usuario no encontrado para post ${postData.id} con authorId: ${postData.authorId}`);
                    }
                } catch (error) {
                    console.error(`Error al obtener foto de perfil para post ${docSnapshot.id}:`, error);
                }
            }
            
            regularPosts.push(postData);
            
            // Guardar el último documento para paginación
            lastVisible = docSnapshot;
        }
        
        console.log('Posts regulares con sus fotos:', regularPosts.length);
        regularPosts.forEach(p => console.log(`  - ${p.id}: ${p.authorName} -> ${p.authorPhotoURL}`));
        posts.push(...regularPosts);
        
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
router.get('/new', allowAnyUser, csrfProtection, (req, res) => { // Añadir csrfProtection aquí para que req.csrfToken() esté disponible
    // Pasamos oldInput y errors por si venimos de un error de validación o creación
    res.render('posts/new', {
        title: 'Crear nuevo post',
        user: req.session.user,
        oldInput: {}, // Objeto vacío por defecto
        errors: [],    // Array vacío por defecto
        csrfToken: req.csrfToken() // Pasar token CSRF a la plantilla
    });
});

// Crear un nuevo post
router.post('/new', allowAnyUser, uploadPosts.single('mediaFile'), csrfProtection, async (req, res) => {
    try {
        const { title, content } = req.body;
        
        if (!title || !title.trim()) {
            return res.render('posts/new', {
                title: 'Crear nuevo post',
                error: 'El título es obligatorio y no puede estar vacío.',
                user: req.session.user,
                csrfToken: req.csrfToken()
            });
        }
        
        // Datos base del post
        const postData = {
            title: title.trim(),
            content: (content || '').trim(),
            authorId: req.session.user.uid,
            authorName: req.session.user.username || 'Anónimo',
            authorPhotoURL: req.session.user.photoURL || null,
            authorRole: req.session.user.role || 'estudiante',
            isAnonymous: req.session.user.isAnonymous || false,
            createdAt: new Date(),
            updatedAt: new Date(),
            views: 0,
            commentsCount: 0,
            likesCount: 0,
            isPinned: false
        };
        
        // Si hay imagen, ya fue procesada por Cloudinary a través de multer
        if (req.file) {
            // Cloudinary ya ha subido la imagen y guardado la información en req.file
            postData.mediaUrl = req.file.path; // URL de Cloudinary
            postData.public_id = req.file.filename; // El 'filename' que multer-storage-cloudinary nos da es el public_id
            postData.fileMimetype = req.file.mimetype; // Guardar el mimetype original

            if (req.file.mimetype.startsWith('image')) {
                postData.mediaType = 'image';
            } else if (req.file.mimetype.startsWith('video')) {
                postData.mediaType = 'video';
                // Cloudinary devuelve información sobre las transformaciones eager en req.file.eager
                // Si solicitamos un poster jpg, debería estar ahí.
                if (req.file.eager && req.file.eager.length > 0) {
                    const posterTransformation = req.file.eager.find(e => e.format === 'jpg');
                    if (posterTransformation) {
                        postData.thumbnailUrl = posterTransformation.secure_url || posterTransformation.url;
                    }
                }
                // Si no hay eager transformation o no se encuentra el poster, thumbnailUrl no se establecerá.
                // Podríamos tener una miniatura por defecto o manejarlo en el frontend.
            }
        }
        
        // Guardar el post en Firestore
        const docRef = await addDoc(collection(db, 'posts'), postData);
        
        res.redirect(`/posts/${docRef.id}`);
    } catch (error) {
        console.error('Error al crear post:', error);
        res.render('posts/new', {
            title: 'Crear nuevo post',
            error: 'Error al crear el post: ' + (error.message || error.toString()),
            oldInput: req.body, // Para repoblar el formulario en caso de error
            user: req.session.user || null,
            csrfToken: req.csrfToken()
        });
    }
});

// Ver un post específico
router.get('/:id', csrfProtection, async (req, res) => {
    try {
        const postId = req.params.id;
        console.log('🔍 Obteniendo post con ID:', postId);
        
        // 1. Obtener el post
        const postRef = doc(db, 'posts', postId);
        console.log('📄 Referencia del post creada');
        
        const postSnap = await getDoc(postRef);
        console.log('✅ Post obtenido de Firestore');
        
        if (!postSnap.exists()) {
            console.log('❌ Post no encontrado');
            return res.status(404).render('404', {
                title: 'Post no encontrado',
                user: req.session.user || null
            });
        }
        
        // 2. Incrementar contador de vistas
        try {
            await updateDoc(postRef, {
                views: increment(1)
            });
            console.log('👀 Contador de vistas incrementado');
        } catch (viewError) {
            console.error('⚠️ Error al incrementar vistas (continuando):', viewError);
        }
        
        // 3. Preparar datos del post
        const postData = {
            id: postSnap.id,
            ...postSnap.data(),
            createdAt: postSnap.data().createdAt 
                ? new Date(postSnap.data().createdAt.seconds * 1000).toLocaleString() 
                : 'Fecha desconocida',
            likes: postSnap.data().likes || 0,
            views: (postSnap.data().views || 0) + 1
        };
        
        console.log('📝 Datos del post preparados:', {
            id: postData.id,
            title: postData.title,
            authorId: postData.authorId,
            authorName: postData.authorName
        });
        
        // 4. Obtener foto de perfil del autor del post
        if (postData.authorId) {
            try {
                console.log('👤 Buscando datos del autor con ID:', postData.authorId);
                const userRef = doc(db, 'users', postData.authorId);
                const userDoc = await getDoc(userRef);
                
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    postData.authorPhotoURL = userData.photoURL || null;
                    postData.authorName = userData.displayName || userData.username || 'Usuario';
                    postData.authorRole = userData.role || 'usuario';
                    
                    console.log('✅ Datos del autor obtenidos:', {
                        name: postData.authorName,
                        photoURL: postData.authorPhotoURL,
                        role: postData.authorRole
                    });
                } else {
                    console.warn('⚠️ Usuario no encontrado en la base de datos');
                    postData.authorName = 'Usuario eliminado';
                    postData.authorPhotoURL = null;
                }
            } catch (error) {
                console.error('❌ Error al obtener datos del autor:', error);
                postData.authorName = 'Error al cargar';
                postData.authorPhotoURL = null;
            }
        } else {
            postData.authorName = 'Anónimo';
            postData.authorPhotoURL = null;
        }
        
        // 5. Obtener comentarios
        console.log('💬 Obteniendo comentarios para el post ID:', postId);
        const commentsRef = collection(db, 'comments');
        const commentsQuery = query(
            commentsRef,
            where('postId', '==', postId),
            orderBy('createdAt', 'asc') // Ensure ascending order for nesting
        );
        
        const comments = [];
        try {
            console.log('🔍 Ejecutando consulta de comentarios...');
            const commentsSnapshot = await getDocs(commentsQuery);
            console.log(`📝 Se encontraron ${commentsSnapshot.size} comentarios`);
            
            if (commentsSnapshot.empty) {
                console.log('ℹ️ No se encontraron comentarios para este post');
            } else {
                console.log('📋 Primer comentario encontrado:', commentsSnapshot.docs[0].data());
            }
            
            // Procesar comentarios en paralelo
            const commentPromises = commentsSnapshot.docs.map(async (commentDoc) => {
                const commentData = {
                    id: commentDoc.id,
                    ...commentDoc.data(),
                    createdAt: commentDoc.data().createdAt ? commentDoc.data().createdAt.toDate() : new Date() // Convert Firestore Timestamp to JS Date
                };
                
                // Obtener foto de perfil del autor del comentario
                console.log(`   Procesando comentario ID: ${commentDoc.id}`);
                console.log(`   Datos del comentario:`, commentData);
                
                if (commentData.authorId) {
                    try {
                        console.log(`   Buscando datos del usuario: ${commentData.authorId}`);
                        const userRef = doc(db, 'users', commentData.authorId);
                        const userDoc = await getDoc(userRef);
                        
                        if (userDoc.exists()) {
                            const userData = userDoc.data();
                            commentData.authorPhotoURL = userData.photoURL || null;
                            commentData.authorName = userData.displayName || userData.username || 'Usuario';
                            console.log(`   Datos del usuario encontrados: ${commentData.authorName}`);
                        } else {
                            console.log(`   Usuario ${commentData.authorId} no encontrado`);
                            commentData.authorName = 'Usuario eliminado';
                            commentData.authorPhotoURL = null;
                        }
                    } catch (error) {
                        console.error(`❌ Error al obtener datos del autor del comentario ${commentDoc.id}:`, error);
                        commentData.authorName = 'Error al cargar';
                        commentData.authorPhotoURL = null;
                    }
                } else {
                    console.log('   Comentario anónimo');
                    commentData.authorName = 'Anónimo';
                    commentData.authorPhotoURL = null;
                }
                
                return commentData;
            });
            
            // Esperar a que todos los comentarios se procesen
            const processedComments = await Promise.all(commentPromises);
            
            // Función para anidar comentarios
            function nestComments(commentList) {
                const commentMap = {};
                commentList.forEach(comment => {
                    commentMap[comment.id] = { ...comment, children: [] };
                });

                const nestedComments = [];
                commentList.forEach(comment => {
                    // Asegurarse de que el objeto en commentMap se usa para la anidación
                    const currentCommentNode = commentMap[comment.id]; 
                    if (comment.parentId && commentMap[comment.parentId]) {
                        commentMap[comment.parentId].children.push(currentCommentNode);
                    } else {
                        nestedComments.push(currentCommentNode);
                    }
                });
                return nestedComments;
            }

            const nestedComments = nestComments(processedComments);
            comments.push(...nestedComments); // Ahora 'comments' contendrá la estructura anidada
            
        } catch (error) {
            console.error('❌ Error al obtener comentarios:', error);
            // Continuar sin comentarios si hay un error
        }
        
        // 6. Renderizar la vista con los datos
        console.log('🎉 Todo listo, renderizando vista...');
        console.log('📦 Pasando a la plantilla:', { post: postData, comments: comments, user: req.session.user, csrfToken: req.csrfToken() });
        res.render('posts/show', {
            title: postData.title || 'Ver post',
            post: postData,
            comments,
            user: req.session.user || null,
            csrfToken: req.csrfToken() // Pasar token CSRF a la plantilla
        });
        
    } catch (error) {
        console.error('❌ Error crítico al obtener el post:', error);
        
        // Mensaje de error más descriptivo
        let errorMessage = 'Error al cargar el post';
        if (error.code === 'permission-denied') {
            errorMessage = 'Error de permisos. Por favor, verifica que estás autenticado y tienes los permisos necesarios.';
        } else if (error.code === 'not-found') {
            errorMessage = 'El post solicitado no existe o ha sido eliminado.';
        }
        
        res.status(500).render('error', {
            title: 'Error',
            message: errorMessage,
            error: process.env.NODE_ENV === 'development' ? error : {},
            user: req.session.user || null
        });
    }
});

// Dar like a un post
/*
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
*/

// Eliminar un post (solo si eres el dueño o administrador)
router.delete('/:id', isAuthenticated, async (req, res) => {
    try {
        const postId = req.params.id;
        const userId = req.session.user.uid;
        const isAdmin = req.session.user.isAdmin || false;
        
        // Obtener el post
        const postRef = doc(db, 'posts', postId);
        const postSnap = await getDoc(postRef);
        
        if (!postSnap.exists()) {
            return res.status(404).json({
                success: false,
                message: 'Post no encontrado'
            });
        }
        
        const postData = postSnap.data();
        
        // Verificar que el usuario sea el autor o administrador
        if (userId !== postData.authorId && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'No tienes permiso para eliminar este post'
            });
        }
        
        // 1. Eliminar los comentarios asociados al post
        const commentsRef = collection(db, 'comments');
        const commentsQuery = query(commentsRef, where('postId', '==', postId));
        const commentsSnap = await getDocs(commentsQuery);
        
        const commentDeletePromises = [];
        commentsSnap.forEach(commentDoc => {
            commentDeletePromises.push(deleteDoc(doc(db, 'comments', commentDoc.id)));
        });
        
        await Promise.all(commentDeletePromises);
        
        // 2. Eliminar los likes asociados al post
        const likesRef = collection(db, 'likes');
        const likesQuery = query(likesRef, where('postId', '==', postId));
        const likesSnap = await getDocs(likesQuery);
        
        const likeDeletePromises = [];
        likesSnap.forEach(likeDoc => {
            likeDeletePromises.push(deleteDoc(doc(db, 'likes', likeDoc.id)));
        });
        
        await Promise.all(likeDeletePromises);
        
        // 3. Si el post tiene una imagen, eliminarla de Cloudinary
        if (postData.imageUrl) {
            try {
                // Extraer el public_id de la URL de Cloudinary
                // El formato típico es: https://res.cloudinary.com/CLOUD_NAME/image/upload/v1234567890/cetisgram_posts/abc123def456
                const urlParts = postData.imageUrl.split('/');
                const filenameWithExtension = urlParts[urlParts.length - 1];
                const publicId = `cetisgram_posts/${filenameWithExtension.split('.')[0]}`;
                
                console.log('Intentando eliminar imagen de Cloudinary:', publicId);
                
                // Eliminar la imagen de Cloudinary
                await cloudinary.uploader.destroy(publicId, { invalidate: true });
                console.log('Imagen eliminada de Cloudinary con éxito');
            } catch (cloudinaryError) {
                console.error('Error al eliminar imagen de Cloudinary:', cloudinaryError);
                // Continuamos con la eliminación del post aunque falle la eliminación de la imagen
            }
        }
        
        // 4. Finalmente, eliminar el post
        await deleteDoc(postRef);
        
        res.json({
            success: true,
            message: 'Post eliminado correctamente'
        });
    } catch (error) {
        console.error('Error al eliminar post:', error);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar el post'
        });
    }
});

// Fijar/desfijar un post (solo para administradores)
router.post('/:id/pin', isAuthenticated, async (req, res) => {
    try {
        const postId = req.params.id;
        const userId = req.session.user.uid;
        
        // Verificar si el usuario es administrador
        if (!req.session.user.isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Solo los administradores pueden fijar posts'
            });
        }
        
        // Obtener el post
        const postRef = doc(db, 'posts', postId);
        const postSnap = await getDoc(postRef);
        
        if (!postSnap.exists()) {
            return res.status(404).json({
                success: false,
                message: 'Post no encontrado'
            });
        }
        
        const postData = postSnap.data();
        const isPinned = !postData.isPinned; // Alternar estado
        
        // Actualizar el post
        await updateDoc(postRef, {
            isPinned: isPinned,
            updatedAt: new Date()
        });
        
        res.json({
            success: true,
            isPinned: isPinned,
            message: isPinned ? 'Post fijado correctamente' : 'Post desfijado correctamente'
        });
    } catch (error) {
        console.error('Error al fijar/desfijar post:', error);
        res.status(500).json({
            success: false,
            message: 'Error al fijar/desfijar el post'
        });
    }
});

// User profile route
router.get('/user/:userId', allowAnyUser, async (req, res) => {
    try {
        const userId = req.params.userId;
        const currentUserId = req.session.user.uid;
        
        console.log('Solicitando perfil de usuario:', {
            usuarioSolicitado: userId,
            usuarioActual: currentUserId,
            esAnonimo: req.session.user.isAnonymous
        });
        
        // Si el ID de usuario solicitado es 'me', redirigir al perfil del usuario actual
        if (userId === 'me' && !req.session.user.isAnonymous) {
            return res.redirect(`/posts/user/${currentUserId}`);
        } else if (userId === 'me') {
            return res.redirect('/auth/login');
        }

        // Verificar si el perfil solicitado es de un usuario anónimo
        if (userId.startsWith('anon_')) {
            return res.status(404).render('error', {
                title: 'Perfil no disponible',
                message: 'Los perfiles anónimos no son visibles.',
                user: req.session.user
            });
        }
        
        // Obtener datos del usuario solicitado
        const userRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            console.log('Usuario no encontrado en la base de datos:', userId);
            return res.status(404).render('error', {
                title: 'Usuario no encontrado',
                message: 'El perfil que buscas no existe o ha sido eliminado.',
                user: req.session.user
            });
        }

        const userData = userSnap.data();
        
        // Asegurarse de que los datos básicos del usuario existan
        const safeUserData = {
            username: userData.username || 'Usuario',
            fullName: userData.fullName || '',
            bio: userData.bio || '',
            photoURL: userData.photoURL || null,
            role: userData.role || 'estudiante',
            isAdmin: userData.isAdmin || false,
            createdAt: userData.createdAt || new Date()
        };
        
        // Obtener posts del usuario con manejo de errores mejorado
        let userPosts = [];
        try {
            const postsQuery = query(
                collection(db, 'posts'),
                where('authorId', '==', userId)
            );
            
            const postsSnapshot = await getDocs(postsQuery);
            console.log(`Se encontraron ${postsSnapshot.size} posts para el usuario ${userId}`);
            
            // Procesar posts en paralelo para mejor rendimiento
            const postPromises = postsSnapshot.docs.map(async (doc) => {
                const postData = doc.data();
                return {
                    id: doc.id,
                    ...postData,
                    createdAt: postData.createdAt?.toDate ? postData.createdAt.toDate() : new Date(),
                    likes: postData.likes || 0,
                    commentsCount: postData.commentsCount || 0
                };
            });
            
            userPosts = await Promise.all(postPromises);
            
            // Ordenar por fecha (más reciente primero)
            userPosts.sort((a, b) => b.createdAt - a.createdAt);
            
            // Formatear fechas para la vista
            userPosts = userPosts.map(post => ({
                ...post,
                createdAt: post.createdAt.toLocaleString('es-MX', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                })
            }));
            
        } catch (postsError) {
            console.error('Error al cargar los posts del usuario:', postsError);
            // Continuar con un array vacío si hay un error
            userPosts = [];
        }

        // Check if current user is following this profile
        let isFollowing = false;
        if (currentUserId && currentUserId !== userId) {
            const followRef = doc(db, 'users', currentUserId, 'following', userId);
            const followSnap = await getDoc(followRef);
            isFollowing = followSnap.exists();
        }

        // Get followers and following count
        const followersSnap = await getDocs(collection(db, 'users', userId, 'followers'));
        const followingSnap = await getDocs(collection(db, 'users', userId, 'following'));
        
        // Calculate total likes from user's posts
        let totalLikes = 0;
        userPosts.forEach(post => {
            totalLikes += post.likes || 0; // Assuming 'likes' is the field for like count on a post object
        });

        try {
            res.render('profile', {
                title: `Perfil de ${safeUserData.username}`,
                profileUser: {
                    ...safeUserData,
                    id: userId,
                    followersCount: followersSnap.size || 0,
                    followingCount: followingSnap.size || 0,
                    postsCount: userPosts.length || 0,
                    totalLikes: totalLikes || 0
                },
                posts: userPosts || [],
                isFollowing: isFollowing,
                isOwnProfile: currentUserId === userId,
                user: req.session.user || null
            });
        } catch (renderError) {
            console.error('Error al renderizar el perfil:', renderError);
            res.status(500).render('error', {
                title: 'Error',
                message: 'Ocurrió un error al cargar el perfil',
                user: req.session.user
            });
        }

    } catch (error) {
        console.error('Error al cargar el perfil:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Ocurrió un error al cargar el perfil.'
        });
    }
});

// Follow/Unfollow user
router.post('/user/:userId/follow', isAuthenticated, async (req, res) => {
    try {
        const currentUserId = req.session.user.uid;
        const targetUserId = req.params.userId;
        
        if (currentUserId === targetUserId) {
            return res.status(400).json({ success: false, message: 'No puedes seguirte a ti mismo' });
        }

        const currentUserRef = doc(db, 'users', currentUserId);
        const targetUserRef = doc(db, 'users', targetUserId);
        
        // Check if already following
        const followRef = doc(db, 'users', currentUserId, 'following', targetUserId);
        const followSnap = await getDoc(followRef);
        
        if (followSnap.exists()) {
            // Unfollow
            await deleteDoc(followRef);
            await updateDoc(currentUserRef, {
                followingCount: increment(-1)
            });
            await updateDoc(targetUserRef, {
                followersCount: increment(-1)
            });
            return res.json({ success: true, isFollowing: false });
        } else {
            // Follow
            await setDoc(followRef, {
                followedAt: new Date()
            });
            
            // Create reverse relationship for easy querying
            const followerRef = doc(db, 'users', targetUserId, 'followers', currentUserId);
            await setDoc(followerRef, {
                followedAt: new Date()
            });
            
            await updateDoc(currentUserRef, {
                followingCount: increment(1)
            });
            await updateDoc(targetUserRef, {
                followersCount: increment(1)
            });
            
            return res.json({ success: true, isFollowing: true });
        }
    } catch (error) {
        console.error('Error al seguir/dejar de seguir:', error);
        res.status(500).json({ success: false, message: 'Error al procesar la solicitud' });
    }
});

// Ruta para dar "Me Gusta" o "No Me Gusta" a un post
router.post('/:postId/like', isAuthenticated, csrfProtection, async (req, res) => {
    try {
        const { postId } = req.params;
        const userId = req.session.user.uid;

        if (!userId) {
            return res.status(401).json({ success: false, message: 'Debes iniciar sesión para dar me gusta.' });
        }

        const postRef = doc(db, 'posts', postId);
        const likeRef = doc(db, 'posts', postId, 'likers', userId); // Documento específico del usuario que da like
        const likeDoc = await getDoc(likeRef);

        let newLikesCount;
        let isLikedNow;

        if (likeDoc.exists()) {
            // Usuario ya dio "me gusta", ahora quitarlo (unlike)
            await deleteDoc(likeRef);
            await updateDoc(postRef, {
                likesCount: increment(-1)
            });
            isLikedNow = false;
        } else {
            // Usuario no ha dado "me gusta", ahora darlo (like)
            await setDoc(likeRef, {
                likedAt: new Date() // Puedes usar serverTimestamp() de Firestore si prefieres
            });
            await updateDoc(postRef, {
                likesCount: increment(1)
            });
            isLikedNow = true;
        }
        
        // Obtener el contador actualizado para devolverlo (útil para la UI)
        const updatedPostDoc = await getDoc(postRef);
        newLikesCount = updatedPostDoc.data().likesCount;

        res.json({ success: true, isLiked: isLikedNow, likesCount: newLikesCount });

    } catch (error) {
        console.error('Error al procesar like/unlike:', error);
        res.status(500).json({ success: false, message: 'Error al procesar la solicitud de me gusta.' });
    }
});

module.exports = router;
