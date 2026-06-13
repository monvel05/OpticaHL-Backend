const checkRole = (rolesPermitidos) => {
    return (req, res, next) => {
        // 1. Validar que la información del token exista en la petición
        if (!req.user || !req.user.roles) {
            return res.status(403).json({ message: "Acceso denegado. Permisos no encontrados en la sesión." });
        }

        // 2. Forzar a que userRoles siempre sea un Arreglo (por si el JWT lo guardó como String plano)
        const userRoles = Array.isArray(req.user.roles) ? req.user.roles : [req.user.roles]; 

        // 3. Normalizar todo a Mayúsculas y limpiar espacios para evitar fallos de dedo
        const rolesUsuarioNormalizados = userRoles.map(rol => rol.toUpperCase().trim());
        const rolesRutaNormalizados = rolesPermitidos.map(rol => rol.toUpperCase().trim());

        // 4. Evaluar si existe coincidencia
        const tienePermiso = rolesUsuarioNormalizados.some(rol => rolesRutaNormalizados.includes(rol));

        if (!tienePermiso) {
            return res.status(403).json({ message: "Acceso denegado. No tienes los permisos necesarios para esta acción." });
        }

        next();
    };
};

module.exports = { checkRole };