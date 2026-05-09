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

module.exports = router;