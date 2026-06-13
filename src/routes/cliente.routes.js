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

// Búsqueda en tiempo real (Buscador del Mostrador)
router.get('/buscar', checkRole(['ADMINISTRADOR', 'MOSTRADOR', 'CAJER@', 'FACTURADOR@']), clienteController.buscarClientes);

// Obtener historial clínico del paciente
router.get('/:id/historial', checkRole(['ADMINISTRADOR', 'MOSTRADOR']), clienteController.obtenerHistorial);


// ==========================================
// 📥 RUTAS DE ESCRITURA (POST)
// ==========================================

// Guardar nueva RX / refracción (Va primero por ser ruta específica con parámetro :id)
router.post('/:id/rx', checkRole(['ADMINISTRADOR', 'MOSTRADOR']), clienteController.guardarNuevaRX);

// 🧪 PRUEBA REINA: Alta rápida de clientes desde el mostrador
// Comentamos el checkRole para saltarnos temporalmente la validación del rol
// router.post('/', checkRole(['ADMINISTRADOR', 'MOSTRADOR']), clienteController.crearCliente);

// 👇 Dejamos esta ruta activa (solo protegida por el token) para verificar si el rol es el que falla:
router.post('/', clienteController.crearCliente);


module.exports = router;