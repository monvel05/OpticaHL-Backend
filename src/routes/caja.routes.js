const express = require('express');
const router = express.Router();
const cajaController = require('../controllers/caja.controller');

// Middlewares
const { verifyToken } = require('../middlewares/auth.middleware');
const { checkRole } = require('../middlewares/rol.middleware');

// ==========================================
// 🖨️ RUTAS DE IMPRESIÓN PDF (LIBRES DE TOKEN PARA ABRIR EN PESTAÑA NUEVA)
// ==========================================
router.get('/ticket/:folio', cajaController.descargarTicketPDF);
router.get('/ticket-expres/pdf', cajaController.descargarTicketVentaExpresPDF); // 👈 AQUÍ ARRIBA
router.get('/corte/pdf', cajaController.descargarTicketCortePDF);

// ==========================================
// MIDDLEWARES DE SEGURIDAD (PROTECCIÓN DE RUTAS REST)
// ==========================================
router.use(verifyToken);
router.use(checkRole(['CAJA', 'CAJERO', 'CAJER@', 'ADMINISTRADOR', 'MOSTRADOR'])); 

// 💰 Rutas operativas de caja
router.get('/corte', cajaController.obtenerCorteCaja);
router.get('/orden/:folio', cajaController.obtenerOrdenParaCobro);
router.get('/caja/orden/:folio', cajaController.obtenerOrdenParaCobro);
router.post('/', cajaController.procesarPago);

module.exports = router;