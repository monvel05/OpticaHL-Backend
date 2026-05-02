const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
    const authHeader = req.header('Authorization');
    
    // Validar existencia y formato del token
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: "Acceso Denegado. Token requerido." });
    }

    const token = authHeader.split(" ")[1];

    try {
        // Desencriptar el token usando el secreto
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        
        // Inyectar el payload en el request
        // req.user ahora contiene { id_operador, nombre, roles, sucursal }
        req.user = verified; 
        
        next(); // Continuar a la ruta solicitada
    } catch (error) {
        res.status(401).json({ message: "Token inválido o expirado. Inicia sesión nuevamente." });
    }
};

module.exports =  verifyToken;