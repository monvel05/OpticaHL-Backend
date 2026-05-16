const express = require('express');
const router = express.Router();
const cajaController = require('../controllers/caja.controller');

// Middlewares
const {verifyToken} = require('../middlewares/auth.middleware');
const {checkRole} = require('../middlewares/rol.middleware');

router.use(verifyToken);
router.use(checkRole(['CAJERO', 'ADMINISTRADOR'])); 

// Traer orden para mostrar en pantalla de cobro
router.get('/orden/:folio', cajaController.obtenerOrdenParaCobro);

// Procesar el pago 
router.post('/pago', cajaController.procesarPago);

// Enviar recibo de pago por correo, esta ruta es por si se necesita reenviar el recibo de pago
router.post('/enviarRecibo', cajaController.enviarReciboPago);

module.exports = router;