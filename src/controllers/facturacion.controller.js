// src/controllers/facturacion.controller.js
const pool = require('../config/db');
const pacService = require('../services/pac.service');
const pdfService = require('../services/pdf.service');
const correoService = require('../services/correo.service'); 
const cfdiService = require('../services/cfdi.service');

const TASA_IVA = 0.16;
const FACTOR_IVA = 1 + TASA_IVA;

const timbrarFactura = async (req, res) => {
  const { 
      folio_orden, id_sucursal, id_operador, metodo_pago, forma_pago, 
      uso_cfdi, regimen_fiscal, nombres_personalizados = []
  } = req.body;
  
  const connection = await pool.getConnection();

  try {
    // OPTIMIZACIÓN: Ejecutamos ambas consultas en paralelo para ganar velocidad
    const [ [ordenRows], [detalles] ] = await Promise.all([
      connection.query(
        `SELECT o.folio, o.total, o.id_cliente, c.email, c.rfc, c.nombre_completo, c.cp, c.domicilio 
         FROM orden o JOIN clientes c ON o.id_cliente = c.id_cliente WHERE o.folio = ?`, 
        [folio_orden]
      ),
      connection.query(
        `SELECT d.id_articulo, d.cantidad, d.precio_unitario, a.nombre 
         FROM detalle_venta d JOIN articulos a ON d.id_articulo = a.id_articulo WHERE d.folio_orden = ?`,
        [folio_orden]
      )
    ]);

    if (ordenRows.length === 0) {
      return res.status(404).json({ exito: false, mensaje: 'No se encontró la orden especificada.' });
    }
    const orden = ordenRows[0];

    // Cálculos fiscales usando la constante
    const total = parseFloat(orden.total);
    const subtotal = total / FACTOR_IVA;
    const iva_trasladado = total - subtotal;
    const descuento = 0.00; 

    // Armar el JSON requerido por la API del PAC
    const payloadFacte = cfdiService.construirPayloadFacte(orden, detalles, uso_cfdi, regimen_fiscal, nombres_personalizados);

    // Llamada a la API de Facte
    const respuestaPAC = await pacService.timbrarComprobante(payloadFacte);
    if (!respuestaPAC.exito) {
      return res.status(400).json({
        exito: false, mensaje: "El SAT/PAC rechazó la factura", detalle: respuestaPAC.mensaje
      });
    }

    const { uuid, xml: xml_sat } = respuestaPAC; // Desestructuración limpia
    const num_factura = `FAC-${Date.now()}`; 

    // Preparamos los datos y generamos PDF
    const datosParaPDF = {
        uuid, 
        cliente: { nombre: orden.nombre_completo, rfc: orden.rfc, uso_cfdi, regimen: regimen_fiscal },
        conceptos: payloadFacte.Conceptos.map(c => ({
            cantidad: c.Cantidad, descripcion: c.Descripcion,
            precio_unitario: c.ValorUnitario.toFixed(2), importe: c.Importe.toFixed(2)
        })),
        totales: { subtotal: subtotal.toFixed(2), iva: iva_trasladado.toFixed(2), total: total.toFixed(2) }
    };
    const nombrePdf = `${num_factura}.pdf`;
    const pdf_url = await pdfService.generarFacturaPDF(datosParaPDF, nombrePdf);

    // INICIAR TRANSACCIÓN EN BASE DE DATOS
    await connection.beginTransaction();

    await connection.query(
      `INSERT INTO factura (num_factura, folio_orden, fecha, subtotal, descuento, iva_trasladado, total, metodo_pago, forma_pago, estatus, id_sucursal, id_cliente, id_operador) VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [num_factura, folio_orden, subtotal.toFixed(2), descuento, iva_trasladado.toFixed(2), total.toFixed(2), metodo_pago, forma_pago, 'VIGENTE', id_sucursal, orden.id_cliente, id_operador]
    );

    await connection.query(
      `INSERT INTO cfdi_timbrado (id_factura, uuid, rfc_receptor, razon_social_receptor, regimen_fiscal_receptor, cp_receptor, uso_cfdi, xml_sat, estatus_sat) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [num_factura, uuid, orden.rfc, orden.nombre_completo, regimen_fiscal, orden.cp, uso_cfdi, xml_sat, 'VIGENTE']
    );

    await connection.commit();

    // Enviar el correo al cliente usando el nuevo servicio
    if (orden.email) {
      // Se ejecuta en background 
      correoService.enviarFactura(orden.email, orden.nombre_completo, uuid, pdf_url); 
    }

    res.status(200).json({
      exito: true, mensaje: 'Factura timbrada y guardada correctamente.', datos: { num_factura, uuid, pdf_url }
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