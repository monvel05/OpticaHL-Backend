const express = require('express');
const router = express.Router();
const articuloController = require('../controllers/articulo.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
const { checkRole } = require('../middlewares/rol.middleware');
const auditLogger = require('../middlewares/audit.middleware'); 

// 1. Crear un nuevo artículo 
router.post('/', verifyToken, checkRole(['ADMINISTRADOR', 'INVENTARIO']), auditLogger, articuloController.crearArticulo);

// 2. Obtener artículos activos 
router.get('/', articuloController.obtenerArticulos);

// 3. Actualizar datos de un articulo
router.put('/:id_articulo', verifyToken, checkRole(['ADMINISTRADOR', 'INVENTARIO']), auditLogger, articuloController.actualizarArticulo); 

// 4. Eliminar (Desactivar) un artículo
router.put('/:id_articulo/desactivar', verifyToken, checkRole(['ADMINISTRADOR', 'INVENTARIO']), auditLogger, articuloController.desactivarArticulo);

// 5. Ajustar stock rápidamente (Spinner) 
router.put('/:id_articulo/stock', verifyToken, checkRole(['ADMINISTRADOR', 'INVENTARIO']), auditLogger, articuloController.actualizarStock);

module.exports = router;