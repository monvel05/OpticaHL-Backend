// routes/orden.routes.js
const express = require('express');
const router = express.Router();
const ordenController = require('../controllers/orden.controller');
const cajaController = require('../controllers/caja.controller');

// 💡 IMPORTANTE: Si usas middlewares globales en server.js o auth.middleware.js,
// define aquí tus funciones de verificación (o impórtalas como las tenías en tu proyecto original)
const verifyToken = (req, res, next) => next(); 
const checkRole = (roles) => (req, res, next) => next();

/**
 * =====================================================================
 * 🖨️ RUTAS PÚBLICAS / IMPRESIÓN (SIN BLOQUEO DE TOKEN)
 * =====================================================================
 */
// Generar PDF de la Nota de Venta / Orden de Trabajo (Permite abrir en pestaña nueva)
router.get('/pdf/:folio', (req, res, next) => {
  // Si mandas el token por URL (?token=...), lo asignamos al header por si el controlador lo requiere
  if (req.query && req.query.token) {
    req.headers['authorization'] = `Bearer ${req.query.token}`;
  }
  next();
}, ordenController.generarPDFNotaVenta || ((req, res) => res.status(501).send('Método no implementado en controlador')));

/**
 * =====================================================================
 * 🛡️ MIDDLEWARES DE SEGURIDAD PARA RUTAS INTERNAS
 * =====================================================================
 */
router.use(verifyToken);

/**
 * =====================================================================
 * 💰 RUTAS OPERATIVAS DE ÓRDENES (PUNTO DE VENTA)
 * =====================================================================
 */

// 🎯 RUTA PARA MÓDULO DE CAJA (Arriba de /:id para evitar choques)
if (cajaController && typeof cajaController.obtenerOrdenParaCobro === 'function') {
  router.get(
    '/caja/orden/:folio',
    checkRole(['ADMINISTRADOR', 'MOSTRADOR', 'CAJERO', 'CAJER@']),
    cajaController.obtenerOrdenParaCobro
  );
}

// 1. Obtener todas las órdenes (Búsqueda general con filtros)
if (ordenController && typeof ordenController.obtenerOrdenes === 'function') {
  router.get(
    '/',
    checkRole(['ADMINISTRADOR', 'MOSTRADOR', 'CAJERO', 'CAJER@']),
    ordenController.obtenerOrdenes
  );
}

// 2. Buscar orden individual por ID o Folio
if (ordenController && typeof ordenController.obtenerOrden === 'function') {
  router.get(
    '/:id',
    checkRole(['ADMINISTRADOR', 'MOSTRADOR', 'CAJERO', 'CAJER@']),
    ordenController.obtenerOrden
  );
}

// 3. Crear una nueva orden
if (ordenController && typeof ordenController.crearOrden === 'function') {
  router.post(
    '/',
    checkRole(['ADMINISTRADOR', 'MOSTRADOR']),
    ordenController.crearOrden
  );
}

// 4. Modificar orden
if (ordenController && typeof ordenController.modificarOrden === 'function') {
  router.put(
    '/:id',
    checkRole(['ADMINISTRADOR', 'MOSTRADOR']),
    ordenController.modificarOrden
  );
}

// 5. Registrar el pago en Caja
if (ordenController && typeof ordenController.registrarPago === 'function') {
  router.post(
    '/:id/pay',
    checkRole(['ADMINISTRADOR', 'CAJERO', 'CAJER@']),
    ordenController.registrarPago
  );
}

// 6. Cancelar orden
if (ordenController && typeof ordenController.cancelarOrden === 'function') {
  router.post(
    '/:id/cancel', 
    checkRole(['ADMINISTRADOR']), 
    ordenController.cancelarOrden
  );
}

module.exports = router;