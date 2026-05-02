const express = require('express');
const router = express.Router();
const proveedorController = require('../controllers/proveedor.controller');
const verifyToken = require('../middlewares/auth.middleware');
const checkRole = require('../middlewares/rol.middleware');

router.use(verifyToken);

// Obtener todos los proveedores activos
router.get('/', proveedorController.obtenerProveedores);

// Crear un nuevo proveedor
router.post('/', checkRole(['ADMINISTRADOR']), proveedorController.crearProveedor);

// Desactivar un proveedor (Soft Delete)
router.put('/:idProveedor/desactivar', checkRole(['ADMINISTRADOR']), proveedorController.desactivarProveedor);

module.exports = router;