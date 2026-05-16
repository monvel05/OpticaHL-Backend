const express = require('express');
const router = express.Router();
const reporteController = require('../controllers/reporte.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
const { checkRole } = require('../middlewares/rol.middleware'); 

router.use(verifyToken);

// El reporte de stock solo lo podrán ver ADMINISTRADOR e INVENTARIO, ya que es información sensible pero no tan crítica como productividad o caja
router.get('/stock-critico', checkRole(['ADMINISTRADOR', 'INVENTARIO']), reporteController.getReporteStockCritico);

// Productividad y Caja son sensibles, solo ADMINISTRADOR puede acceder a esos reportes
router.get('/productividad', checkRole(['ADMINISTRADOR']), reporteController.getReporteProductividad);
router.get('/caja', checkRole(['ADMINISTRADOR']), reporteController.getReporteIngresosCaja);

// Ingresos por método de pago (Corte de caja)
router.get('/ingresos-metodo', checkRole(['ADMINISTRADOR']), reporteController.obtenerIngresosPorMetodo);

// Antigüedad de saldos (Cuentas por cobrar críticas)
router.get('/antiguedad-saldos', checkRole(['ADMINISTRADOR']), reporteController.obtenerAntiguedadSaldos);

// CRM de recordatorios de pacientes
router.get('/crm-recordatorios', checkRole(['ADMINISTRADOR']), reporteController.obtenerPacientesParaRecordatorio);

// Inventario de lento movimiento
router.get('/inventario-lento', checkRole(['ADMINISTRADOR', 'INVENTARIO']), reporteController.obtenerInventarioLentoMovimiento);

// Productividad de operadores por mes y año
router.get('/productividad-operadores', checkRole(['ADMINISTRADOR']), reporteController.obtenerProductividadOperadores);

module.exports = router;