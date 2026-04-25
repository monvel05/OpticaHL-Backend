// routes/order.routes.js
const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order.controller');
const { verificarToken, requiereRol } = require('../middlewares/auth');

/**
 * =====================================================================
 * RUTAS DE ÓRDENES (PUNTO DE VENTA)
 * Base URL esperada en app.js: /api/orders
 * =====================================================================
 */

// 1. Obtener lista de órdenes (Historial)
router.get(
  '/',
  verificarToken,
  requiereRol(['ADMINISTRADOR', 'MOSTRADOR', 'CAJERO']),
  orderController.ObtenerOrdenes
);

// 2. Crear nueva orden
router.post(
  '/',
  verificarToken,
  requiereRol(['ADMINISTRADOR', 'MOSTRADOR']),
  orderController.crearOrden
);

// 3. Modificar orden existente
router.put(
  '/:id',
  verificarToken,
  requiereRol(['ADMINISTRADOR', 'MOSTRADOR']),
  orderController.modificarOrden
);

// 4. Registrar un pago / abono
router.post(
  '/:id/pay',
  verificarToken,
  requiereRol(['ADMINISTRADOR', 'CAJERO']),
  orderController.registrarPago
);

// 5. Cancelar orden entera
router.post(
  '/:id/cancel', 
  verificarToken, 
  requiereRol(['ADMINISTRADOR']), 
  orderController.cancelarOrden
);

module.exports = router;