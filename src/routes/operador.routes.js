const express = require('express');
const router = express.Router();
const operadorController = require('../controllers/operador.controller');
const { check, validationResult } = require('express-validator');

// 🔐 Importamos tus middlewares reales con destructuración
const { verifyToken } = require('../middlewares/auth.middleware');
const { checkRole } = require('../middlewares/rol.middleware');

// 🔎 Middleware para atrapar los errores de express-validator
const validarCampos = (req, res, next) => {
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
        return res.status(400).json({ ok: false, errores: errores.mapped() });
    }
    next();
};

// ==========================================
// 🛡️ SEGURIDAD GLOBAL PARA ESTE MÓDULO
// ==========================================

// Descomenta estas dos líneas de abajo si quieres que todo el módulo de operadores 
// esté protegido y sea exclusivo para el ADMINISTRADOR:
// router.use(verifyToken);
// router.use(checkRole(['ADMINISTRADOR']));

// ==========================================
// 👥 RUTAS DEL MÓDULO OPERADORES
// ==========================================

// 0. Obtener catálogos de roles y sucursales
router.get('/catalogos', verifyToken, operadorController.obtenerCatalogosOperador);

// 1. Registrar un nuevo operador (Mantiene las validaciones de tu compañera)
router.post('/', 
    [
        //verifyToken,                       
        //checkRole(['ADMINISTRADOR']),      
        check('nombre_completo', 'El nombre es obligatorio y debe ser texto').not().isEmpty().trim().escape(),
        check('usuario_login', 'El nombre de usuario es obligatorio').not().isEmpty().trim(),
        check('password', 'La contraseña debe tener al menos 6 caracteres').isLength({ min: 6 }),
        validarCampos 
    ], 
    operadorController.crearOperador
);

// 2. Obtener la lista de operadores con filtros
router.get('/', verifyToken, operadorController.obtenerOperadores);

// 3. Obtener un operador específico por su ID
router.get('/:id', verifyToken, operadorController.obtenerOperadorPorId);

// 4. Modificar datos generales de un operador
router.put('/:id', verifyToken, operadorController.modificarOperador);

// 5. Cambiar contraseña de un operador
router.patch('/:id/password', verifyToken, operadorController.cambiarPassword);

// 6. Cambiar estado activo/inactivo
router.patch('/:id/estado', verifyToken, operadorController.cambiarEstadoOperador);

// 7. Dar de baja (Soft Delete) a un operador
router.put('/:id/desactivar', verifyToken, operadorController.desactivarOperador); 


module.exports = router;