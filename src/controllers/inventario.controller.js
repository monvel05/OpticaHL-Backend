// src/controllers/inventario.controller.js
const pool = require("../config/db");

// ==========================================
// ALERTAS DE STOCK
// ==========================================
const obtenerAlertasStock = async (req, res) => {
  const { id_sucursal } = req.query;

  try {
    let query = `
            SELECT 
                a.codigo, a.nombre, a.categoria,
                inv.stock_actual, inv.stock_minimo,
                s.nombre AS sucursal
            FROM INVENTARIO_SUCURSAL inv
            JOIN ARTICULOS a ON inv.id_articulo = a.id_articulo
            JOIN SUCURSALES s ON inv.id_sucursal = s.id_sucursal AND s.activo = 1
            WHERE inv.stock_actual <= inv.stock_minimo AND a.activo = 1
        `;

    const queryParams = [];

    if (id_sucursal) {
      query += ` AND inv.id_sucursal = ?`;
      queryParams.push(id_sucursal);
    }

    const [alertas] = await pool.query(query, queryParams);

    res.status(200).json({ success: true, data: alertas });
  } catch (error) {
    console.error("Error al obtener alertas de stock:", error);
    res
      .status(500)
      .json({ success: false, message: "Error interno del servidor." });
  }
};

// ==========================================
// ACTUALIZAR STOCK (Entradas o Ajustes)
// ==========================================
const actualizarStock = async (req, res) => {
  const { id_articulo, id_sucursal } = req.params;
  const { nuevo_stock } = req.body;

  try {
    const query = `
            UPDATE INVENTARIO_SUCURSAL 
            SET stock_actual = ? 
            WHERE id_articulo = ? AND id_sucursal = ?
        `;

    const [result] = await pool.execute(query, [
      nuevo_stock,
      id_articulo,
      id_sucursal,
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message:
          "No se encontró registro de inventario para este artículo en esta sucursal.",
      });
    }

    res
      .status(200)
      .json({ success: true, message: "Stock actualizado correctamente." });
  } catch (error) {
    console.error("Error al actualizar stock:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Error interno al actualizar el inventario.",
      });
  }
};

// ==========================================
// TRASLADAR STOCK (De una sucursal a otra)
// ==========================================
const trasladarStock = async (req, res) => {
  const { id_articulo } = req.params;
  const { id_sucursal_origen, id_sucursal_destino, cantidad, id_operador } =
    req.body;

  if (cantidad <= 0) {
    return res
      .status(400)
      .json({
        success: false,
        message: "La cantidad a trasladar debe ser mayor a 0.",
      });
  }

  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();

    // 1. Descontar de la sucursal de origen
    const queryDescuento = `
            UPDATE INVENTARIO_SUCURSAL 
            SET stock_actual = stock_actual - ? 
            WHERE id_articulo = ? AND id_sucursal = ? AND stock_actual >= ?
        `;
    const [resDescuento] = await conexion.execute(queryDescuento, [
      cantidad,
      id_articulo,
      id_sucursal_origen,
      cantidad,
    ]);

    if (resDescuento.affectedRows === 0) {
      await conexion.rollback();
      return res.status(400).json({
        success: false,
        message:
          "Stock insuficiente en la sucursal de origen para realizar el traslado.",
      });
    }

    // 2. Aumentar en la sucursal de destino
    const queryAumento = `
            INSERT INTO INVENTARIO_SUCURSAL (id_articulo, id_sucursal, stock_actual, stock_minimo)
            VALUES (?, ?, ?, 5)
            ON DUPLICATE KEY UPDATE stock_actual = stock_actual + ?
        `;
    await conexion.execute(queryAumento, [
      id_articulo,
      id_sucursal_destino,
      cantidad,
      cantidad,
    ]);

    // 3. Registrar el movimiento en la auditoría/bitácora
    const queryAudit = `
            INSERT INTO audit_logs (id_operador, accion, modulo, detalles)
            VALUES (?, 'TRASLADO_STOCK', 'INVENTARIO', ?)
        `;
    const detalles = `Traslado de ${cantidad} unidades del articulo ID ${id_articulo} de sucursal ${id_sucursal_origen} a ${id_sucursal_destino}`;
    await conexion.execute(queryAudit, [
      id_operador || null,
      detalles,
    ]);

    await conexion.commit();

    res
      .status(200)
      .json({ success: true, message: "Traslado de stock exitoso." });
  } catch (error) {
    await conexion.rollback();
    console.error("Error al trasladar stock:", error);
    res
      .status(500)
      .json({ success: false, message: "Error interno al procesar el traslado." });
  } finally {
    conexion.release();
  }
};

// ==========================================
// ACTIVAR ARTICULO EN SUCURSAL
// ==========================================
const activarArticuloSucursal = async (req, res) => {
  const { id_articulo, id_sucursal } = req.body;
  try {
    const query = `
      INSERT INTO INVENTARIO_SUCURSAL (id_articulo, id_sucursal, stock_actual, stock_minimo)
      VALUES (?, ?, 0, 5)
      ON DUPLICATE KEY UPDATE stock_actual = stock_actual
    `;
    await pool.execute(query, [id_articulo, id_sucursal]);
    res.status(200).json({ success: true, message: "Artículo activado en la sucursal." });
  } catch (error) {
    console.error("Error al activar artículo en sucursal:", error);
    res.status(500).json({ success: false, message: "Error interno." });
  }
};

// ==========================================
// CONSULTAR ARMAZONES
// ==========================================
const consultarArmazones = async (req, res) => {
  try {
    const query = `
      SELECT 
        a.id_articulo, a.codigo, a.nombre, a.precio_venta, a.costo,
        det.marca, det.color, det.material, det.estilo, det.puente, det.diagonal, det.base
      FROM ARTICULOS a
      JOIN ARTICULO_DETALLE det ON a.id_articulo = det.id_articulo
      WHERE a.categoria = 'Z' AND a.activo = 1
    `;
    const [armazones] = await pool.query(query);
    res.status(200).json({ success: true, data: armazones });
  } catch (error) {
    console.error("Error al consultar armazones:", error);
    res.status(500).json({ success: false, message: "Error interno." });
  }
};

// ==========================================
// INVENTARIO GENERAL PAGINADO (MULTI-SUCURSAL)
// ==========================================
const obtenerInventarioGeneral = async (req, res) => {
  const { id_sucursal, categoria } = req.query;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;

  const esTodas = !id_sucursal || id_sucursal === 'TODAS' || id_sucursal === 'ALL' || id_sucursal === '0';

  try {
    let query = '';
    let queryParams = [];

    if (esTodas) {
      query = `
        SELECT 
            a.id_articulo, a.codigo, a.nombre, a.categoria, a.precio_venta, a.costo,
            IFNULL(SUM(CASE WHEN s.id_sucursal IS NOT NULL THEN inv.stock_actual ELSE 0 END), 0) AS stock_actual, 
            IFNULL(MIN(inv.stock_minimo), 5) AS stock_minimo, 
            det.marca, det.color, det.material, det.estilo
        FROM articulos a
        LEFT JOIN inventario_sucursal inv ON a.id_articulo = inv.id_articulo
        LEFT JOIN sucursales s ON inv.id_sucursal = s.id_sucursal AND s.activo = 1
        LEFT JOIN articulo_detalle det ON a.id_articulo = det.id_articulo
        WHERE a.activo = 1
      `;
    } else {
      query = `
        SELECT 
            a.id_articulo, a.codigo, a.nombre, a.categoria, a.precio_venta, a.costo,
            IFNULL(inv.stock_actual, 0) AS stock_actual, 
            IFNULL(inv.stock_minimo, 5) AS stock_minimo, 
            det.marca, det.color, det.material, det.estilo
        FROM articulos a
        LEFT JOIN inventario_sucursal inv ON a.id_articulo = inv.id_articulo AND inv.id_sucursal = ?
        LEFT JOIN articulo_detalle det ON a.id_articulo = det.id_articulo
        WHERE a.activo = 1
      `;
      queryParams.push(id_sucursal);
    }

    if (categoria && categoria !== "sucursales") {
      if (categoria === "Z" || categoria === "ARMAZON") {
        query += ` AND (a.categoria = 'Z' OR UPPER(a.categoria) LIKE '%ARMAZON%')`;
      } else if (categoria === "S" || categoria === "MICA") {
        query += ` AND (a.categoria = 'S' OR UPPER(a.categoria) LIKE '%MICA%' OR UPPER(a.categoria) LIKE '%CRISTAL%' OR UPPER(a.categoria) LIKE '%LENTE%')`;
      } else if (categoria === "A" || categoria === "ACCESORIO") {
        query += ` AND (a.categoria = 'A' OR UPPER(a.categoria) LIKE '%ACCESORIO%')`;
      } else if (categoria === "SERVICIO") {
        query += ` AND (a.categoria = 'SERVICIO' OR UPPER(a.categoria) LIKE '%SERVICIO%')`;
      }
    }

    query += ` GROUP BY a.id_articulo, a.codigo, a.nombre, a.categoria, a.precio_venta, a.costo, det.marca, det.color, det.material, det.estilo ORDER BY a.id_articulo DESC LIMIT ? OFFSET ?`;
    queryParams.push(limit, offset);

    const [articulos] = await pool.query(query, queryParams);

    let stocksPorArticulo = {};
    if (articulos.length > 0) {
      const ids = articulos.map(a => a.id_articulo);
      const [branchStocks] = await pool.query(
        `SELECT inv.id_articulo, inv.id_sucursal, inv.stock_actual 
         FROM INVENTARIO_SUCURSAL inv 
         JOIN SUCURSALES s ON inv.id_sucursal = s.id_sucursal AND s.activo = 1 
         WHERE inv.id_articulo IN (?)`,
        [ids]
      ).catch(async () => await pool.query(
        `SELECT inv.id_articulo, inv.id_sucursal, inv.stock_actual 
         FROM inventario_sucursal inv 
         JOIN sucursales s ON inv.id_sucursal = s.id_sucursal AND s.activo = 1 
         WHERE inv.id_articulo IN (?)`,
        [ids]
      )).catch(() => [[]]);

      (branchStocks || []).forEach(row => {
        if (!stocksPorArticulo[row.id_articulo]) stocksPorArticulo[row.id_articulo] = {};
        stocksPorArticulo[row.id_articulo][row.id_sucursal] = Number(row.stock_actual || 0);
      });
    }

    const datosMapeados = articulos.map((art) => {
      let catLimpia = art.categoria ? art.categoria.toUpperCase().trim() : "Z";
      return {
        ...art,
        categoria: catLimpia,
        precio_venta: Number(art.precio_venta) || 0,
        costo: Number(art.costo) || 0,
        stock_actual: Number(art.stock_actual) || 0,
        stock_minimo: Number(art.stock_minimo) || 5,
        marca: art.marca || "Sin Marca",
        color: art.color || "N/A",
        material: art.material || "N/A",
        stocks_sucursales: stocksPorArticulo[art.id_articulo] || {}
      };
    });

    res.status(200).json({ success: true, data: datosMapeados });
  } catch (error) {
    console.error("Error al obtener inventario general:", error);
    res.status(500).json({ success: false, message: "Error interno del servidor." });
  }
};

const obtenerSucursales = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id_sucursal, nombre FROM SUCURSALES WHERE activo = 1 ORDER BY id_sucursal ASC')
      .catch(async () => await pool.query('SELECT id_sucursal, nombre FROM sucursales WHERE activo = 1 ORDER BY id_sucursal ASC'));
    res.status(200).json({ success: true, data: rows || [] });
  } catch (error) {
    console.error('Error al obtener sucursales:', error);
    res.status(500).json({ success: false, message: 'Error al consultar sucursales.' });
  }
};

module.exports = {
  obtenerAlertasStock,
  actualizarStock,
  trasladarStock,
  activarArticuloSucursal,
  consultarArmazones,
  obtenerInventarioGeneral,
  obtenerSucursales,
};
