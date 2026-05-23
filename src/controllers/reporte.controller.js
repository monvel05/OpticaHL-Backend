const pool = require("../config/db");

// Reporte para mostrar artículos con stock crítico
const obtenerReporteStockCritico = async (req, res) => {
  try {
    const [rows] = await pool.query("CALL sp_ReporteStockCritico()");
    // Al llamar un SP, MySQL devuelve un arreglo de arreglos. El índice [0] tiene los datos.
    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error("Error en obtenerReporteStockCritico:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Error interno al generar reporte de stock",
      });
  }
};

// Reporte para mostrar productividad de operadores en un rango de fechas
const obtenerReporteProductividad = async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = req.query;

    if (!fechaInicio || !fechaFin) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Las fechas 'fechaInicio' y 'fechaFin' son obligatorias.",
        });
    }

    const [rows] = await pool.query("CALL sp_ReporteProductividad(?, ?)", [
      fechaInicio,
      fechaFin,
    ]);
    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error("Error en obtenerReporteProductividad:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Error interno al generar reporte de productividad",
      });
  }
};

// Reporte para mostrar ingresos por caja en un rango de fechas, con opción de filtrar por sucursal
const obtenerReporteIngresosCaja = async (req, res) => {
  try {
    const { fechaInicio, fechaFin, idSucursal } = req.query;

    if (!fechaInicio || !fechaFin) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Las fechas 'fechaInicio' y 'fechaFin' son obligatorias.",
        });
    }

    // Si no mandan idSucursal, lo pasamos como null para que el SP devuelva todo (Global)
    const sucursalFiltro = idSucursal ? idSucursal : null;

    const [rows] = await pool.query("CALL sp_ReporteIngresosCaja(?, ?, ?)", [
      fechaInicio,
      fechaFin,
      sucursalFiltro,
    ]);
    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error("Error en obtenerReporteIngresosCaja:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Error interno al generar reporte de caja",
      });
  }
};

const pool = require("../config/db");

/**
 *  Reporte de Ingresos por Método de Pago (Corte de Caja)
 * @description Muestra cuánto dinero entró hoy (o en una fecha específica) desglosado por método de pago.
 * @route GET /api/reportes/ingresos-metodo?fecha=YYYY-MM-DD&id_sucursal=1
 */
const obtenerIngresosPorMetodo = async (req, res) => {
  // Si no mandan fecha, usamos la fecha actual por defecto
  const fecha = req.query.fecha || new Date().toISOString().split("T")[0];
  const { id_sucursal } = req.query;

  try {
    let query = `
      SELECT metodo_pago, 
             COUNT(id_movimiento) AS cantidad_transacciones, 
             SUM(monto) AS total_ingresado
      FROM movimientos_caja
      WHERE DATE(fecha_hora) = ? AND tipo_movimiento = 'ENTRADA'
    `;
    const params = [fecha];

    if (id_sucursal) {
      query += ` AND id_sucursal = ?`;
      params.push(id_sucursal);
    }

    query += ` GROUP BY metodo_pago ORDER BY total_ingresado DESC`;

    const [resultados] = await pool.query(query, params);
    res
      .status(200)
      .json({ exito: true, fecha_corte: fecha, datos: resultados });
  } catch (error) {
    console.error("Error en obtenerIngresosPorMetodo:", error);
    res
      .status(500)
      .json({ exito: false, mensaje: "Error al generar reporte de ingresos." });
  }
};

/**
 *   Reporte de Antigüedad de Saldos (Cuentas por Cobrar Críticas)
 * @description Obtiene órdenes con saldo pendiente que tienen más de 30 días de antigüedad.
 * @route GET /api/reportes/antiguedad-saldos
 */
const obtenerAntiguedadSaldos = async (req, res) => {
  try {
    const query = `
      SELECT o.folio, o.fecha_emision, o.total, c.nombre_completo AS paciente, c.telefono,
             IFNULL(SUM(m.monto), 0) AS total_pagado,
             (o.total - IFNULL(SUM(m.monto), 0)) AS saldo_pendiente,
             DATEDIFF(NOW(), o.fecha_emision) AS dias_antiguedad
      FROM orden o
      JOIN clientes c ON o.id_cliente = c.id_cliente
      LEFT JOIN movimientos_caja m ON o.folio = m.folio_orden AND m.tipo_movimiento = 'ENTRADA'
      WHERE o.estatus IN ('Con Anticipo', 'Pendiente')
        AND o.fecha_emision <= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY o.folio, c.id_cliente
      HAVING saldo_pendiente > 0
      ORDER BY dias_antiguedad DESC
    `;

    const [resultados] = await pool.query(query);
    res.status(200).json({ exito: true, datos: resultados });
  } catch (error) {
    console.error("Error en obtenerAntiguedadSaldos:", error);
    res
      .status(500)
      .json({
        exito: false,
        mensaje: "Error al generar reporte de cartera vencida.",
      });
  }
};

/**
 *  CRM de Salud Visual (Pacientes para Recordatorio)
 * @description Encuentra pacientes cuya última visita/compra fue hace más de 12 meses.
 * @route GET /api/reportes/crm-recordatorios
 */
const obtenerPacientesParaRecordatorio = async (req, res) => {
  try {
    const query = `
      SELECT c.id_cliente, c.nombre_completo, c.telefono, c.email, 
             MAX(o.fecha_emision) AS ultima_visita,
             DATEDIFF(NOW(), MAX(o.fecha_emision)) AS dias_sin_venir
      FROM clientes c
      JOIN orden o ON c.id_cliente = o.id_cliente
      GROUP BY c.id_cliente
      HAVING ultima_visita <= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      ORDER BY ultima_visita ASC
    `;

    const [resultados] = await pool.query(query);
    res
      .status(200)
      .json({
        exito: true,
        total_pacientes: resultados.length,
        datos: resultados,
      });
  } catch (error) {
    console.error("Error en obtenerPacientesParaRecordatorio:", error);
    res
      .status(500)
      .json({ exito: false, mensaje: "Error al generar reporte de CRM." });
  }
};

/**
 *  Rotación de Inventario (Artículos de Lento Movimiento)
 * @description Muestra armazones/artículos que tienen stock pero no se han vendido en los últimos 6 meses.
 * @route GET /api/reportes/inventario-lento?id_sucursal=1
 */
const obtenerInventarioLentoMovimiento = async (req, res) => {
  const { id_sucursal } = req.query;

  try {
    let query = `
      SELECT a.codigo, a.nombre, a.categoria, i.stock_actual, i.id_sucursal
      FROM articulos a
      JOIN inventario_sucursal i ON a.id_articulo = i.id_articulo
      WHERE i.stock_actual > 0
        AND a.id_articulo NOT IN (
            SELECT dv.id_articulo
            FROM detalle_venta dv
            JOIN orden o ON dv.folio_orden = o.folio
            WHERE o.fecha_emision >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
        )
    `;
    const params = [];

    if (id_sucursal) {
      query += ` AND i.id_sucursal = ?`;
      params.push(id_sucursal);
    }

    query += ` ORDER BY i.stock_actual DESC`;

    const [resultados] = await pool.query(query, params);
    res.status(200).json({ exito: true, datos: resultados });
  } catch (error) {
    console.error("Error en obtenerInventarioLentoMovimiento:", error);
    res
      .status(500)
      .json({
        exito: false,
        mensaje: "Error al generar reporte de inventario.",
      });
  }
};

/**
 *  Productividad: Ticket Promedio y Exámenes por Operador
 * @description Mide la eficiencia de los vendedores/optometristas en un mes y año específico.
 * @route GET /api/reportes/productividad?mes=05&anio=2026
 */
const obtenerProductividadOperadores = async (req, res) => {
  const mes = req.query.mes || new Date().getMonth() + 1; // Mes actual por defecto
  const anio = req.query.anio || new Date().getFullYear();

  try {
    const query = `
      SELECT op.id_operador, op.nombre_completo AS operador,
             COUNT(DISTINCT o.folio) AS total_ventas_cerradas,
             IFNULL(SUM(o.total), 0) AS ingresos_generados,
             IFNULL(SUM(o.total) / NULLIF(COUNT(DISTINCT o.folio), 0), 0) AS ticket_promedio,
             COUNT(DISTINCT g.id_graduacion) AS examenes_realizados
      FROM operadores op
      LEFT JOIN orden o ON op.id_operador = o.id_operador 
           AND MONTH(o.fecha_emision) = ? 
           AND YEAR(o.fecha_emision) = ?
           AND o.estatus != 'Cancelada'
      LEFT JOIN graduacion_orden g ON o.folio = g.folio_orden
      GROUP BY op.id_operador
      ORDER BY ingresos_generados DESC
    `;

    const [resultados] = await pool.query(query, [mes, anio]);
    res
      .status(200)
      .json({ exito: true, periodo: `${mes}/${anio}`, datos: resultados });
  } catch (error) {
    console.error("Error en obtenerProductividadOperadores:", error);
    res
      .status(500)
      .json({
        exito: false,
        mensaje: "Error al generar reporte de productividad.",
      });
  }
};

/**
 * Reporte de Descuentos Mensuales 
 * @description Muestra las órdenes o facturas donde se aplicó un descuento en un mes específico.
 */
const obtenerReporteDescuentos = async (req, res) => {
  const mes = req.query.mes || new Date().getMonth() + 1;
  const anio = req.query.anio || new Date().getFullYear();

  try {
    const query = `
      SELECT f.num_factura, f.folio_orden, f.fecha, c.nombre_completo AS cliente, 
             f.subtotal, f.descuento, f.total
      FROM factura f
      JOIN clientes c ON f.id_cliente = c.id_cliente
      WHERE f.descuento > 0 
        AND MONTH(f.fecha) = ? AND YEAR(f.fecha) = ?
      ORDER BY f.fecha DESC
    `;
    const [resultados] = await pool.query(query, [mes, anio]);
    res.status(200).json({ exito: true, periodo: `${mes}/${anio}`, datos: resultados });
  } catch (error) {
    console.error("Error en obtenerReporteDescuentos:", error);
    res.status(500).json({ exito: false, mensaje: "Error al generar reporte de descuentos." });
  }
};

/**
 * Reporte Completo de Ventas 
 * @description Cruce de datos entre órdenes, clientes y movimientos de caja.
 */
const obtenerReporteVentasCompleto = async (req, res) => {
  const { fechaInicio, fechaFin } = req.query;

  try {
    const query = `
      SELECT o.folio, o.fecha_emision, c.nombre_completo AS cliente, 
             o.total AS total_orden, o.estatus,
             IFNULL(SUM(m.monto), 0) AS total_pagado
      FROM orden o
      JOIN clientes c ON o.id_cliente = c.id_cliente
      LEFT JOIN movimientos_caja m ON o.folio = m.folio_orden AND m.tipo_movimiento = 'ENTRADA'
      WHERE DATE(o.fecha_emision) BETWEEN ? AND ?
      GROUP BY o.folio
      ORDER BY o.fecha_emision DESC
    `;
    const [resultados] = await pool.query(query, [fechaInicio, fechaFin]);
    res.status(200).json({ exito: true, datos: resultados });
  } catch (error) {
    console.error("Error en obtenerReporteVentasCompleto:", error);
    res.status(500).json({ exito: false, mensaje: "Error al generar reporte de ventas." });
  }
};

module.exports = {
  obtenerReporteStockCritico,
  obtenerReporteProductividad,
  obtenerReporteIngresosCaja,
  obtenerIngresosPorMetodo,
  obtenerAntiguedadSaldos,
  obtenerPacientesParaRecordatorio,
  obtenerInventarioLentoMovimiento,
  obtenerProductividadOperadores,
  obtenerReporteDescuentos,
  obtenerReporteVentasCompleto
};
