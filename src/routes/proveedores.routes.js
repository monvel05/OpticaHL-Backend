const express = require('express');
const router = express.Router();
const proveedoresController = require('../controllers/proveedores.controller');
const verifyToken = require('../middlewares/auth.middleware');
const checkRole = require('../middlewares/rol.middleware');

router.use(verifyToken);

// Obtener todos los proveedores activos
router.get('/', proveedoresController.obtenerProveedores);

// Crear un nuevo proveedor
router.post('/', checkRole(['ADMINISTRADOR']), proveedoresController.crearProveedor);

// Desactivar un proveedor (Soft Delete)
router.put('/:idProveedor/desactivar', checkRole(['ADMINISTRADOR']), proveedoresController.desactivarProveedor);

module.exports = router;