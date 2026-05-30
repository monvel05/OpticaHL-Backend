const express = require('express');
const router = express.Router();
const articuloController = require('../controllers/articulo.controller');
const {verifyToken} = require('../middlewares/auth.middleware');
const {checkRole} = require('../middlewares/rol.middleware');

// ❌ BORRAMOS o comentamos la aduana general:
// router.use(verifyToken);

// 1. Crear un nuevo artículo ➔ SÍ lleva candado individual
router.post('/', verifyToken, checkRole(['ADMINISTRADOR', 'INVENTARIO']), articuloController.crearArticulo);

// 2. Obtener artículos activos ➔ ¡COMPLETAMENTE LIBRE! (Sin verifyToken)
router.get('/', articuloController.obtenerArticulos);

// 3. Actualizar datos ➔ SÍ lleva candado individual
router.put('/:id_articulo', verifyToken, checkRole(['ADMINISTRADOR', 'INVENTARIO']), articuloController.actualizarArticulo); 

// 4. Eliminar un artículo ➔ SÍ lleva candado individual
router.put('/:id_articulo/desactivar', verifyToken, checkRole(['ADMINISTRADOR', 'INVENTARIO']), articuloController.desactivarArticulo);

module.exports = router;