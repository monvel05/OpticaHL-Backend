const express = require('express');
const router = express.Router();
const facturacionController = require('../controllers/facturacion.controller');
const {verifyToken} = require('../middlewares/auth.middleware');
const {checkRole} = require('../middlewares/rol.middleware');

router.use(verifyToken);

// Ruta para obtener órdenes disponibles para facturar
router.get('/ordenes-disponibles', checkRole(['ADMINISTRADOR', 'CONTADOR', 'CAJA', 'CAJER@', 'MOSTRADOR']), facturacionController.obtenerOrdenesParaFacturar);

// Ruta para obtener detalles consolidado de uno o varios folios
router.get('/ordenes-detalles', checkRole(['ADMINISTRADOR', 'CONTADOR', 'CAJA', 'CAJER@', 'MOSTRADOR']), facturacionController.obtenerDetallesOrdenes);

// Ruta para timbrar una factura (soporta multi-folio y conceptos personalizados/falsos)
router.post('/timbrar', checkRole(['ADMINISTRADOR', 'CONTADOR', 'CAJA', 'CAJER@', 'MOSTRADOR']), facturacionController.timbrarFactura);  

// Ruta para obtener facturas con filtros y búsqueda
router.get('/obtenerFacturas', checkRole(['ADMINISTRADOR', 'CONTADOR', 'CAJA', 'CAJER@', 'MOSTRADOR']), facturacionController.obtenerFacturasConFiltros);

// Ruta para cancelar una factura 
router.put('/:num_factura/cancelar', checkRole(['ADMINISTRADOR', 'CONTADOR', 'CAJA']), facturacionController.cancelarFactura);

// Ruta para descargar el XML de una factura
router.get('/:num_factura/xml', checkRole(['ADMINISTRADOR', 'CONTADOR', 'MOSTRADOR', 'CAJA', 'CAJER@']), facturacionController.descargarXML);

// Ruta para descargar/ver el PDF de una factura
router.get('/:num_factura/pdf', checkRole(['ADMINISTRADOR', 'CONTADOR', 'MOSTRADOR', 'CAJA', 'CAJER@']), facturacionController.descargarPDF);

module.exports = router;