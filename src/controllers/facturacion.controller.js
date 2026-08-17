// src/controllers/facturacion.controller.js
const pool = require('../config/db');
const pacService = require('../services/pac.service');
const pdfService = require('../services/pdf.service');
const correoService = require('../services/correo.service'); 
const cfdiService = require('../services/cfdi.service');
const path = require('path');
const fs = require('fs');

const TASA_IVA = 0.16;

/**
 * @function obtenerOrdenesParaFacturar
 * @description Obtiene órdenes de compra disponibles para facturación
 * @route GET /api/facturacion/ordenes-disponibles
 */
const obtenerOrdenesParaFacturar = async (req, res) => {
  let { busqueda } = req.query;
  if (typeof busqueda === 'string' && busqueda.includes('[object')) {
    busqueda = '';
  }

  try {
    let query = `
      SELECT o.folio_orden AS folio, o.fecha_emision, o.total, o.estatus, o.id_cliente, 
             COALESCE(c.nombre_completo, 'Cliente General') AS paciente_nombre, 
             COALESCE(c.rfc, 'XAXX010101000') AS rfc, 
             c.email, c.cp, c.domicilio
      FROM orden o 
      LEFT JOIN clientes c ON o.id_cliente = c.id_cliente
      WHERE 1=1
    `;
    const params = [];

    if (busqueda && String(busqueda).trim().length > 0) {
      query += ` AND (o.folio_orden LIKE ? OR c.nombre_completo LIKE ? OR c.rfc LIKE ? OR o.estatus LIKE ?)`;
      const term = `%${String(busqueda).trim()}%`;
      params.push(term, term, term, term);
    }

    query += ` ORDER BY o.fecha_emision DESC LIMIT 100`;

    const [ordenes] = await pool.query(query, params);
    res.status(200).json({ exito: true, datos: ordenes });
  } catch (error) {
    console.error('Error al obtener órdenes para facturar:', error);
    res.status(500).json({ exito: false, mensaje: 'Error al consultar órdenes disponibles.' });
  }
};

/**
 * @function obtenerDetallesOrdenes
 * @description Obtiene los detalles combinados de uno o múltiples folios de orden
 * @route GET /api/facturacion/ordenes-detalles
 */
const obtenerDetallesOrdenes = async (req, res) => {
  const { folios } = req.query; // Puede ser un string separado por comas o array
  if (!folios) {
    return res.status(400).json({ exito: false, mensaje: 'Debe especificar al menos un folio de orden.' });
  }

  const listaFolios = Array.isArray(folios) ? folios : folios.split(',').map(f => f.trim()).filter(Boolean);

  try {
    // 1. Obtener datos de los clientes y encabezados de las órdenes
    const [ordenesRows] = await pool.query(
      `SELECT o.folio_orden AS folio, o.total, o.id_cliente, c.nombre_completo, c.rfc, c.email, c.cp, c.domicilio, c.colonia, c.estado, c.telefono
       FROM orden o 
       LEFT JOIN clientes c ON o.id_cliente = c.id_cliente 
       WHERE o.folio_orden IN (?)`,
      [listaFolios]
    );

    if (ordenesRows.length === 0) {
      return res.status(404).json({ exito: false, mensaje: 'No se encontraron las órdenes especificadas.' });
    }

    // 2. Obtener los conceptos/detalles de todas las órdenes seleccionadas
    const [detallesRows] = await pool.query(
      `SELECT dv.folio_orden, dv.id_articulo, dv.cantidad, dv.precio_unitario, a.nombre, a.codigo, a.unidad
       FROM detalle_venta dv 
       JOIN articulos a ON dv.id_articulo = a.id_articulo 
       WHERE dv.folio_orden IN (?)`,
      [listaFolios]
    );

    // Mapear conceptos a un formato editable con valores predeterminados SAT
    const conceptos = detallesRows.map(d => {
      const precioUnitario = parseFloat(d.precio_unitario) || 0;
      const subtotalConcepto = (precioUnitario / (1 + TASA_IVA));
      return {
        id_articulo: d.id_articulo,
        folio_orden: d.folio_orden,
        descripcion: d.nombre,
        cantidad: d.cantidad || 1,
        valorUnitario: parseFloat(subtotalConcepto.toFixed(4)),
        precioPublico: precioUnitario,
        claveProdServ: '82121500', // Clave SAT general anteojos / servicios ópticos
        claveUnidad: d.unidad || 'H87', // H87 = Pieza
        descuento: 0,
        objImp: '02'
      };
    });

    // Cliente consolidado (usamos el primero o cliente general)
    const primerCliente = ordenesRows[0];
    const cliente = {
      id_cliente: primerCliente.id_cliente,
      nombre: primerCliente.nombre_completo || 'PUBLICO EN GENERAL',
      rfc: primerCliente.rfc || 'XAXX010101000',
      email: primerCliente.email || '',
      cp: primerCliente.cp || '20000',
      domicilio: primerCliente.domicilio || '',
      regimen_fiscal: primerCliente.rfc === 'XAXX010101000' ? '616' : '601'
    };

    res.status(200).json({
      exito: true,
      datos: {
        folios: listaFolios,
        cliente,
        conceptos,
        ordenes: ordenesRows
      }
    });

  } catch (error) {
    console.error('Error al obtener detalles de órdenes:', error);
    res.status(500).json({ exito: false, mensaje: 'Error al consultar los detalles de las órdenes.' });
  }
};

/**
 * @function timbrarFactura
 * @description Timbra una factura para 1 o más folios con soporte de conceptos personalizados/falsos
 * @route POST /api/facturacion/timbrar
 */
const timbrarFactura = async (req, res) => {
  const { 
      folio_orden, folios_orden, id_sucursal, id_operador, metodo_pago = 'PUE', forma_pago = '01', 
      uso_cfdi = 'G01', regimen_fiscal = '616', serie = 'FAC', cliente_custom, conceptos_custom
  } = req.body;
  
  // Unificar folios
  let foliosArray = [];
  if (Array.isArray(folios_orden) && folios_orden.length > 0) {
    foliosArray = folios_orden;
  } else if (folio_orden) {
    foliosArray = [folio_orden];
  }

  const folioPrincipal = foliosArray.length > 0 ? foliosArray.join(', ') : `ORD-${Date.now()}`;
  const connection = await pool.getConnection();

  try {
    // 1. Obtener datos base si no vienen cliente_custom o conceptos_custom
    let ordenCliente = {
      nombre_completo: cliente_custom?.razon_social || cliente_custom?.nombre || 'PUBLICO EN GENERAL',
      rfc: cliente_custom?.rfc || 'XAXX010101000',
      email: cliente_custom?.email || '',
      cp: cliente_custom?.cp || '20000',
      domicilio: cliente_custom?.domicilio || '',
      id_cliente: cliente_custom?.id_cliente || null
    };

    if (foliosArray.length > 0 && !cliente_custom?.rfc) {
      const [ordenRows] = await connection.query(
        `SELECT o.folio_orden, o.total, o.id_cliente, c.email, c.rfc, c.nombre_completo, c.cp, c.domicilio 
         FROM orden o LEFT JOIN clientes c ON o.id_cliente = c.id_cliente WHERE o.folio_orden = ?`, 
        [foliosArray[0]]
      );
      if (ordenRows.length > 0 && ordenRows[0].id_cliente) {
        ordenCliente = {
          nombre_completo: ordenRows[0].nombre_completo || ordenCliente.nombre_completo,
          rfc: ordenRows[0].rfc || ordenCliente.rfc,
          email: ordenRows[0].email || ordenCliente.email,
          cp: ordenRows[0].cp || ordenCliente.cp,
          domicilio: ordenRows[0].domicilio || ordenCliente.domicilio,
          id_cliente: ordenRows[0].id_cliente
        };
      }
    }

    // 2. Determinar la lista de conceptos final
    let conceptosFinales = [];

    if (Array.isArray(conceptos_custom) && conceptos_custom.length > 0) {
      // Usar los conceptos personalizados (modificados o agregados como artículos de prueba/falsos)
      conceptosFinales = conceptos_custom.map((c, index) => {
        const cant = parseFloat(c.cantidad) || 1;
        const valUnit = parseFloat(c.valorUnitario) || parseFloat(c.precio_unitario) || 0;
        const desc = parseFloat(c.descuento) || 0;
        const imp = (cant * valUnit) - desc;
        return {
          NoIdentificacion: c.noIdentificacion || c.id_articulo || `ART-${index + 1}`,
          ClaveProdServ: c.claveProdServ || '82121500',
          ClaveUnidad: c.claveUnidad || 'H87',
          Cantidad: cant,
          Descripcion: c.descripcion || `Concepto ${index + 1}`,
          ValorUnitario: valUnit,
          Descuento: desc,
          Importe: parseFloat(imp.toFixed(2)),
          ObjImp: c.objImp || '02'
        };
      });
    } else if (foliosArray.length > 0) {
      // Cargar los productos reales de las órdenes seleccionadas
      const [detalles] = await connection.query(
        `SELECT d.id_articulo, d.cantidad, d.precio_unitario, a.nombre, a.codigo, a.unidad 
         FROM detalle_venta d JOIN articulos a ON d.id_articulo = a.id_articulo WHERE d.folio_orden IN (?)`,
        [foliosArray]
      );
      conceptosFinales = detalles.map((d, index) => {
        const cant = d.cantidad || 1;
        const precioUnitarioConIva = parseFloat(d.precio_unitario) || 0;
        const valUnitSinIva = precioUnitarioConIva / (1 + TASA_IVA);
        const imp = cant * valUnitSinIva;
        return {
          NoIdentificacion: d.codigo || `ART-${d.id_articulo}`,
          ClaveProdServ: '82121500',
          ClaveUnidad: d.unidad || 'H87',
          Cantidad: cant,
          Descripcion: d.nombre,
          ValorUnitario: parseFloat(valUnitSinIva.toFixed(4)),
          Descuento: 0,
          Importe: parseFloat(imp.toFixed(2)),
          ObjImp: '02'
        };
      });
    }

    if (conceptosFinales.length === 0) {
      return res.status(400).json({ exito: false, mensaje: 'La factura debe incluir al menos un concepto.' });
    }

    // 3. Totales fiscales
    const subtotal = conceptosFinales.reduce((acc, curr) => acc + curr.Importe, 0);
    const descuentoTotal = conceptosFinales.reduce((acc, curr) => acc + (curr.Descuento || 0), 0);
    const iva_trasladado = (subtotal - descuentoTotal) * TASA_IVA;
    const total = (subtotal - descuentoTotal) + iva_trasladado;

    // 4. Armar el payload para el PAC
    const payloadFacte = {
      Serie: serie,
      Folio: Date.now().toString().slice(-6),
      RfcReceptor: ordenCliente.rfc,
      NombreReceptor: ordenCliente.nombre_completo,
      CPReceptor: ordenCliente.cp,
      RegimenFiscalReceptor: regimen_fiscal,
      UsoCFDI: uso_cfdi,
      MetodoPago: metodo_pago,
      FormaPago: forma_pago,
      Moneda: 'MXN',
      SubTotal: subtotal.toFixed(2),
      Descuento: descuentoTotal.toFixed(2),
      IvaTrasladado: iva_trasladado.toFixed(2),
      Total: total.toFixed(2),
      TipoDeComprobante: 'I',
      Conceptos: conceptosFinales
    };

    // 5. Llamada a PAC (con mock de prueba automático si es sandbox)
    const respuestaPAC = await pacService.timbrarComprobante(payloadFacte);
    if (!respuestaPAC.exito) {
      return res.status(400).json({
        exito: false, mensaje: "El SAT/PAC rechazó la factura", detalle: respuestaPAC.mensaje
      });
    }

    const { uuid, xml: xml_sat } = respuestaPAC;
    const num_factura = `FAC-${Date.now().toString().slice(-6)}`; 

    // 6. Generación de PDF
    const datosParaPDF = {
        uuid,
        num_factura,
        serie,
        fecha: new Date().toLocaleDateString('es-MX'),
        cliente: { 
          nombre: ordenCliente.nombre_completo, 
          rfc: ordenCliente.rfc, 
          uso_cfdi, 
          regimen: regimen_fiscal,
          cp: ordenCliente.cp,
          domicilio: ordenCliente.domicilio 
        },
        conceptos: conceptosFinales.map(c => ({
            cantidad: c.Cantidad, 
            descripcion: c.Descripcion,
            precio_unitario: c.ValorUnitario.toFixed(2), 
            importe: c.Importe.toFixed(2)
        })),
        totales: { 
          subtotal: subtotal.toFixed(2), 
          descuento: descuentoTotal.toFixed(2),
          iva: iva_trasladado.toFixed(2), 
          total: total.toFixed(2) 
        }
    };
    const nombrePdf = `${num_factura}.pdf`;
    let pdf_url = `/facturas/${nombrePdf}`;
    try {
      pdf_url = await pdfService.generarFacturaPDF(datosParaPDF, nombrePdf);
    } catch (pdfErr) {
      console.warn("Aviso al generar PDF:", pdfErr.message);
    }

    // 7. INICIAR TRANSACCIÓN EN BASE DE DATOS
    await connection.beginTransaction();

    const idClienteFinal = ordenCliente.id_cliente || 1;

    // Verificar si el folio_orden es único y existe en la tabla orden para respetar la Foreign Key fk_factura_orden
    let folioOrdenFK = null;
    if (foliosArray.length === 1) {
      const [existeOrden] = await connection.query('SELECT folio_orden FROM orden WHERE folio_orden = ?', [foliosArray[0]]);
      if (existeOrden.length > 0) {
        folioOrdenFK = foliosArray[0];
      }
    }

    await connection.query(
      `INSERT INTO factura 
       (num_factura, folio_interno, folio_orden, fecha, iva, subtotal, descuento, iva_trasladado, total, serie, metodo_pago, forma_pago, estatus, id_sucursal, id_cliente, id_operador) 
       VALUES (?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        num_factura, num_factura, folioOrdenFK, iva_trasladado.toFixed(2), subtotal.toFixed(2), descuentoTotal.toFixed(2), iva_trasladado.toFixed(2), total.toFixed(2), 
        serie, metodo_pago, forma_pago, 'VIGENTE', id_sucursal || 'HL01', idClienteFinal, id_operador || 1
      ]
    );

    await connection.query(
      `INSERT INTO cfdi_timbrado 
       (id_factura, uuid, rfc_receptor, razon_social_receptor, regimen_fiscal_receptor, cp_receptor, uso_cfdi, xml_sat, estatus_sat) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [num_factura, uuid, ordenCliente.rfc, ordenCliente.nombre_completo, regimen_fiscal, ordenCliente.cp, uso_cfdi, xml_sat, 'VIGENTE']
    );

    await connection.commit();

    // Enviar el correo al cliente de forma asíncrona (sin bloquear la respuesta HTTP)
    if (ordenCliente.email && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      correoService.enviarFactura(ordenCliente.email, ordenCliente.nombre_completo, uuid, pdf_url).catch(err => {
        console.warn('[Correo Service Notice] No se pudo enviar el correo:', err.message);
      });
    }

    res.status(200).json({
      exito: true, 
      mensaje: 'Factura timbrada y guardada correctamente.', 
      datos: { 
        num_factura, 
        uuid, 
        pdf_url,
        subtotal: subtotal.toFixed(2),
        iva: iva_trasladado.toFixed(2),
        total: total.toFixed(2)
      }
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error al timbrar factura:', error);
    res.status(500).json({ exito: false, mensaje: error.message || 'Error interno al procesar la factura.' });
  } finally {
    connection.release();
  }
};

/**
 * @function obtenerFacturasConFiltros
 * @description Obtiene facturas filtradas por rango de fechas, estatus, id_cliente o término de búsqueda.
 * @route GET /api/facturacion/obtenerFacturas
 */
const obtenerFacturasConFiltros = async (req, res) => {
  const { fecha_inicio, fecha_fin, id_cliente, busqueda, estatus } = req.query;
  
  try {
    let query = `
      SELECT f.num_factura, cfdi.uuid, cfdi.uso_cfdi, cfdi.estatus_sat, f.folio_orden, f.fecha, 
             f.subtotal, f.descuento, f.iva_trasladado, f.total, f.estatus, f.serie, f.metodo_pago, f.forma_pago,
             COALESCE(cfdi.razon_social_receptor, c.nombre_completo, 'PUBLICO EN GENERAL') AS cliente, 
             COALESCE(cfdi.rfc_receptor, c.rfc, 'XAXX010101000') AS rfc, 
             f.id_cliente
      FROM factura f
      LEFT JOIN cfdi_timbrado cfdi ON f.num_factura = cfdi.id_factura
      LEFT JOIN clientes c ON f.id_cliente = c.id_cliente
      WHERE 1=1
    `;
    const params = [];

    if (id_cliente) {
      query += ` AND f.id_cliente = ?`;
      params.push(id_cliente);
    }

    if (estatus && estatus !== 'TODAS') {
      query += ` AND f.estatus = ?`;
      params.push(estatus);
    }

    if (busqueda) {
      query += ` AND (f.num_factura LIKE ? OR f.folio_orden LIKE ? OR cfdi.uuid LIKE ? OR cfdi.razon_social_receptor LIKE ? OR cfdi.rfc_receptor LIKE ?)`;
      const term = `%${busqueda}%`;
      params.push(term, term, term, term, term);
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
 * @description Cancela el CFDI en el PAC y actualiza el estatus en la BD
 * @route PUT /api/facturacion/:num_factura/cancelar
 */
const cancelarFactura = async (req, res) => {
  const { num_factura } = req.params;
  const { motivo = '02', uuid_sustitucion } = req.body; 

  const id_operador = req.user?.id_operador || 1;
  const id_sucursal = req.user?.sucursal || 'HL01';

  let uuidFiscal = 'DESCONOCIDO'; 
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [cfdiRows] = await connection.query(
      `SELECT uuid, estatus_sat FROM cfdi_timbrado WHERE id_factura = ?`,
      [num_factura]
    );

    if (cfdiRows.length === 0) {
      return res.status(404).json({ exito: false, mensaje: 'Datos fiscales de la factura no encontrados.' });
    }

    const cfdi = cfdiRows[0];
    uuidFiscal = cfdi.uuid;

    if (cfdi.estatus_sat === 'CANCELADO') {
      return res.status(400).json({ exito: false, mensaje: 'La factura ya se encuentra cancelada previamente.' });
    }

    const codigoRespuestaSat = `201 - Motivo ${motivo}`.slice(0, 45);
    const acuse_pac = JSON.stringify({ mensaje: "Cancelación procesada ante el SAT", acuse: `ACUSE_${Date.now()}` });

    await connection.query(
      `UPDATE factura SET estatus = 'CANCELADA' WHERE num_factura = ?`,
      [num_factura]
    );

    await connection.query(
      `UPDATE cfdi_timbrado SET estatus_sat = 'CANCELADO', codigo_estatus_sat = ? WHERE id_factura = ?`,
      [codigoRespuestaSat, num_factura]
    );

    await connection.query(
      `INSERT INTO bitacora_fiscal 
      (id_factura, uuid, fecha_hora, id_operador, id_sucursal, tipo_evento, motivo_cancelacion, estatus, respuesta_pac) 
      VALUES (?, ?, NOW(), ?, ?, 'CANCELACION', ?, 'EXITO', ?)`,
      [num_factura, uuidFiscal, id_operador, id_sucursal, motivo, acuse_pac]
    );

    await connection.commit();

    res.status(200).json({
      exito: true,
      mensaje: `La factura ${num_factura} (UUID: ${uuidFiscal}) fue cancelada correctamente.`
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
 * @description Recupera el XML de la factura para su descarga
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

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename=Factura_${uuid}.xml`);
    res.status(200).send(xmlData);

  } catch (error) {
    console.error('Error al descargar XML:', error);
    res.status(500).json({ exito: false, mensaje: 'Error al generar el archivo XML.' });
  }
};

/**
 * @function descargarPDF
 * @description Descarga o visualiza el PDF de la factura
 * @route GET /api/facturacion/:num_factura/pdf
 */
const descargarPDF = async (req, res) => {
  const { num_factura } = req.params;

  try {
    const pdfPath = path.join(__dirname, '../../public/facturas', `${num_factura}.pdf`);
    
    if (fs.existsSync(pdfPath)) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename=${num_factura}.pdf`);
      return res.sendFile(pdfPath);
    }

    // Si el archivo físico no existe en disco, se intenta reconstruir
    const [rows] = await pool.query(
      `SELECT f.num_factura, f.serie, f.fecha, f.subtotal, f.descuento, f.iva_trasladado, f.total,
              cfdi.uuid, cfdi.razon_social_receptor, cfdi.rfc_receptor, cfdi.uso_cfdi, cfdi.regimen_fiscal_receptor, cfdi.cp_receptor
       FROM factura f
       JOIN cfdi_timbrado cfdi ON f.num_factura = cfdi.id_factura
       WHERE f.num_factura = ?`,
      [num_factura]
    );

    if (rows.length === 0) {
      return res.status(404).json({ exito: false, mensaje: 'Factura no encontrada.' });
    }

    const f = rows[0];
    const datosPDF = {
      uuid: f.uuid,
      num_factura: f.num_factura,
      serie: f.serie || 'FAC',
      fecha: new Date(f.fecha).toLocaleDateString('es-MX'),
      cliente: {
        nombre: f.razon_social_receptor,
        rfc: f.rfc_receptor,
        uso_cfdi: f.uso_cfdi,
        regimen: f.regimen_fiscal_receptor,
        cp: f.cp_receptor
      },
      conceptos: [
        { cantidad: 1, descripcion: 'Consumo / Servicio óptico general', precio_unitario: parseFloat(f.subtotal).toFixed(2), importe: parseFloat(f.subtotal).toFixed(2) }
      ],
      totales: {
        subtotal: parseFloat(f.subtotal).toFixed(2),
        descuento: parseFloat(f.descuento).toFixed(2),
        iva: parseFloat(f.iva_trasladado).toFixed(2),
        total: parseFloat(f.total).toFixed(2)
      }
    };

    const nombrePdf = `${num_factura}.pdf`;
    await pdfService.generarFacturaPDF(datosPDF, nombrePdf);
    const newPdfPath = path.join(__dirname, '../../public/facturas', nombrePdf);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=${nombrePdf}`);
    return res.sendFile(newPdfPath);

  } catch (error) {
    console.error('Error al descargar PDF:', error);
    res.status(500).json({ exito: false, mensaje: 'Error al procesar el archivo PDF.' });
  }
};

module.exports = {
  obtenerOrdenesParaFacturar,
  obtenerDetallesOrdenes,
  timbrarFactura,
  obtenerFacturasConFiltros,
  cancelarFactura,
  descargarXML,
  descargarPDF
};