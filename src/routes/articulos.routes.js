const express = require('express');
const router = express.Router();
const articulosController = require('../controllers/articulos.controller');
const verifyToken = require('../middlewares/auth.middleware');
const checkRole = require('../middlewares/rol.middleware');

router.use(verifyToken);

// Crear un nuevo artículo (con detalles e inventario)
router.post('/', checkRole(['ADMINISTRADOR', 'INVENTARIO']), articulosController.crearArticulo);

// Obtener artículos activos (con detalles e inventario)
router.get('/', articulosController.obtenerArticulos);

// Actualizar datos de un artículo (con detalles)
router.put('/:id_articulo', checkRole(['ADMINISTRADOR', 'INVENTARIO']), articulosController.actualizarArticulo); 

// Eliminar un artículo (Soft Delete)
router.put('/:id_articulo/desactivar', checkRole(['ADMINISTRADOR', 'INVENTARIO']), articulosController.desactivarArticulo);

module.exports = router;