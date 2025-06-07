// middleware/authMiddleware.js

const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user && !req.session.user.isAnonymous) {
        return next();
    }
    // Si no hay sesión de usuario autenticado, manejar según el tipo de request
    if (req.accepts('json')) {
        // Para requests AJAX, enviar error JSON
        return res.status(401).json({ success: false, message: 'Authentication required. Please log in.' });
    } else {
        // Para requests de navegador, redirigir al login
        req.flash('error_msg', 'Por favor, inicia sesión para ver este recurso.');
        return res.redirect('/auth/login');
    }
};

const isAdmin = (req, res, next) => {
    if (req.session && req.session.user && req.session.user.isAdmin) {
        return next();
    }
    req.flash('error_msg', 'No tienes permisos de administrador para acceder a este recurso.');
    // Redirigir a la home o a una página de no autorizado, o enviar error si es AJAX
    if (req.accepts('json')) {
        return res.status(403).json({ success: false, message: 'Forbidden. Administrator access required.' });
    } else {
        return res.redirect('/');
    }
};

const allowAnyUser = (req, res, next) => {
    // Si es usuario autenticado o anónimo con sesión, permitir
    if (req.session && req.session.user) {
        return next();
    }
    // Si no hay sesión, crear una sesión anónima (reincorporando lógica previa)
    const anonymousId = 'anon_' + Math.random().toString(36).substring(2, 15);
    req.session.user = {
        uid: anonymousId,
        isAnonymous: true,
        username: 'Anónimo_' + anonymousId.substring(5, 10),
        role: 'estudiante', // Rol por defecto para usuarios anónimos
        isAdmin: false
    };
    return next();
};

module.exports = {
    isAuthenticated,
    isAdmin,
    allowAnyUser
};
