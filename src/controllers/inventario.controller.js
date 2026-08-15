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
            JOIN SUCURSALES s ON inv.id_sucursal = s.id_sucursal
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

    const queryOrigen =
      "SELECT stock_actual FROM INVENTARIO_SUCURSAL WHERE id_articulo = ? AND id_sucursal = ?";
    const [rowsOrigen] = await conexion.execute(queryOrigen, [
      id_articulo,
      id_sucursal_origen,
    ]);

    if (rowsOrigen.length === 0 || rowsOrigen[0].stock_actual < cantidad) {
      await conexion.rollback();
      return res.status(400).json({
        success: false,
        message:
          "Stock insuficiente en la sucursal de origen para realizar el traslado.",
      });
    }

    const queryRestar =
      "UPDATE INVENTARIO_SUCURSAL SET stock_actual = stock_actual - ? WHERE id_articulo = ? AND id_sucursal = ?";
    await conexion.execute(queryRestar, [
      cantidad,
      id_articulo,
      id_sucursal_origen,
    ]);

    const queryVerificarDestino =
      "SELECT id_inventario FROM INVENTARIO_SUCURSAL WHERE id_articulo = ? AND id_sucursal = ?";
    const [rowsDestino] = await conexion.execute(queryVerificarDestino, [
      id_articulo,
      id_sucursal_destino,
    ]);

    if (rowsDestino.length > 0) {
      const querySumar =
        "UPDATE INVENTARIO_SUCURSAL SET stock_actual = stock_actual + ? WHERE id_articulo = ? AND id_sucursal = ?";
      await conexion.execute(querySumar, [
        cantidad,
        id_articulo,
        id_sucursal_destino,
      ]);
    } else {
      const queryInsertar = `
                INSERT INTO INVENTARIO_SUCURSAL (id_articulo, id_sucursal, stock_actual, stock_minimo) 
                VALUES (?, ?, ?, 2)
            `;
      await conexion.execute(queryInsertar, [
        id_articulo,
        id_sucursal_destino,
        Math.max(0, cantidad),
      ]);
    }

    await conexion.commit();

    res.status(200).json({
      success: true,
      message: `Se trasladaron ${cantidad} piezas correctamente de ${id_sucursal_origen} a ${id_sucursal_destino}.`,
    });
  } catch (error) {
    await conexion.rollback();
    console.error("Error al trasladar stock:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Error interno al procesar el traslado.",
      });
  } finally {
    conexion.release();
  }
};

// ==========================================
// ACTIVAR ARTÍCULO EN NUEVA SUCURSAL
// ==========================================
const activarArticuloSucursal = async (req, res) => {
  const { id_articulo, id_sucursal } = req.params;
  const { stock_inicial, stock_minimo } = req.body;

  try {
    const query = `
            INSERT INTO INVENTARIO_SUCURSAL (id_articulo, id_sucursal, stock_actual, stock_minimo)
            VALUES (?, ?, ?, ?)
        `;

    await pool.execute(query, [
      id_articulo,
      id_sucursal,
      stock_inicial,
      stock_minimo,
    ]);

    res.status(201).json({
      success: true,
      message:
        "El artículo ha sido activado en el inventario de esta sucursal.",
    });
  } catch (error) {
    console.error("Error al activar artículo en sucursal:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(400).json({
        success: false,
        message:
          "Este artículo ya está registrado en el inventario de esta sucursal.",
      });
    }

    res
      .status(500)
      .json({ success: false, message: "Error interno del servidor." });
  }
};

// ==========================================
// CONSULTA DE ARMAZONES (FILTRO RÁPIDO)
// ==========================================
const consultarArmazones = async (req, res) => {
  const { id_sucursal } = req.query;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;

  if (!id_sucursal) {
    return res
      .status(400)
      .json({ success: false, message: "Falta especificar la sucursal." });
  }

  try {
    const query = `
            SELECT a.codigo, a.nombre, det.color, det.marca, inv.stock_actual
            FROM articulos a
            JOIN inventario_sucursal inv ON a.id_articulo = inv.id_articulo
            LEFT JOIN articulo_detalle det ON a.id_articulo = det.id_articulo
            WHERE (a.categoria = 'Armazon' OR a.categoria = 'Z') 
              AND inv.id_sucursal = ? 
              AND inv.stock_actual > 0
              AND a.activo = 1
            ORDER BY a.nombre ASC
            LIMIT ? OFFSET ?
        `;

    const [armazones] = await pool.query(query, [id_sucursal, limit, offset]);

    res.status(200).json({ success: true, data: armazones });
  } catch (error) {
    console.error("Error al consultar armazones:", error);
    res
      .status(500)
      .json({ success: false, message: "Error interno del servidor." });
  }
};

// =========================================================
// OBTENER INVENTARIO GENERAL POR SUCURSAL
// =========================================================
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
            IFNULL(SUM(inv.stock_actual), 0) AS stock_actual, 
            IFNULL(MIN(inv.stock_minimo), 5) AS stock_minimo, 
            det.marca, det.color, det.material, det.estilo
        FROM articulos a
        LEFT JOIN inventario_sucursal inv ON a.id_articulo = inv.id_articulo
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
        `SELECT id_articulo, id_sucursal, stock_actual FROM INVENTARIO_SUCURSAL WHERE id_articulo IN (?)`,
        [ids]
      ).catch(() => [[]]);

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
    const [rows] = await pool.query('SELECT id_sucursal, nombre FROM SUCURSALES WHERE activo = 1')
      .catch(async () => await pool.query('SELECT id_sucursal, nombre FROM sucursales'));
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
