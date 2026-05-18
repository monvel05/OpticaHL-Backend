const express = require('express');
const router = express.Router();
const facturacionController = require('../controllers/facturacion.controller');
const {verifyToken} = require('../middlewares/auth.middleware');
const {checkRole} = require('../middlewares/rol.middleware');

router.use(verifyToken);

// Ruta para timbrar una factura
router.post('/timbrar', checkRole(['ADMINISTRADOR', 'CONTADOR']), facturacionController.timbrarFactura);  

// Ruta para obtener facturas con filtros
router.get('/obtenerFacturas', checkRole(['ADMINISTRADOR', 'CONTADOR']), facturacionController.obtenerFacturasConFiltros);

// Ruta para cancelar una factura 
router.put('/:num_factura/cancelar', checkRole(['ADMINISTRADOR', 'CONTADOR']), facturacionController.cancelarFactura);

// Ruta para descargar el XML de una factura
router.get('/:num_factura/xml', checkRole(['ADMINISTRADOR', 'CONTADOR', 'MOSTRADOR', 'CAJERO']), facturacionController.descargarXML);

module.exports = router;