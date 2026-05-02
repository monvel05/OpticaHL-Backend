// routes/orden.routes.js
const express = require('express');
const router = express.Router();
const ordenController = require('../controllers/orden.controller');
const {verifyToken} = require('../middlewares/auth.middleware');
const {checkRole} = require('../middlewares/rol.middleware');

/**
 * =====================================================================
 * RUTAS DE ÓRDENES (PUNTO DE VENTA)
 * Base URL esperada en app.js: /api/orders
 * =====================================================================
 */

router.use(verifyToken);

router.get(
  '/',
  checkRole(['ADMINISTRADOR', 'MOSTRADOR', 'CAJERO']),
  ordenController.obtenerOrdenes
);


router.post(
  '/',
  checkRole(['ADMINISTRADOR', 'MOSTRADOR']),
  ordenController.crearOrden
);


router.put(
  '/:id',
  checkRole(['ADMINISTRADOR', 'MOSTRADOR']),
  ordenController.modificarOrden
);

router.post(
  '/:id/pay',
  checkRole(['ADMINISTRADOR', 'CAJERO']),
  ordenController.registrarPago
);

router.post(
  '/:id/cancel', 
  checkRole(['ADMINISTRADOR']), 
  ordenController.cancelarOrden
);

module.exports = router;