const express = require('express');
const router = express.Router();
const { auth, db } = require('../config/firebase');
const { 
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    sendPasswordResetEmail,
    onAuthStateChanged
} = require('firebase/auth');
const { doc, setDoc, getDoc } = require('firebase/firestore');

// Ruta para la página de registro
router.get('/register', (req, res) => {
    if (req.session.user) {
        return res.redirect('/');
    }
    res.render('auth/register', { 
        title: 'Registrarse en Cetisgram',
        error: null 
    });
});

// Procesar el registro
router.post('/register', async (req, res) => {
    try {
        const { email, password, username } = req.body;
        
        if (!email || !password || !username) {
            return res.render('auth/register', {
                title: 'Registrarse en Cetisgram',
                error: 'Todos los campos son obligatorios'
            });
        }

        // Crear usuario en Firebase Authentication
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // Guardar información adicional en Firestore
        await setDoc(doc(db, 'users', user.uid), {
            username: username,
            email: email,
            createdAt: new Date(),
            photoURL: null,
            role: 'estudiante'  // Rol por defecto para nuevos usuarios
        });

        // Establecer la sesión
        req.session.user = {
            uid: user.uid,
            email: user.email,
            username: username,
            role: 'estudiante', // Rol por defecto para nuevos usuarios
            isAdmin: false,
            isAnonymous: false // Marcar explícitamente como no anónimo
        };

        res.redirect('/');
    } catch (error) {
        let errorMessage = 'Error al registrarse';
        
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'Este correo ya está en uso';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'La contraseña es demasiado débil';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Correo electrónico inválido';
        }
        
        res.render('auth/register', {
            title: 'Registrarse en Cetisgram',
            error: errorMessage
        });
    }
});

// Ruta para la página de inicio de sesión
router.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/');
    }
    res.render('auth/login', { 
        title: 'Iniciar sesión en Cetisgram',
        error: null 
    });
});

// Procesar el inicio de sesión
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.render('auth/login', {
                title: 'Iniciar sesión en Cetisgram',
                error: 'Correo y contraseña son requeridos'
            });
        }

        // Iniciar sesión con Firebase Authentication
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // Obtener información adicional desde Firestore
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const userData = userDoc.data();
        
        // Establecer la sesión
        req.session.user = {
            uid: user.uid,
            email: user.email,
            username: userData.username,
            photoURL: userData.photoURL,
            role: userData.role || 'estudiante', // Asignar rol predeterminado si no existe
            isAdmin: userData.role === 'admin', // Flag para acceso rápido a permisos de admin
            isAnonymous: false // Marcar explícitamente como no anónimo
        };

        res.redirect('/');
    } catch (error) {
        let errorMessage = 'Error al iniciar sesión';
        
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            errorMessage = 'Credenciales incorrectas';
        } else if (error.code === 'auth/too-many-requests') {
            errorMessage = 'Demasiados intentos fallidos. Inténtalo más tarde';
        }
        
        res.render('auth/login', {
            title: 'Iniciar sesión en Cetisgram',
            error: errorMessage
        });
    }
});

// Iniciar sesión como anónimo
router.get('/anonymous', (req, res) => {
    // Generar ID único para usuario anónimo
    const anonymousId = 'anon_' + Math.random().toString(36).substring(2, 15);
    
    // Establecer sesión como usuario anónimo
    req.session.user = {
        uid: anonymousId,
        isAnonymous: true,
        username: 'Anónimo_' + anonymousId.substring(5, 10),
        role: 'estudiante', // Rol por defecto para usuarios anónimos
        isAdmin: false
    };
    
    res.redirect('/');
});

// Cerrar sesión
router.get('/logout', (req, res) => {
    // Cerrar sesión en Firebase Authentication (si no es anónimo)
    if (req.session.user && !req.session.user.isAnonymous) {
        signOut(auth);
    }
    
    // Destruir sesión
    req.session.destroy((err) => {
        if (err) {
            console.error('Error al cerrar sesión:', err);
        }
        res.redirect('/');
    });
});

module.exports = router;
