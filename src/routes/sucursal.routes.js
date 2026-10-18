const express = require('express');
const router = express.Router();
const sucursalController = require('../controllers/sucursal.controller');
const { check, validationResult } = require('express-validator');

// Importamos middlewares de autenticación y autorización
const { verifyToken } = require('../middlewares/auth.middleware');
const { checkRole } = require('../middlewares/rol.middleware');

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
// No tiene verify token para que aparezcan todas las sucursales en el login, ya que se necesita mostrar la lista de sucursales disponibles para iniciar sesión.
router.get('/', sucursalController.obtenerSucursales);

// 2. Obtener una sucursal por ID
router.get('/:id', verifyToken, sucursalController.obtenerSucursalPorId);

// 3. Crear una nueva sucursal (Solo Administrador)
router.post(
  '/',
  [
    verifyToken,
    checkRole(['ADMINISTRADOR']),
    check('id_sucursal', 'El código de la sucursal (id_sucursal) es obligatorio').not().isEmpty().trim(),
    check('nombre', 'El nombre de la sucursal es obligatorio').not().isEmpty().trim(),
    validarCampos
  ],
  sucursalController.crearSucursal
);

// 4. Actualizar datos de una sucursal (Solo Administrador)
router.put(
  '/:id',
  [
    verifyToken,
    checkRole(['ADMINISTRADOR']),
    check('nombre', 'El nombre de la sucursal es obligatorio').not().isEmpty().trim(),
    validarCampos
  ],
  sucursalController.actualizarSucursal
);

// 5. Cambiar estado activo/inactivo (Solo Administrador)
router.patch('/:id/estado', verifyToken, checkRole(['ADMINISTRADOR']), sucursalController.cambiarEstadoSucursal);

// 6. Eliminar o desactivar sucursal (Solo Administrador)
router.delete('/:id', verifyToken, checkRole(['ADMINISTRADOR']), sucursalController.eliminarSucursal);

module.exports = router;
