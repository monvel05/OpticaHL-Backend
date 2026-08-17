const express = require('express');
const router = express.Router();
const cajaController = require('../controllers/caja.controller');

// Middlewares
const { verifyToken } = require('../middlewares/auth.middleware');
const { checkRole } = require('../middlewares/rol.middleware');

// 🖨️ Rutas de impresión PDF (Libres de token para permitir abrir en ventana nueva)
router.get('/ticket/:folio', cajaController.descargarTicketPDF);
router.get('/corte/pdf', cajaController.descargarTicketCortePDF);

// ==========================================
// MIDDLEWARES DE SEGURIDAD (PROTECCIÓN DE RUTAS)
// ==========================================
router.use(verifyToken);
router.use(checkRole(['CAJA', 'CAJERO', 'CAJER@', 'ADMINISTRADOR', 'MOSTRADOR'])); 

// 💰 Rutas operativas de caja
router.get('/corte', cajaController.obtenerCorteCaja);
router.get('/orden/:folio', cajaController.obtenerOrdenParaCobro);
router.get('/caja/orden/:folio', cajaController.obtenerOrdenParaCobro); // <-- RUTA AGREGADA PARA COINCIDIR CON EL FRONTEND
router.post('/', cajaController.procesarPago);

module.exports = router;