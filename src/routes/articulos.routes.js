const express = require('express');
const router = express.Router();
const articulosController = require('../controllers/articulos.controller');

// Crear un nuevo artículo (con detalles e inventario)
router.post('/', articulosController.crearArticulo);

// Obtener artículos activos (con detalles e inventario)
router.get('/', articulosController.obtenerArticulos);

// Actualizar datos de un artículo (con detalles)
router.put('/:id_articulo', articulosController.actualizarArticulo); 

// Eliminar un artículo (Soft Delete)
router.put('/:id_articulo/desactivar', articulosController.desactivarArticulo);

module.exports = router;