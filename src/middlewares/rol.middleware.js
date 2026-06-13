const checkRole = (rolesPermitidos) => {
    return (req, res, next) => {
        // req.user debe ser inyectado previamente por el middleware de autenticación (auth.middleware)
        if (!req.user || !req.user.rol) {
            return res.status(401).json({ 
                ok: false, 
                msg: 'No autenticado o token no válido' 
            });
        }

        const rolUsuario = req.user.rol;

        // Verificar si el rol del usuario está dentro de los permitidos
        if (!rolesPermitidos.includes(rolUsuario)) {
            return res.status(403).json({ 
                ok: false, 
                msg: `Acceso denegado. Se requiere uno de los siguientes roles: ${rolesPermitidos.join(', ')}` 
            });
        }

        next();
    };
};

module.exports = { checkRole };