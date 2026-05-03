const express = require('express');
const router = express.Router();
const operadorController = require('../controllers/operador.controller');

// Importamos los middlewares con destructuración
const {verifyToken} = require('../middlewares/auth.middleware');
const {checkRole} = require('../middlewares/rol.middleware');



// Protegemos todas las rutas de este módulo exigiendo un JWT válido
//router.use(verifyToken);

// Solo ADMINISTRADOR puede gestionar operadores (Verificar políticas de la empresa si otro rol debe tener acceso)
//router.use(checkRole(['ADMINISTRADOR']));

// Rutas
router.get('/', operadorController.obtenerOperadores);
router.get('/:id', operadorController.obtenerOperadorPorId);
router.post('/', operadorController.crearOperador);
router.put('/:id', operadorController.modificarOperador);
router.patch('/:id/password', operadorController.cambiarPassword);
router.put('/:id/desactivar', operadorController.desactivarOperador); // Soft delete

module.exports = router;