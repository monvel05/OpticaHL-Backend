const express = require('express');
const router = express.Router();
const inventarioController = require('../controllers/inventario.controller');

// Alertas de stock bajo
router.get('/alertas', inventarioController.obtenerAlertasStock);

// Actualizar stock de un artículo en una sucursal
router.put('/stock/:id_articulo/:id_sucursal', inventarioController.actualizarStock);

// Transferir stock entre sucursales
router.post('/traslado', inventarioController.trasladarStock);

module.exports = router;