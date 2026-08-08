const express = require('express');
const router = express.Router();
const cajaController = require('../controllers/caja.controller');

// Middlewares
const { verifyToken } = require('../middlewares/auth.middleware');
const { checkRole } = require('../middlewares/rol.middleware');

// 🖨️ Ruta para el PDF (libre de token)
router.get('/ticket/:folio', cajaController.descargarTicketPDF);

// Middlewares para las demás rutas
router.use(verifyToken);
router.use(checkRole(['CAJERO', 'CAJER@', 'ADMINISTRADOR', 'MOSTRADOR'])); 

// Otras rutas
router.get('/orden/:folio', cajaController.obtenerOrdenParaCobro);
router.post('/', cajaController.procesarPago);

module.exports = router;