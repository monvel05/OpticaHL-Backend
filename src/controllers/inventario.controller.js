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
            FROM inventario_sucursal inv
            JOIN articulos a ON inv.id_articulo = a.id_articulo
            JOIN sucursales s ON inv.id_sucursal = s.id_sucursal AND s.activo = 1
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
      .json({ success: false, message: "Error interno del servidor.", detalle: error.message });
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
            UPDATE inventario_sucursal 
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
        detalle: error.message
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
            UPDATE inventario_sucursal 
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
            INSERT INTO inventario_sucursal (id_articulo, id_sucursal, stock_actual, stock_minimo)
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
            INSERT INTO audit_logs (id_usuario, accion, ruta_afectada, detalles)
            VALUES (?, 'TRASLADO_STOCK', '/api/inventario/traslado', ?)
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
      .json({ success: false, message: "Error interno al procesar el traslado.", detalle: error.message });
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
      INSERT INTO inventario_sucursal (id_articulo, id_sucursal, stock_actual, stock_minimo)
      VALUES (?, ?, 0, 5)
      ON DUPLICATE KEY UPDATE stock_actual = stock_actual
    `;
    await pool.execute(query, [id_articulo, id_sucursal]);
    res.status(200).json({ success: true, message: "Artículo activado en la sucursal." });
  } catch (error) {
    console.error("Error al activar artículo en sucursal:", error);
    res.status(500).json({ success: false, message: "Error interno.", detalle: error.message });
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
      FROM articulos a
      JOIN articulo_detalle det ON a.id_articulo = det.id_articulo
      WHERE a.categoria = 'Z' AND a.activo = 1
    `;
    const [armazones] = await pool.query(query);
    res.status(200).json({ success: true, data: armazones });
  } catch (error) {
    console.error("Error al consultar armazones:", error);
    res.status(500).json({ success: false, message: "Error interno.", detalle: error.message });
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
         FROM inventario_sucursal inv 
         JOIN sucursales s ON inv.id_sucursal = s.id_sucursal AND s.activo = 1 
         WHERE inv.id_articulo IN (?)`,
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
    res.status(500).json({ success: false, message: "Error interno del servidor.", detalle: error.message });
  }
};

const obtenerSucursales = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id_sucursal, nombre, telefono, direccion FROM sucursales WHERE activo = 1 ORDER BY id_sucursal ASC');
    res.status(200).json({ success: true, data: rows || [] });
  } catch (error) {
    console.error('Error al obtener sucursales:', error);
    res.status(500).json({ success: false, message: 'Error al consultar sucursales.', detalle: error.message });
  }
};

// ==========================================
// BÚSQUEDA DE PRODUCTOS PARA CAJA / MOSTRADOR
// ==========================================
const buscarProductosCaja = async (req, res) => {
  const termino = req.query.search || req.query.q || '';

  if (!termino || termino.trim() === '') {
    return res.status(200).json([]);
  }

  try {
    const filtro = `%${termino.trim()}%`;
    const query = `
      SELECT 
        a.id_articulo AS id_inventario,
        a.codigo AS codigo_barras,
        a.nombre,
        a.nombre AS descripcion,
        a.precio_venta AS precio,
        IFNULL(SUM(inv.stock_actual), 0) AS stock
      FROM articulos a
      LEFT JOIN inventario_sucursal inv ON a.id_articulo = inv.id_articulo
      WHERE a.activo = 1 
        AND (a.codigo LIKE ? OR a.nombre LIKE ?)
      GROUP BY a.id_articulo, a.codigo, a.nombre, a.precio_venta
      LIMIT 15
    `;

    const [productos] = await pool.query(query, [filtro, filtro]);

    const resultado = productos.map(p => ({
      ...p,
      precio: Number(p.precio) || 0,
      stock: Number(p.stock) || 0
    }));

    res.status(200).json(resultado);
  } catch (error) {
    console.error("Error al buscar productos para caja:", error);
    res.status(500).json({ success: false, message: "Error al consultar inventario.", detalle: error.message });
  }
};

// ==========================================
// 🔍 BUSCADOR UNIVERSAL MULTI-SUCURSAL
// ==========================================
const buscadorUniversal = async (req, res) => {
  const query = req.query.q || req.query.search || '';

  try {
    let sql = `
      SELECT 
        a.id_articulo,
        a.codigo,
        a.nombre,
        a.categoria,
        a.precio_venta,
        a.costo,
        det.marca,
        det.color,
        det.material
      FROM articulos a
      LEFT JOIN articulo_detalle det ON a.id_articulo = det.id_articulo
      WHERE a.activo = 1
    `;
    const params = [];

    if (query && query.trim() !== '') {
      sql += ` AND (a.codigo LIKE ? OR a.nombre LIKE ? OR det.marca LIKE ? OR a.categoria LIKE ?)`;
      const term = `%${query.trim()}%`;
      params.push(term, term, term, term);
    }

    sql += ` ORDER BY a.id_articulo DESC LIMIT 50`;

    const [articulos] = await pool.query(sql, params);

    // Obtener catálogo completo de sucursales activas
    const [sucursales] = await pool.query('SELECT id_sucursal, nombre, telefono, direccion FROM sucursales WHERE activo = 1 ORDER BY id_sucursal ASC');

    if (articulos.length === 0) {
      return res.status(200).json({ success: true, sucursales, data: [] });
    }

    const ids = articulos.map(a => a.id_articulo);
    const [stocks] = await pool.query(
      `SELECT inv.id_articulo, inv.id_sucursal, inv.stock_actual, inv.stock_minimo 
       FROM inventario_sucursal inv 
       WHERE inv.id_articulo IN (?)`,
      [ids]
    );

    const stockMap = {};
    (stocks || []).forEach(st => {
      if (!stockMap[st.id_articulo]) stockMap[st.id_articulo] = {};
      stockMap[st.id_articulo][st.id_sucursal] = Number(st.stock_actual || 0);
    });

    const resultado = articulos.map(art => {
      const stocksPorSucursal = {};
      let stockTotal = 0;
      sucursales.forEach(suc => {
        const cant = stockMap[art.id_articulo]?.[suc.id_sucursal] || 0;
        stocksPorSucursal[suc.id_sucursal] = {
          id_sucursal: suc.id_sucursal,
          nombre_sucursal: suc.nombre,
          telefono: suc.telefono || '',
          stock: cant
        };
        stockTotal += cant;
      });

      return {
        ...art,
        precio_venta: Number(art.precio_venta) || 0,
        costo: Number(art.costo) || 0,
        stock_total: stockTotal,
        sucursales_stock: stocksPorSucursal
      };
    });

    res.status(200).json({ success: true, sucursales, data: resultado });
  } catch (error) {
    console.error('Error en buscadorUniversal:', error);
    res.status(500).json({ success: false, message: 'Error interno en búsqueda universal', detalle: error.message });
  }
};

// ==========================================
// 📦 SOLICITUDES DE TRASLADO ENTRE SUCURSALES
// ==========================================

const asegurarTablaSolicitudes = async () => {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS solicitudes_traslado (
      id_solicitud INT AUTO_INCREMENT PRIMARY KEY,
      folio VARCHAR(50) UNIQUE NOT NULL,
      id_articulo INT NOT NULL,
      id_sucursal_origen VARCHAR(50) NOT NULL,
      id_sucursal_destino VARCHAR(50) NOT NULL,
      cantidad INT NOT NULL DEFAULT 1,
      id_operador_solicita INT NULL,
      id_operador_autoriza INT NULL,
      estatus ENUM('PENDIENTE', 'ACEPTADA', 'RECHAZADA', 'RECIBIDA') DEFAULT 'PENDIENTE',
      motivo TEXT NULL,
      fecha_solicitud TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      fecha_autorizacion DATETIME NULL,
      fecha_recepcion DATETIME NULL,
      CONSTRAINT fk_traslado_art FOREIGN KEY (id_articulo) REFERENCES articulos(id_articulo),
      INDEX idx_traslado_orig (id_sucursal_origen),
      INDEX idx_traslado_dest (id_sucursal_destino)
    ) ENGINE=InnoDB;
  `;
  await pool.query(createTableSQL).catch(err => console.warn('Aviso crear solicitudes_traslado:', err.message));
};

const crearSolicitudTraslado = async (req, res) => {
  const { id_articulo, id_sucursal_origen, id_sucursal_destino, cantidad, motivo } = req.body;
  const id_operador = req.usuario?.id_operador || req.user?.id_operador || 1;

  if (!id_articulo || !id_sucursal_origen || !id_sucursal_destino) {
    return res.status(400).json({ success: false, message: 'Artículo, sucursal origen y sucursal destino son obligatorios.' });
  }

  if (id_sucursal_origen === id_sucursal_destino) {
    return res.status(400).json({ success: false, message: 'La sucursal de origen y destino no pueden ser la misma.' });
  }

  const cant = parseInt(cantidad) || 1;
  if (cant <= 0) {
    return res.status(400).json({ success: false, message: 'La cantidad debe ser mayor a 0.' });
  }

  try {
    // Validar que la sucursal de origen tenga stock suficiente
    const [invRows] = await pool.query(
      'SELECT stock_actual FROM inventario_sucursal WHERE id_articulo = ? AND id_sucursal = ?',
      [id_articulo, id_sucursal_origen]
    );

    const stockActual = invRows[0]?.stock_actual || 0;
    if (stockActual < cant) {
      return res.status(400).json({
        success: false,
        message: `La sucursal origen solo cuenta con ${stockActual} unidades disponibles.`
      });
    }

    const folio = `TRAS-${Date.now().toString().slice(-6)}`;

    const [result] = await pool.query(
      `INSERT INTO solicitudes_traslado 
       (folio, id_articulo, id_sucursal_origen, id_sucursal_destino, cantidad, id_operador_solicita, motivo, estatus)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDIENTE')`,
      [folio, id_articulo, id_sucursal_origen, id_sucursal_destino, cant, id_operador, motivo || null]
    );

    res.status(201).json({
      success: true,
      message: 'Solicitud de traslado enviada exitosamente.',
      id_solicitud: result.insertId,
      folio
    });
  } catch (error) {
    console.error('Error al crear solicitud de traslado:', error);
    res.status(500).json({ success: false, message: 'Error al registrar solicitud de traslado.', detalle: error.message });
  }
};

const obtenerSolicitudesTraslado = async (req, res) => {
  const { id_sucursal, estatus } = req.query;

  try {
    let query = `
      SELECT 
        st.id_solicitud,
        st.folio,
        st.id_articulo,
        a.codigo AS codigo_articulo,
        a.nombre AS nombre_articulo,
        a.precio_venta,
        st.id_sucursal_origen,
        so.nombre AS sucursal_origen,
        so.telefono AS telefono_origen,
        st.id_sucursal_destino,
        sd.nombre AS sucursal_destino,
        sd.telefono AS telefono_destino,
        st.cantidad,
        st.estatus,
        st.motivo,
        st.fecha_solicitud,
        st.fecha_autorizacion,
        st.fecha_recepcion,
        op_sol.nombre_completo AS operador_solicita,
        op_aut.nombre_completo AS operador_autoriza
      FROM solicitudes_traslado st
      JOIN articulos a ON st.id_articulo = a.id_articulo
      JOIN sucursales so ON st.id_sucursal_origen = so.id_sucursal
      JOIN sucursales sd ON st.id_sucursal_destino = sd.id_sucursal
      LEFT JOIN operadores op_sol ON st.id_operador_solicita = op_sol.id_operador
      LEFT JOIN operadores op_aut ON st.id_operador_autoriza = op_aut.id_operador
      WHERE 1=1
    `;
    const params = [];

    if (id_sucursal && id_sucursal !== '0' && id_sucursal !== 'TODAS') {
      query += ` AND (st.id_sucursal_origen = ? OR st.id_sucursal_destino = ?)`;
      params.push(id_sucursal, id_sucursal);
    }

    if (estatus && estatus !== 'TODOS') {
      query += ` AND st.estatus = ?`;
      params.push(estatus);
    }

    query += ` ORDER BY st.id_solicitud DESC LIMIT 50`;

    const [rows] = await pool.query(query, params);
    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') {
      await asegurarTablaSolicitudes();
      return res.status(200).json({ success: true, data: [] });
    }
    console.error('Error al obtener solicitudes de traslado:', error);
    res.status(500).json({ success: false, message: 'Error interno al consultar traslados.', detalle: error.message });
  }
};

const responderSolicitudTraslado = async (req, res) => {
  const { id } = req.params;
  const { accion } = req.body; // 'ACEPTAR' o 'RECHAZAR'
  const id_operador = req.usuario?.id_operador || req.user?.id_operador || 1;

  if (!accion || !['ACEPTAR', 'RECHAZAR'].includes(accion.toUpperCase())) {
    return res.status(400).json({ success: false, message: "Acción inválida. Use 'ACEPTAR' o 'RECHAZAR'." });
  }

  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();

    const [solRows] = await conexion.query(
      'SELECT * FROM solicitudes_traslado WHERE id_solicitud = ? FOR UPDATE',
      [id]
    );

    if (solRows.length === 0) {
      await conexion.rollback();
      return res.status(404).json({ success: false, message: 'Solicitud no encontrada.' });
    }

    const sol = solRows[0];
    if (sol.estatus !== 'PENDIENTE') {
      await conexion.rollback();
      return res.status(400).json({ success: false, message: `La solicitud ya fue procesada (Estatus: ${sol.estatus}).` });
    }

    if (accion.toUpperCase() === 'RECHAZAR') {
      await conexion.query(
        "UPDATE solicitudes_traslado SET estatus = 'RECHAZADA', id_operador_autoriza = ?, fecha_autorizacion = NOW() WHERE id_solicitud = ?",
        [id_operador, id]
      );
      await conexion.commit();
      return res.status(200).json({ success: true, message: 'Solicitud de traslado rechazada.' });
    }

    // ACEPTAR: Descontar de la sucursal de origen y generar ficha de salida
    const [resDescuento] = await conexion.execute(
      `UPDATE inventario_sucursal 
       SET stock_actual = stock_actual - ? 
       WHERE id_articulo = ? AND id_sucursal = ? AND stock_actual >= ?`,
      [sol.cantidad, sol.id_articulo, sol.id_sucursal_origen, sol.cantidad]
    );

    if (resDescuento.affectedRows === 0) {
      await conexion.rollback();
      return res.status(400).json({
        success: false,
        message: 'Stock insuficiente en la sucursal de origen para autorizar la salida.'
      });
    }

    // Actualizar estatus a ACEPTADA
    await conexion.query(
      "UPDATE solicitudes_traslado SET estatus = 'ACEPTADA', id_operador_autoriza = ?, fecha_autorizacion = NOW() WHERE id_solicitud = ?",
      [id_operador, id]
    );

    // Registrar en auditoría
    await conexion.execute(
      `INSERT INTO audit_logs (id_usuario, accion, ruta_afectada, detalles)
       VALUES (?, 'FICHA_SALIDA_TRASLADO', '/api/inventario/solicitudes-traslado', ?)`,
      [id_operador, `Salida autorizada de ${sol.cantidad} pzs de art. ID ${sol.id_articulo} de sucursal ${sol.id_sucursal_origen} hacia ${sol.id_sucursal_destino}. Folio: ${sol.folio}`]
    );

    await conexion.commit();

    res.status(200).json({
      success: true,
      message: 'Solicitud aceptada. Se descontó del inventario de origen y se generó la ficha de salida.',
      folio: sol.folio
    });
  } catch (error) {
    await conexion.rollback();
    console.error('Error al responder solicitud traslado:', error);
    res.status(500).json({ success: false, message: 'Error interno al procesar traslado.', detalle: error.message });
  } finally {
    conexion.release();
  }
};

const recibirSolicitudTraslado = async (req, res) => {
  const { id } = req.params;
  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();

    const [solRows] = await conexion.query(
      'SELECT * FROM solicitudes_traslado WHERE id_solicitud = ? FOR UPDATE',
      [id]
    );

    if (solRows.length === 0) {
      await conexion.rollback();
      return res.status(404).json({ success: false, message: 'Solicitud no encontrada.' });
    }

    const sol = solRows[0];
    if (sol.estatus !== 'ACEPTADA') {
      await conexion.rollback();
      return res.status(400).json({ success: false, message: 'Solo se pueden recibir solicitudes con estatus ACEPTADA.' });
    }

    // Aumentar en inventario de destino
    const queryAumento = `
      INSERT INTO inventario_sucursal (id_articulo, id_sucursal, stock_actual, stock_minimo)
      VALUES (?, ?, ?, 5)
      ON DUPLICATE KEY UPDATE stock_actual = stock_actual + ?
    `;
    await conexion.execute(queryAumento, [sol.id_articulo, sol.id_sucursal_destino, sol.cantidad, sol.cantidad]);

    // Marcar como RECIBIDA
    await conexion.query(
      "UPDATE solicitudes_traslado SET estatus = 'RECIBIDA', fecha_recepcion = NOW() WHERE id_solicitud = ?",
      [id]
    );

    await conexion.commit();

    res.status(200).json({ success: true, message: 'Producto recibido e ingresado al inventario de la sucursal destino.' });
  } catch (error) {
    await conexion.rollback();
    console.error('Error al recibir traslado:', error);
    res.status(500).json({ success: false, message: 'Error interno al confirmar recepción.', detalle: error.message });
  } finally {
    conexion.release();
  }
};

const obtenerFichaSalida = async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await pool.query(
      `SELECT 
        st.id_solicitud,
        st.folio,
        st.cantidad,
        st.estatus,
        st.motivo,
        st.fecha_solicitud,
        st.fecha_autorizacion,
        a.id_articulo,
        a.codigo,
        a.nombre,
        a.precio_venta,
        det.marca,
        det.color,
        det.material,
        so.id_sucursal AS sucursal_origen_id,
        so.nombre AS sucursal_origen_nombre,
        so.direccion AS sucursal_origen_direccion,
        so.telefono AS sucursal_origen_telefono,
        sd.id_sucursal AS sucursal_destino_id,
        sd.nombre AS sucursal_destino_nombre,
        sd.direccion AS sucursal_destino_direccion,
        sd.telefono AS sucursal_destino_telefono,
        op_sol.nombre_completo AS operador_solicita,
        op_aut.nombre_completo AS operador_autoriza
       FROM solicitudes_traslado st
       JOIN articulos a ON st.id_articulo = a.id_articulo
       LEFT JOIN articulo_detalle det ON a.id_articulo = det.id_articulo
       JOIN sucursales so ON st.id_sucursal_origen = so.id_sucursal
       JOIN sucursales sd ON st.id_sucursal_destino = sd.id_sucursal
       LEFT JOIN operadores op_sol ON st.id_operador_solicita = op_sol.id_operador
       LEFT JOIN operadores op_aut ON st.id_operador_autoriza = op_aut.id_operador
       WHERE st.id_solicitud = ? OR st.folio = ?`,
      [id, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ficha de salida no encontrada.' });
    }

    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Error al obtener ficha de salida:', error);
    res.status(500).json({ success: false, message: 'Error al consultar la ficha de salida.', detalle: error.message });
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
  buscarProductosCaja,
  buscadorUniversal,
  crearSolicitudTraslado,
  obtenerSolicitudesTraslado,
  responderSolicitudTraslado,
  recibirSolicitudTraslado,
  obtenerFichaSalida
};
