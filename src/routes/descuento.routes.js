const express = require("express");
const router = express.Router();
const {
  obtenerTodos,
  obtenerVigentes,
  crear,
  cambiarEstado,
  eliminar
} = require("../controllers/descuento.controller");

const { verifyToken } = require("../middlewares/auth.middleware");
const { checkRole } = require("../middlewares/rol.middleware");

// 🔐 Todas las consultas de descuento requieren sesión activa
router.use(verifyToken);

router.get("/", checkRole(['ADMINISTRADOR', 'MOSTRADOR', 'CAJERO', 'CAJER@']), obtenerTodos);
router.get("/vigentes", checkRole(['ADMINISTRADOR', 'MOSTRADOR', 'CAJERO', 'CAJER@']), obtenerVigentes);

// 🛡️ Solo el Administrador puede crear, pausar o borrar promociones
router.post("/", checkRole(['ADMINISTRADOR']), crear);
router.put("/:id/toggle", checkRole(['ADMINISTRADOR']), cambiarEstado);
router.delete("/:id", checkRole(['ADMINISTRADOR']), eliminar);

module.exports = router;