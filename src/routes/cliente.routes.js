const express = require('express');
const router = express.Router(); // 👈 ¡ESTA ES LA LÍNEA QUE SE HABÍA BORRADO!
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


// ==========================================
// 📥 RUTAS DE ESCRITURA (POST)
// ==========================================

// Guardar nueva RX / refracción
router.post('/:id/rx', checkRole(['ADMINISTRADOR', 'Optometrista', 'OPTOMETRISTA']), clienteController.guardarNuevaRX);

// Alta rápida de clientes desde el mostrador (Protegida por Token de forma global arriba)
router.post('/', clienteController.crearCliente);


module.exports = router;