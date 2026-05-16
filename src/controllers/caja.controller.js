// src/controllers/caja.controller.js
const pool = require('../config/db'); 

// Buscar orden para mostrarla en la pantalla de cobro
const obtenerOrdenParaCobro = async (req, res) => {
    const { folio } = req.params;
    try {
        // Se obtienen los datos base de la orden y el cliente
        const [ordenes] = await pool.query(
            `SELECT o.folio, o.total, o.estatus, c.nombre_completo AS paciente 
             FROM orden o 
             JOIN clientes c ON o.id_cliente = c.id_cliente 
             WHERE o.folio = ?`, 
            [folio]
        );

        if (ordenes.length === 0) {
            return res.status(404).json({ mensaje: 'Orden no encontrada' });
        }

        const orden = ordenes[0];

        // Calcular lo que ya se ha pagado (anticipo) leyendo de movimientos_caja
        const [pagos] = await pool.query(
            `SELECT IFNULL(SUM(monto), 0) AS anticipo 
             FROM movimientos_caja 
             WHERE folio_orden = ?`,
            [folio]
        );

        const anticipo = parseFloat(pagos[0].anticipo);
        const total = parseFloat(orden.total);
        const saldo = total - anticipo;

        res.json({
            folio: orden.folio,
            total: total,
            anticipo: anticipo,
            saldo: saldo,
            estatus: orden.estatus,
            paciente: orden.paciente
        });
    } catch (error) {
        console.error('Error al buscar orden:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
};

// Procesar el pago con Control de Concurrencia 
const procesarPago = async (req, res) => {
    const { folio, monto, metodo_pago, id_sucursal } = req.body; 
    
    // Obtenemos el ID del operador desde el token JWT 
    const id_operador = req.user.id; 

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // Buscar la orden y BLOQUEAR LA FILA (FOR UPDATE)
        const [ordenes] = await connection.query(
            'SELECT total, estatus FROM orden WHERE folio = ? FOR UPDATE',
            [folio]
        );

        if (ordenes.length === 0) {
            throw new Error('Orden no encontrada');
        }

        const orden = ordenes[0];

        if (orden.estatus === 'PAGADO') {
            throw new Error('Esta orden ya se encuentra liquidada completamente.');
        }

        // Calcular saldo actual sumando todos los movimientos previos
        const [pagos] = await connection.query(
            'SELECT IFNULL(SUM(monto), 0) AS anticipo FROM movimientos_caja WHERE folio_orden = ?',
            [folio]
        );
        
        const anticipoActual = parseFloat(pagos[0].anticipo);
        const total = parseFloat(orden.total);
        const saldoActual = total - anticipoActual;
        const pagoIngresado = parseFloat(monto);

        if (pagoIngresado > saldoActual) {
            throw new Error(`El monto a pagar (${pagoIngresado}) es mayor al saldo pendiente (${saldoActual}).`);
        }

        // Registrar el movimiento en la tabla movimientos_caja
        await connection.query(
            `INSERT INTO movimientos_caja 
             (id_sucursal, id_operador, folio_orden, tipo_movimiento, metodo_pago, monto, fecha_hora, concepto) 
             VALUES (?, ?, ?, 'INGRESO', ?, ?, NOW(), 'Pago en caja')`,
            [id_sucursal || null, id_operador, folio, metodo_pago, pagoIngresado]
        );

        // Actualizar el estatus de la orden
        const nuevoSaldo = saldoActual - pagoIngresado;
        const nuevoEstatus = nuevoSaldo === 0 ? 'PAGADO' : 'PENDIENTE'; 

        await connection.query(
            `UPDATE orden SET estatus = ? WHERE folio = ?`,
            [nuevoEstatus, folio]
        );

        // CONFIRMAR LA TRANSACCIÓN
        await connection.commit();

        // Enviar recibo de pago por correo
        await enviarReciboPago(orden.email, orden.nombre_completo, folio, pagoIngresado, nuevoSaldo);

        res.status(200).json({
            mensaje: 'Pago procesado y registrado correctamente',
            recibo: {
                folio,
                monto_pagado: pagoIngresado,
                saldo_restante: nuevoSaldo,
                estatus: nuevoEstatus
            }
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error en transacción de pago:', error);
        res.status(400).json({ mensaje: error.message });
    } finally {
        connection.release();
    }
};

// Asegúrate de importar nodemailer en este archivo también
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail', // Se cambiará cuando tengas las credenciales
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/**
 * @function enviarReciboPago
 * @description Envía un comprobante de abono o liquidación al correo del paciente.
 */
const enviarReciboPago = async (emailDestino, nombreCliente, folioOrden, montoPagado, saldoRestante) => {
  if (!emailDestino) return; // Si el cliente no tiene correo, salimos silenciosamente

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: emailDestino,
    subject: `Recibo de Pago - Óptica HL (Orden: ${folioOrden})`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
        <h2 style="color: #2c3e50;">¡Gracias por tu pago, ${nombreCliente}!</h2>
        <p>Hemos registrado exitosamente un pago en tu cuenta.</p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
          <tr style="background-color: #f8f9fa;">
            <td style="padding: 10px; border: 1px solid #ddd;"><b>Folio de Orden:</b></td>
            <td style="padding: 10px; border: 1px solid #ddd;">${folioOrden}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd;"><b>Monto Pagado:</b></td>
            <td style="padding: 10px; border: 1px solid #ddd; color: green;">$${parseFloat(montoPagado).toFixed(2)}</td>
          </tr>
          <tr style="background-color: #f8f9fa;">
            <td style="padding: 10px; border: 1px solid #ddd;"><b>Saldo Restante:</b></td>
            <td style="padding: 10px; border: 1px solid #ddd; color: red;">$${parseFloat(saldoRestante).toFixed(2)}</td>
          </tr>
        </table>
        <p style="margin-top: 20px;">Si requieres factura electrónica, por favor solicítala en mostrador.</p>
        <p>Atentamente,<br><b>El equipo de Óptica HL</b></p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Recibo enviado a ${emailDestino} por la orden ${folioOrden}`);
  } catch (error) {
    console.error('Error enviando el recibo de pago:', error);
  }
};

module.exports = {obtenerOrdenParaCobro, procesarPago, enviarReciboPago};