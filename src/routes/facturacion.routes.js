const express = require('express');
const router = express.Router();
const facturacionController = require('../controllers/facturacion.controller');
const {verifyToken} = require('../middlewares/auth.middleware');
const {checkRole} = require('../middlewares/rol.middleware');

router.use(verifyToken);

// Ruta para timbrar una factura
router.post('/timbrar', checkRole(['ADMINISTRADOR', 'CAJERO']), facturacionController.timbrarFactura);  

// Ruta para obtener todas las facturas
router.get('/obtenerFacturas', checkRole(['ADMINISTRADOR']), facturacionController.obtenerFacturas);

// Ruta para obtener facturas con filtros
router.get('/obtenerFacturasConFiltros', checkRole(['ADMINISTRADOR']), facturacionController.obtenerFacturasConFiltros);


module.exports = router;