const pool = require('../config/db');

/**
 * Asegura que la tabla marcas exista y tenga marcas iniciales
 */
const asegurarTablaMarcas = async () => {
  const ddl = `
    CREATE TABLE IF NOT EXISTS marcas (
      id_marca INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      id_proveedor INT NULL,
      descripcion VARCHAR(255) NULL,
      activo TINYINT(1) DEFAULT 1,
      fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_marca_nombre (nombre),
      INDEX idx_marca_prov (id_proveedor)
    ) ENGINE=InnoDB;
  `;
  await pool.query(ddl).catch(err => console.warn('Aviso crear tabla marcas:', err.message));

  // Migrar marcas existentes de articulo_detalle si las hay
  await pool.query(`
    INSERT IGNORE INTO marcas (nombre, id_proveedor, activo)
    SELECT DISTINCT TRIM(marca), 1, 1 
    FROM articulo_detalle 
    WHERE marca IS NOT NULL AND TRIM(marca) != '' AND TRIM(marca) != 'Sin Marca' AND TRIM(marca) != 'Sin marca'
  `).catch(() => {});

  // Marcas por defecto mínimas
  await pool.query(`
    INSERT IGNORE INTO marcas (nombre, id_proveedor, descripcion, activo) VALUES
    ('Ray-Ban', 1, 'Armazones oftálmicos y sol', 1),
    ('Oakley', 1, 'Armazones deportivos y sol', 1),
    ('Vogue', 1, 'Armazones de moda', 1),
    ('Prada', 1, 'Armazones premium', 1),
    ('Carrera', 1, 'Armazones clásicos', 1),
    ('Genérica / Económica', 1, 'Armazones accesibles', 1)
  `).catch(() => {});
};

// ==========================================
// 1. Obtener todas las marcas
// ==========================================
const obtenerMarcas = async (req, res) => {
  const { activo, id_proveedor, busqueda } = req.query;

  try {
    await asegurarTablaMarcas();

    let sql = `
      SELECT 
        m.id_marca,
        m.nombre,
        m.id_proveedor,
        COALESCE(p.nombre, p.razon_social, '') AS proveedor_nombre,
        m.descripcion,
        m.activo,
        m.fecha_creacion,
        (SELECT COUNT(*) FROM articulo_detalle ad WHERE ad.marca = m.nombre) AS total_articulos
      FROM marcas m
      LEFT JOIN proveedores p ON m.id_proveedor = p.id_proveedor
      WHERE 1=1
    `;
    const params = [];

    if (activo !== undefined && activo !== null && activo !== 'all') {
      if (activo === 'true' || activo === '1' || activo === 1) {
        sql += ' AND m.activo = 1';
      } else if (activo === 'false' || activo === '0' || activo === 0) {
        sql += ' AND m.activo = 0';
      }
    }

    if (id_proveedor && id_proveedor !== '0' && id_proveedor !== 'all') {
      sql += ' AND m.id_proveedor = ?';
      params.push(Number(id_proveedor));
    }

    if (busqueda && busqueda.trim() !== '') {
      sql += ' AND (m.nombre LIKE ? OR m.descripcion LIKE ? OR p.nombre LIKE ? OR p.razon_social LIKE ?)';
      const term = `%${busqueda.trim()}%`;
      params.push(term, term, term, term);
    }

    sql += ' ORDER BY m.nombre ASC';

    const [rows] = await pool.query(sql, params);
    return res.status(200).json({ success: true, datos: rows });
  } catch (error) {
    console.error('Error al obtener marcas:', error);
    return res.status(500).json({ success: false, message: 'Error interno al consultar marcas.', detalle: error.message });
  }
};

// ==========================================
// 2. Crear nueva marca
// ==========================================
const crearMarca = async (req, res) => {
  const { nombre, id_proveedor, descripcion } = req.body;

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ success: false, message: 'El nombre de la marca es obligatorio.' });
  }

  const nombreLimpio = nombre.trim();
  const idProv = id_proveedor ? Number(id_proveedor) : null;
  const desc = descripcion ? descripcion.trim() : null;

  try {
    await asegurarTablaMarcas();

    // Verificar si ya existe por nombre
    const [existentes] = await pool.query(
      'SELECT id_marca, nombre, id_proveedor, activo FROM marcas WHERE LOWER(nombre) = LOWER(?)',
      [nombreLimpio]
    );

    if (existentes.length > 0) {
      const encontrada = existentes[0];
      if (encontrada.activo === 0) {
        // Reactivar
        await pool.query(
          'UPDATE marcas SET activo = 1, id_proveedor = COALESCE(?, id_proveedor), descripcion = COALESCE(?, descripcion) WHERE id_marca = ?',
          [idProv, desc, encontrada.id_marca]
        );
        return res.status(200).json({
          success: true,
          message: 'Marca reactivada con éxito.',
          datos: { id_marca: encontrada.id_marca, nombre: encontrada.nombre, id_proveedor: idProv || encontrada.id_proveedor }
        });
      }
      return res.status(200).json({
        success: true,
        message: 'La marca ya existe.',
        datos: encontrada
      });
    }

    const [result] = await pool.query(
      'INSERT INTO marcas (nombre, id_proveedor, descripcion, activo) VALUES (?, ?, ?, 1)',
      [nombreLimpio, idProv, desc]
    );

    return res.status(201).json({
      success: true,
      message: 'Marca creada exitosamente.',
      datos: {
        id_marca: result.insertId,
        nombre: nombreLimpio,
        id_proveedor: idProv,
        descripcion: desc,
        activo: 1
      }
    });
  } catch (error) {
    console.error('Error al crear marca:', error);
    return res.status(500).json({ success: false, message: 'Error interno al registrar marca.', detalle: error.message });
  }
};

// ==========================================
// 3. Actualizar marca
// ==========================================
const actualizarMarca = async (req, res) => {
  const { id } = req.params;
  const { nombre, id_proveedor, descripcion, activo } = req.body;

  if (!id) {
    return res.status(400).json({ success: false, message: 'ID de marca no proporcionado.' });
  }

  try {
    const campos = [];
    const params = [];

    if (nombre !== undefined && nombre.trim() !== '') {
      campos.push('nombre = ?');
      params.push(nombre.trim());
    }

    if (id_proveedor !== undefined) {
      campos.push('id_proveedor = ?');
      params.push(id_proveedor ? Number(id_proveedor) : null);
    }

    if (descripcion !== undefined) {
      campos.push('descripcion = ?');
      params.push(descripcion ? descripcion.trim() : null);
    }

    if (activo !== undefined) {
      campos.push('activo = ?');
      params.push(activo ? 1 : 0);
    }

    if (campos.length === 0) {
      return res.status(400).json({ success: false, message: 'No se enviaron datos para actualizar.' });
    }

    params.push(Number(id));
    await pool.query(`UPDATE marcas SET ${campos.join(', ')} WHERE id_marca = ?`, params);

    return res.status(200).json({ success: true, message: 'Marca actualizada exitosamente.' });
  } catch (error) {
    console.error('Error al actualizar marca:', error);
    return res.status(500).json({ success: false, message: 'Error al actualizar marca.', detalle: error.message });
  }
};

// ==========================================
// 4. Desactivar / Eliminar marca
// ==========================================
const eliminarMarca = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ success: false, message: 'ID de marca no proporcionado.' });
  }

  try {
    await pool.query('UPDATE marcas SET activo = 0 WHERE id_marca = ?', [Number(id)]);
    return res.status(200).json({ success: true, message: 'Marca desactivada exitosamente.' });
  } catch (error) {
    console.error('Error al desactivar marca:', error);
    return res.status(500).json({ success: false, message: 'Error al desactivar marca.', detalle: error.message });
  }
};

module.exports = {
  asegurarTablaMarcas,
  obtenerMarcas,
  crearMarca,
  actualizarMarca,
  eliminarMarca
};
