const express = require('express');
const router = express.Router();
const inventarioController = require('../controllers/inventario.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
const { checkRole } = require('../middlewares/rol.middleware');

// ==========================================
// MIDDLEWARE DE AUTENTICACIÓN GLOBAL
// ==========================================
router.use(verifyToken);

// ==========================================
// RUTAS OPERATIVAS Y DE CONSULTA (CAJA / MOSTRADOR / INVENTARIO)
// ==========================================

// 🔍 Búsqueda de productos en tiempo real para Cobro Rápido / Punto de Venta
router.get(
  '/', 
  checkRole(['ADMINISTRADOR', 'INVENTARIO', 'CAJA', 'CAJERO', 'CAJER@', 'MOSTRADOR']), 
  inventarioController.buscarProductosCaja
);

// 👓 Consulta de armazones disponibles
router.get(
  '/armazones', 
  checkRole(['ADMINISTRADOR', 'INVENTARIO', 'CAJA', 'CAJERO', 'CAJER@', 'MOSTRADOR']), 
  inventarioController.consultarArmazones
);

// 🏢 Obtener lista de sucursales activas
router.get(
  '/sucursales', 
  checkRole(['ADMINISTRADOR', 'INVENTARIO', 'CAJA', 'CAJERO', 'CAJER@', 'MOSTRADOR']), 
  inventarioController.obtenerSucursales
);

// 📋 Obtener inventario general paginado
router.get(
  '/general', 
  checkRole(['ADMINISTRADOR', 'INVENTARIO', 'CAJA', 'CAJERO', 'CAJER@', 'MOSTRADOR']), 
  inventarioController.obtenerInventarioGeneral
);

// ==========================================
// RUTAS ADMINISTRATIVAS Y DE CONTROL DE STOCK
// ==========================================

// ⚠️ Alertas de stock bajo
router.get(
  '/alertas', 
  checkRole(['ADMINISTRADOR', 'INVENTARIO']), 
  inventarioController.obtenerAlertasStock
);

// ✏️ Actualizar stock de un artículo en una sucursal específica
router.put(
  '/stock/:id_articulo/:id_sucursal', 
  checkRole(['ADMINISTRADOR', 'INVENTARIO']), 
  inventarioController.actualizarStock
);

// 🚚 Transferir/Trasladar stock entre sucursales
router.post(
  '/traslado', 
  checkRole(['ADMINISTRADOR', 'INVENTARIO']), 
  inventarioController.trasladarStock
);

// ➕ Activar artículo en una sucursal
router.post(
  '/activar', 
  checkRole(['ADMINISTRADOR', 'INVENTARIO']), 
  inventarioController.activarArticuloSucursal
);

module.exports = router;