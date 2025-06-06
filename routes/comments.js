const express = require('express');
const router = express.Router();
const allCloudinaryExports = require('../config/cloudinary');

console.log('--- DEBUGGING routes/comments.js ---');
console.log('Imported from ../config/cloudinary:', allCloudinaryExports);
if (allCloudinaryExports) {
    console.log('Keys in imported object:', Object.keys(allCloudinaryExports));
    console.log('typeof allCloudinaryExports.uploadCommentMedia:', typeof allCloudinaryExports.uploadCommentMedia);
    if (typeof allCloudinaryExports.uploadCommentMedia === 'function') {
        console.log('uploadCommentMedia itself has keys (should include .single, .array etc.):', Object.keys(allCloudinaryExports.uploadCommentMedia));
    } else if (allCloudinaryExports.uploadCommentMedia) {
        console.log('uploadCommentMedia is not a function, but exists. Keys:', Object.keys(allCloudinaryExports.uploadCommentMedia));
    } else {
        console.log('allCloudinaryExports.uploadCommentMedia is undefined or null.');
    }
} else {
    console.log('../config/cloudinary was imported as undefined/null itself.');
}
console.log('--- END DEBUGGING ---');

const { uploadCommentMedia } = allCloudinaryExports; // Attempt destructuring after logging. If allCloudinaryExports is undefined, this will also error.
const { db } = require('../config/firebase');
const { 
    collection, doc, addDoc, getDoc, 
    updateDoc, deleteDoc, query, where, increment, serverTimestamp 
} = require('firebase/firestore');

// Middleware que permite tanto a usuarios autenticados como anónimos
const allowAnyUser = (req, res, next) => {
    // Si no hay usuario en sesión, crear uno anónimo
    if (!req.session.user) {
        const anonymousId = 'anon_' + Math.random().toString(36).substring(2, 15);
        req.session.user = {
            uid: anonymousId,
            isAnonymous: true,
            username: 'Anónimo_' + anonymousId.substring(5, 10),
            role: 'estudiante',
            isAdmin: false
        };
        console.log('Nuevo usuario anónimo creado en middleware de comentarios:', req.session.user.uid);
    }
    next();
};

// Middleware para verificar autenticación (solo usuarios registrados)
const isAuthenticated = (req, res, next) => {
    if (req.session.user && !req.session.user.isAnonymous) {
        return next();
    }
    res.status(401).json({ 
        success: false, 
        message: 'Debes iniciar sesión para realizar esta acción' 
    });
};

// Agregar un comentario a un post (permite usuarios anónimos)
router.post('/new', allowAnyUser, uploadCommentMedia.single('commentMedia'), async (req, res) => {
    try {
        console.log('Recibiendo solicitud de comentario:', req.body);
        const { postId, content, parentId } = req.body; // _csrf removed, parentId added
        
        // CSRF token is now expected to be validated by the global csurf middleware
        
        if (!postId || !content) {
            console.error('Faltan datos:', { postId, content });
            return res.status(400).json({ 
                success: false, 
                message: 'El ID del post y contenido son obligatorios' 
            });
        }
        
        console.log('Sesión actual:', req.session);
        
        console.log('🔍 Verificando existencia del post ID:', postId);
        const postRef = doc(db, 'posts', postId);
        const postSnap = await getDoc(postRef);
        
        if (!postSnap.exists()) {
            console.error('❌ Post no encontrado con ID:', postId);
            return res.status(404).json({ 
                success: false, 
                message: 'Post no encontrado' 
            });
        }
        
        console.log('✅ Post encontrado:', postSnap.data().title);

        let depth = 0;
        let resolvedParentId = parentId || null;

        if (resolvedParentId) {
            try {
                const parentCommentRef = doc(db, 'comments', resolvedParentId);
                const parentCommentSnap = await getDoc(parentCommentRef);
                if (parentCommentSnap.exists()) {
                    const parentCommentData = parentCommentSnap.data();
                    depth = (parentCommentData.depth || 0) + 1;
                } else {
                    console.warn(`Parent comment with ID ${resolvedParentId} not found. Creating as top-level comment.`);
                    resolvedParentId = null; // Tratar como comentario de nivel superior
                }
            } catch (error) {
                console.error(`Error fetching parent comment ${resolvedParentId}:`, error);
                // Decidir si fallar o tratar como top-level. Por ahora, top-level.
                resolvedParentId = null;
                depth = 0;
            }
        }

        // Datos para el comentario
        let commentData = {
            postId: postId, 
            content: content.trim(),
            createdAt: serverTimestamp(), // Usar serverTimestamp para Firestore
            likes: 0,
            edited: false,
            parentId: resolvedParentId,
            depth: depth
        };

        if (req.file) {
            console.log('Archivo de comentario recibido:', req.file);
            commentData.mediaUrl = req.file.path; 
            commentData.mediaType = 'image'; 
            commentData.mediaPublicId = req.file.filename; // Para posible eliminación futura de Cloudinary
        }
        
        console.log('📝 Datos del comentario a guardar:', commentData);
        
        // Usar la información de la sesión (ya sea autenticada o anónima)
        commentData = {
            ...commentData,
            authorId: req.session.user.uid,
            authorName: req.session.user.username || 'Usuario',
            authorPhotoURL: req.session.user.photoURL || null,
            isAnonymous: req.session.user.isAnonymous || false
        };
        
        console.log('Información del autor del comentario:', {
            authorId: commentData.authorId,
            authorName: commentData.authorName,
            isAnonymous: commentData.isAnonymous
        });
        
        try {
            // Guardar el comentario en Firestore
            console.log('💾 Guardando comentario en Firestore...');
            const commentRef = await addDoc(collection(db, 'comments'), commentData);
            console.log('✅ Comentario guardado con ID:', commentRef.id);
            
            // Actualizar el contador de comentarios en el post
            console.log('🔄 Actualizando contador de comentarios...');
            const postUpdateRef = doc(db, 'posts', postId);
            await updateDoc(postUpdateRef, {
                commentsCount: increment(1),
                updatedAt: new Date()
            });
            console.log('✅ Contador de comentarios actualizado');
            
            // Construir el objeto de comentario para la respuesta
            const finalCommentDataForResponse = {
                id: commentRef.id,
                postId: commentData.postId,
                content: commentData.content,
                authorId: req.session.user.uid,
                authorName: req.session.user.username || 'Usuario',
                authorPhotoURL: req.session.user.photoURL || null,
                isAnonymous: req.session.user.isAnonymous || false,
                likes: commentData.likes,
                edited: commentData.edited,
                parentId: commentData.parentId,
                depth: commentData.depth,
                createdAt: new Date().toLocaleString('es-MX', { // Hora actual formateada para la respuesta inmediata
                    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                })
            };

            if (req.file) {
                finalCommentDataForResponse.mediaUrl = req.file.path;
                finalCommentDataForResponse.mediaType = 'image';
            }
            
            console.log('✅ Comentario listo para enviar como respuesta:', finalCommentDataForResponse);
            // Devolver respuesta exitosa
            res.json({ 
                success: true, 
                comment: finalCommentDataForResponse
            });
            
        } catch (error) {
            console.error('Error al guardar el comentario:', error);
            throw new Error('Error al guardar el comentario en la base de datos');
        }
    } catch (error) {
        console.error('Error al crear comentario:', error);
        
        if (req.xhr) {
            res.status(500).json({ 
                success: false, 
                message: 'Error al crear el comentario' 
            });
        } else {
            res.status(500).render('error', {
                title: 'Error',
                message: 'Error al crear el comentario',
                error
            });
        }
    }
});

// Eliminar un comentario
router.delete('/:id', isAuthenticated, async (req, res) => {
    try {
        const commentId = req.params.id;
        const commentRef = doc(db, 'comments', commentId);
        const commentSnap = await getDoc(commentRef);
        
        if (!commentSnap.exists()) {
            return res.status(404).json({ 
                success: false, 
                message: 'Comentario no encontrado' 
            });
        }
        
        const commentData = commentSnap.data();
        
        // Verificar que el usuario sea el autor o tenga permisos
        if (req.session.user.uid !== commentData.authorId && !req.session.user.isAdmin) {
            return res.status(403).json({ 
                success: false, 
                message: 'No tienes permiso para eliminar este comentario' 
            });
        }
        
        // Eliminar el comentario
        await deleteDoc(commentRef);

        // Actualizar el contador de comentarios en el post
        const postRef = doc(db, 'posts', commentData.postId);
        await updateDoc(postRef, {
            commentsCount: increment(-1),
            updatedAt: new Date()
        });
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error al eliminar comentario:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error al eliminar el comentario' 
        });
    }
});

// Editar un comentario
router.put('/:id', isAuthenticated, async (req, res) => {
    try {
        const commentId = req.params.id;
        const { content } = req.body;
        
        if (!content) {
            return res.status(400).json({ 
                success: false, 
                message: 'El contenido es obligatorio' 
            });
        }
        
        const commentRef = doc(db, 'comments', commentId);
        const commentSnap = await getDoc(commentRef);
        
        if (!commentSnap.exists()) {
            return res.status(404).json({ 
                success: false, 
                message: 'Comentario no encontrado' 
            });
        }
        
        const commentData = commentSnap.data();
        
        // Verificar que el usuario sea el autor
        if (req.session.user.uid !== commentData.authorId) {
            return res.status(403).json({ 
                success: false, 
                message: 'No tienes permiso para editar este comentario' 
            });
        }
        
        // Actualizar el comentario
        await updateDoc(commentRef, {
            content,
            updatedAt: new Date(),
            edited: true
        });
        
        res.json({ 
            success: true,
            message: 'Comentario actualizado correctamente'
        });
    } catch (error) {
        console.error('Error al editar comentario:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error al editar el comentario' 
        });
    }
});

module.exports = router;
