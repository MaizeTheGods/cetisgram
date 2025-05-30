const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { 
    collection, doc, addDoc, getDoc, 
    updateDoc, deleteDoc, query, where 
} = require('firebase/firestore');

// Middleware para verificar autenticación
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    }
    res.redirect('/auth/login');
};

// Agregar un comentario a un post
router.post('/new', async (req, res) => {
    try {
        console.log('Recibiendo solicitud de comentario:', req.body);
        const { postId, content } = req.body;
        
        if (!postId || !content) {
            console.error('Faltan datos:', { postId, content });
            // Siempre devolver JSON ya que estamos usando AJAX
            return res.status(400).json({ 
                success: false, 
                message: 'El ID del post y contenido son obligatorios' 
            });
        }
        
        console.log('Sesión actual:', req.session);
        
        // Verificar que el post exista
        const postRef = doc(db, 'posts', postId);
        const postSnap = await getDoc(postRef);
        
        if (!postSnap.exists()) {
            return res.status(404).json({ 
                success: false, 
                message: 'Post no encontrado' 
            });
        }

        // Datos para el comentario
        let commentData = {
            postId,
            content,
            createdAt: new Date()
        };
        
        // Si el usuario está autenticado, agregar su información
        if (req.session.user) {
            commentData = {
                ...commentData,
                authorId: req.session.user.uid,
                authorName: req.session.user.username,
                isAnonymous: req.session.user.isAnonymous || false
            };
        } else {
            // Comentario anónimo
            const anonymousId = 'anon_' + Math.random().toString(36).substring(2, 15);
            commentData = {
                ...commentData,
                authorId: anonymousId,
                authorName: 'Anónimo_' + anonymousId.substring(5, 10),
                isAnonymous: true
            };
        }
        
        // Guardar el comentario en Firestore
        const commentRef = await addDoc(collection(db, 'comments'), commentData);
        
        // Siempre devolver JSON ya que estamos usando AJAX
        res.json({ 
            success: true, 
            comment: {
                id: commentRef.id,
                ...commentData,
                createdAt: commentData.createdAt.toLocaleString()
            }
        });
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
