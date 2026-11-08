const pool = require('./db');

async function migrate() {
  try {
    // 1. Agregar columna telefono a sucursales si no existe
    const [cols] = await pool.query("SHOW COLUMNS FROM sucursales LIKE 'telefono'");
    if (cols.length === 0) {
      await pool.query("ALTER TABLE sucursales ADD COLUMN telefono VARCHAR(20) AFTER direccion");
      console.log('✅ Columna telefono agregada a sucursales');
    } else {
      console.log('ℹ️ Columna telefono ya existía en sucursales');
    }

    // 2. Crear tabla solicitudes_traslado
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS solicitudes_traslado (
        id_solicitud INT AUTO_INCREMENT PRIMARY KEY,
        folio VARCHAR(50) UNIQUE NOT NULL,
        id_articulo INT NOT NULL,
        id_sucursal_origen VARCHAR(50) NOT NULL,
        id_sucursal_destino VARCHAR(50) NOT NULL,
        cantidad INT NOT NULL DEFAULT 1,
        id_operador_solicita INT NULL,
        id_operador_autoriza INT NULL,
        estatus ENUM('PENDIENTE', 'ACEPTADA', 'RECHAZADA', 'RECIBIDA') DEFAULT 'PENDIENTE',
        motivo TEXT NULL,
        fecha_solicitud TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        fecha_autorizacion DATETIME NULL,
        fecha_recepcion DATETIME NULL,
        CONSTRAINT fk_traslado_art FOREIGN KEY (id_articulo) REFERENCES articulos(id_articulo),
        INDEX idx_traslado_orig (id_sucursal_origen),
        INDEX idx_traslado_dest (id_sucursal_destino)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;
    await pool.query(createTableSQL);
    console.log('✅ Tabla solicitudes_traslado verificada/creada');

    // 3. Si las sucursales no tienen telefono, asignar un default
    await pool.query("UPDATE sucursales SET telefono = '4951234567' WHERE telefono IS NULL OR telefono = ''");

    // 4. Asegurar existencia de proveedor por defecto (id_proveedor = 1) para claves foráneas
    await pool.query(`
      INSERT INTO proveedores (id_proveedor, nombre, activo) 
      VALUES (1, 'Proveedor General', 1) 
      ON DUPLICATE KEY UPDATE activo = 1
    `).catch((err) => console.warn('Advertencia al insertar proveedor default:', err.message));
    console.log('✅ Proveedor default (id 1) verificado/asegurado');

    // 5. Agregar columnas adicionales a proveedores si no existen
    const [provCols] = await pool.query('SHOW COLUMNS FROM proveedores');
    const provColNames = new Set(provCols.map(c => c.Field));
    const columnasProveedores = [
      { name: 'tipo_cliente', def: 'VARCHAR(50) NULL DEFAULT "Negocio"' },
      { name: 'razon_social', def: 'VARCHAR(150) NULL' },
      { name: 'colonia', def: 'VARCHAR(100) NULL' },
      { name: 'localidad', def: 'VARCHAR(100) NULL' },
      { name: 'estado', def: 'VARCHAR(100) NULL' },
      { name: 'cp', def: 'VARCHAR(10) NULL' },
      { name: 'tel_negocio', def: 'VARCHAR(30) NULL' },
      { name: 'celular', def: 'VARCHAR(30) NULL' },
      { name: 'observaciones', def: 'TEXT NULL' }
    ];

    for (const col of columnasProveedores) {
      if (!provColNames.has(col.name)) {
        await pool.query(`ALTER TABLE proveedores ADD COLUMN ${col.name} ${col.def}`).catch(() => {});
        console.log(`✅ Columna ${col.name} agregada a proveedores`);
      }
    }

    // 6. Crear tabla marcas si no existe y poblar iniciales con utf8mb4_unicode_ci
    await pool.query(`
      CREATE TABLE IF NOT EXISTS marcas (
        id_marca INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
        id_proveedor INT NULL,
        descripcion VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
        activo TINYINT(1) DEFAULT 1,
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_marca_nombre (nombre),
        INDEX idx_marca_prov (id_proveedor)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await pool.query(`
      ALTER TABLE marcas CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `).catch(() => {});

    await pool.query(`
      INSERT IGNORE INTO marcas (nombre, id_proveedor, descripcion, activo) VALUES
      ('Ray-Ban', 1, 'Armazones oftálmicos y sol', 1),
      ('Oakley', 1, 'Armazones deportivos y sol', 1),
      ('Vogue', 1, 'Armazones de moda', 1),
      ('Prada', 1, 'Armazones premium', 1),
      ('Carrera', 1, 'Armazones clásicos', 1),
      ('Genérica / Económica', 1, 'Armazones accesibles', 1)
    `).catch(() => {});

    await pool.query(`
      INSERT IGNORE INTO marcas (nombre, id_proveedor, activo)
      SELECT DISTINCT TRIM(marca) COLLATE utf8mb4_unicode_ci, 1, 1 
      FROM articulo_detalle 
      WHERE marca IS NOT NULL AND TRIM(marca) != '' AND TRIM(marca) != 'Sin Marca' AND TRIM(marca) != 'Sin marca'
    `).catch(() => {});
    console.log('✅ Tabla marcas verificada/creada y poblada');

    console.log('🎉 Migración completada.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error en migración:', error);
    process.exit(1);
  }
}

migrate();
