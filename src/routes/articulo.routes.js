const express = require('express');
const router = express.Router();
const articuloController = require('../controllers/articulo.controller');
const {verifyToken} = require('../middlewares/auth.middleware');
const {checkRole} = require('../middlewares/rol.middleware');

router.use(verifyToken);

// Crear un nuevo artículo (con detalles e inventario)
router.post('/', checkRole(['ADMINISTRADOR', 'INVENTARIO']), articuloController.crearArticulo);

// Obtener artículos activos (con detalles e inventario)
router.get('/', articuloController.obtenerArticulos);

// Actualizar datos de un artículo (con detalles)
router.put('/:id_articulo', checkRole(['ADMINISTRADOR', 'INVENTARIO']), articuloController.actualizarArticulo); 

// Eliminar un artículo (Soft Delete)
router.put('/:id_articulo/desactivar', checkRole(['ADMINISTRADOR', 'INVENTARIO']), articuloController.desactivarArticulo);

module.exports = router;