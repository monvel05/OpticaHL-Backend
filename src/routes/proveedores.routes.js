const express = require('express');
const router = express.Router();
const proveedoresController = require('../controllers/proveedores.controller');

// Obtener todos los proveedores activos
router.get('/', proveedoresController.obtenerProveedores);

// Crear un nuevo proveedor
router.post('/', proveedoresController.crearProveedor);

// Desactivar un proveedor (Soft Delete)
router.put('/:idProveedor/desactivar', proveedoresController.desactivarProveedor);

module.exports = router;