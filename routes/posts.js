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
        
        const page = parseInt(req.query.page) || 1;
        const cursor = req.query.cursor;
        
        let postsRef = collection(db, 'posts');
        let q;
        
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
            pinnedPosts = [];
        }
        
        try {
            if (cursor) {
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
            q = query(
                postsRef,
                orderBy('createdAt', 'desc'),
                limit(postsPerPage)
            );
        }
        
        const querySnapshot = await getDocs(q);
        
        const posts = [];
        
        if (pinnedPosts.length > 0) {
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
        
        const regularPosts = [];
        
        for (const docSnapshot of querySnapshot.docs) {
            const postData = {
                id: docSnapshot.id,
                ...docSnapshot.data(),
                createdAt: docSnapshot.data().createdAt ? new Date(docSnapshot.data().createdAt.seconds * 1000).toLocaleString() : 'Fecha desconocida'
            };
            
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
            lastVisible = docSnapshot;
        }
        
        console.log('Posts regulares con sus fotos:', regularPosts.length);
        regularPosts.forEach(p => console.log(`  - ${p.id}: ${p.authorName} -> ${p.authorPhotoURL}`));
        posts.push(...regularPosts);
        
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
router.get('/new', allowAnyUser, csrfProtection, (req, res) => {
    res.render('posts/new', {
        title: 'Crear nuevo post',
        user: req.session.user,
        oldInput: {},
        errors: [],
        csrfToken: req.csrfToken()
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
        
        if (req.file) {
            postData.mediaUrl = req.file.path;
            postData.public_id = req.file.filename;
            postData.fileMimetype = req.file.mimetype;

            if (req.file.mimetype.startsWith('image')) {
                postData.mediaType = 'image';
            } else if (req.file.mimetype.startsWith('video')) {
                postData.mediaType = 'video';
                if (req.file.eager && req.file.eager.length > 0) {
                    const posterTransformation = req.file.eager.find(e => e.format === 'jpg');
                    if (posterTransformation) {
                        postData.thumbnailUrl = posterTransformation.secure_url || posterTransformation.url;
                    }
                }
            }
        }
        
        const docRef = await addDoc(collection(db, 'posts'), postData);
        
        res.redirect(`/posts/${docRef.id}`);
    } catch (error) {
        console.error('Error al crear post:', error);
        res.render('posts/new', {
            title: 'Crear nuevo post',
            error: 'Error al crear el post: ' + (error.message || error.toString()),
            oldInput: req.body,
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
        
        try {
            await updateDoc(postRef, {
                views: increment(1)
            });
            console.log('👀 Contador de vistas incrementado');
        } catch (viewError) {
            console.error('⚠️ Error al incrementar vistas (continuando):', viewError);
        }
        
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
        
        console.log('💬 Obteniendo comentarios para el post ID:', postId);
        const commentsRef = collection(db, 'comments');
        const commentsQuery = query(
            commentsRef,
            where('postId', '==', postId),
            orderBy('createdAt', 'asc')
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
            
            const commentPromises = commentsSnapshot.docs.map(async (commentDoc) => {
                const commentData = {
                    id: commentDoc.id,
                    ...commentDoc.data(),
                    createdAt: commentDoc.data().createdAt ? commentDoc.data().createdAt.toDate() : new Date()
                };
                
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
            
            const processedComments = await Promise.all(commentPromises);
            
            function nestComments(commentList) {
                const commentMap = {};
                commentList.forEach(comment => {
                    commentMap[comment.id] = { ...comment, children: [] };
                });

                const nestedComments = [];
                commentList.forEach(comment => {
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
            comments.push(...nestedComments);
            
        } catch (error) {
            console.error('❌ Error al obtener comentarios:', error);
        }
        
        console.log('🎉 Todo listo, renderizando vista...');
        console.log('📦 Pasando a la plantilla:', { post: postData, comments: comments, user: req.session.user, csrfToken: req.csrfToken() });
        res.render('posts/show', {
            title: postData.title || 'Ver post',
            post: postData,
            comments,
            user: req.session.user || null,
            csrfToken: req.csrfToken()
        });
        
    } catch (error) {
        console.error('❌ Error crítico al obtener el post:', error);
        
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

// Eliminar un post
router.delete('/:id', isAuthenticated, async (req, res) => {
    try {
        const postId = req.params.id;
        const userId = req.session.user.uid;
        const isAdmin = req.session.user.isAdmin || false;
        
        const postRef = doc(db, 'posts', postId);
        const postSnap = await getDoc(postRef);
        
        if (!postSnap.exists()) {
            return res.status(404).json({
                success: false,
                message: 'Post no encontrado'
            });
        }
        
        const postData = postSnap.data();
        
        if (userId !== postData.authorId && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'No tienes permiso para eliminar este post'
            });
        }
        
        const commentsRef = collection(db, 'comments');
        const commentsQuery = query(commentsRef, where('postId', '==', postId));
        const commentsSnap = await getDocs(commentsQuery);
        
        const commentDeletePromises = [];
        commentsSnap.forEach(commentDoc => {
            commentDeletePromises.push(deleteDoc(doc(db, 'comments', commentDoc.id)));
        });
        
        await Promise.all(commentDeletePromises);
        
        const likesRef = collection(db, 'likes');
        const likesQuery = query(likesRef, where('postId', '==', postId));
        const likesSnap = await getDocs(likesQuery);
        
        const likeDeletePromises = [];
        likesSnap.forEach(likeDoc => {
            likeDeletePromises.push(deleteDoc(doc(db, 'likes', likeDoc.id)));
        });
        
        await Promise.all(likeDeletePromises);
        
        if (postData.imageUrl) {
            try {
                const urlParts = postData.imageUrl.split('/');
                const filenameWithExtension = urlParts[urlParts.length - 1];
                const publicId = `cetisgram_posts/${filenameWithExtension.split('.')[0]}`;
                
                console.log('Intentando eliminar imagen de Cloudinary:', publicId);
                
                await cloudinary.uploader.destroy(publicId, { invalidate: true });
                console.log('Imagen eliminada de Cloudinary con éxito');
            } catch (cloudinaryError) {
                console.error('Error al eliminar imagen de Cloudinary:', cloudinaryError);
            }
        }
        
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

// Fijar/desfijar un post
router.post('/:id/pin', isAuthenticated, async (req, res) => {
    try {
        const postId = req.params.id;
        const userId = req.session.user.uid;
        
        if (!req.session.user.isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Solo los administradores pueden fijar posts'
            });
        }
        
        const postRef = doc(db, 'posts', postId);
        const postSnap = await getDoc(postRef);
        
        if (!postSnap.exists()) {
            return res.status(404).json({
                success: false,
                message: 'Post no encontrado'
            });
        }
        
        const postData = postSnap.data();
        const isPinned = !postData.isPinned;
        
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

// ##################################################################
// #               INICIO DE LA RUTA CORREGIDA                      #
// ##################################################################

router.get('/user/:userId', allowAnyUser, async (req, res) => {
    try {
        const userId = req.params.userId;
        
        // --- INICIO DE LA CORRECCIÓN ---
        // Comprobación defensiva: si hay usuario en sesión, obtenemos sus datos.
        // Si no, usamos 'null' o 'false' como valores por defecto.
        const currentUser = req.session.user || null;
        const currentUserId = currentUser ? currentUser.uid : null;
        const isCurrentUserAnonymous = currentUser ? currentUser.isAnonymous : true; // Asumimos anónimo si no hay sesión
        // --- FIN DE LA CORRECCIÓN ---
        
        console.log('Solicitando perfil de usuario:', {
            usuarioSolicitado: userId,
            usuarioActual: currentUserId,
            esAnonimo: isCurrentUserAnonymous
        });
        
        if (userId === 'me' && currentUser && !isCurrentUserAnonymous) {
            return res.redirect(`/posts/user/${currentUserId}`);
        } else if (userId === 'me') {
            return res.redirect('/auth/login');
        }

        if (userId.startsWith('anon_')) {
            return res.status(404).render('error', {
                title: 'Perfil no disponible',
                message: 'Los perfiles anónimos no son visibles.',
                user: currentUser
            });
        }
        
        const userRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            return res.status(404).render('error', {
                title: 'Usuario no encontrado',
                message: 'El perfil que buscas no existe o ha sido eliminado.',
                user: currentUser
            });
        }

        const userData = userSnap.data();
        const safeUserData = {
            username: userData.username || 'Usuario',
            fullName: userData.fullName || '',
            bio: userData.bio || '',
            photoURL: userData.photoURL || null,
            role: userData.role || 'estudiante',
            isAdmin: userData.isAdmin || false,
            createdAt: userData.createdAt || new Date()
        };
        
        let userPosts = [];
        try {
            const postsQuery = query(collection(db, 'posts'), where('authorId', '==', userId));
            const postsSnapshot = await getDocs(postsQuery);
            console.log(`Se encontraron ${postsSnapshot.size} posts para el usuario ${userId}`);
            
            const postPromises = postsSnapshot.docs.map(async (docSnap) => {
                const postData = docSnap.data();
                return {
                    id: docSnap.id,
                    ...postData,
                    createdAt: postData.createdAt?.toDate ? postData.createdAt.toDate() : new Date(),
                    likes: postData.likes || 0,
                    commentsCount: postData.commentsCount || 0
                };
            });
            userPosts = await Promise.all(postPromises);
            userPosts.sort((a, b) => b.createdAt - a.createdAt);
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
            userPosts = [];
        }

        let isFollowing = false;
        if (currentUserId && currentUserId !== userId) {
            const followRef = doc(db, 'users', currentUserId, 'following', userId);
            const followSnap = await getDoc(followRef);
            isFollowing = followSnap.exists();
        }

        const followersSnap = await getDocs(collection(db, 'users', userId, 'followers'));
        const followingSnap = await getDocs(collection(db, 'users', userId, 'following'));
        
        let totalLikes = 0;
        userPosts.forEach(post => {
            totalLikes += post.likes || 0;
        });

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
            user: currentUser
        });

    } catch (error) {
        console.error('Error al cargar el perfil:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Ocurrió un error al cargar el perfil.'
        });
    }
});

// ##################################################################
// #                  FIN DE LA RUTA CORREGIDA                      #
// ##################################################################

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
        
        const followRef = doc(db, 'users', currentUserId, 'following', targetUserId);
        const followSnap = await getDoc(followRef);
        
        if (followSnap.exists()) {
            await deleteDoc(followRef);
            await updateDoc(currentUserRef, {
                followingCount: increment(-1)
            });
            await updateDoc(targetUserRef, {
                followersCount: increment(-1)
            });
            return res.json({ success: true, isFollowing: false });
        } else {
            await setDoc(followRef, {
                followedAt: new Date()
            });
            
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
        const likeRef = doc(db, 'posts', postId, 'likers', userId);
        const likeDoc = await getDoc(likeRef);

        let newLikesCount;
        let isLikedNow;

        if (likeDoc.exists()) {
            await deleteDoc(likeRef);
            await updateDoc(postRef, {
                likesCount: increment(-1)
            });
            isLikedNow = false;
        } else {
            await setDoc(likeRef, {
                likedAt: new Date()
            });
            await updateDoc(postRef, {
                likesCount: increment(1)
            });
            isLikedNow = true;
        }
        
        const updatedPostDoc = await getDoc(postRef);
        newLikesCount = updatedPostDoc.data().likesCount;

        res.json({ success: true, isLiked: isLikedNow, likesCount: newLikesCount });

    } catch (error) {
        console.error('Error al procesar like/unlike:', error);
        res.status(500).json({ success: false, message: 'Error al procesar la solicitud de me gusta.' });
    }
});

// Ruta para eliminar un post
router.post('/:id/delete', isAuthenticated, csrfProtection, async (req, res) => {
    const postId = req.params.id;
    const userId = req.session.user.uid;
    const isAdminUser = req.session.user.isAdmin;

    try {
        const postRef = doc(db, 'posts', postId);
        const postSnap = await getDoc(postRef);

        if (!postSnap.exists()) {
            req.flash('error', 'Post no encontrado.');
            return res.redirect('/');
        }

        const postData = postSnap.data();

        if (postData.authorId !== userId && !isAdminUser) {
            req.flash('error', 'No tienes permiso para eliminar este post.');
            return res.redirect(`/posts/${postId}`);
        }

        if (postData.public_id) {
            let resource_type = 'image';
            if (postData.mediaType === 'video') {
                resource_type = 'video';
            }
            await cloudinary.uploader.destroy(postData.public_id, { resource_type: resource_type });
            console.log(`Media ${postData.public_id} eliminada de Cloudinary.`);
        }

        await deleteDoc(postRef);
        console.log(`Post ${postId} eliminado de Firestore.`);

        const likersCollectionRef = collection(db, 'posts', postId, 'likers');
        const likersSnapshot = await getDocs(likersCollectionRef);
        const deleteLikersPromises = [];
        likersSnapshot.forEach((docLiker) => {
            deleteLikersPromises.push(deleteDoc(doc(db, 'posts', postId, 'likers', docLiker.id)));
        });
        await Promise.all(deleteLikersPromises);
        console.log(`Likes del post ${postId} eliminados.`);

        const commentsCollectionRef = collection(db, 'posts', postId, 'comments');
        const commentsSnapshot = await getDocs(commentsCollectionRef);
        const deleteCommentsPromises = [];
        commentsSnapshot.forEach((docComment) => {
            deleteCommentsPromises.push(deleteDoc(doc(db, 'posts', postId, 'comments', docComment.id)));
        });
        await Promise.all(deleteCommentsPromises);
        console.log(`Comentarios del post ${postId} eliminados.`);

        req.flash('success', 'Post eliminado correctamente.');
        res.redirect('/');

    } catch (error) {
        console.error('Error al eliminar post:', error);
        req.flash('error', 'Error al eliminar el post.');
        res.redirect('back');
    }
});

module.exports = router;