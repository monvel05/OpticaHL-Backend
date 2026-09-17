const express = require("express");
const router = express.Router();
const {
  obtenerTodos,
  obtenerVigentes,
  crear,
  cambiarEstado,
  eliminar
} = require("../controllers/descuento.controller");

router.get("/", obtenerTodos);
router.get("/vigentes", obtenerVigentes);
router.post("/", crear);
router.put("/:id/toggle", cambiarEstado);
router.delete("/:id", eliminar);

module.exports = router;