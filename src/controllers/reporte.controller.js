const pool = require('../config/db');

// Reporte para mostrar artículos con stock crítico
const getReporteStockCritico = async (req, res) => {
    try {
        const [rows] = await pool.query('CALL sp_ReporteStockCritico()');
        // Al llamar un SP, MySQL devuelve un arreglo de arreglos. El índice [0] tiene los datos.
        res.status(200).json({ success: true, data: rows[0] });
    } catch (error) {
        console.error('Error en getReporteStockCritico:', error);
        res.status(500).json({ success: false, message: 'Error interno al generar reporte de stock' });
    }
};

// Reporte para mostrar productividad de operadores en un rango de fechas
const getReporteProductividad = async (req, res) => {
    try {
        const { fechaInicio, fechaFin } = req.query;
        
        if (!fechaInicio || !fechaFin) {
            return res.status(400).json({ success: false, message: "Las fechas 'fechaInicio' y 'fechaFin' son obligatorias." });
        }

        const [rows] = await pool.query('CALL sp_ReporteProductividad(?, ?)', [fechaInicio, fechaFin]);
        res.status(200).json({ success: true, data: rows[0] });
    } catch (error) {
        console.error('Error en getReporteProductividad:', error);
        res.status(500).json({ success: false, message: 'Error interno al generar reporte de productividad' });
    }
};

// Reporte para mostrar ingresos por caja en un rango de fechas, con opción de filtrar por sucursal
const getReporteIngresosCaja = async (req, res) => {
    try {
        const { fechaInicio, fechaFin, idSucursal } = req.query;

        if (!fechaInicio || !fechaFin) {
            return res.status(400).json({ success: false, message: "Las fechas 'fechaInicio' y 'fechaFin' son obligatorias." });
        }

        // Si no mandan idSucursal, lo pasamos como null para que el SP devuelva todo (Global)
        const sucursalFiltro = idSucursal ? idSucursal : null;

        const [rows] = await pool.query('CALL sp_ReporteIngresosCaja(?, ?, ?)', [fechaInicio, fechaFin, sucursalFiltro]);
        res.status(200).json({ success: true, data: rows[0] });
    } catch (error) {
        console.error('Error en getReporteIngresosCaja:', error);
        res.status(500).json({ success: false, message: 'Error interno al generar reporte de caja' });
    }
};

module.exports = {
    getReporteStockCritico,
    getReporteProductividad,
    getReporteIngresosCaja
};