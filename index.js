require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc } = require('firebase/firestore');
const csrf = require('csurf');
const app = express();

// Inicializar Firebase
const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID
};

// Inicializar Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// Configuración de middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Configuración de sesión mejorada
const sessionConfig = {
    secret: process.env.SESSION_SECRET || 'cetisgram-secret-key-12345',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production', // Usar solo en producción con HTTPS
        maxAge: 24 * 60 * 60 * 1000, // 24 horas
        httpOnly: true,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        domain: process.env.NODE_ENV === 'production' ? '.cetisgram.onrender.com' : undefined
    },
    // Usar store en producción (puedes implementar connect-redis para mejor escalabilidad)
    store: process.env.NODE_ENV === 'production' ? new (require('memorystore')(session))({ 
        checkPeriod: 86400000 // Limpiar entradas expiradas cada 24h
    }) : null
};

// Configurar proxy de confianza si está detrás de un proxy (como en Render.com)
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
    sessionConfig.cookie.secure = true;
}

app.use(session(sessionConfig));

// Protección CSRF
// Nota: csurf debe ir DESPUÉS de session y cookieParser
// y DESPUÉS de express.urlencoded para formularios, o express.json para JSON.
const csrfProtection = csrf({ cookie: true }); // Puedes configurar 'cookie: false' si prefieres tokens en sesión.
app.use(csrfProtection);

// Middleware para hacer el token CSRF disponible en todas las vistas
app.use((req, res, next) => {
    res.locals.csrfToken = req.csrfToken();
    next();
});

// Middleware para manejo de usuarios (autenticados y anónimos)
app.use(async (req, res, next) => {
    console.log(`[SESSION_MIDDLEWARE] Iniciando para ruta: ${req.path}`);
    try {
        // Estado inicial de la sesión
        console.log('[SESSION_MIDDLEWARE] Estado inicial de req.session.user:', JSON.stringify(req.session.user));

        // // Crear usuario anónimo solo si no existe NINGÚN usuario en sesión.
        // if (typeof req.session.user === 'undefined' || req.session.user === null) {
        //     const anonymousId = 'anon_' + Math.random().toString(36).substring(2, 15);
        //     req.session.user = {
        //         uid: anonymousId,
        //         isAnonymous: true,
        //         username: 'Anónimo_' + anonymousId.substring(5, 10),
        //         role: 'estudiante', // Rol por defecto para anónimos
        //         isAdmin: false,
        //         photoURL: null // Anónimos no tienen foto
        //     };
        //     console.log('[SESSION_MIDDLEWARE] Nuevo usuario anónimo creado en sesión:', JSON.stringify(req.session.user));
        // } else {
        //     console.log('[SESSION_MIDDLEWARE] Usuario existente en sesión:', JSON.stringify(req.session.user));
        // }

        // Si el usuario en sesión es autenticado (no anónimo), intentar refrescar sus datos desde Firestore.
        if (req.session.user && req.session.user.uid && !req.session.user.isAnonymous) {
            console.log(`[SESSION_MIDDLEWARE] Usuario autenticado (${req.session.user.uid}). Intentando refrescar datos desde Firestore.`);
            try {
                const userDocRef = doc(db, 'users', req.session.user.uid);
                const userDocSnap = await getDoc(userDocRef);

                if (userDocSnap.exists()) {
                    const userDataFromDb = userDocSnap.data();
                    // Mantener datos de sesión existentes y sobreescribir/añadir con los de Firestore
                    const updatedUser = {
                        ...req.session.user, // Mantener datos base de la sesión (como CSRF si estuviera aquí)
                        uid: req.session.user.uid, // Asegurar que el UID no cambie
                        username: userDataFromDb.username || req.session.user.username, // Usar de DB, fallback a sesión
                        fullName: userDataFromDb.fullName || req.session.user.fullName || '',
                        email: userDataFromDb.email || req.session.user.email,
                        photoURL: userDataFromDb.photoURL !== undefined ? userDataFromDb.photoURL : req.session.user.photoURL,
                        role: userDataFromDb.role || req.session.user.role || 'estudiante',
                        isAdmin: (userDataFromDb.role === 'admin') || req.session.user.isAdmin || false,
                        isAnonymous: false // Asegurar que no se marque como anónimo
                    };
                    req.session.user = updatedUser;
                    console.log('[SESSION_MIDDLEWARE] Datos del usuario autenticado refrescados desde Firestore:', JSON.stringify(req.session.user));
                } else {
                    // El usuario existe en sesión pero no en Firestore (podría haber sido eliminado)
                    // En este caso, podríamos invalidar la sesión o marcarlo como anónimo.
                    // Por ahora, lo dejaremos con los datos de sesión pero registraremos el problema.
                    console.warn(`[SESSION_MIDDLEWARE] Usuario ${req.session.user.uid} en sesión no encontrado en Firestore. Se mantendrán los datos de sesión actuales.`);
                }
            } catch (dbError) {
                console.error('[SESSION_MIDDLEWARE] Error al refrescar datos del usuario desde Firestore:', dbError);
                // No se pudo conectar a Firestore o hubo un error. Continuar con los datos de sesión existentes.
                // Es importante no destruir la sesión aquí, solo loguear el error.
            }
        }

        // Asegurar que res.locals.user siempre esté disponible para las vistas.
        res.locals.user = req.session.user || null;
        if (res.locals.user) {
            console.log(`[SESSION_MIDDLEWARE] res.locals.user establecido para vistas: ${JSON.stringify(res.locals.user)}`);
        } else {
            console.log('[SESSION_MIDDLEWARE] res.locals.user es null (ningún usuario en sesión).');
        }
        
        next();
    } catch (error) {
        console.error('[SESSION_MIDDLEWARE] Error catastrófico en el middleware de sesión:', error);
        // En caso de un error grave aquí, es mejor pasar el error al manejador de errores de Express.
        next(error);
    }
});

// Para propósitos de depuración
app.use((req, res, next) => {
    console.log('Sesión:', req.session);
    console.log('Usuario en sesión:', req.session.user);
    next();
});

// Configuración de EJS como motor de plantillas
app.set('view engine', 'ejs');

// Usar ruta absoluta para las vistas (mejor compatibilidad con entornos de producción)
const viewsPath = path.resolve(__dirname, 'views');
console.log('Ruta de vistas configurada como:', viewsPath);
app.set('views', viewsPath);

// Verificar que la carpeta de vistas existe
const fs = require('fs');
if (fs.existsSync(viewsPath)) {
    console.log('✅ La carpeta de vistas existe');
    // Listar archivos en el directorio de vistas/profile para diagnóstico
    const profilePath = path.join(viewsPath, 'profile');
    if (fs.existsSync(profilePath)) {
        console.log('✅ La carpeta profile existe');
        console.log('Archivos en la carpeta profile:', fs.readdirSync(profilePath));
    } else {
        console.log('❌ ERROR: La carpeta profile NO existe');
    }
} else {
    console.log('❌ ERROR: La carpeta de vistas NO existe');
}

// Archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Importar rutas
const indexRoutes = require('./routes/index');
const authRoutes = require('./routes/auth');
const postsRoutes = require('./routes/posts');
const commentsRoutes = require('./routes/comments');
const profileRoutes = require('./routes/profile');

// Utilizar rutas
app.use('/', indexRoutes);
app.use('/auth', authRoutes);
app.use('/posts', postsRoutes);
app.use('/comments', commentsRoutes);

// Ruta para perfil con respaldo directo en caso de fallos
app.use('/profile', profileRoutes);

// Ruta de respaldo directa para el perfil en caso de problemas con el router
app.get('/perfil', (req, res) => {
    console.log('Accediendo a ruta de respaldo directa para perfil');
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    
    try {
        res.render('profile/index', {
            title: 'Mi Perfil - Cetisgram (Ruta de respaldo)',
            user: req.session.user,
            userData: req.session.user
        });
    } catch (error) {
        console.error('Error en ruta de respaldo:', error);
        res.send(`
            <h1>Perfil de Usuario (Vista de emergencia)</h1>
            <p>Nombre de usuario: ${req.session.user.username}</p>
            <p>Correo: ${req.session.user.email}</p>
            <p>Rol: ${req.session.user.role}</p>
            <p><a href="/">Volver al inicio</a></p>
        `);
    }
});

// Manejador de errores CSRF (debe ir antes de otros manejadores de error generales y 404)
app.use((err, req, res, next) => {
    if (err.code === 'EBADCSRFTOKEN') {
        console.warn('CSRF Token Inválido Detectado:', err);
        // Puedes renderizar una página de error específica o redirigir
        res.status(403).render('error', { 
            title: 'Acción Prohibida', 
            error: { message: 'Error de seguridad: Token CSRF inválido o ausente. Por favor, inténtalo de nuevo.' },
            user: req.session.user || null // Asegúrate que 'user' esté disponible para el layout
        });
    } else {
        next(err); // Pasa a otros manejadores de error si no es un error CSRF
    }
});

// Middleware para manejar errores 404
app.use((req, res) => {
    res.status(404).render('404', { title: 'Página no encontrada' });
});

// Ruta de prueba directa para diagnosticar problemas
app.get('/test-root', (req, res) => {
    console.log('Accediendo a ruta de prueba directa');
    res.send(`
        <h1>Prueba de ruta directa</h1>
        <p>Esta ruta está definida directamente en index.js</p>
        <p>Usuario en sesión: ${req.session.user ? 'Sí' : 'No'}</p>
        <p><a href="/">Volver al inicio</a></p>
    `);
});

// Puerto del servidor
const PORT = process.env.PORT || 3689;
app.listen(PORT, () => {
    console.log(`Servidor iniciado en http://localhost:${PORT}`);
});
