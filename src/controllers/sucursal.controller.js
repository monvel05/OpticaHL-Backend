const pool = require('../config/db');

/**
 * @module SucursalController
 * @description Controlador para la gestión integral de sucursales en OpticaHL.
 */

// Obtener todas las sucursales con opciones de filtro (activo, busqueda)
const obtenerSucursales = async (req, res) => {
  const { activo, busqueda } = req.query;

  try {
    let query = `
      SELECT 
        id_sucursal, 
        nombre, 
        direccion, 
        activo 
      FROM sucursales 
      WHERE 1=1
    `;
    const params = [];

    if (activo !== undefined && activo !== null && activo !== '' && activo !== 'all') {
      if (activo === 'true' || activo === '1' || activo === 1) {
        query += ` AND activo = 1`;
      } else if (activo === 'false' || activo === '0' || activo === 0) {
        query += ` AND activo = 0`;
      }
    }

    if (busqueda && busqueda.trim() !== '') {
      query += ` AND (id_sucursal LIKE ? OR nombre LIKE ? OR direccion LIKE ?)`;
      const term = `%${busqueda.trim()}%`;
      params.push(term, term, term);
    }

    query += ` ORDER BY id_sucursal ASC`;

    const [rows] = await pool.query(query, params);
    
    // Convertir activo a booleano explícito
    const sucursalesFormateadas = rows.map(s => ({
      ...s,
      activo: Boolean(s.activo)
    }));

    return res.status(200).json({
      exito: true,
      datos: sucursalesFormateadas
    });
  } catch (error) {
    console.error('Error al obtener sucursales:', error);
    return res.status(500).json({
      exito: false,
      mensaje: 'Error interno al consultar la lista de sucursales.'
    });
  }
};

// Obtener una sucursal específica por ID
const obtenerSucursalPorId = async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await pool.query(
      'SELECT id_sucursal, nombre, direccion, activo FROM sucursales WHERE id_sucursal = ?',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        exito: false,
        mensaje: `No se encontró la sucursal con ID ${id}.`
      });
    }

    const sucursal = {
      ...rows[0],
      activo: Boolean(rows[0].activo)
    };

    return res.status(200).json({
      exito: true,
      datos: sucursal
    });
  } catch (error) {
    console.error(`Error al obtener sucursal ${id}:`, error);
    return res.status(500).json({
      exito: false,
      mensaje: 'Error interno al consultar la sucursal.'
    });
  }
};

// Crear una nueva sucursal
const crearSucursal = async (req, res) => {
  let { id_sucursal, nombre, direccion, activo } = req.body;

  if (!id_sucursal || !nombre) {
    return res.status(400).json({
      exito: false,
      mensaje: 'El código (id_sucursal) y el nombre de la sucursal son obligatorios.'
    });
  }

  id_sucursal = String(id_sucursal).trim().toUpperCase();
  nombre = String(nombre).trim();
  direccion = direccion ? String(direccion).trim() : '';
  const estadoActivo = (activo === undefined || activo === null) ? 1 : (activo ? 1 : 0);

  try {
    // Verificar si ya existe la clave de sucursal
    const [existentes] = await pool.query(
      'SELECT id_sucursal FROM sucursales WHERE id_sucursal = ?',
      [id_sucursal]
    );

    if (existentes.length > 0) {
      return res.status(400).json({
        exito: false,
        mensaje: `La clave de sucursal "${id_sucursal}" ya está registrada.`
      });
    }

    const query = `
      INSERT INTO sucursales (id_sucursal, nombre, direccion, activo)
      VALUES (?, ?, ?, ?)
    `;
    await pool.query(query, [id_sucursal, nombre, direccion, estadoActivo]);

    return res.status(201).json({
      exito: true,
      mensaje: 'Sucursal registrada exitosamente.',
      datos: {
        id_sucursal,
        nombre,
        direccion,
        activo: Boolean(estadoActivo)
      }
    });
  } catch (error) {
    console.error('Error al crear sucursal:', error);
    return res.status(500).json({
      exito: false,
      mensaje: 'Error interno al registrar la sucursal.'
    });
  }
};

// Actualizar datos de una sucursal existente
const actualizarSucursal = async (req, res) => {
  const { id } = req.params;
  let { nombre, direccion, activo } = req.body;

  if (!nombre) {
    return res.status(400).json({
      exito: false,
      mensaje: 'El nombre de la sucursal es obligatorio.'
    });
  }

  nombre = String(nombre).trim();
  direccion = direccion ? String(direccion).trim() : '';
  const estadoActivo = (activo === undefined || activo === null) ? 1 : (activo ? 1 : 0);

  try {
    const query = `
      UPDATE sucursales 
      SET nombre = ?, direccion = ?, activo = ? 
      WHERE id_sucursal = ?
    `;
    const [result] = await pool.query(query, [nombre, direccion, estadoActivo, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        exito: false,
        mensaje: `No se encontró la sucursal con ID ${id}.`
      });
    }

    return res.status(200).json({
      exito: true,
      mensaje: 'Sucursal actualizada exitosamente.',
      datos: {
        id_sucursal: id,
        nombre,
        direccion,
        activo: Boolean(estadoActivo)
      }
    });
  } catch (error) {
    console.error(`Error al actualizar sucursal ${id}:`, error);
    return res.status(500).json({
      exito: false,
      mensaje: 'Error interno al actualizar la sucursal.'
    });
  }
};

// Cambiar estado activo/inactivo de una sucursal
const cambiarEstadoSucursal = async (req, res) => {
  const { id } = req.params;
  const { activo } = req.body;

  if (activo === undefined || activo === null) {
    return res.status(400).json({
      exito: false,
      mensaje: 'El estado "activo" es obligatorio.'
    });
  }

  const estadoActivo = activo ? 1 : 0;

  try {
    const query = 'UPDATE sucursales SET activo = ? WHERE id_sucursal = ?';
    const [result] = await pool.query(query, [estadoActivo, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        exito: false,
        mensaje: `No se encontró la sucursal con ID ${id}.`
      });
    }

    return res.status(200).json({
      exito: true,
      mensaje: `Sucursal ${estadoActivo ? 'activada' : 'desactivada'} exitosamente.`
    });
  } catch (error) {
    console.error(`Error al cambiar estado de sucursal ${id}:`, error);
    return res.status(500).json({
      exito: false,
      mensaje: 'Error interno al cambiar el estado de la sucursal.'
    });
  }
};

// Eliminar o desactivar sucursal (Soft Delete si existen dependencias)
const eliminarSucursal = async (req, res) => {
  const { id } = req.params;

  try {
    // Intentar borrado físico
    await pool.query('DELETE FROM sucursales WHERE id_sucursal = ?', [id]);

    return res.status(200).json({
      exito: true,
      mensaje: `Sucursal ${id} eliminada permanentemente.`
    });
  } catch (error) {
    // Si la eliminación física falla debido a llaves foráneas (código 1451 / ER_ROW_IS_REFERENCED)
    if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.code === 'ER_ROW_IS_REFERENCED' || error.errno === 1451) {
      try {
        await pool.query('UPDATE sucursales SET activo = 0 WHERE id_sucursal = ?', [id]);
        return res.status(200).json({
          exito: true,
          desactivado: true,
          mensaje: `La sucursal ${id} contiene registros asociados en el sistema (operadores, inventario u órdenes). Fue desactivada correctamente para mantener la integridad de los datos.`
        });
      } catch (softError) {
        console.error(`Error al desactivar sucursal ${id}:`, softError);
        return res.status(500).json({
          exito: false,
          mensaje: 'Error interno al desactivar la sucursal.'
        });
      }
    }

    console.error(`Error al eliminar sucursal ${id}:`, error);
    return res.status(500).json({
      exito: false,
      mensaje: 'Error interno al eliminar la sucursal.'
    });
  }
};

module.exports = {
  obtenerSucursales,
  obtenerSucursalPorId,
  crearSucursal,
  actualizarSucursal,
  cambiarEstadoSucursal,
  eliminarSucursal
};
