const express = require('express');
const router = express.Router();
const marcaController = require('../controllers/marca.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
const { checkRole } = require('../middlewares/rol.middleware');

// Rutas protegidas con token
router.use(verifyToken);

const rolesLectura = ['ADMINISTRADOR', 'INVENTARIO', 'MOSTRADOR', 'CAJA', 'CAJERO', 'CAJER@', 'OPTOMETRISTA', 'CONTADOR'];
const rolesEscritura = ['ADMINISTRADOR', 'INVENTARIO'];

// 1. Consultar marcas (opcional filtros: activo, id_proveedor, busqueda)
router.get('/', checkRole(rolesLectura), marcaController.obtenerMarcas);

// 2. Crear marca
router.post('/', checkRole(rolesEscritura), marcaController.crearMarca);

// 3. Actualizar marca
router.put('/:id', checkRole(rolesEscritura), marcaController.actualizarMarca);

// 4. Desactivar marca
router.delete('/:id', checkRole(rolesEscritura), marcaController.eliminarMarca);

module.exports = router;
