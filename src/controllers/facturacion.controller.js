const pool = require('../config/db');
const axios = require('axios');
const nodemailer = require('nodemailer');

/**
 * Configuración del transportador de Nodemailer para enviar correos.
 * Nota: Asegúrate de tener EMAIL_USER y EMAIL_PASS en tu archivo .env
 */
const transporter = nodemailer.createTransport({
  service: 'gmail', 
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/**
 * @function timbrarFactura
 * @description Recopila datos de orden, conecta con Facte, guarda en la BD (tablas factura y cfdi_timbrado) y envía correo.
 */
const timbrarFactura = async (req, res) => {
  // Ahora recibimos datos comerciales y fiscales necesarios para CFDI 4.0
  const { 
      folio_orden, id_sucursal, id_operador, metodo_pago, forma_pago, // Datos comerciales
      uso_cfdi, regimen_fiscal // Datos fiscales
  } = req.body;
  
  const connection = await pool.getConnection();

  try {
    // 1. Obtener datos de la Orden y el Cliente
    const [ordenRows] = await connection.query(
      `SELECT o.folio, o.total, o.id_cliente, c.email, c.rfc, c.nombre_completo, c.cp, c.domicilio 
       FROM orden o 
       JOIN clientes c ON o.id_cliente = c.id_cliente 
       WHERE o.folio = ?`, 
      [folio_orden]
    );

    if (ordenRows.length === 0) {
      return res.status(404).json({ exito: false, mensaje: 'No se encontró la orden especificada.' });
    }
    const orden = ordenRows[0];

    // 2. Obtener los artículos de la orden desde detalle_venta
    const [detalles] = await connection.query(
      `SELECT d.id_articulo, d.cantidad, d.precio_unitario, a.nombre 
       FROM detalle_venta d
       JOIN articulos a ON d.id_articulo = a.id_articulo
       WHERE d.folio_orden = ?`,
      [folio_orden]
    );

    // 3. Cálculos fiscales (Desglosando IVA al 16%)
    const total = parseFloat(orden.total);
    const subtotal = total / 1.16;
    const iva_trasladado = total - subtotal;
    const descuento = 0.00; // Asumiendo 0 por ahora, puedes ajustarlo a tu lógica

    // 4. Armar el JSON requerido por la API del PAC (Facte)
    const payloadFacte = {
      Receptor: {
        Rfc: orden.rfc,
        Nombre: orden.nombre_completo,
        UsoCFDI: uso_cfdi,
        DomicilioFiscalReceptor: orden.cp,
        RegimenFiscalReceptor: regimen_fiscal
      },
      Conceptos: detalles.map(item => ({
        ClaveProdServ: "42142902", // Código SAT genérico
        Cantidad: item.cantidad,
        Descripcion: item.nombre,
        ValorUnitario: parseFloat(item.precio_unitario) / 1.16,
        Importe: (parseFloat(item.precio_unitario) / 1.16) * item.cantidad
      }))
    };

    // 5. Llamada a la API de Facte (Axios)
    /* // DESCOMENTAR CUANDO ESTE LA URL REAL DE FACTE
    const respuestaFacte = await axios.post('URL_API_FACTE/timbrar', payloadFacte, {
      headers: { 'Authorization': `Bearer ${process.env.FACTE_TOKEN}` }
    });
    const { uuid, xml_base64, pdf_url } = respuestaFacte.data; 
    */
    
    // MOCK (Simulación de respuesta de Facte)
    const uuid = `MOCK-UUID-${Date.now()}`;
    const pdf_url = "https://miservidor.com/facturas/mock.pdf";
    const xml_sat = "<cfdi:Comprobante>XML Simulado</cfdi:Comprobante>"; // MOCK del XML
    
    // Generamos un folio interno para tu control comercial
    const num_factura = `FAC-${Date.now()}`; 

    // 6. INICIAR TRANSACCIÓN EN BASE DE DATOS
    await connection.beginTransaction();

    // 6.1 Guardar en la tabla COMERCIAL (factura) - MER V2
    await connection.query(
      `INSERT INTO factura (num_factura, folio_orden, fecha, subtotal, descuento, iva_trasladado, total, metodo_pago, forma_pago, estatus, id_sucursal, id_cliente, id_operador) 
       VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [num_factura, folio_orden, subtotal.toFixed(2), descuento, iva_trasladado.toFixed(2), total.toFixed(2), metodo_pago, forma_pago, 'VIGENTE', id_sucursal, orden.id_cliente, id_operador]
    );

    // 6.2 Guardar en la tabla FISCAL (cfdi_timbrado) - MER V2
    await connection.query(
      `INSERT INTO cfdi_timbrado (id_factura, uuid, rfc_receptor, razon_social_receptor, regimen_fiscal_receptor, cp_receptor, uso_cfdi, xml_sat, estatus_sat) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [num_factura, uuid, orden.rfc, orden.nombre_completo, regimen_fiscal, orden.cp, uso_cfdi, xml_sat, 'VIGENTE']
    );

    // Confirmar transacción
    await connection.commit();

    // 7. Enviar el correo al cliente (Nodemailer)
    if (orden.email) {
      await enviarFacturaPorCorreo(orden.email, orden.nombre_completo, uuid, pdf_url);
    }

    res.status(200).json({
      exito: true,
      mensaje: 'Factura timbrada y guardada correctamente.',
      datos: { num_factura, uuid, pdf_url }
    });

  } catch (error) {
    // Si algo falla, revertimos los INSERT en MySQL
    await connection.rollback();
    console.error('Error al timbrar factura:', error);
    res.status(500).json({ exito: false, mensaje: error.message });
  } finally {
    connection.release();
  }
};

/**
 * @function enviarFacturaPorCorreo
 * @description Envía el comprobante al paciente.
 */
const enviarFacturaPorCorreo = async (emailDestino, nombreCliente, folioFiscal, linkPdf) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: emailDestino,
    subject: `Tu Factura Electrónica - Óptica HL (Folio: ${folioFiscal})`,
    html: `
      <h3>Hola ${nombreCliente},</h3>
      <p>Adjuntamos tu comprobante fiscal digital correspondiente a tu compra en Óptica HL.</p>
      <p>Folio Fiscal (UUID): <b>${folioFiscal}</b></p>
      <p>Puedes descargar tu PDF aquí: <a href="${linkPdf}">Descargar Factura</a></p>
      <p>Gracias por tu preferencia.</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Correo enviado a ${emailDestino}`);
  } catch (error) {
    console.error('Error enviando el correo de factura:', error);
  }
};

/**
 * @function obtenerFacturasConFiltros
 * @description Obtiene facturas filtradas por rango de fechas y/o id_cliente.
 */
const obtenerFacturasConFiltros = async (req, res) => {
  const { fecha_inicio, fecha_fin, id_cliente } = req.query;
  
  try {
    // Igual que arriba, unimos cfdi_timbrado para obtener el UUID real del SAT
    let query = `
      SELECT f.num_factura, cfdi.uuid, cfdi.uso_cfdi, cfdi.estatus_sat, f.folio_orden, f.fecha, f.total, f.estatus,
             c.nombre_completo AS cliente, c.rfc, c.id_cliente
      FROM factura f
      LEFT JOIN cfdi_timbrado cfdi ON f.num_factura = cfdi.id_factura
      JOIN orden o ON f.folio_orden = o.folio
      JOIN clientes c ON o.id_cliente = c.id_cliente
      WHERE 1=1
    `;
    const params = [];

    if (id_cliente) {
      query += ` AND c.id_cliente = ?`;
      params.push(id_cliente);
    }

    if (fecha_inicio && fecha_fin) {
      query += ` AND DATE(f.fecha) BETWEEN ? AND ?`;
      params.push(fecha_inicio, fecha_fin);
    }

    query += ` ORDER BY f.fecha DESC`;

    const [facturas] = await pool.query(query, params);
    res.status(200).json({ exito: true, datos: facturas });
  } catch (error) {
    console.error('Error al filtrar facturas:', error);
    res.status(500).json({ exito: false, mensaje: 'Error al consultar las facturas filtradas.' });
  }
};

/**
 * @function cancelarFactura
 * @description Cancela el CFDI en el PAC y actualiza el estatus en la BD. Soporta motivos CFDI 4.0.
 * @route PUT /api/facturacion/:num_factura/cancelar
 */
const cancelarFactura = async (req, res) => {
  const { num_factura } = req.params;
  // motivo: '01' (Con error con relación), '02' (Con error sin relación), '03' (No se llevó a cabo la operación)
  // uuid_sustitucion: Requerido solo si el motivo es '01'
  const { motivo, uuid_sustitucion } = req.body; 

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Obtener el UUID fiscal actual
    const [cfdiRows] = await connection.query(
      `SELECT uuid, estatus_sat FROM cfdi_timbrado WHERE id_factura = ?`,
      [num_factura]
    );

    if (cfdiRows.length === 0) {
      return res.status(404).json({ exito: false, mensaje: 'Datos fiscales de la factura no encontrados.' });
    }

    const cfdi = cfdiRows[0];
    if (cfdi.estatus_sat === 'CANCELADO') {
      return res.status(400).json({ exito: false, mensaje: 'La factura ya se encuentra cancelada previamente.' });
    }

    // 2. Llamada a la API de Facte para Cancelar (Axios)
    /* // DESCOMENTAR CUANDO ESTE LA URL REAL DE FACTE
    const payloadCancelacion = {
      uuid: cfdi.uuid,
      motivo: motivo,
      folioSustitucion: motivo === '01' ? uuid_sustitucion : null
    };
    const respuestaFacte = await axios.post('URL_API_FACTE/cancelar', payloadCancelacion, {
      headers: { 'Authorization': `Bearer ${process.env.FACTE_TOKEN}` }
    });
    
    if(!respuestaFacte.data.exito) {
        throw new Error('El SAT/PAC rechazó la cancelación: ' + respuestaFacte.data.mensaje);
    }
    */

    // MOCK: Simulación de respuesta exitosa de cancelación
    const codigoRespuestaSat = `Cancelado (Motivo ${motivo})`;

    // 3.1 Actualizar tabla comercial (factura)
    await connection.query(
      `UPDATE factura SET estatus = 'CANCELADA' WHERE num_factura = ?`,
      [num_factura]
    );

    // 3.2 Actualizar tabla fiscal (cfdi_timbrado)
    await connection.query(
      `UPDATE cfdi_timbrado SET estatus_sat = 'CANCELADO', codigo_estatus_sat = ? WHERE id_factura = ?`,
      [codigoRespuestaSat, num_factura]
    );

    await connection.commit();

    res.status(200).json({
      exito: true,
      mensaje: `La factura ${num_factura} (UUID: ${cfdi.uuid}) fue cancelada correctamente.`
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error al cancelar factura:', error);
    res.status(500).json({ exito: false, mensaje: error.message || 'Error interno al cancelar la factura.' });
  } finally {
    connection.release();
  }
};

/**
 * @function descargarXML
 * @description Recupera el string XML de la BD y lo formatea para que el navegador lo descargue como archivo.
 * @route GET /api/facturacion/:num_factura/xml
 */
const descargarXML = async (req, res) => {
  const { num_factura } = req.params;

  try {
    const [rows] = await pool.query(
      `SELECT xml_sat, uuid FROM cfdi_timbrado WHERE id_factura = ?`, 
      [num_factura]
    );

    if (rows.length === 0 || !rows[0].xml_sat) {
      return res.status(404).json({ exito: false, mensaje: 'El archivo XML no está disponible para esta factura.' });
    }

    const xmlData = rows[0].xml_sat;
    const uuid = rows[0].uuid || num_factura;

    // Configuramos los headers para forzar la descarga en el navegador del frontend
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename=Factura_${uuid}.xml`);
    
    // Enviamos el texto crudo
    res.status(200).send(xmlData);

  } catch (error) {
    console.error('Error al descargar XML:', error);
    res.status(500).json({ exito: false, mensaje: 'Error al generar el archivo XML.' });
  }
};

module.exports = {
  timbrarFactura,
  obtenerFacturasConFiltros,
  cancelarFactura,
  descargarXML
};