const express = require('express');
const router = express.Router();
const sucursalController = require('../controllers/sucursal.controller');
const { check, validationResult } = require('express-validator');

// Importamos middleware de autenticación
const { verifyToken } = require('../middlewares/auth.middleware');

// Middleware para validar campos de express-validator
const validarCampos = (req, res, next) => {
  const errores = validationResult(req);
  if (!errores.isEmpty()) {
    return res.status(400).json({ exito: false, errores: errores.mapped() });
  }
  next();
};

// ==========================================
// 🏢 RUTAS DEL MÓDULO SUCURSALES
// ==========================================

// 1. Obtener todas las sucursales (con filtros opcionales query `activo`, `busqueda`)
router.get('/', verifyToken, sucursalController.obtenerSucursales);

// 2. Obtener una sucursal por ID
router.get('/:id', verifyToken, sucursalController.obtenerSucursalPorId);

// 3. Crear una nueva sucursal
router.post(
  '/',
  [
    verifyToken,
    check('id_sucursal', 'El código de la sucursal (id_sucursal) es obligatorio').not().isEmpty().trim(),
    check('nombre', 'El nombre de la sucursal es obligatorio').not().isEmpty().trim(),
    validarCampos
  ],
  sucursalController.crearSucursal
);

// 4. Actualizar datos de una sucursal
router.put(
  '/:id',
  [
    verifyToken,
    check('nombre', 'El nombre de la sucursal es obligatorio').not().isEmpty().trim(),
    validarCampos
  ],
  sucursalController.actualizarSucursal
);

// 5. Cambiar estado activo/inactivo
router.patch('/:id/estado', verifyToken, sucursalController.cambiarEstadoSucursal);

// 6. Eliminar o desactivar sucursal
router.delete('/:id', verifyToken, sucursalController.eliminarSucursal);

module.exports = router;
