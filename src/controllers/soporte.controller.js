// src/controllers/soporte.controller.js
const correoService = require('../services/correo.service');

/**
 * Recibe un reporte de usuario desde el frontend (falla técnica o petición de nueva función).
 * Se envía hacia soporte@opthospitaldelentes.com desde el correo de Ventas o Finanzas,
 * según el departamento / rol del operador logueado.
 */
exports.enviarReporte = async (req, res) => {
  try {
    const { tipo, descripcion, departamento, operador, sucursal, rutaActual } = req.body;

    if (!tipo || !descripcion || !descripcion.trim()) {
      return res.status(400).json({
        ok: false,
        error: 'El tipo de reporte y la descripción son obligatorios.'
      });
    }

    // Datos del operador obtenidos del body o de req.usuario (si vino por JWT)
    const operadorData = operador || req.usuario || {
      nombre_completo: 'Operador General',
      usuario_login: 'Anonimo',
      roles: ['MOSTRADOR']
    };

    const resultado = await correoService.enviarReporteUsuario({
      tipo,
      descripcion: descripcion.trim(),
      operador: operadorData,
      sucursal: sucursal || operadorData.id_sucursal || 'Principal',
      rutaActual: rutaActual || 'N/A'
    });

    if (!resultado.ok) {
      return res.status(500).json({
        ok: false,
        error: resultado.error || 'No se pudo enviar el correo de reporte.'
      });
    }

    res.status(200).json({
      ok: true,
      mensaje: 'Tu reporte ha sido enviado exitosamente al equipo de soporte.'
    });
  } catch (error) {
    console.error('Error en soporteController.enviarReporte:', error);
    res.status(500).json({
      ok: false,
      error: 'Error interno al procesar el reporte de soporte.'
    });
  }
};
