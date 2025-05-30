require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const app = express();

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

// Para propósitos de depuración
app.use((req, res, next) => {
    console.log('Sesión:', req.session);
    console.log('Usuario en sesión:', req.session.user);
    next();
});

// Configuración de EJS como motor de plantillas
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Importar rutas
const indexRoutes = require('./routes/index');
const authRoutes = require('./routes/auth');
const postsRoutes = require('./routes/posts');
const commentsRoutes = require('./routes/comments');

// Utilizar rutas
app.use('/', indexRoutes);
app.use('/auth', authRoutes);
app.use('/posts', postsRoutes);
app.use('/comments', commentsRoutes);

// Middleware para manejar errores 404
app.use((req, res) => {
    res.status(404).render('404', { title: 'Página no encontrada' });
});

// Puerto del servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor iniciado en http://localhost:${PORT}`);
});
