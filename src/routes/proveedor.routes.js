const express = require('express');
const router = express.Router();
const proveedorController = require('../controllers/proveedor.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
const { checkRole } = require('../middlewares/rol.middleware');

router.use(verifyToken);

// ==================== PROVEEDORES ====================

// GET /api/proveedores
router.get('/', proveedorController.obtenerProveedores);

// POST /api/proveedores
router.post('/', checkRole(['ADMINISTRADOR']), proveedorController.crearProveedor);

// PUT /api/proveedores/:id
router.put('/:id', checkRole(['ADMINISTRADOR']), proveedorController.actualizarProveedor);

// PUT /api/proveedores/:idProveedor/desactivar
router.put('/:idProveedor/desactivar', checkRole(['ADMINISTRADOR']), proveedorController.desactivarProveedor);

// ==================== COMPRAS Y VALES ====================

router.post('/compras', checkRole(['ADMINISTRADOR']), proveedorController.guardarCompra);
router.post('/vales', checkRole(['ADMINISTRADOR']), proveedorController.guardarVale);

module.exports = router;