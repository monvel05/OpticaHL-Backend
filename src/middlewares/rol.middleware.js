const checkRole = (rolesPermitidos) => {
    return (req, res, next) => {
        const userRoles = req.user.roles; 

        const tienePermiso = userRoles.some(rol => rolesPermitidos.includes(rol));

        if (!tienePermiso) {
            return res.status(403).json({ message: "Acceso denegado. No tienes los permisos necesarios para esta acción." });
        }

        next();
    };
};

module.exports = { checkRole };