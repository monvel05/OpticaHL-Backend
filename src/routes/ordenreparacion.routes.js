const express = require('express');
const router = express.Router();
const controller = require('../controllers/ordenreparacion.controller');
const { verifyToken } = require('../middlewares/auth.middleware');

router.use(verifyToken);

router.post('/', controller.crearOrdenReparacion);
router.get('/:id/pdf', controller.obtenerPdfReparacion);

module.exports = router;