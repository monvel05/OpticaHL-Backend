const express = require('express');
const router = express.Router();
const clienteController = require('../controllers/cliente.controller');
const {verifyToken} = require('../middlewares/auth.middleware');
const {checkRole} = require('../middlewares/rol.middleware');

router.use(verifyToken);

// Búsqueda de clientes (Permitido para Mostrador, Cajero, Facturador y Admin)
router.get('/buscar', checkRole(['ADMINISTRADOR', 'MOSTRADOR', 'CAJER@', 'FACTURADOR@']), clienteController.buscarClientes);

// Alta de clientes (Solo Administrador y Mostrador) 
router.post('/', checkRole(['ADMINISTRADOR', 'MOSTRADOR']), clienteController.crearCliente);

// Obtener historial del cliente (Para Mostrador y Admin)
router.get('/:id/historial', checkRole(['ADMINISTRADOR', 'MOSTRADOR']), clienteController.obtenerHistorial);

// Guardar nueva RX (Solo para Mostrador y Admin)
router.post('/:id/rx',  checkRole(['ADMINISTRADOR', 'MOSTRADOR']), clienteController.guardarNuevaRX);

module.exports = router;