const pool = require('../config/db');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// 1. Crear Orden de Reparación
exports.crearOrdenReparacion = async (req, res) => {
  try {
    const { id_cliente, email_cliente, armazon, observaciones, mano_obra, total, detalles } = req.body;

    // Guardar en la nueva tabla: ordenes_reparacion
    const [result] = await pool.query(
      `INSERT INTO ordenes_reparacion (id_cliente, armazon, observaciones, mano_obra, total, estado, fecha_creacion) 
       VALUES (?, ?, ?, ?, ?, 'PENDIENTE_PAGO', NOW())`,
      [id_cliente, armazon, observaciones, mano_obra || 0, total]
    );

    const id_reparacion = result.insertId;

    // Guardar los detalles de piezas/refacciones
    if (detalles && detalles.length > 0) {
      for (const item of detalles) {
        await pool.query(
          `INSERT INTO ordenes_reparacion_detalles (id_reparacion, concepto, cantidad, precio_unitario, subtotal) 
           VALUES (?, ?, ?, ?, ?)`,
          [id_reparacion, item.concepto, item.cantidad, item.precio_unitario, item.subtotal]
        );
      }
    }

    // Notificación por Correo
    if (email_cliente) {
      const mailOptions = {
        from: '"Óptica HL" <no-reply@opticahl.com>',
        to: email_cliente,
        subject: `Orden de Reparación #${id_reparacion} - Óptica HL`,
        html: `
          <div style="font-family: Arial, sans-serif; color: #333;">
            <h2 style="color: #008020;">¡Hola! Tu orden de reparación ha sido registrada</h2>
            <p><strong>Folio de Servicio:</strong> #${id_reparacion}</p>
            <p><strong>Armazón:</strong> ${armazon || 'Genérico'}</p>
            <p><strong>Detalles:</strong> ${observaciones}</p>
            <p style="font-size: 1.1em;"><strong>Total a pagar en Caja:</strong> $${Number(total).toFixed(2)}</p>
            <hr>
            <p>Puedes pasar a caja para realizar tu pago. ¡Gracias por tu preferencia!</p>
          </div>
        `
      };

      transporter.sendMail(mailOptions, (err) => {
        if (err) console.error('Error al enviar correo:', err);
        else console.log(`📧 Correo enviado a ${email_cliente}`);
      });
    }

    res.status(201).json({
      mensaje: 'Orden de reparación creada exitosamente',
      id_reparacion
    });

  } catch (error) {
    console.error('Error en crearOrdenReparacion:', error);
    res.status(500).json({ error: 'Error al registrar la orden de reparación en la base de datos' });
  }
};


// 2. Generar y descargar el PDF de la orden
exports.obtenerPdfReparacion = async (req, res) => {
  try {
    const { id } = req.params;

    // Consulta limpia con los campos reales de la tabla 'clientes'
    const [filas] = await pool.query(
      `SELECT r.*, c.nombre_completo, c.telefono, c.email 
       FROM ordenes_reparacion r 
       LEFT JOIN clientes c ON r.id_cliente = c.id_cliente 
       WHERE r.id_reparacion = ?`, 
      [id]
    );

    if (filas.length === 0) {
      return res.status(404).json({ error: 'Orden no encontrada' });
    }

    const orden = filas[0];
    const [detalles] = await pool.query(
      `SELECT * FROM ordenes_reparacion_detalles WHERE id_reparacion = ?`, 
      [id]
    );

    const doc = new PDFDocument({ margin: 40 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=Orden_Reparacion_${id}.pdf`);
    doc.pipe(res);

    // Encabezado
    doc.fillColor('#008020').fontSize(20).text('ÓPTICA HL', { align: 'center' });
    doc.fillColor('#333333').fontSize(14).text('Comprobante de Servicio de Reparación', { align: 'center' }).moveDown();

    // Datos del Trabajo
    doc.fontSize(10)
       .text(`Folio de Servicio: #${orden.id_reparacion}`)
       .text(`Fecha: ${orden.fecha_creacion ? new Date(orden.fecha_creacion).toLocaleDateString() : new Date().toLocaleDateString()}`)
       .text(`Cliente: ${orden.nombre_completo || 'Cliente General'}`)
       .text(`Teléfono: ${orden.telefono || 'N/A'}`)
       .text(`Armazón: ${orden.armazon || 'N/A'}`)
       .text(`Observaciones: ${orden.observaciones || 'Sin observaciones'}`)
       .moveDown();

    // Tabla de Detalle
    doc.fillColor('#008020').text('---------------------------------------------------------------------------------');
    doc.text('Concepto / Insumo                                              Cant.    Precio     Subtotal');
    doc.text('---------------------------------------------------------------------------------').fillColor('#333333');

    if (detalles && detalles.length > 0) {
      detalles.forEach(item => {
        const concepto = (item.concepto || '').padEnd(50);
        const cant = item.cantidad || 1;
        const precio = Number(item.precio_unitario || 0).toFixed(2);
        const subt = Number(item.subtotal || 0).toFixed(2);

        doc.text(`${concepto} ${cant}      $${precio}    $${subt}`);
      });
    }

    doc.fillColor('#008020').text('---------------------------------------------------------------------------------');
    doc.fontSize(12).text(`TOTAL A PAGAR EN CAJA: $${Number(orden.total || 0).toFixed(2)}`, { align: 'right' }).moveDown();

    doc.fontSize(9).fillColor('#666666').text('Presente este ticket en caja para realizar su pago.', { align: 'center' });

    doc.end();

  } catch (error) {
    console.error('Error al generar PDF:', error);
    res.status(500).json({ error: 'Error al generar el PDF de la orden' });
  }
};