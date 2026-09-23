// routes/orden.routes.js
const express = require('express');
const router = express.Router();
const ordenController = require('../controllers/orden.controller');
const cajaController = require('../controllers/caja.controller'); // <-- Importación agregada
const {verifyToken} = require('../middlewares/auth.middleware');
const {checkRole} = require('../middlewares/rol.middleware');

/**
 * =====================================================================
 * RUTAS DE ÓRDENES (PUNTO DE VENTA)
 * =====================================================================
 */

router.use(verifyToken);

// 🎯 RUTA PARA MÓDULO DE CAJA (Debe ir arriba de /:id para evitar choques de rutas)
router.get(
  '/caja/orden/:folio',
  checkRole(['ADMINISTRADOR', 'MOSTRADOR', 'CAJERO', 'CAJER@']),
  cajaController.obtenerOrdenParaCobro
);

// 1. Obtener todas las órdenes (Búsqueda general)
router.get(
  '/',
  checkRole(['ADMINISTRADOR', 'MOSTRADOR', 'CAJERO', 'CAJER@']),
  ordenController.obtenerOrdenes
);

// 2. Buscar orden individual por ID o Folio
router.get(
  '/:id',
  checkRole(['ADMINISTRADOR', 'MOSTRADOR', 'CAJERO', 'CAJER@']),
  ordenController.obtenerOrdenes
);

// 3. Crear una nueva orden
router.post(
  '/',
  checkRole(['ADMINISTRADOR', 'MOSTRADOR']),
  ordenController.crearOrden
);

// 4. Modificar orden
router.put(
  '/:id',
  checkRole(['ADMINISTRADOR', 'MOSTRADOR']),
  ordenController.modificarOrden
);

// 5. Registrar el pago en Caja
router.post(
  '/:id/pay',
  checkRole(['ADMINISTRADOR', 'CAJERO', 'CAJER@']),
  ordenController.registrarPago
);

// 6. Cancelar orden
router.post(
  '/:id/cancel', 
  checkRole(['ADMINISTRADOR']), 
  ordenController.cancelarOrden
);

module.exports = router;