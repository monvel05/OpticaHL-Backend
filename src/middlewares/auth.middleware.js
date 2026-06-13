const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
    const authHeader = req.header('Authorization');
    
    // 🔍 CHISMOSO 1: Ver si el backend recibe el encabezado
    console.log('============= BACKEND AUTH VERIFICATION =============');
    console.log('1. ¿Llegó el encabezado Authorization?:', authHeader ? 'SÍ' : 'NO');
    console.log('   Valor recibido:', authHeader);

    // Validar existencia y formato del token
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('❌ FALLÓ: No hay header o no empieza con "Bearer "');
        return res.status(401).json({ message: "Acceso Denegado. Token requerido." });
    }

    const token = authHeader.split(" ")[1];

    try {
        // Desencriptar el token usando el secreto
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        
        // 🔍 CHISMOSO 2: Ver qué datos reales vienen dentro de tu JWT decodificado
        console.log('2. ✅ Token verificado con éxito por JWT.');
        console.log('3. Contenido del payload decodificado (req.user):', verified);
        console.log('=====================================================');
        
        // Inyectar el payload en el request
        req.user = verified; 
        
        next(); // Continuar a la ruta solicitada
    } catch (error) {
        console.log('❌ ERROR EN VERIFICACIÓN JWT:', error.message);
        console.log('=====================================================');
        return res.status(401).json({ message: "Token inválido o expirado. Inicia sesión nuevamente." });
    }
};

module.exports = { verifyToken };