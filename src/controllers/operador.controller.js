const pool = require('../config/db'); // Importación del pool de conexiones MySQL
const bcrypt = require('bcrypt');     // Importación de bcrypt para seguridad de contraseñas

/**
 * @module OperadorController
 * @description Controlador para la gestión integral de operadores y sus roles.
 */

// Obtener catálogos de roles y sucursales para selectores de la vista
const obtenerCatalogosOperador = async (req, res) => {
  try {
    const [roles] = await pool.query('SELECT id_rol, nombre_rol FROM roles ORDER BY id_rol ASC').catch(() => [[]]);
    const [sucursales] = await pool.query('SELECT id_sucursal, nombre FROM sucursales').catch(async () => {
      return await pool.query('SELECT id_sucursal, nombre FROM SUCURSALES').catch(async () => {
        return await pool.query('SELECT id_sucursal, nombre_sucursal AS nombre FROM sucursal');
      });
    });

    res.status(200).json({
      exito: true,
      datos: {
        roles: roles || [],
        sucursales: ((sucursales && sucursales[0]) ? (Array.isArray(sucursales[0]) ? sucursales[0] : sucursales) : []).map(s => ({
          id_sucursal: s.id_sucursal,
          nombre: s.nombre || s.nombre_sucursal || `Sucursal ${s.id_sucursal}`
        }))
      }
    });
  } catch (error) {
    console.error('Error al obtener catálogos de operador:', error);
    res.status(500).json({ exito: false, mensaje: 'Error al obtener catálogos.' });
  }
};

// Obtener la lista de operadores con filtros (activo, id_sucursal, rol, busqueda)
const obtenerOperadores = async (req, res) => {
  const { activo, id_sucursal, rol, busqueda } = req.query;

  try {
    let query = `
      SELECT 
        o.id_operador, 
        o.nombre_completo, 
        o.usuario_login, 
        GROUP_CONCAT(DISTINCT r.descripcion) AS descripcion, 
        o.activo, 
        o.id_sucursal,
        IFNULL(s.nombre, CONCAT('Sucursal ', o.id_sucursal)) AS nombre_sucursal,
        GROUP_CONCAT(DISTINCT r.nombre_rol) AS roles_concatenados,
        GROUP_CONCAT(DISTINCT r.id_rol) AS roles_ids
      FROM operadores o
      LEFT JOIN sucursales s ON o.id_sucursal = s.id_sucursal
      LEFT JOIN operador_roles op_r ON o.id_operador = op_r.id_operador
      LEFT JOIN roles r ON op_r.id_rol = r.id_rol
      WHERE 1=1
    `;
    const params = [];

    if (activo !== undefined && activo !== 'all' && activo !== '') {
      const isActivo = (activo === 'true' || activo === '1' || activo === true) ? 1 : 0;
      query += ` AND o.activo = ? `;
      params.push(isActivo);
    }

    if (id_sucursal && id_sucursal !== '0' && id_sucursal !== 'all') {
      query += ` AND o.id_sucursal = ? `;
      params.push(id_sucursal);
    }

    if (rol && rol !== 'all' && rol !== '') {
      const numRol = Number(rol);
      if (!isNaN(numRol)) {
        query += ` AND (r.nombre_rol LIKE ? OR r.id_rol = ?) `;
        params.push(`%${rol}%`, numRol);
      } else {
        query += ` AND r.nombre_rol LIKE ? `;
        params.push(`%${rol}%`);
      }
    }

    if (busqueda && busqueda.trim() !== '') {
      query += ` AND (o.nombre_completo LIKE ? OR o.usuario_login LIKE ?) `;
      params.push(`%${busqueda.trim()}%`, `%${busqueda.trim()}%`);
    }

    query += ` GROUP BY o.id_operador ORDER BY o.id_operador DESC`;

    const [operadoresRaw] = await pool.query(query, params);

    const datosFormat = (operadoresRaw || []).map(op => {
      const rolesArray = op.roles_concatenados ? op.roles_concatenados.split(',') : [];
      return {
        ...op,
        activo: Boolean(op.activo),
        roles: rolesArray
      };
    });

    res.status(200).json({ exito: true, datos: datosFormat });
  } catch (error) {
    console.error('Error al obtener operadores:', error);
    res.status(500).json({ exito: false, mensaje: 'Error al obtener la lista de operadores.' });
  }
};

// Obtener un operador por ID
const obtenerOperadorPorId = async (req, res) => {
  const { id } = req.params;
  try {
    const query = `
      SELECT 
        o.id_operador, 
        o.nombre_completo, 
        o.usuario_login, 
        GROUP_CONCAT(DISTINCT r.descripcion) AS descripcion, 
        o.activo, 
        o.id_sucursal,
        GROUP_CONCAT(DISTINCT r.nombre_rol) AS roles_concatenados
      FROM operadores o
      LEFT JOIN operador_roles op_r ON o.id_operador = op_r.id_operador
      LEFT JOIN roles r ON op_r.id_rol = r.id_rol
      WHERE o.id_operador = ?
      GROUP BY o.id_operador
    `;
    const [operador] = await pool.query(query, [id]);
    
    if (operador.length === 0) {
      return res.status(404).json({ exito: false, mensaje: 'Operador no encontrado.' });
    }

    const op = operador[0];
    const rolesArray = op.roles_concatenados ? op.roles_concatenados.split(',') : [];

    res.status(200).json({ exito: true, datos: { ...op, activo: Boolean(op.activo), roles: rolesArray } });
  } catch (error) {
    console.error('Error al obtener operador:', error);
    res.status(500).json({ exito: false, mensaje: 'Error al obtener el operador.' });
  }
};

// Crear un nuevo operador con roles múltiples
const crearOperador = async (req, res) => {
  const { 
    nombre_completo, usuario_login, password, id_rol, roles, id_sucursal, activo
  } = req.body;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [existe] = await connection.query('SELECT id_operador FROM operadores WHERE usuario_login = ?', [usuario_login]);
    if (existe.length > 0) throw new Error('El nombre de usuario ya está en uso.');

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password || '123456', salt);

    const sucursalFija = id_sucursal || 'HL01';
    const isActivo = activo !== undefined ? (activo ? 1 : 0) : 1;

    const [result] = await connection.query(
      `INSERT INTO operadores (nombre_completo, usuario_login, password_hash, id_sucursal, activo) 
       VALUES (?, ?, ?, ?, ?)`,
      [
        nombre_completo, usuario_login, password_hash, sucursalFija, isActivo
      ]
    );
    const id_operador = result.insertId;

    const rolesAsignar = Array.isArray(roles) && roles.length > 0 ? roles : (id_rol ? [id_rol] : ['MOSTRADOR']);
    
    for (const r of rolesAsignar) {
      let idRolFinal = r;
      if (typeof r === 'string') {
        const [rRow] = await connection.query('SELECT id_rol FROM roles WHERE nombre_rol = ?', [r]);
        if (rRow.length > 0) idRolFinal = rRow[0].id_rol;
      }
      if (idRolFinal) {
        await connection.query(
          `INSERT INTO operador_roles (id_operador, id_rol) VALUES (?, ?)`,
          [id_operador, idRolFinal]
        ).catch(() => {});
      }
    }

    await connection.commit();
    res.status(201).json({ exito: true, mensaje: 'Operador creado correctamente.', id_operador });
  } catch (error) {
    await connection.rollback();
    console.error('Error al crear operador:', error.message);
    res.status(400).json({ exito: false, mensaje: error.message || 'Error al crear el operador.' });
  } finally {
    connection.release();
  }
};

// Modificar datos generales de un operador
const modificarOperador = async (req, res) => {
  const { id } = req.params;
  const { 
    nombre_completo, usuario_login, id_rol, roles, id_sucursal, activo
  } = req.body;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const updates = [];
    const params = [];

    if (nombre_completo) { updates.push('nombre_completo = ?'); params.push(nombre_completo); }
    if (usuario_login) { updates.push('usuario_login = ?'); params.push(usuario_login); }
    if (id_sucursal) { updates.push('id_sucursal = ?'); params.push(id_sucursal); }
    if (activo !== undefined) { updates.push('activo = ?'); params.push(activo ? 1 : 0); }

    if (updates.length > 0) {
      params.push(id);
      await connection.query(`UPDATE operadores SET ${updates.join(', ')} WHERE id_operador = ?`, params);
    }

    const rolesAsignar = Array.isArray(roles) && roles.length > 0 ? roles : (id_rol ? [id_rol] : null);
    if (rolesAsignar) {
      await connection.query(`DELETE FROM operador_roles WHERE id_operador = ?`, [id]);
      for (const r of rolesAsignar) {
        let idRolFinal = r;
        if (typeof r === 'string') {
          const [rRow] = await connection.query('SELECT id_rol FROM roles WHERE nombre_rol = ?', [r]);
          if (rRow.length > 0) idRolFinal = rRow[0].id_rol;
        }
        if (idRolFinal) {
          await connection.query(`INSERT INTO operador_roles (id_operador, id_rol) VALUES (?, ?)`, [id, idRolFinal]).catch(() => {});
        }
      }
    }

    await connection.commit();
    res.status(200).json({ exito: true, mensaje: 'Operador actualizado correctamente.' });
  } catch (error) {
    await connection.rollback();
    console.error('Error al modificar operador:', error);
    res.status(500).json({ exito: false, mensaje: 'Error al actualizar el operador.' });
  } finally {
    connection.release();
  }
};

// Cambiar contraseña de un operador
const cambiarPassword = async (req, res) => {
  const { id } = req.params;
  const { nueva_password, password } = req.body;
  const passFinal = nueva_password || password;

  if (!passFinal) {
    return res.status(400).json({ exito: false, mensaje: 'La nueva contraseña es obligatoria.' });
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(passFinal, salt);

    await pool.query(
      `UPDATE operadores SET password_hash = ? WHERE id_operador = ?`,
      [password_hash, id]
    );
    res.status(200).json({ exito: true, mensaje: 'Contraseña actualizada con éxito.' });
  } catch (error) {
    console.error('Error al cambiar contraseña:', error);
    res.status(500).json({ exito: false, mensaje: 'Error al actualizar la contraseña.' });
  }
};

// Cambiar estado de un operador (Activo / Inactivo)
const cambiarEstadoOperador = async (req, res) => {
  const { id } = req.params;
  const { activo } = req.body;

  try {
    const isActivo = (activo === true || activo === 1 || activo === 'true') ? 1 : 0;
    await pool.query(`UPDATE operadores SET activo = ? WHERE id_operador = ?`, [isActivo, id]);
    res.status(200).json({ exito: true, mensaje: `Operador ${isActivo ? 'activado' : 'desactivado'} correctamente.` });
  } catch (error) {
    console.error('Error al cambiar estado operador:', error);
    res.status(500).json({ exito: false, mensaje: 'Error al cambiar estado del operador.' });
  }
};

// Desactivar un operador (Soft Delete)
const desactivarOperador = async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query(`UPDATE operadores SET activo = 0 WHERE id_operador = ?`, [id]);
    res.status(200).json({ exito: true, mensaje: 'Operador desactivado correctamente.' });
  } catch (error) {
    console.error('Error al desactivar operador:', error);
    res.status(500).json({ exito: false, mensaje: 'Error al desactivar el operador.' });
  }
};

module.exports = {
  obtenerCatalogosOperador,
  obtenerOperadores, 
  obtenerOperadorPorId, 
  crearOperador, 
  modificarOperador, 
  cambiarPassword, 
  cambiarEstadoOperador,
  desactivarOperador
};