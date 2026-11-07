const express = require('express');
const router = express.Router();
const proveedorController = require('../controllers/proveedor.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
const { checkRole } = require('../middlewares/rol.middleware');

// Proteger todas las rutas con autenticación
router.use(verifyToken);

// ==================== PROVEEDORES (RUTAS ESTÁTICAS) ====================

// GET /api/proveedores - Obtener o buscar proveedores activos
router.get('/', proveedorController.obtenerProveedores);

// POST /api/proveedores - Crear nuevo proveedor
router.post('/', checkRole(['ADMINISTRADOR']), proveedorController.crearProveedor);

// ==================== IMPRESIÓN ZEBRA ====================

// POST /api/proveedores/imprimir-etiquetas - Imprimir lote de etiquetas de una compra
router.post('/imprimir-etiquetas', checkRole(['ADMINISTRADOR']), proveedorController.imprimirEtiquetas);

// POST /api/proveedores/reimprimir-etiqueta - Reimprimir etiquetas individuales por código o ID
router.post('/reimprimir-etiqueta', checkRole(['ADMINISTRADOR']), proveedorController.reimprimirEtiquetaIndividual);

// ==================== COMPRAS Y VALES ====================

// POST /api/proveedores/compras - Registrar orden de compra y sus artículos
router.post('/compras', checkRole(['ADMINISTRADOR']), proveedorController.guardarCompra);

// POST /api/proveedores/vales - Registrar vale de entrada/salida
router.post('/vales', checkRole(['ADMINISTRADOR']), proveedorController.guardarVale);

// ==================== PROVEEDORES (RUTAS DINÁMICAS :id) ====================

// PUT /api/proveedores/:id - Actualizar datos del proveedor
router.put('/:id', checkRole(['ADMINISTRADOR']), proveedorController.actualizarProveedor);

// PUT /api/proveedores/:idProveedor/desactivar - Desactivación lógica de proveedor
router.put('/:idProveedor/desactivar', checkRole(['ADMINISTRADOR']), proveedorController.desactivarProveedor);

module.exports = router;