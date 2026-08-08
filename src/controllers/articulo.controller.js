// src/controllers/articulo.controller.js
const pool = require("../config/db");

// ==========================================
// CREATE: Crear un nuevo artículo (Transacción)
// ==========================================
const crearArticulo = async (req, res) => {
  const { 
    codigo, nombre, categoria, id_proveedor, costo, precio_venta, 
    marca, color, material, estilo, puente, diagonal, base, 
    id_sucursal, stock_inicial, stock_minimo, stocks_sucursales,
    creado_por 
  } = req.body;

  const safeCodigo = codigo || null;
  const safeNombre = nombre || null;
  const safeCategoria = categoria || 'GENERAL';
  const safeIdProveedor = id_proveedor || null;
  const safeCosto = costo || 0.00;
  const safePrecioVenta = precio_venta || 0.00;
  const safeCreadoPor = creado_por || null;

  const safeMarca = marca || null;
  const safeColor = color || null;
  const safeMaterial = material || null;
  const safeEstilo = estilo || null;
  const safePuente = puente || null;
  const safeDiagonal = diagonal || null;
  const safeBase = base || null;

  const safeIdSucursal = id_sucursal || 'HL01';
  const safeStockInicial = stock_inicial || 0;
  const safeStockMinimo = stock_minimo || 5;

  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();

    const queryArticulo = `
            INSERT INTO ARTICULOS (codigo, nombre, categoria, id_proveedor, costo, precio_venta, creado_por)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
    const [resultArticulo] = await conexion.execute(queryArticulo, [
      safeCodigo,
      safeNombre,
      safeCategoria,
      safeIdProveedor,
      safeCosto,
      safePrecioVenta,
      safeCreadoPor,
    ]);
    const idNuevoArticulo = resultArticulo.insertId;

    if (safeCategoria !== 'SERVICIO') { 
      const queryDetalle = `
                INSERT INTO ARTICULO_DETALLE (id_articulo, marca, color, material, estilo, puente, diagonal, base)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;
      await conexion.execute(queryDetalle, [
        idNuevoArticulo,
        safeMarca,
        safeColor,
        safeMaterial,
        safeEstilo,
        safePuente,
        safeDiagonal,
        safeBase,
      ]);

      const [dbSucursales] = await conexion.query('SELECT id_sucursal FROM SUCURSALES')
        .catch(async () => await conexion.query('SELECT id_sucursal FROM sucursales'))
        .catch(() => [[]]);
      const validSucIds = (dbSucursales && dbSucursales.length > 0)
        ? new Set(dbSucursales.map(s => String(s.id_sucursal)))
        : null;

      const sucursalesProcesar = stocks_sucursales && typeof stocks_sucursales === 'object'
        ? Object.keys(stocks_sucursales)
        : [safeIdSucursal];

      for (const sucId of sucursalesProcesar) {
        if (validSucIds && !validSucIds.has(String(sucId))) {
          console.warn(`Omitiendo sucursal no registrada en BD: ${sucId}`);
          continue;
        }

        const cantStock = stocks_sucursales && stocks_sucursales[sucId] !== undefined
          ? Number(stocks_sucursales[sucId])
          : safeStockInicial;
        const queryInventario = `
                  INSERT INTO INVENTARIO_SUCURSAL (id_articulo, id_sucursal, stock_actual, stock_minimo)
                  VALUES (?, ?, ?, ?)
                  ON DUPLICATE KEY UPDATE stock_actual = VALUES(stock_actual), stock_minimo = VALUES(stock_minimo)
              `;
        await conexion.execute(queryInventario, [
          idNuevoArticulo,
          sucId,
          cantStock,
          safeStockMinimo,
        ]);
      }
    }

    await conexion.commit();

    res.status(201).json({
      success: true,
      message: 'Registro guardado correctamente.',
      id_articulo: idNuevoArticulo
    });

  } catch (error) {
    await conexion.rollback();
    console.error('Error en la transacción de creación:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: 'El código ya existe.' });
    }
    res.status(500).json({ success: false, message: "Error interno al registrar." });
  } finally {
    conexion.release();
  }
};

// ==========================================
// READ: Obtener artículos activos
// ==========================================
const obtenerArticulos = async (req, res) => {
  const id_sucursal = req.query.id_sucursal || 'HL01';

  try {
    let query = `
            SELECT 
                a.id_articulo, a.codigo, a.nombre, a.categoria, a.precio_venta, a.costo,
                d.marca, d.color, d.material, d.estilo,
                COALESCE(i.stock_actual, 0) as stock_actual, 
                COALESCE(i.stock_minimo, 5) as stock_minimo
            FROM ARTICULOS a
            LEFT JOIN ARTICULO_DETALLE d ON a.id_articulo = d.id_articulo
            LEFT JOIN INVENTARIO_SUCURSAL i ON a.id_articulo = i.id_articulo AND i.id_sucursal = ?
            WHERE a.activo = 1
        `;

    const queryParams = [id_sucursal];

    if (req.query.id_sucursal) {
      query += ` AND i.id_sucursal = ?`;
      queryParams.push(id_sucursal);
    }

    const [articulos] = await pool.query(query, queryParams);

    res.status(200).json({
      success: true,
      data: articulos
    });

  } catch (error) {
    console.error('Error al obtener artículos:', error);
    res.status(500).json({ success: false, message: 'Error al consultar los artículos.' });
  }
};

// ==========================================
// UPDATE: Actualizar datos de un artículo
// ==========================================
const actualizarArticulo = async (req, res) => {
  const { id_articulo } = req.params;
  const { 
    nombre, categoria, costo, precio_venta, 
    marca, color, material, estilo, puente, diagonal, base,
    id_sucursal, stock_inicial, stock_minimo, stocks_sucursales
  } = req.body;

  const safeMarca = marca || null;
  const safeColor = color || null;
  const safeMaterial = material || null;
  const safeEstilo = estilo || null;
  const safePuente = puente || null;
  const safeDiagonal = diagonal || null;
  const safeBase = base || null;

  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();

    const queryArticulo = `
            UPDATE ARTICULOS 
            SET nombre = ?, categoria = ?, costo = ?, precio_venta = ?
            WHERE id_articulo = ?
        `;
    await conexion.execute(queryArticulo, [
      nombre,
      categoria,
      costo,
      precio_venta,
      id_articulo,
    ]);

    if (categoria !== 'SERVICIO') {
      const queryDetalle = `
                INSERT INTO ARTICULO_DETALLE (id_articulo, marca, color, material, estilo, puente, diagonal, base)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                  marca = VALUES(marca), color = VALUES(color), material = VALUES(material),
                  estilo = VALUES(estilo), puente = VALUES(puente), diagonal = VALUES(diagonal), base = VALUES(base)
            `;
      await conexion.execute(queryDetalle, [
        id_articulo,
        safeMarca,
        safeColor,
        safeMaterial,
        safeEstilo,
        safePuente,
        safeDiagonal,
        safeBase,
      ]);

      const [dbSucursales] = await conexion.query('SELECT id_sucursal FROM SUCURSALES')
        .catch(async () => await conexion.query('SELECT id_sucursal FROM sucursales'))
        .catch(() => [[]]);
      const validSucIds = (dbSucursales && dbSucursales.length > 0)
        ? new Set(dbSucursales.map(s => String(s.id_sucursal)))
        : null;

      if (stocks_sucursales && typeof stocks_sucursales === 'object') {
        for (const [sucId, cant] of Object.entries(stocks_sucursales)) {
          if (validSucIds && !validSucIds.has(String(sucId))) {
            console.warn(`Omitiendo sucursal no registrada en BD: ${sucId}`);
            continue;
          }
          const queryInventario = `
            INSERT INTO INVENTARIO_SUCURSAL (id_articulo, id_sucursal, stock_actual, stock_minimo)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE stock_actual = VALUES(stock_actual), stock_minimo = VALUES(stock_minimo)
          `;
          await conexion.execute(queryInventario, [
            id_articulo,
            sucId,
            Number(cant) || 0,
            Number(stock_minimo) || 5
          ]);
        }
      } else if (id_sucursal && stock_inicial !== undefined) {
        if (!validSucIds || validSucIds.has(String(id_sucursal))) {
          const queryInventario = `
            INSERT INTO INVENTARIO_SUCURSAL (id_articulo, id_sucursal, stock_actual, stock_minimo)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE stock_actual = VALUES(stock_actual), stock_minimo = VALUES(stock_minimo)
          `;
          await conexion.execute(queryInventario, [
            id_articulo,
            id_sucursal,
            Number(stock_inicial) || 0,
            Number(stock_minimo) || 5
          ]);
        }
      }
    }

    await conexion.commit();

    res.status(200).json({
      success: true,
      message: "Artículo actualizado correctamente.",
    });
  } catch (error) {
    await conexion.rollback();
    console.error("Error al actualizar artículo:", error);
    res.status(500).json({ success: false, message: "Error interno al actualizar." });
  } finally {
    conexion.release();
  }
};

// ==========================================
// DELETE: Desactivar un artículo (Soft Delete)
// ==========================================
const desactivarArticulo = async (req, res) => {
  const { id_articulo } = req.params;

  try {
    const query = 'UPDATE ARTICULOS SET activo = 0 WHERE id_articulo = ?';
    const [result] = await pool.execute(query, [id_articulo]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Artículo no encontrado." });
    }

    res.status(200).json({
      success: true,
      message: "Artículo desactivado correctamente.",
    });
  } catch (error) {
    console.error("Error al desactivar artículo:", error);
    res.status(500).json({ success: false, message: "Error interno al desactivar." });
  }
};

// ==========================================
// Ajustar el stock rápidamente
// ==========================================
const actualizarStock = async (req, res) => {
  const { id_articulo } = req.params;
  const { id_sucursal, cantidad_ajuste } = req.body;

  try {
    const queryCheck = `SELECT stock_actual FROM INVENTARIO_SUCURSAL WHERE id_articulo = ? AND id_sucursal = ?`;
    const [rows] = await pool.execute(queryCheck, [id_articulo, id_sucursal]);

    if (rows.length === 0) {
      const stockInicialSeguro = cantidad_ajuste > 0 ? cantidad_ajuste : 0;
      const queryInsert = `
                INSERT INTO INVENTARIO_SUCURSAL (id_articulo, id_sucursal, stock_actual, stock_minimo)
                VALUES (?, ?, ?, 5)
            `;
      await pool.execute(queryInsert, [id_articulo, id_sucursal, stockInicialSeguro]);
    } else {
      const queryUpdate = `
                UPDATE INVENTARIO_SUCURSAL 
                SET stock_actual = stock_actual + ? 
                WHERE id_articulo = ? AND id_sucursal = ?
            `;
      await pool.execute(queryUpdate, [cantidad_ajuste, id_articulo, id_sucursal]);
    }

    res.status(200).json({ success: true, message: "Stock actualizado correctamente." });
  } catch (error) {
    console.error("Error al actualizar stock:", error);
    res.status(500).json({ success: false, message: "Error interno al actualizar inventario." });
  }
};

module.exports = {
  crearArticulo,
  obtenerArticulos,
  actualizarArticulo,
  desactivarArticulo,
  actualizarStock,
};