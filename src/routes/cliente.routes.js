const express = require('express');
const router = express.Router(); 
const clienteController = require('../controllers/cliente.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
const { checkRole } = require('../middlewares/rol.middleware');

// 🔐 1. Autenticación global: Todas las rutas exigen un token válido y vivo
router.use(verifyToken);

// ==========================================
// 🔎 RUTAS DE LECTURA (GET)
// ==========================================

// Búsqueda en tiempo real (Buscador del Mostrador y Gabinete)
router.get('/buscar', checkRole(['ADMINISTRADOR', 'MOSTRADOR', 'CAJER@', 'FACTURADOR@', 'Optometrista', 'OPTOMETRISTA']), clienteController.buscarClientes);

// Obtener historial clínico del paciente
router.get('/:id/historial', checkRole(['ADMINISTRADOR', 'MOSTRADOR', 'Optometrista', 'OPTOMETRISTA']), clienteController.obtenerHistorial);

// 🎯 CORREGIDO: Removido el prefijo innecesario para coincidir exactamente con Angular (/api/clientes/4/ultima-rx)
router.get('/:id/ultima-rx', checkRole(['ADMINISTRADOR', 'Optometrista', 'OPTOMETRISTA']), clienteController.obtenerUltimaRX);


// ==========================================
// 📥 RUTAS DE ESCRITURA (POST)
// ==========================================

// Guardar nueva RX / refracción
router.post('/:id/rx', checkRole(['ADMINISTRADOR', 'Optometrista', 'OPTOMETRISTA']), clienteController.guardarNuevaRX);

// Alta rápida de clientes desde el mostrador
router.post('/', clienteController.crearCliente);

module.exports = router;