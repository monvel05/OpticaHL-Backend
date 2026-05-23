const pool = require('../config/db');

const crearOrden = async (req, res) => {
  const { id_cliente, id_sucursal, articulos, total } = req.body;
  const id_operador = req.usuario.id; 
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const folio_orden = `ORD-${id_sucursal}-${Date.now()}`; 
    await connection.query(
      `INSERT INTO orden (folio, id_sucursal, fecha_emision, id_cliente, id_operador, total, estatus) 
       VALUES (?, ?, NOW(), ?, ?, ?, 'Pendiente')`,
      [folio_orden, id_sucursal, id_cliente, id_operador, total]
    );

    for (let item of articulos) {
      await connection.query(
        `INSERT INTO detalle_venta (folio_orden, id_articulo, cantidad, precio_unitario) 
         VALUES (?, ?, ?, ?)`,
        [folio_orden, item.id_articulo, item.cantidad, item.precio]
      );

      await connection.query(
        `UPDATE inventario_sucursal 
         SET stock_actual = stock_actual - ? 
         WHERE id_articulo = ? AND id_sucursal = ? AND stock_actual >= ?`,
        [item.cantidad, item.id_articulo, id_sucursal, item.cantidad]
      );
    }

    await connection.commit();
    res.status(201).json({ exito: true, mensaje: 'Orden creada con éxito', folio: folio_orden });
  } catch (error) {
    await connection.rollback();
    console.error('Error al crear orden:', error);
    res.status(500).json({ exito: false, mensaje: 'Error al procesar la orden.' });
  } finally {
    connection.release();
  }
};

const obtenerOrdenes = async (req, res) => {
  const { fecha_inicio, fecha_fin, estatus, id_cliente } = req.query;
  // CAMBIO: Ahora usamos 'clientes' en lugar de 'PACIENTE'
  let query = `SELECT o.folio, o.fecha_emision, o.total, o.estatus, c.nombre_completo AS paciente_nombre 
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

const modificarOrden = async (req, res) => {
  const folio = req.params.id; // Ahora usamos folio en lugar de ID
  const { estatus } = req.body; 

  try {
    await pool.query(
      `UPDATE orden SET estatus = ? WHERE folio = ?`,
      [estatus, folio]
    );
    res.status(200).json({ exito: true, mensaje: 'Orden actualizada correctamente.' });
  } catch (error) {
    console.error('Error al modificar orden:', error);
    res.status(500).json({ exito: false, mensaje: 'Error al actualizar la orden.' });
  }
};

const registrarPago = async (req, res) => {
  const folio = req.params.id;
  const { monto, metodo_pago, id_sucursal } = req.body;
  const usuarioId = req.usuario.id;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // CAMBIO: Ahora insertamos en movimientos_caja en lugar de CAJA
    await connection.query(
      `INSERT INTO movimientos_caja (id_sucursal, id_operador, folio_orden, tipo_movimiento, metodo_pago, monto, fecha_hora, concepto) 
       VALUES (?, ?, ?, 'ENTRADA', ?, ?, NOW(), 'Abono a Orden')`,
      [id_sucursal, usuarioId, folio, metodo_pago, monto]
    );

    const [pagos] = await connection.query(
      `SELECT SUM(monto) as totalPagado FROM movimientos_caja WHERE folio_orden = ? AND tipo_movimiento = 'ENTRADA'`,
      [folio]
    );
    const [orden] = await connection.query(`SELECT total FROM orden WHERE folio = ?`, [folio]);
    
    if (pagos[0].totalPagado >= orden[0].total) {
      await connection.query(`UPDATE orden SET estatus = 'Liquidada' WHERE folio = ?`, [folio]);
    } else {
      await connection.query(`UPDATE orden SET estatus = 'Con Anticipo' WHERE folio = ?`, [folio]);
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

const cancelarOrden = async (req, res) => {
  const folio = req.params.id;
  const usuarioId = req.usuario.id;
  const { id_sucursal } = req.body; // Necesitamos saber la sucursal para devolver stock
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [ordenRows] = await connection.query('SELECT estatus FROM orden WHERE folio = ? FOR UPDATE', [folio]);
    if (ordenRows.length === 0) throw new Error('La orden no existe.');
    if (ordenRows[0].estatus === 'Cancelada') throw new Error('Esta orden ya fue cancelada previamente.');

    await connection.query('UPDATE orden SET estatus = "Cancelada" WHERE folio = ?', [folio]);

    // CAMBIO: Usamos detalle_venta e inventario_sucursal
    const [detalles] = await connection.query('SELECT id_articulo, cantidad FROM detalle_venta WHERE folio_orden = ?', [folio]);
    for (let item of detalles) {
      await connection.query(
        'UPDATE inventario_sucursal SET stock_actual = stock_actual + ? WHERE id_articulo = ? AND id_sucursal = ?',
        [item.cantidad, item.id_articulo, id_sucursal]
      );
    }

    // CAMBIO: Checamos en movimientos_caja
    const [pagosRows] = await connection.query(
      'SELECT IFNULL(SUM(monto), 0) as totalPagado FROM movimientos_caja WHERE folio_orden = ? AND tipo_movimiento = "ENTRADA"',
      [folio]
    );
    const totalDevolver = pagosRows[0].totalPagado;

    if (totalDevolver > 0) {
      await connection.query(
        `INSERT INTO movimientos_caja (id_sucursal, id_operador, folio_orden, tipo_movimiento, metodo_pago, monto, fecha_hora, concepto) 
         VALUES (?, ?, ?, 'SALIDA', 'Efectivo', ?, NOW(), 'Devolución por Cancelación')`,
        [id_sucursal, usuarioId, folio, totalDevolver]
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

const obtenerCuentasPorCobrar = async (req, res) => {
  try {
    // CAMBIO: Ahora usamos orden, clientes y movimientos_caja
    const query = `
      SELECT o.folio AS orden_id, o.fecha_emision AS fecha, o.estatus, o.total, c.nombre_completo AS paciente_nombre,
             IFNULL(SUM(m.monto), 0) AS total_pagado,
             (o.total - IFNULL(SUM(m.monto), 0)) AS saldo_pendiente
      FROM orden o
      JOIN clientes c ON o.id_cliente = c.id_cliente
      LEFT JOIN movimientos_caja m ON o.folio = m.folio_orden AND m.tipo_movimiento = 'ENTRADA'
      WHERE o.estatus IN ('Pendiente', 'Con Anticipo')
      GROUP BY o.folio
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

module.exports = {crearOrden, obtenerOrdenes, modificarOrden, registrarPago, cancelarOrden, obtenerCuentasPorCobrar};