const pool = require('../config/db');
const bcrypt = require('bcrypt');

/**
 * @module OperadorController
 * @description Controlador para la gestión de operadores (usuarios del sistema) y sus roles.
 */

// Obtener todos los operadores activos con sus roles
const obtenerOperadores = async (req, res) => {
  try {
    // 🏛️ Corregido: Se cambió "operador_rol" por "OPERADOR_ROLES"
    const query = `
      SELECT o.id_operador, o.cveope_historicos, o.nombre_completo, o.usuario_login, o.descripcion, o.activo, r.nombre_rol, r.id_rol
      FROM operadores o
      LEFT JOIN OPERADOR_ROLES op_r ON o.id_operador = op_r.id_operador
      LEFT JOIN roles r ON op_r.id_rol = r.id_rol
      WHERE o.activo = 1
    `;
    const [operadores] = await pool.query(query);
    res.status(200).json({ exito: true, datos: operadores });
  } catch (error) {
    console.error('Error al obtener operadores:', error);
    res.status(500).json({ exito: false, mensaje: 'Error al obtener la lista de operadores.' });
  }
};

// Obtener un operador por ID
const obtenerOperadorPorId = async (req, res) => {
  const { id } = req.params;
  try {
    // 🏛️ Corregido: Se cambió "operador_rol" por "OPERADOR_ROLES"
    const query = `
      SELECT o.id_operador, o.nombre_completo, o.usuario_login, o.descripcion, o.activo, r.id_rol, r.nombre_rol
      FROM operadores o
      LEFT JOIN OPERADOR_ROLES op_r ON o.id_operador = op_r.id_operador
      LEFT JOIN roles r ON op_r.id_rol = r.id_rol
      WHERE o.id_operador = ?
    `;
    const [operador] = await pool.query(query, [id]);
    
    if (operador.length === 0) {
      return res.status(404).json({ exito: false, mensaje: 'Operador no encontrado.' });
    }
    res.status(200).json({ exito: true, datos: operador[0] });
  } catch (error) {
    console.error('Error al obtener operador:', error);
    res.status(500).json({ exito: false, mensaje: 'Error al obtener el operador.' });
  }
};

// Crear un nuevo operador (Transacción ACID para Operador + Rol)
const crearOperador = async (req, res) => {
  const { nombre_completo, usuario_login, password, id_rol } = req.body;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Validar que el usuario no exista
    const [existe] = await connection.query('SELECT id_operador FROM operadores WHERE usuario_login = ?', [usuario_login]);
    if (existe.length > 0) throw new Error('El nombre de usuario ya está en uso.');

    // 2. Hashear la contraseña
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // 3. Insertar el operador
    const [result] = await connection.query(
      `INSERT INTO operadores (nombre_completo, usuario_login, password_hash, activo) 
       VALUES (?, ?, ?, 1)`,
      [nombre_completo, usuario_login, password_hash]
    );
    const id_operador = result.insertId;

    // 4. Asignar el rol en la tabla intermedia
    if (id_rol) {
      // 🏛️ Corregido: Se cambió "operador_rol" por "OPERADOR_ROLES"
      await connection.query(
        `INSERT INTO OPERADOR_ROLES (id_operador, id_rol) VALUES (?, ?)`,
        [id_operador, id_rol]
      );
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

// Modificar datos generales de un operador (sin contraseña)
const modificarOperador = async (req, res) => {
  const { id } = req.params;
  const { nombre_completo, usuario_login, id_rol } = req.body;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Actualizar datos del operador
    await connection.query(
      `UPDATE operadores SET nombre_completo = ?, usuario_login = ? WHERE id_operador = ?`,
      [nombre_completo, usuario_login, id]
    );

    // Actualizar rol (Se elimina el anterior y se inserta el nuevo)
    if (id_rol) {
      // 🏛️ Corregido: Se cambió "operador_rol" por "OPERADOR_ROLES" en DELETE e INSERT
      await connection.query(`DELETE FROM OPERADOR_ROLES WHERE id_operador = ?`, [id]);
      await connection.query(`INSERT INTO OPERADOR_ROLES (id_operador, id_rol) VALUES (?, ?)`, [id, id_rol]);
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
  const { nueva_password } = req.body;

  try {
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(nueva_password, salt);

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

// Desactivar un operador (Soft Delete)
const desactivarOperador = async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query(`UPDATE operadores SET activo = 0 WHERE id_operador = ?`, [id]);
    res.status(200).json({ exito: true, mensaje: 'Operador desactivado (Soft Delete) correctamente.' });
  } catch (error) {
    console.error('Error al desactivar operador:', error);
    res.status(500).json({ exito: false, mensaje: 'Error al desactivar el operador.' });
  }
};

module.exports = {
  obtenerOperadores, 
  obtenerOperadorPorId, 
  crearOperador, 
  modificarOperador, 
  cambiarPassword, 
  desactivarOperador
};