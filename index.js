require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc } = require('firebase/firestore');
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
app.use(session({
    secret: process.env.SESSION_SECRET || 'cetisgram-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { 
        // En Render.com, necesitamos permitir cookies sin HTTPS para desarrollo
        secure: false, 
        maxAge: 3600000, // 1 hora
        httpOnly: true,
        sameSite: 'lax'
    }
}));

// Middleware para hacer que el usuario esté disponible en todas las vistas
app.use(async (req, res, next) => {
    try {
        // Si hay un usuario en sesión, asegurarse de tener la información más reciente
        if (req.session.user && req.session.user.uid) {
            const userDoc = await getDoc(doc(db, 'users', req.session.user.uid));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                req.user = {
                    ...req.session.user,
                    photoURL: userData.photoURL || null,
                    username: userData.username || req.session.user.username,
                    role: userData.role || req.session.user.role,
                    isAdmin: (userData.role === 'admin') || req.session.user.isAdmin
                };
                // Actualizar la sesión con los datos más recientes
                req.session.user = req.user;
            }
        }
        // Hacer que el usuario esté disponible en todas las vistas
        res.locals.user = req.session.user || null;
        next();
    } catch (error) {
        console.error('Error en middleware de usuario:', error);
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
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor iniciado en http://localhost:${PORT}`);
});
