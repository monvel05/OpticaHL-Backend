const pool = require("../config/db");
const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");

/**
 * @function enviarReciboPago
 * @description Envía un comprobante al correo si las credenciales están configuradas.
 */
const enviarReciboPago = async (
  emailDestino,
  nombreCliente,
  folioOrden,
  montoPagado,
  saldoRestante
) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || !emailDestino) {
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

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
            <td style="padding: 10px; border: 1px solid #ddd;"><b>Folio:</b></td>
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
        <p>Atentamente,<br><b>Óptica HL</b></p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Error enviando recibo:", error.message);
  }
};

// Buscar orden para mostrarla en la pantalla de cobro
const obtenerOrdenParaCobro = async (req, res) => {
  const { folio } = req.params;
  const folioLimpio = folio ? String(folio).trim() : "";

  try {
    const [ordenes] = await pool.query(
      `SELECT o.folio_orden AS folio, o.total, o.estatus, c.nombre_completo AS paciente 
       FROM orden o 
       JOIN clientes c ON o.id_cliente = c.id_cliente 
       WHERE TRIM(o.folio_orden) = ?`,
      [folioLimpio]
    );

    if (ordenes.length === 0) {
      return res.status(404).json({ mensaje: `Orden '${folioLimpio}' no encontrada.` });
    }

    const orden = ordenes[0];

    const [pagos] = await pool.query(
      `SELECT IFNULL(SUM(monto), 0) AS anticipo 
       FROM movimientos_caja 
       WHERE TRIM(folio_orden) = ?`,
      [folioLimpio]
    );

    const anticipo = parseFloat(pagos[0].anticipo);
    const total = parseFloat(orden.total);
    const saldo = total - anticipo;

    res.json({
      folio: orden.folio,
      total: total,
      anticipo: anticipo,
      saldo: saldo > 0 ? saldo : 0,
      estatus: orden.estatus,
      paciente: orden.paciente,
    });
  } catch (error) {
    console.error("Error al buscar orden:", error);
    res.status(500).json({ mensaje: "Error interno del servidor" });
  }
};

// Procesar el pago
const procesarPago = async (req, res) => {
  const { folio, folio_orden, folioOrden, monto, metodo_pago, id_sucursal } = req.body;
  const folioRaw = folio || folio_orden || folioOrden || "";
  const folioLimpio = String(folioRaw).trim();

  if (!folioLimpio) {
    return res.status(400).json({ mensaje: "No se recibió el Folio de la orden." });
  }

  const id_operador = req.user?.id || req.usuario?.id || 1;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [ordenes] = await connection.query(
      `SELECT o.folio_orden, o.total, o.estatus, c.email, c.nombre_completo 
       FROM orden o 
       JOIN clientes c ON o.id_cliente = c.id_cliente 
       WHERE TRIM(o.folio_orden) = ? FOR UPDATE`,
      [folioLimpio]
    );

    if (ordenes.length === 0) {
      throw new Error(`Orden '${folioLimpio}' no existe en la base de datos.`);
    }

    const orden = ordenes[0];

    if (orden.estatus === "PAGADO") {
      throw new Error("Esta orden ya se encuentra liquidada completamente.");
    }

    const [pagos] = await connection.query(
      "SELECT IFNULL(SUM(monto), 0) AS anticipo FROM movimientos_caja WHERE TRIM(folio_orden) = ?",
      [folioLimpio]
    );

    const anticipoActual = parseFloat(pagos[0].anticipo);
    const total = parseFloat(orden.total);
    const saldoActual = total - anticipoActual;
    const pagoIngresado = parseFloat(monto);

    if (pagoIngresado > saldoActual) {
      throw new Error(
        `El monto ($${pagoIngresado}) supera el saldo pendiente ($${saldoActual}).`
      );
    }

    await connection.query(
      `INSERT INTO movimientos_caja 
       (id_sucursal, id_operador, folio_orden, tipo_movimiento, metodo_pago, monto, fecha_hora, concepto) 
       VALUES (?, ?, ?, 'INGRESO', ?, ?, NOW(), 'Pago en caja')`,
      [id_sucursal || "HL01", id_operador, folioLimpio, metodo_pago, pagoIngresado]
    );

    const nuevoSaldo = saldoActual - pagoIngresado;
    const nuevoEstatus = nuevoSaldo === 0 ? "PAGADO" : "PENDIENTE";

    await connection.query(
      `UPDATE orden SET estatus = ? WHERE TRIM(folio_orden) = ?`,
      [nuevoEstatus, folioLimpio]
    );

    await connection.commit();

    enviarReciboPago(orden.email, orden.nombre_completo, folioLimpio, pagoIngresado, nuevoSaldo);

    res.status(200).json({
      success: true,
      mensaje: "Pago procesado correctamente",
      recibo: {
        folio: folioLimpio,
        monto_pagado: pagoIngresado,
        saldo_restante: nuevoSaldo,
        estatus: nuevoEstatus,
      },
    });
  } catch (error) {
    await connection.rollback();
    res.status(400).json({ mensaje: error.message || "Error al procesar el pago" });
  } finally {
    connection.release();
  }
};

/**
 * @function descargarTicketPDF
 * @description Genera un Ticket PDF usando la tabla 'detalle_venta'.
 */
const descargarTicketPDF = async (req, res) => {
  const { folio } = req.params;
  const folioLimpio = folio ? String(folio).trim() : "";

  try {
    // 1. Datos principales de la orden
    const [ordenes] = await pool.query(
      `SELECT o.folio_orden, o.total, o.estatus, c.nombre_completo, c.telefono 
       FROM orden o 
       JOIN clientes c ON o.id_cliente = c.id_cliente 
       WHERE TRIM(o.folio_orden) = ?`,
      [folioLimpio]
    );

    if (ordenes.length === 0) {
      return res.status(404).json({ mensaje: "Orden no encontrada" });
    }

    const orden = ordenes[0];

    // 2. Consulta usando la tabla correcta: 'detalle_venta'
    let articulos = [];
    try {
      const [filas] = await pool.query(
        `SELECT dv.*, a.nombre AS producto_nombre
         FROM detalle_venta dv
         LEFT JOIN articulos a ON dv.id_articulo = a.id_articulo
         WHERE TRIM(dv.folio_orden) = ?`,
        [folioLimpio]
      );
      articulos = filas;
    } catch (errDetalle) {
      console.warn("Aviso al consultar detalle_venta:", errDetalle.message);
    }

    // 3. Historial de pagos
    const [pagos] = await pool.query(
      `SELECT metodo_pago, monto, fecha_hora 
       FROM movimientos_caja 
       WHERE TRIM(folio_orden) = ? ORDER BY fecha_hora ASC`,
      [folioLimpio]
    );

    // Crear PDF tamaño Ticket (80mm)
    const doc = new PDFDocument({ margin: 15, size: [226, 600] });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=Ticket_${folioLimpio}.pdf`);

    doc.pipe(res);

    // --- ENCABEZADO ---
    doc.fontSize(12).text("ÓPTICA HL", { align: "center" });
    doc.fontSize(8).text("Ticket de Ventas y Pagos", { align: "center" });
    doc.text("-----------------------------------------", { align: "center" });

    // --- DATOS CLIENTE ---
    doc.fontSize(7);
    doc.text(`Folio: ${orden.folio_orden}`);
    doc.text(`Cliente: ${orden.nombre_completo}`);
    doc.text(`Estado: ${orden.estatus}`);
    doc.text(`Fecha Emisión: ${new Date().toLocaleDateString()}`);
    doc.text("-----------------------------------------", { align: "center" });

    // --- DESGLOSE DE ARTÍCULOS ---
    doc.fontSize(8).text("DETALLE DE COMPRA:", { underline: true });
    if (articulos && articulos.length > 0) {
      articulos.forEach((item) => {
        const cant = item.cantidad || item.cant || item.unidades || 1;
        const prod = item.producto_nombre || item.producto || item.descripcion || "Artículo";
        const precio = item.subtotal || item.precio_unitario || item.precio || item.monto || 0;

        doc.fontSize(7).text(
          `${cant}x ${prod} - $${parseFloat(precio).toFixed(2)}`
        );
      });
    } else {
      doc.fontSize(7).text("Venta de Graduación / Servicio de Óptica");
    }

    doc.text("-----------------------------------------", { align: "center" });

    // --- DESGLOSE DE PAGOS ---
    let totalPagado = 0;
    doc.fontSize(8).text("FORMAS DE PAGO APLICADAS:", { underline: true });

    if (pagos && pagos.length > 0) {
      pagos.forEach((pago) => {
        totalPagado += parseFloat(pago.monto);
        doc.fontSize(7).text(
          `• ${pago.metodo_pago}: $${parseFloat(pago.monto).toFixed(2)} (${new Date(pago.fecha_hora).toLocaleDateString()})`
        );
      });
    } else {
      doc.fontSize(7).text("Sin pagos registrados aún.");
    }

    const saldoPendiente = parseFloat(orden.total) - totalPagado;

    doc.text("-----------------------------------------", { align: "center" });

    // --- TOTALES ---
    doc.fontSize(8);
    doc.text(`TOTAL GENERAL: $${parseFloat(orden.total).toFixed(2)}`);
    doc.text(`TOTAL PAGADO:  $${totalPagado.toFixed(2)}`);
    doc.text(`SALDO PENDIENTE: $${saldoPendiente > 0 ? saldoPendiente.toFixed(2) : "0.00"}`);

    doc.text("-----------------------------------------", { align: "center" });
    doc.fontSize(7).text("¡Gracias por su compra!", { align: "center" });

    doc.end();
  } catch (error) {
    console.error("Error al generar PDF:", error);
    res.status(500).json({ mensaje: "Error generando el ticket en PDF" });
  }
};

module.exports = {
  obtenerOrdenParaCobro,
  procesarPago,
  enviarReciboPago,
  descargarTicketPDF,
};