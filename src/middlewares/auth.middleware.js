const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
    let token = null;
    const authHeader = req.header('Authorization');

    // Extracto de Bearer Header o Query Params
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    } else if (req.query && req.query.token) {
        token = req.query.token;
    }

    // Si no hay token, rechazamos la petición silenciosamente (sin ensuciar la consola)
    if (!token) {
        return res.status(401).json({ message: "Acceso Denegado. Token requerido." });
    }

    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        req.user = verified; 
        next();
    } catch (error) {
        // Mantenemos solo el log cuando el token sea FALSO o haya EXPIRADO para depurar intentos de hackeo o sesiones caducadas
        console.log('⚠️ TOKEN INVÁLIDO O EXPIRADO:', error.message);
        return res.status(401).json({ message: "Token inválido o expirado. Inicia sesión nuevamente." });
    }
};

module.exports = { verifyToken };