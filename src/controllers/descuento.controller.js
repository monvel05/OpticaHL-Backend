const pool = require("../config/db");

// 1. Obtener todos los descuentos para la pantalla de gestión
const obtenerTodos = async (req, res) => {
  try {
    const [descuento] = await pool.query(`
      SELECT 
        p.*, 
        a.nombre AS articulo_nombre,
        CASE 
          WHEN p.activo = 0 THEN 'PAUSADO'
          WHEN CURDATE() < p.fecha_inicio THEN 'PROGRAMADO'
          WHEN CURDATE() > p.fecha_fin THEN 'VENCIDO'
          ELSE 'VIGENTE'
        END AS estado_actual
      FROM promociones p
      LEFT JOIN articulos a ON p.id_articulo = a.id_articulo
      ORDER BY p.id_promocion DESC
    `);

    res.json({ exito: true, datos: descuento });
  } catch (error) {
    console.error("Error al obtener descuentos:", error);
    res.status(500).json({ exito: false, mensaje: "Error al obtener descuentos" });
  }
};

// 2. Obtener solo los descuentos activos y vigentes el día de hoy
const obtenerVigentes = async (req, res) => {
  try {
    const [vigentes] = await pool.query(`
      SELECT 
        p.*, 
        a.nombre AS articulo_nombre
      FROM promociones p
      LEFT JOIN articulos a ON p.id_articulo = a.id_articulo
      WHERE p.activo = 1 AND CURDATE() BETWEEN p.fecha_inicio AND p.fecha_fin
      ORDER BY p.porcentaje_descuento DESC
    `);

    res.json({ exito: true, datos: vigentes });
  } catch (error) {
    console.error("Error al obtener descuentos vigentes:", error);
    res.status(500).json({ exito: false, mensaje: "Error al obtener descuentos vigentes" });
  }
};

// 3. Crear una nueva promoción o descuento
const crear = async (req, res) => {
  const {
    nombre,
    descripcion,
    porcentaje_descuento,
    tipo_aplicacion,
    id_articulo,
    categoria,
    fecha_inicio,
    fecha_fin
  } = req.body;

  if (!nombre || !porcentaje_descuento || !fecha_inicio || !fecha_fin) {
    return res.status(400).json({
      exito: false,
      mensaje: "Nombre, porcentaje de descuento y fechas de inicio y fin son obligatorios."
    });
  }

  try {
    const [resultado] = await pool.query(`
      INSERT INTO promociones 
      (nombre, descripcion, porcentaje_descuento, tipo_aplicacion, id_articulo, categoria, fecha_inicio, fecha_fin, activo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `, [
      nombre.trim(),
      descripcion || null,
      parseFloat(porcentaje_descuento),
      tipo_aplicacion || 'TODOS',
      id_articulo ? parseInt(id_articulo, 10) : null,
      categoria || null,
      fecha_inicio,
      fecha_fin
    ]);

    res.status(201).json({
      exito: true,
      mensaje: "Descuento registrado correctamente",
      id_promocion: resultado.insertId
    });
  } catch (error) {
    console.error("Error al crear descuento:", error);
    res.status(500).json({ exito: false, mensaje: "Error al guardar el descuento" });
  }
};

// 4. Activar o Pausar un descuento
const cambiarEstado = async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query(`
      UPDATE promociones 
      SET activo = IF(activo = 1, 0, 1) 
      WHERE id_promocion = ?
    `, [id]);

    res.json({ exito: true, mensaje: "Estado del descuento actualizado" });
  } catch (error) {
    console.error("Error al cambiar estado:", error);
    res.status(500).json({ exito: false, mensaje: "Error al actualizar estado" });
  }
};

// 5. Eliminar un descuento
const eliminar = async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query("DELETE FROM promociones WHERE id_promocion = ?", [id]);
    res.json({ exito: true, mensaje: "Descuento eliminado correctamente" });
  } catch (error) {
    console.error("Error al eliminar descuento:", error);
    res.status(500).json({ exito: false, mensaje: "Error al eliminar el descuento" });
  }
};

module.exports = {
  obtenerTodos,
  obtenerVigentes,
  crear,
  cambiarEstado,
  eliminar
};