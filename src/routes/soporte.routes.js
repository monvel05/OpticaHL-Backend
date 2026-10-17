// src/routes/soporte.routes.js
const express = require('express');
const router = express.Router();
const soporteController = require('../controllers/soporte.controller');

// Ruta pública o protegida para reportar falla o solicitar función
router.post('/reportar', soporteController.enviarReporte);

module.exports = router;
