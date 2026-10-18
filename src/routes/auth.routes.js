const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/auth.controller');

// 🛡️ Limitador estricto para prevenir fuerza bruta en el inicio de sesión
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 15, // Máximo 15 intentos por IP cada 15 minutos
    message: {
        message: "Demasiados intentos de inicio de sesión. Por seguridad, por favor intente de nuevo en 15 minutos."
    },
    standardHeaders: true,
    legacyHeaders: false
});

router.post('/login', loginLimiter, authController.login);

module.exports = router;