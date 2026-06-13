const express = require('express');
const router = express.Router();
const operadorController = require('../controllers/operador.controller');
const { check, validationResult } = require('express-validator');

// Importamos los middlewares con destructuración
const {verifyToken} = require('../middlewares/auth.middleware');
const {checkRole} = require('../middlewares/rol.middleware');

// Middleware para atrapar los errores de validación
const validarCampos = (req, res, next) => {
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
        return res.status(400).json({ ok: false, errores: errores.mapped() });
    }
    next();
};


// Protegemos todas las rutas de este módulo exigiendo un JWT válido
//router.use(verifyToken);

// Solo ADMINISTRADOR puede gestionar operadores (Verificar políticas de la empresa si otro rol debe tener acceso)
//router.use(checkRole(['ADMINISTRADOR']));

// Rutas
router.post('/', 
    [
        authMiddleware,
        verificarRol(['Administrador']),
        check('nombre', 'El nombre es obligatorio y debe ser texto').not().isEmpty().trim().escape(),
        check('correo', 'Debe ser un correo válido').isEmail().normalizeEmail(),
        check('password', 'La contraseña debe tener al menos 6 caracteres').isLength({ min: 6 }),
        check('rol', 'El rol no es válido').isIn(['Administrador', 'Vendedor', 'Cajero', 'Contador', 'Inventario', 'Optometrista']),
        validarCampos 
    ], 
    operadorController.crearOperador
);
router.get('/', operadorController.obtenerOperadores);
router.get('/:id', operadorController.obtenerOperadorPorId);
router.put('/:id', operadorController.modificarOperador);
router.patch('/:id/password', operadorController.cambiarPassword);
router.put('/:id/desactivar', operadorController.desactivarOperador); // Soft delete

module.exports = router;