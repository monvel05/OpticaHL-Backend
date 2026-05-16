const pool = require('../config/db'); // Tu conexión a MySQL
const axios = require('axios');
const nodemailer = require('nodemailer');

/**
 * Configuración del transportador de Nodemailer para enviar correos.
 * Nota: Actualizar credenciales en .env y usar variables de entorno para seguridad.
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
 * @description Recopila datos de orden, conecta con Facte y guarda en BD.
 */
const timbrarFactura = async (req, res) => {
  const { folio_orden, uso_cfdi, regimen_fiscal } = req.body;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Obtener datos de la Orden y el Cliente
    const [ordenRows] = await connection.query(
      `SELECT o.folio, o.total, c.email, c.rfc, c.nombre_completo, c.cp, c.domicilio 
       FROM orden o 
       JOIN clientes c ON o.id_cliente = c.id_cliente 
       WHERE o.folio = ?`, 
      [folio_orden]
    );

    if (ordenRows.length === 0) {
      throw new Error('No se encontró la orden especificada.');
    }
    const orden = ordenRows[0];

    // Obtener los artículos de la orden desde detalle_venta
    const [detalles] = await connection.query(
      `SELECT d.id_articulo, d.cantidad, d.precio_unitario, a.nombre 
       FROM detalle_venta d
       JOIN articulos a ON d.id_articulo = a.id_articulo
       WHERE d.folio_orden = ?`,
      [folio_orden]
    );

    // Cálculos fiscales (Desglosando IVA al 16%)
    const total = parseFloat(orden.total);
    const subtotal = total / 1.16;
    const iva = total - subtotal;

    // Armar el JSON requerido por la API del PAC (Facte)
    const payloadFacte = {
      Receptor: {
        Rfc: orden.rfc,
        Nombre: orden.nombre_completo,
        UsoCFDI: uso_cfdi,
        DomicilioFiscalReceptor: orden.cp,
        RegimenFiscalReceptor: regimen_fiscal
      },
      Conceptos: detalles.map(item => ({
        ClaveProdServ: "42142902", // Código SAT genérico para lentes/armazones
        Cantidad: item.cantidad,
        Descripcion: item.nombre,
        ValorUnitario: parseFloat(item.precio_unitario) / 1.16,
        Importe: (parseFloat(item.precio_unitario) / 1.16) * item.cantidad
      }))
      // Agrega aquí las credenciales o headers que Facte te solicite
    };

    // 5. Llamada a la API de Facte (Axios)
    /* // DESCOMENTAR CUANDO ESTE LA URL REAL DE FACTE
    const respuestaFacte = await axios.post('URL_API_FACTE/timbrar', payloadFacte, {
      headers: { 'Authorization': `Bearer ${process.env.FACTE_TOKEN}` }
    });
    const { uuid, xml_base64, pdf_url } = respuestaFacte.data; 
    */
    
    // MOCK (Simulación mientras te dan las credenciales de Facte)
    const uuid = `MOCK-UUID-${Date.now()}`;
    const pdf_url = "https://miservidor.com/facturas/mock.pdf";

    // Guardar en la tabla FACTURA según el MER V2
    await connection.query(
      `INSERT INTO factura (num_factura, folio_orden, fecha, subtotal, iva, total, estatus) 
       VALUES (?, ?, NOW(), ?, ?, ?, ?)`,
      [uuid, folio_orden, subtotal.toFixed(2), iva.toFixed(2), total.toFixed(2), 'Timbrada']
    );

    await connection.commit();

    // Enviar el correo al cliente
    if (orden.email) {
      await enviarFacturaPorCorreo(orden.email, orden.nombre_completo, uuid, pdf_url);
    }

    res.status(200).json({
      exito: true,
      mensaje: 'Factura timbrada y guardada correctamente.',
      datos: { num_factura: uuid, pdf_url }
    });

  } catch (error) {
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
    // No lanzamos el error para no afectar la respuesta HTTP si el correo falla pero la factura se generó
  }
};

/**
 * @function obtenerFacturas
 * @description Obtiene el listado de facturas emitidas con datos del cliente y la orden.
 */
const obtenerFacturas = async (req, res) => {
  try {
    const query = `
      SELECT f.num_factura AS uuid, f.folio_orden, f.fecha, f.total, f.estatus,
             c.nombre_completo AS cliente, c.rfc
      FROM factura f
      JOIN orden o ON f.folio_orden = o.folio
      JOIN clientes c ON o.id_cliente = c.id_cliente
      ORDER BY f.fecha DESC
    `;
    const [facturas] = await pool.query(query);
    
    res.status(200).json({ exito: true, datos: facturas });
  } catch (error) {
    console.error('Error al obtener facturas:', error);
    res.status(500).json({ exito: false, mensaje: 'Error al consultar el historial de facturas.' });
  }
};

/**
 * @function obtenerFacturasConFiltros
 * @description Obtiene facturas filtradas por rango de fechas y/o id_cliente.
 * @route GET /api/facturacion/buscar?fecha_inicio=YYYY-MM-DD&fecha_fin=YYYY-MM-DD&id_cliente=1
 */
const obtenerFacturasConFiltros = async (req, res) => {
  const { fecha_inicio, fecha_fin, id_cliente } = req.query;
  
  try {
    let query = `
      SELECT f.num_factura AS uuid, f.folio_orden, f.fecha, f.total, f.estatus,
             c.nombre_completo AS cliente, c.rfc, c.id_cliente
      FROM factura f
      JOIN orden o ON f.folio_orden = o.folio
      JOIN clientes c ON o.id_cliente = c.id_cliente
      WHERE 1=1
    `;
    const params = [];

    // Filtro por cliente
    if (id_cliente) {
      query += ` AND c.id_cliente = ?`;
      params.push(id_cliente);
    }

    // Filtro por rango de fechas
    if (fecha_inicio && fecha_fin) {
      query += ` AND DATE(f.fecha) BETWEEN ? AND ?`;
      params.push(fecha_inicio, fecha_fin);
    }

    query += ` ORDER BY f.fecha DESC`;

    const [facturas] = await pool.query(query, params);
    res.status(200).json({ exito: true, datos: facturas });
  } catch (error) {
    console.error('Error al filtrar facturas:', error);
    res.status(500).json({ exito: false, mensaje: 'Error al consultar las facturas.' });
  }
};

module.exports = {
  timbrarFactura,
  obtenerFacturas,
  obtenerFacturasConFiltros
};