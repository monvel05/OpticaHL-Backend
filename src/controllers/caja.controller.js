const pool = require("../config/db");
const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");

/**
 * @function enviarReciboPago
 * @description Envía el ticket de compra con formato estilo recibo impreso al correo del cliente.
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

  try {
    // 1. Obtener datos actualizados de la orden
    const [ordenes] = await pool.query(
      `SELECT total, estatus FROM orden WHERE TRIM(folio_orden) = ?`,
      [folioOrden]
    );
    const orden = ordenes[0] || { total: 0, estatus: 'PENDIENTE' };

    // 2. Obtener detalle de productos
    let articulos = [];
    try {
      const [filas] = await pool.query(
        `SELECT dv.cantidad, dv.precio_unitario, (dv.cantidad * dv.precio_unitario) AS subtotal, a.nombre AS producto_nombre
         FROM detalle_venta dv
         LEFT JOIN articulos a ON dv.id_articulo = a.id_articulo
         WHERE TRIM(dv.folio_orden) = ?`,
        [folioOrden]
      );
      articulos = filas;
    } catch (e) {
      console.warn("Error consultando articulos para correo:", e.message);
    }

    // 3. Obtener historial de pagos
    const [pagos] = await pool.query(
      `SELECT metodo_pago, monto, fecha_hora 
       FROM movimientos_caja 
       WHERE TRIM(folio_orden) = ? AND UPPER(tipo_movimiento) = 'INGRESO'
       ORDER BY fecha_hora ASC`,
      [folioOrden]
    );

    // Construir filas de artículos
    let filasArticulosHTML = "";
    if (articulos.length > 0) {
      articulos.forEach((item) => {
        const cant = item.cantidad || 1;
        const prod = item.producto_nombre || "Artículo";
        const precio = parseFloat(item.subtotal || item.precio_unitario || 0).toFixed(2);
        filasArticulosHTML += `<p style="margin: 3px 0;">${cant}x ${prod} - $${precio}</p>`;
      });
    } else {
      filasArticulosHTML = `<p style="margin: 3px 0;">Venta de Graduación / Servicio de Óptica</p>`;
    }

    // Construir filas de pagos
    let filasPagosHTML = "";
    let totalPagado = 0;
    if (pagos.length > 0) {
      pagos.forEach((pago) => {
        const montoNum = parseFloat(pago.monto);
        totalPagado += montoNum;
        const fecha = new Date(pago.fecha_hora).toLocaleDateString();
        filasPagosHTML += `<p style="margin: 3px 0;">• ${pago.metodo_pago}: $${montoNum.toFixed(2)} (${fecha})</p>`;
      });
    } else {
      filasPagosHTML = `<p style="margin: 3px 0;">Sin pagos registrados</p>`;
    }

    const totalGeneral = parseFloat(orden.total || 0);
    const fechaEmision = new Date().toLocaleDateString();

    // 4. Configurar transporte Nodemailer
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    // 5. Correo estilo Ticket
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: emailDestino,
      subject: `Recibo de Pago - Óptica HL (Orden: ${folioOrden})`,
      html: `
        <div style="background-color: #f4f4f4; padding: 20px; font-family: 'Courier New', Courier, monospace;">
          <div style="max-width: 340px; margin: auto; background: #ffffff; padding: 20px; border: 1px solid #ddd; border-radius: 4px; text-align: center; color: #000;">
            
            <h2 style="margin: 0; font-size: 20px; font-weight: bold;">ÓPTICA HL</h2>
            <p style="margin: 5px 0 10px 0; font-size: 13px;">Ticket de Ventas y Pagos</p>
            <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>

            <div style="text-align: left; font-size: 12px; line-height: 1.4;">
              <p style="margin: 2px 0;"><b>Folio:</b> ${folioOrden}</p>
              <p style="margin: 2px 0;"><b>Cliente:</b> ${nombreCliente}</p>
              <p style="margin: 2px 0;"><b>Estado:</b> ${orden.estatus}</p>
              <p style="margin: 2px 0;"><b>Fecha Emisión:</b> ${fechaEmision}</p>
            </div>

            <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>

            <div style="text-align: left; font-size: 12px;">
              <p style="margin-bottom: 5px; font-weight: bold; text-decoration: underline;">DETALLE DE COMPRA:</p>
              ${filasArticulosHTML}
            </div>

            <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>

            <div style="text-align: left; font-size: 12px;">
              <p style="margin-bottom: 5px; font-weight: bold; text-decoration: underline;">FORMAS DE PAGO APLICADAS:</p>
              ${filasPagosHTML}
            </div>

            <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>

            <div style="text-align: left; font-size: 13px; font-weight: bold; line-height: 1.5;">
              <p style="margin: 2px 0;">TOTAL GENERAL: $${totalGeneral.toFixed(2)}</p>
              <p style="margin: 2px 0;">TOTAL PAGADO:  $${totalPagado.toFixed(2)}</p>
              <p style="margin: 2px 0; color: #d9534f;">SALDO PENDIENTE: $${saldoRestante.toFixed(2)}</p>
            </div>

            <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>

            <p style="margin: 10px 0 0 0; font-size: 12px; font-weight: bold;">¡Gracias por su compra!</p>
          </div>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Error enviando recibo estilo ticket:", error.message);
  }
};

/**
 * @function obtenerOrdenParaCobro
 * @description Permite buscar orden por Folio y devuelve el saldo pendiente exacto.
 */
const obtenerOrdenParaCobro = async (req, res) => {
  const param = req.params.folio || req.params.id || "";
  const busquedaLimpia = String(param).trim();

  if (!busquedaLimpia) {
    return res.status(400).json({ exito: false, mensaje: "Debe proporcionar un ID o Folio." });
  }

  try {
    const [ordenes] = await pool.query(
      `SELECT o.folio_orden AS folio, o.total, o.estatus, COALESCE(c.nombre_completo, 'Cliente General') AS paciente 
       FROM orden o 
       LEFT JOIN clientes c ON o.id_cliente = c.id_cliente 
       WHERE TRIM(o.folio_orden) = ?`,
      [busquedaLimpia]
    );

    if (ordenes.length === 0) {
      return res.status(404).json({ exito: false, mensaje: `Orden con Folio '${busquedaLimpia}' no encontrada.` });
    }

    const orden = ordenes[0];
    const folioReal = orden.folio;

    const [pagos] = await pool.query(
      `SELECT IFNULL(SUM(monto), 0) AS anticipo 
       FROM movimientos_caja 
       WHERE TRIM(folio_orden) = ? AND UPPER(tipo_movimiento) = 'INGRESO'`,
      [folioReal]
    );

    let articulos = [];
    try {
      const [detalles] = await pool.query(
        `SELECT dv.id_articulo, dv.cantidad, dv.precio_unitario, 
                (dv.cantidad * dv.precio_unitario) AS subtotal, 
                a.nombre AS producto_nombre
         FROM detalle_venta dv
         LEFT JOIN articulos a ON dv.id_articulo = a.id_articulo
         WHERE TRIM(dv.folio_orden) = ?`,
        [folioReal]
      );
      articulos = detalles;
    } catch (e) {
      console.warn("Aviso al consultar detalle_venta:", e.message);
    }

    const anticipo = parseFloat(pagos[0].anticipo || 0);
    const total = parseFloat(orden.total || 0);
    const saldo = Math.max(0, total - anticipo);

    const respuestaDatos = {
      id_orden: folioReal,
      folio: folioReal,
      total: total,
      anticipo: anticipo,
      saldo: saldo,
      estatus: saldo <= 0 ? 'PAGADO' : orden.estatus,
      paciente: orden.paciente,
      paciente_nombre: orden.paciente,
      articulos: articulos
    };

    res.json({
      exito: true,
      datos: respuestaDatos,
      ...respuestaDatos
    });
  } catch (error) {
    console.error("Error al buscar orden para cobro:", error);
    res.status(500).json({ exito: false, mensaje: "Error interno del servidor" });
  }
};

/**
 * @function procesarPago
 * @description Procesa pago en caja y registra el abono
 */
const procesarPago = async (req, res) => {
  const { folio, folio_orden, folioOrden, id_orden, monto, metodo_pago, id_sucursal } = req.body;
  const busqueda = folio || folio_orden || folioOrden || id_orden || "";
  const busquedaLimpia = String(busqueda).trim();

  if (!busquedaLimpia) {
    return res.status(400).json({ mensaje: "No se recibió el Folio/ID de la orden." });
  }

  const id_operador = req.user?.id || req.usuario?.id || 1;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [ordenes] = await connection.query(
      `SELECT o.folio_orden, o.total, o.estatus, c.email, COALESCE(c.nombre_completo, 'Cliente General') AS nombre_completo 
       FROM orden o 
       LEFT JOIN clientes c ON o.id_cliente = c.id_cliente 
       WHERE TRIM(o.folio_orden) = ? FOR UPDATE`,
      [busquedaLimpia]
    );

    if (ordenes.length === 0) {
      throw new Error(`Orden '${busquedaLimpia}' no existe en la base de datos.`);
    }

    const orden = ordenes[0];
    const folioReal = orden.folio_orden;

    const [pagos] = await connection.query(
      `SELECT IFNULL(SUM(monto), 0) AS anticipo 
       FROM movimientos_caja 
       WHERE TRIM(folio_orden) = ? AND UPPER(tipo_movimiento) = 'INGRESO'`,
      [folioReal]
    );

    const anticipoActual = parseFloat(pagos[0].anticipo || 0);
    const total = parseFloat(orden.total || 0);
    const saldoActual = Math.max(0, total - anticipoActual);
    const pagoIngresado = parseFloat(monto || 0);

    if (saldoActual <= 0) {
      throw new Error("Esta orden ya se encuentra liquidada completamente.");
    }

    if (pagoIngresado > saldoActual) {
      throw new Error(`El monto ($${pagoIngresado.toFixed(2)}) supera el saldo pendiente ($${saldoActual.toFixed(2)}).`);
    }

    await connection.query(
      `INSERT INTO movimientos_caja 
       (id_sucursal, id_operador, folio_orden, tipo_movimiento, metodo_pago, monto, fecha_hora, concepto) 
       VALUES (?, ?, ?, 'INGRESO', ?, ?, NOW(), 'Pago en caja')`,
      [id_sucursal || "HL01", id_operador, folioReal, (metodo_pago || 'EFECTIVO').toUpperCase(), pagoIngresado]
    );

    const nuevoSaldo = Math.max(0, saldoActual - pagoIngresado);
    const nuevoEstatus = nuevoSaldo === 0 ? "PAGADO" : "PENDIENTE";

    await connection.query(
      `UPDATE orden SET estatus = ? WHERE TRIM(folio_orden) = ?`,
      [nuevoEstatus, folioReal]
    );

    await connection.commit();

    enviarReciboPago(orden.email, orden.nombre_completo, folioReal, pagoIngresado, nuevoSaldo);

    res.status(200).json({
      success: true,
      mensaje: "Pago procesado correctamente",
      recibo: {
        folio: folioReal,
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
 * @description Genera un Ticket PDF individual para impresión en miniprinter
 */
const descargarTicketPDF = async (req, res) => {
  const { folio } = req.params;
  const busquedaLimpia = folio ? String(folio).trim() : "";

  try {
    const [ordenes] = await pool.query(
      `SELECT o.folio_orden, o.total, o.estatus, COALESCE(c.nombre_completo, 'Cliente General') AS nombre_completo, c.telefono 
       FROM orden o 
       LEFT JOIN clientes c ON o.id_cliente = c.id_cliente 
       WHERE TRIM(o.folio_orden) = ?`,
      [busquedaLimpia]
    );

    if (ordenes.length === 0) {
      return res.status(404).json({ mensaje: "Orden no encontrada" });
    }

    const orden = ordenes[0];
    const folioReal = orden.folio_orden;

    let articulos = [];
    try {
      const [filas] = await pool.query(
        `SELECT dv.*, (dv.cantidad * dv.precio_unitario) AS subtotal, a.nombre AS producto_nombre
         FROM detalle_venta dv
         LEFT JOIN articulos a ON dv.id_articulo = a.id_articulo
         WHERE TRIM(dv.folio_orden) = ?`,
        [folioReal]
      );
      articulos = filas;
    } catch (errDetalle) {
      console.warn("Aviso al consultar detalle_venta:", errDetalle.message);
    }

    const [pagos] = await pool.query(
      `SELECT metodo_pago, monto, fecha_hora 
       FROM movimientos_caja 
       WHERE TRIM(folio_orden) = ? AND UPPER(tipo_movimiento) = 'INGRESO'
       ORDER BY fecha_hora ASC`,
      [folioReal]
    );

    const doc = new PDFDocument({ margin: 15, size: [226, 600] });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=Ticket_${folioReal}.pdf`);

    doc.pipe(res);

    doc.fontSize(12).text("ÓPTICA HL", { align: "center" });
    doc.fontSize(8).text("Ticket de Ventas y Pagos", { align: "center" });
    doc.text("-----------------------------------------", { align: "center" });

    doc.fontSize(7);
    doc.text(`Folio: ${folioReal}`);
    doc.text(`Cliente: ${orden.nombre_completo}`);
    doc.text(`Estado: ${orden.estatus}`);
    doc.text(`Fecha Emisión: ${new Date().toLocaleDateString()}`);
    doc.text("-----------------------------------------", { align: "center" });

    doc.fontSize(8).text("DETALLE DE COMPRA:", { underline: true });
    if (articulos && articulos.length > 0) {
      articulos.forEach((item) => {
        const cant = item.cantidad || 1;
        const prod = item.producto_nombre || "Artículo";
        const precio = item.subtotal || item.precio_unitario || 0;

        doc.fontSize(7).text(
          `${cant}x ${prod} - $${parseFloat(precio).toFixed(2)}`
        );
      });
    } else {
      doc.fontSize(7).text("Venta de Graduación / Servicio de Óptica");
    }

    doc.text("-----------------------------------------", { align: "center" });

    let totalPagado = 0;
    doc.fontSize(8).text("FORMAS DE PAGO APLICADAS:", { underline: true });

    if (pagos && pagos.length > 0) {
      pagos.forEach((pago) => {
        const montoNum = parseFloat(pago.monto);
        totalPagado += montoNum;
        doc.fontSize(7).text(
          `• ${pago.metodo_pago}: $${montoNum.toFixed(2)} (${new Date(pago.fecha_hora).toLocaleDateString()})`
        );
      });
    } else {
      doc.fontSize(7).text("Sin pagos registrados aún.");
    }

    const saldoPendiente = Math.max(0, parseFloat(orden.total) - totalPagado);

    doc.text("-----------------------------------------", { align: "center" });

    doc.fontSize(8);
    doc.text(`TOTAL GENERAL: $${parseFloat(orden.total).toFixed(2)}`);
    doc.text(`TOTAL PAGADO:  $${totalPagado.toFixed(2)}`);
    doc.text(`SALDO PENDIENTE: $${saldoPendiente.toFixed(2)}`);

    doc.text("-----------------------------------------", { align: "center" });
    doc.fontSize(7).text("¡Gracias por su compra!", { align: "center" });

    doc.end();
  } catch (error) {
    console.error("Error al generar PDF:", error);
    res.status(500).json({ mensaje: "Error generando el ticket en PDF" });
  }
};

/**
 * @function obtenerCorteCaja
 * @description Obtiene el resumen del dinero en caja del día
 */
const obtenerCorteCaja = async (req, res) => {
  try {
    const [movimientos] = await pool.query(`
      SELECT 
        m.id_movimiento,
        m.folio_orden,
        m.fecha_hora,
        m.concepto,
        m.tipo_movimiento,
        m.metodo_pago,
        m.monto,
        o.total AS total_orden
      FROM movimientos_caja m
      LEFT JOIN orden o ON TRIM(m.folio_orden) = TRIM(o.folio_orden)
      WHERE DATE(m.fecha_hora) = CURDATE()
      ORDER BY m.id_movimiento DESC
    `);

    let totalEfectivo = 0;
    let totalTarjeta = 0;
    let totalTransferencia = 0;
    let totalIngresos = 0;
    let totalEgresos = 0;

    movimientos.forEach((mov) => {
      const monto = parseFloat(mov.monto) || 0;
      const metodo = (mov.metodo_pago || "").toUpperCase();

      if (mov.tipo_movimiento === "INGRESO") {
        totalIngresos += monto;
        if (metodo.includes("EFECTIVO")) totalEfectivo += monto;
        else if (metodo.includes("TARJETA") || metodo.includes("DEBITO") || metodo.includes("CREDITO")) totalTarjeta += monto;
        else if (metodo.includes("TRANSF") || metodo.includes("TRANSFERENCIA")) totalTransferencia += monto;
      } else if (mov.tipo_movimiento === "EGRESO") {
        totalEgresos += monto;
      }
    });

    res.json({
      resumen: {
        totalIngresos,
        totalEgresos,
        saldoNeto: totalIngresos - totalEgresos,
        desglose: {
          efectivo: totalEfectivo,
          tarjeta: totalTarjeta,
          transferencia: totalTransferencia,
        },
      },
      movimientos,
    });
  } catch (error) {
    console.error("Error al generar corte de caja:", error);
    res.status(500).json({ mensaje: "Error al generar corte de caja" });
  }
};

/**
 * @function descargarTicketCortePDF
 * @description Genera un reporte PDF formal en hoja Carta (LETTER)
 */
const descargarTicketCortePDF = async (req, res) => {
  try {
    const [movimientos] = await pool.query(`
      SELECT m.* FROM movimientos_caja m
      WHERE DATE(m.fecha_hora) = CURDATE()
      ORDER BY m.id_movimiento ASC
    `);

    let efectivo = 0, tarjeta = 0, transferencia = 0, totalIngresos = 0, totalEgresos = 0;

    movimientos.forEach((m) => {
      const monto = parseFloat(m.monto) || 0;
      const metodo = (m.metodo_pago || "").toUpperCase();

      if (m.tipo_movimiento === "INGRESO") {
        totalIngresos += monto;
        if (metodo.includes("EFECTIVO")) efectivo += monto;
        else if (metodo.includes("TARJETA") || metodo.includes("DEBITO") || metodo.includes("CREDITO")) tarjeta += monto;
        else if (metodo.includes("TRANSF")) transferencia += monto;
      } else if (m.tipo_movimiento === "EGRESO") {
        totalEgresos += monto;
      }
    });

    const saldoNeto = totalIngresos - totalEgresos;

    // Configurar PDF en tamaño CARTA / LETTER con márgenes amplios
    const doc = new PDFDocument({ margin: 40, size: "LETTER" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=Corte_Caja_${new Date().toISOString().split("T")[0]}.pdf`);

    doc.pipe(res);

    // ENCABEZADO FORMAL
    doc.fillColor("#2c3e50").fontSize(22).text("ÓPTICA HL", { align: "center" });
    doc.fontSize(14).text("REPORTE OFICIAL DE CORTE DE CAJA", { align: "center" });
    doc.fillColor("#7f8c8d").fontSize(9).text(`Fecha: ${new Date().toLocaleDateString()}  |  Hora: ${new Date().toLocaleTimeString()}`, { align: "center" });
    doc.moveDown(1.5);

    // LÍNEA DIVISORIA
    doc.moveTo(40, doc.y).lineTo(572, doc.y).strokeColor("#34495e").lineWidth(1.5).stroke();
    doc.moveDown(1.5);

    // RESUMEN EN TABLA / BLOQUES
    doc.fillColor("#2c3e50").fontSize(12).text("RESUMEN DE CAJA", { underline: true });
    doc.moveDown(0.8);

    doc.fontSize(10).fillColor("#2c3e50");
    doc.text(`(+) Efectivo en Caja:      $${efectivo.toFixed(2)}`);
    doc.text(`(+) Pagos con Tarjeta:    $${tarjeta.toFixed(2)}`);
    doc.text(`(+) Transferencias:       $${transferencia.toFixed(2)}`);
    doc.text(`(-) Egresos / Retiros:    $${totalEgresos.toFixed(2)}`);
    doc.moveDown(0.5);

    doc.fillColor("#27ae60").fontSize(13).text(`TOTAL NETO EN CAJA: $${saldoNeto.toFixed(2)}`);
    doc.moveDown(1.5);

    // LÍNEA DIVISORIA
    doc.moveTo(40, doc.y).lineTo(572, doc.y).strokeColor("#bdc3c7").lineWidth(1).stroke();
    doc.moveDown(1.5);

    // TABLA DE MOVIMIENTOS
    doc.fillColor("#2c3e50").fontSize(12).text("DETALLE DE MOVIMIENTOS DEL DÍA");
    doc.moveDown(1);

    if (movimientos.length > 0) {
      let y = doc.y;
      
      // Encabezados de Columna
      doc.fillColor("#34495e").fontSize(9);
      doc.text("HORA", 40, y, { width: 70 });
      doc.text("TIPO", 110, y, { width: 80 });
      doc.text("FOLIO / ORDEN", 190, y, { width: 170 });
      doc.text("MÉTODO", 360, y, { width: 100 });
      doc.text("MONTO", 460, y, { width: 110, align: "right" });

      y += 18;
      doc.moveTo(40, y).lineTo(572, y).strokeColor("#bdc3c7").lineWidth(0.5).stroke();
      y += 8;

      // Filas de datos
      doc.fillColor("#2c3e50").fontSize(9);
      movimientos.forEach((mov) => {
        const hora = new Date(mov.fecha_hora).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        doc.text(hora, 40, y, { width: 70 });
        doc.text(mov.tipo_movimiento, 110, y, { width: 80 });
        doc.text(mov.folio_orden || 'GENERAL', 190, y, { width: 170 });
        doc.text(mov.metodo_pago, 360, y, { width: 100 });
        doc.text(`$${parseFloat(mov.monto).toFixed(2)}`, 460, y, { width: 110, align: "right" });
        
        y += 20;

        // Salto de página automático si se llena la hoja
        if (y > 720) {
          doc.addPage();
          y = 50;
        }
      });
    } else {
      doc.fontSize(9).fillColor("#7f8c8d").text("No se registraron movimientos en el día de hoy.");
    }

    doc.end();
  } catch (error) {
    console.error("Error generando PDF de corte de caja:", error);
    res.status(500).json({ mensaje: "Error al generar el PDF de corte de caja" });
  }
};

module.exports = {
  obtenerOrdenParaCobro,
  procesarPago,
  enviarReciboPago,
  descargarTicketPDF,
  obtenerCorteCaja,
  descargarTicketCortePDF,
};