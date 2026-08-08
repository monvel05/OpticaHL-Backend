// routes/orden.routes.js
const express = require('express');
const router = express.Router();
const ordenController = require('../controllers/orden.controller');
const {verifyToken} = require('../middlewares/auth.middleware');
const {checkRole} = require('../middlewares/rol.middleware');

/**
 * =====================================================================
 * RUTAS DE ÓRDENES (PUNTO DE VENTA)
 * =====================================================================
 */

router.use(verifyToken);

// 1. Obtener todas las órdenes (Búsqueda general)
router.get(
  '/',
  checkRole(['ADMINISTRADOR', 'MOSTRADOR', 'CAJERO']),
  ordenController.obtenerOrdenes
);

// 🎯 2. ESTA ES LA QUE FALTA PARA EL MÓDULO DE CAJA (Buscar orden individual por Folio):
router.get(
  '/:id',
  checkRole(['ADMINISTRADOR', 'MOSTRADOR', 'CAJERO']),
  ordenController.obtenerOrdenes // Reutiliza la misma función
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
  checkRole(['ADMINISTRADOR', 'CAJERO']),
  ordenController.registrarPago
);

// 6. Cancelar orden
router.post(
  '/:id/cancel', 
  checkRole(['ADMINISTRADOR']), 
  ordenController.cancelarOrden
);

module.exports = router;