const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
    let token = null;
    const authHeader = req.header('Authorization');

    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    } else if (req.query && req.query.token) {
        token = req.query.token;
    }

    if (!token) {
        console.log('❌ FALLÓ: No hay header Authorization ni parámetro token en query');
        return res.status(401).json({ message: "Acceso Denegado. Token requerido." });
    }

    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        req.user = verified; 
        next();
    } catch (error) {
        console.log('❌ ERROR EN VERIFICACIÓN JWT:', error.message);
        return res.status(401).json({ message: "Token inválido o expirado. Inicia sesión nuevamente." });
    }
};

module.exports = { verifyToken };