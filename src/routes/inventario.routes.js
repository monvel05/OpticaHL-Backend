const express = require('express');
const router = express.Router();
const inventarioController = require('../controllers/inventario.controller');
const {verifyToken} = require('../middlewares/auth.middleware');
const {checkRole} = require('../middlewares/rol.middleware');

router.use(verifyToken);

// Alertas de stock bajo
router.get('/alertas', checkRole(['ADMINISTRADOR', 'INVENTARIO']), inventarioController.obtenerAlertasStock);

// Actualizar stock de un artículo en una sucursal
router.put('/stock/:id_articulo/:id_sucursal', checkRole(['ADMINISTRADOR', 'INVENTARIO']), inventarioController.actualizarStock);

// Transferir stock entre sucursales
router.post('/traslado', checkRole(['ADMINISTRADOR', 'INVENTARIO']), inventarioController.trasladarStock);

// Consulta de armazones
router.get('/armazones', inventarioController.consultarArmazones);

// Obtener lista de sucursales activas
router.get('/sucursales', inventarioController.obtenerSucursales);

// Obtener inventario general de la sucursal (Armazones, micas, etc.)
router.get('/general', inventarioController.obtenerInventarioGeneral);

module.exports = router;