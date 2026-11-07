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
        id_sucursal_origen VARCHAR(10) NOT NULL,
        id_sucursal_destino VARCHAR(10) NOT NULL,
        cantidad INT NOT NULL DEFAULT 1,
        id_operador_solicita INT NULL,
        id_operador_autoriza INT NULL,
        estatus ENUM('PENDIENTE', 'ACEPTADA', 'RECHAZADA', 'RECIBIDA') DEFAULT 'PENDIENTE',
        motivo TEXT NULL,
        fecha_solicitud TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        fecha_autorizacion DATETIME NULL,
        fecha_recepcion DATETIME NULL,
        CONSTRAINT fk_traslado_art FOREIGN KEY (id_articulo) REFERENCES articulos(id_articulo),
        CONSTRAINT fk_traslado_suc_orig FOREIGN KEY (id_sucursal_origen) REFERENCES sucursales(id_sucursal),
        CONSTRAINT fk_traslado_suc_dest FOREIGN KEY (id_sucursal_destino) REFERENCES sucursales(id_sucursal)
      ) ENGINE=InnoDB;
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

    console.log('🎉 Migración completada.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error en migración:', error);
    process.exit(1);
  }
}

migrate();
