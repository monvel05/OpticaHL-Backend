// controllers/order.controller.js
const pool = require('../config/db');

/**
 * @module OrdenController
 * @description Controlador para gestionar el ciclo de vida de las órdenes en el Punto de Venta.
 */

/**
 * @function obtenerOrdenes
 * @description Obtiene una lista de órdenes con filtros opcionales (fecha, estatus, paciente).
 * @param {Object} req - Objeto de petición de Express. Puede contener query params para filtrado.
 * @param {Object} res - Objeto de respuesta de Express.
 * @returns {JSON} Lista de órdenes que cumplen con los criterios de búsqueda.
 */
const obtenerOrdenes = async (req, res) => {
  const { fecha_inicio, fecha_fin, estatus, paciente_id } = req.query;
  let query = `SELECT o.id, o.fecha, o.total, o.estatus, p.nombre AS paciente_nombre FROM ORDEN o JOIN PACIENTE p ON o.paciente_id = p.id`;

  const params = [];
  if (fecha_inicio && fecha_fin) {
    query += ` WHERE o.fecha BETWEEN ? AND ?`;
    params.push(fecha_inicio, fecha_fin);
  }
  if (estatus) {
    query += params.length ? ` AND o.estatus = ?` : ` WHERE o.estatus = ?`;
    params.push(estatus);
  }
  if (paciente_id) {
    query += params.length ? ` AND o.paciente_id = ?` : ` WHERE o.paciente_id = ?`;
    params.push(paciente_id);
  }

  try {
    const [ordenes] = await pool.query(query, params);
    res.status(200).json({ exito: true, datos: ordenes });
  } catch (error) {
    console.error('Error al obtener órdenes:', error);
    res.status(500).json({ exito: false, mensaje: 'Error al obtener las órdenes.' });
  }
};

/**
 * @function crearOrden
 * @description Crea una nueva orden, sus detalles y descuenta el inventario. Utiliza transacciones ACID.
 * @param {Object} req - Objeto de petición de Express. Debe contener paciente_id, rx_id, total y arreglo de articulos.
 * @param {Object} res - Objeto de respuesta de Express.
 * @returns {JSON} Objeto con el ID de la nueva orden y mensaje de éxito.
 */
const crearOrden = async (req, res) => {
  const { paciente_id, rx_id, articulos, total } = req.body;
  const usuarioId = req.usuario.id;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Crear el encabezado de la orden
    const [ordenResult] = await connection.query(
      `INSERT INTO ORDEN (paciente_id, historial_id, fecha, total, estatus, operador_id) 
       VALUES (?, ?, NOW(), ?, 'Pendiente', ?)`,
      [paciente_id, rx_id, total, usuarioId]
    );
    const nuevaOrdenId = ordenResult.insertId;

    // 2. Insertar los detalles y descontar inventario
    for (let item of articulos) {
      await connection.query(
        `INSERT INTO DETORD (orden_id, articulo_id, cantidad, precio_unitario) 
         VALUES (?, ?, ?, ?)`,
        [nuevaOrdenId, item.id, item.cantidad, item.precio]
      );

      // Bloqueamos y descontamos el stock para evitar ventas fantasma
      await connection.query(
        `UPDATE ARTICULO SET existencias = existencias - ? WHERE id = ? AND existencias >= ?`,
        [item.cantidad, item.id, item.cantidad]
      );
    }

    await connection.commit();
    res.status(201).json({ exito: true, mensaje: 'Orden creada con éxito', ordenId: nuevaOrdenId });
  } catch (error) {
    await connection.rollback();
    console.error('Error al crear orden:', error);
    res.status(500).json({ exito: false, mensaje: 'Error al procesar la orden.' });
  } finally {
    connection.release();
  }
};

/**
 * @function modificarOrden
 * @description Permite actualizar datos generales de una orden (ej. notas, fecha de entrega prometida).
 * @param {Object} req - Objeto de petición. req.params.id contiene el ID de la orden.
 * @param {Object} res - Objeto de respuesta.
 */
const modificarOrden = async (req, res) => {
  const orderId = req.params.id;
  const { notas, fecha_entrega } = req.body;

  try {
    await pool.query(
      `UPDATE ORDEN SET notas = ?, fecha_entrega = ? WHERE id = ?`,
      [notas, fecha_entrega, orderId]
    );
    res.status(200).json({ exito: true, mensaje: 'Orden actualizada correctamente.' });
  } catch (error) {
    console.error('Error al modificar orden:', error);
    res.status(500).json({ exito: false, mensaje: 'Error al actualizar la orden.' });
  }
};

/**
 * @function registrarPago
 * @description Registra un abono o liquidación a una orden y actualiza su saldo/estatus.
 * @param {Object} req - Objeto de petición. Body requiere monto y metodo_pago.
 * @param {Object} res - Objeto de respuesta.
 */
const registrarPago = async (req, res) => {
  const orderId = req.params.id;
  const { monto, metodo_pago } = req.body;
  const usuarioId = req.usuario.id;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Ingresar el dinero a caja
    await connection.query(
      `INSERT INTO CAJA (fecha, concepto, tipo_movimiento, forma_pago, monto, orden_id, operador_id) 
       VALUES (NOW(), 'Abono a Orden', 'ENTRADA', ?, ?, ?, ?)`,
      [metodo_pago, monto, orderId, usuarioId]
    );

    // 2. Verificar el saldo restante de la orden
    const [pagos] = await connection.query(
      `SELECT SUM(monto) as totalPagado FROM CAJA WHERE orden_id = ? AND tipo_movimiento = 'ENTRADA'`,
      [orderId]
    );
    const [orden] = await connection.query(`SELECT total FROM ORDEN WHERE id = ?`, [orderId]);
    
    // 3. Cambiar estatus si ya se liquidó
    if (pagos[0].totalPagado >= orden[0].total) {
      await connection.query(`UPDATE ORDEN SET estatus = 'Liquidada' WHERE id = ?`, [orderId]);
    } else {
      await connection.query(`UPDATE ORDEN SET estatus = 'Con Anticipo' WHERE id = ?`, [orderId]);
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

/**
 * @function cancelarOrden
 * @description Cancela una orden, regresa el stock al inventario y genera una nota de devolución en caja.
 * @param {Object} req - Objeto de petición.
 * @param {Object} res - Objeto de respuesta.
 */
const cancelarOrden = async (req, res) => {
  const orderId = req.params.id;
  const usuarioId = req.usuario.id;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Bloqueo por concurrencia
    const [ordenRows] = await connection.query(
      'SELECT estatus FROM ORDEN WHERE id = ? FOR UPDATE', 
      [orderId]
    );

    if (ordenRows.length === 0) throw new Error('La orden no existe.');
    if (ordenRows[0].estatus === 'Cancelada') throw new Error('Esta orden ya fue cancelada previamente.');

    // Estatus a Cancelada
    await connection.query('UPDATE ORDEN SET estatus = "Cancelada" WHERE id = ?', [orderId]);

    // Devolver Inventario
    const [detalles] = await connection.query('SELECT articulo_id, cantidad FROM DETORD WHERE orden_id = ?', [orderId]);
    for (let item of detalles) {
      await connection.query(
        'UPDATE ARTICULO SET existencias = existencias + ? WHERE id = ?',
        [item.cantidad, item.articulo_id]
      );
    }

    // Regresar dinero
    const [pagosRows] = await connection.query(
      'SELECT IFNULL(SUM(monto), 0) as totalPagado FROM CAJA WHERE orden_id = ? AND tipo_movimiento = "ENTRADA"',
      [orderId]
    );
    const totalDevolver = pagosRows[0].totalPagado;

    if (totalDevolver > 0) {
      await connection.query(
        `INSERT INTO CAJA (fecha, concepto, tipo_movimiento, monto, orden_id, operador_id) 
         VALUES (NOW(), 'Devolución por Cancelación', 'SALIDA', ?, ?, ?)`,
        [totalDevolver, orderId, usuarioId]
      );
    }

    await connection.commit();
    res.status(200).json({ exito: true, mensaje: 'Orden cancelada, inventario restaurado y dinero devuelto en sistema.' });
  } catch (error) {
    await connection.rollback();
    console.error('Error en cancelación:', error.message);
    res.status(500).json({ exito: false, mensaje: error.message });
  } finally {
    connection.release();
  }
};

module.exports = {crearOrden, obtenerOrdenes, registrarPago, cancelarOrden};  