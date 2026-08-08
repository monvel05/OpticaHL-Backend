// src/controllers/orden.controller.js
const pool = require('../config/db');

// Crear Orden de venta
const crearOrden = async (req, res) => {
  console.log("=== DATOS RECIBIDOS DESDE EL FRONTEND ===");
  console.log(JSON.stringify(req.body, null, 2));
  console.log("=========================================");

  const { id_cliente, id_sucursal, total } = req.body;
  const id_operador = req.usuario?.id || req.user?.id || 1; 

  let listaArticulos = null;
  for (let key in req.body) {
    if (Array.isArray(req.body[key])) {
      listaArticulos = req.body[key];
      console.log(`-> Se detectó el arreglo de productos en la propiedad: '${key}'`);
      break;
    }
  }

  if (!listaArticulos || !Array.isArray(listaArticulos)) {
    console.error("❌ ERROR: No se encontró ningún arreglo de productos en req.body");
    return res.status(400).json({ 
      exito: false, 
      mensaje: 'El backend no recibió una lista de productos válida. Revisa la terminal.' 
    });
  }

  const safeIdCliente = id_cliente || null; 
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const folio_orden = `ORD-${id_sucursal || 'HL01'}-${Date.now()}`; 
    
    await connection.query(
      `INSERT INTO orden (folio_orden, id_sucursal, fecha_emision, id_cliente, id_operador, total, estatus) 
       VALUES (?, ?, NOW(), ?, ?, ?, 'PENDIENTE')`,
      [folio_orden, id_sucursal || 'HL01', safeIdCliente, id_operador, total || 0]
    );

    for (let item of listaArticulos) {
      const idArticulo = item.id_articulo || item.id || item.codigo;
      const cantidad = item.cantidad || item.qty || item.cant || 1;
      const precio = item.precio_unitario || item.precio || item.precio_venta || item.costo || 0;

      await connection.query(
        `INSERT INTO detalle_venta (folio_orden, id_articulo, cantidad, precio_unitario) 
         VALUES (?, ?, ?, ?)`,
        [folio_orden, idArticulo, cantidad, precio]
      );

      await connection.query(
        `UPDATE inventario_sucursal 
         SET stock_actual = stock_actual - ? 
         WHERE id_articulo = ? AND id_sucursal = ? AND stock_actual >= ?`,
        [cantidad, idArticulo, id_sucursal || 'HL01', cantidad]
      );
    }

    await connection.commit();
    console.log("✅ ¡Orden guardada con éxito en la Base de Datos!");
    res.status(201).json({ exito: true, mensaje: 'Orden creada con éxito', folio: folio_orden });
  } catch (error) {
    await connection.rollback();
    console.error('❌ Error en la base de datos al crear orden:', error);
    res.status(500).json({ exito: false, mensaje: 'Error interno en la base de datos.' });
  } finally {
    connection.release();
  }
};

// Obtener Órdenes (General y por Folio Individual)
const obtenerOrdenes = async (req, res) => {
  // 🎯 Detectamos si el folio viene en la URL como /:id
  const { id } = req.params; 
  const { fecha_inicio, fecha_fin, estatus, id_cliente } = req.query;

  // Si viene un ID/Folio en los parámetros, buscamos solo esa orden con sus detalles
  if (id) {
    try {
      const queryOrden = `
        SELECT o.folio_orden AS folio, o.fecha_emision, o.total, o.estatus, c.nombre_completo AS paciente_nombre 
        FROM orden o 
        JOIN clientes c ON o.id_cliente = c.id_cliente
        WHERE o.folio_orden = ?`;
      
      const [ordenRows] = await pool.query(queryOrden, [id]);

      if (ordenRows.length === 0) {
        return res.status(404).json({ exito: false, mensaje: 'Orden no encontrada.' });
      }

      // Opcional: También traemos los artículos de esa orden para mostrarlos en la caja
      const queryDetalles = `
        SELECT dv.id_articulo, dv.cantidad, dv.precio_unitario
        FROM detalle_venta dv
        WHERE dv.folio_orden = ?`;
      const [detalles] = await pool.query(queryDetalles, [id]);

      // Unimos la orden con sus productos en la respuesta
      const ordenCompleta = { ...ordenRows[0], articulos: detalles };

      return res.status(200).json({ exito: true, datos: ordenCompleta });
    } catch (error) {
      console.error('Error al obtener orden por folio:', error);
      return res.status(500).json({ exito: false, mensaje: 'Error al obtener la orden.' });
    }
  }

  // SI NO VIENE ID, BUSCAMOS TODAS NORMALMENTE POR FILTROS
  let query = `SELECT o.folio_orden AS folio, o.fecha_emision, o.total, o.estatus, c.nombre_completo AS paciente_nombre 
               FROM orden o JOIN clientes c ON o.id_cliente = c.id_cliente`;

  const params = [];
  if (fecha_inicio && fecha_fin) {
    query += ` WHERE DATE(o.fecha_emision) BETWEEN ? AND ?`;
    params.push(fecha_inicio, fecha_fin);
  }
  if (estatus) {
    query += params.length ? ` AND o.estatus = ?` : ` WHERE o.estatus = ?`;
    params.push(estatus);
  }
  if (id_cliente) {
    query += params.length ? ` AND o.id_cliente = ?` : ` WHERE o.id_cliente = ?`;
    params.push(id_cliente);
  }

  try {
    const [ordenes] = await pool.query(query, params);
    res.status(200).json({ exito: true, datos: ordenes });
  } catch (error) {
    console.error('Error al obtener órdenes:', error);
    res.status(500).json({ exito: false, mensaje: 'Error al obtener las órdenes.' });
  }
};

// Modificar Orden
const modificarOrden = async (req, res) => {
  const folio = req.params.id; 
  const { estatus } = req.body; 

  try {
    await pool.query(
      `UPDATE orden SET estatus = ? WHERE folio_orden = ?`,
      [estatus, folio]
    );
    res.status(200).json({ exito: true, mensaje: 'Orden actualizada correctamente.' });
  } catch (error) {
    console.error('Error al modificar orden:', error);
    res.status(500).json({ exito: false, mensaje: 'Error al actualizar la orden.' });
  }
};

// Registrar Pago
const registrarPago = async (req, res) => {
  const folio = req.params.id;
  const { monto, metodo_pago, id_sucursal } = req.body;
  const usuarioId = req.usuario?.id || req.user?.id || 1;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    await connection.query(
      `INSERT INTO movimientos_caja (id_sucursal, id_operador, folio_orden, tipo_movimiento, metodo_pago, monto, fecha_hora, concepto) 
       VALUES (?, ?, ?, 'INGRESO', ?, ?, NOW(), 'Abono a Orden')`,
      [id_sucursal || 'HL01', usuarioId, folio, metodo_pago, monto]
    );

    const [pagos] = await connection.query(
      `SELECT SUM(monto) as totalPagado FROM movimientos_caja WHERE folio_orden = ? AND tipo_movimiento = 'INGRESO'`,
      [folio]
    );
    const [orden] = await connection.query(`SELECT total FROM orden WHERE folio_orden = ?`, [folio]);
    
    if (pagos[0].totalPagado >= orden[0].total) {
      await connection.query(`UPDATE orden SET estatus = 'PAGADO' WHERE folio_orden = ?`, [folio]);
    } else {
      await connection.query(`UPDATE orden SET estatus = 'ANTICIPO' WHERE folio_orden = ?`, [folio]);
    }

    await connection.commit();
    res.status(200).json({ exito: true, mensaje: 'Pago registrado correctamente.' });
  } catch (error) {
    await connection.rollback();
    console.error('Error al registrar pago:', error);
    res.status(500).json({ exito: false, mensaje: 'Error al procesar el pago.' });
  } finally {
    connection.release();
  }
};

// Cancelar Orden
const cancelarOrden = async (req, res) => {
  const folio = req.params.id;
  const usuarioId = req.usuario?.id || req.user?.id || 1;
  const { id_sucursal } = req.body; 
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [ordenRows] = await connection.query('SELECT estatus FROM orden WHERE folio_orden = ? FOR UPDATE', [folio]);
    if (ordenRows.length === 0) throw new Error('La orden no existe.');
    if (ordenRows[0].estatus === 'CANCELADA') throw new Error('Esta orden ya fue cancelada previamente.');

    await connection.query('UPDATE orden SET estatus = "CANCELADA" WHERE folio_orden = ?', [folio]);

    const [detalles] = await connection.query('SELECT id_articulo, cantidad FROM detalle_venta WHERE folio_orden = ?', [folio]);
    for (let item of detalles) {
      await connection.query(
        'UPDATE inventario_sucursal SET stock_actual = stock_actual + ? WHERE id_articulo = ? AND id_sucursal = ?',
        [item.cantidad, item.id_articulo, id_sucursal || 'HL01']
      );
    }

    const [pagosRows] = await connection.query(
      'SELECT IFNULL(SUM(monto), 0) as totalPagado FROM movimientos_caja WHERE folio_orden = ? AND tipo_movimiento = "INGRESO"',
      [folio]
    );
    const totalDevolver = pagosRows[0].totalPagado;

    if (totalDevolver > 0) {
      await connection.query(
        `INSERT INTO movimientos_caja (id_sucursal, id_operador, folio_orden, tipo_movimiento, metodo_pago, monto, fecha_hora, concepto) 
         VALUES (?, ?, ?, 'SALIDA', 'EFECTIVO', ?, NOW(), 'Devolución por Cancelación')`,
        [id_sucursal || 'HL01', usuarioId, folio, totalDevolver]
      );
    }

    await connection.commit();
    res.status(200).json({ exito: true, mensaje: 'Orden cancelada, inventario restaurado y dinero devuelto en caja.' });
  } catch (error) {
    await connection.rollback();
    console.error('Error en cancelación:', error.message);
    res.status(500).json({ exito: false, mensaje: error.message });
  } finally {
    connection.release();
  }
};

// Obtener Cuentas por Cobrar
const obtenerCuentasPorCobrar = async (req, res) => {
  try {
    const query = `
      SELECT o.folio_orden AS orden_id, o.fecha_emision AS fecha, o.estatus, o.total, c.nombre_completo AS paciente_nombre,
             IFNULL(SUM(m.monto), 0) AS total_pagado,
             (o.total - IFNULL(SUM(m.monto), 0)) AS saldo_pendiente
      FROM orden o
      JOIN clientes c ON o.id_cliente = c.id_cliente
      LEFT JOIN movimientos_caja m ON o.folio_orden = m.folio_orden AND m.tipo_movimiento = 'INGRESO'
      WHERE o.estatus IN ('PENDIENTE', 'ANTICIPO', 'Pendiente', 'Con Anticipo')
      GROUP BY o.folio_orden
      HAVING saldo_pendiente > 0
      ORDER BY o.fecha_emision ASC
    `;
    
    const [cuentas] = await pool.query(query);
    res.status(200).json({ exito: true, datos: cuentas });
  } catch (error) {
    console.error('Error al obtener cuentas por cobrar:', error);
    res.status(500).json({ exito: false, mensaje: 'Error al obtener las cuentas por cobrar.' });
  }
};

module.exports = { 
  crearOrden, 
  obtenerOrdenes, 
  modificarOrden, 
  registrarPago, 
  cancelarOrden, 
  obtenerCuentasPorCobrar 
};