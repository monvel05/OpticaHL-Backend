const pool = require('../config/db');

// Alta de Cliente
const crearCliente = async (req, res) => {
    const { 
        nombre_completo, rfc, telefono, celular, email, 
        domicilio, colonia, cp, localidad, estado, 
        creado_por
    } = req.body;

    if (!nombre_completo || !nombre_completo.trim()) {
        return res.status(400).json({ error: "El nombre completo del cliente es obligatorio." });
    }

    try {
        const query = `INSERT INTO clientes 
            (nombre_completo, rfc, telefono, celular, email, domicilio, colonia, cp, localidad, estado, creado_por) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        
        const [result] = await pool.query(query, [
            nombre_completo.trim(), rfc || null, telefono || null, celular || null, email || null, 
            domicilio || null, colonia || null, cp || null, localidad || null, estado || null, creado_por || 1
        ]);
        
        res.status(201).json({ id_cliente: result.insertId, message: "Cliente registrado exitosamente" });
    } catch (error) {
        console.error("Error al registrar cliente:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
};

// 🎯 HISTORIAL COMPLETO: Clínico (Graduaciones) + Materiales (Compras Reales)
const obtenerHistorial = async (req, res) => {
    const clienteId = req.params.id;

    try {
        // 1. Consulta de Graduaciones / Historial Clínico
        const queryClinico = `
            SELECT 
                o.folio_orden AS folio, 
                o.fecha_emision,
                g.od_esfera, g.od_cilindro, g.od_eje, g.od_adicion,
                g.oi_esfera, g.oi_cilindro, g.oi_eje, g.oi_adicion,
                g.distancia_pupilar, g.observaciones
            FROM orden o
            JOIN graduacion_orden g ON o.folio_orden = g.folio_orden
            WHERE o.id_cliente = ?
            ORDER BY o.fecha_emision DESC`;

        // 2. Consulta de Compras Reales / Materiales
        const queryMateriales = `
            SELECT 
                o.folio_orden,
                o.fecha_emision AS fecha,
                GROUP_CONCAT(DISTINCT a.nombre SEPARATOR ', ') AS productos,
                COALESCE(MAX(CASE WHEN a.categoria = 'ARMAZON' THEN CONCAT(COALESCE(ad.marca, ''), ' ', COALESCE(ad.estilo, '')) END), MAX(a.nombre), 'Sin Armazón') AS armazon,
                COALESCE(MAX(CASE WHEN a.categoria = 'MICA' THEN a.nombre END), 'N/A') AS tipo_lente,
                COALESCE(MAX(CASE WHEN a.categoria = 'MICA' THEN ad.material END), 'N/A') AS material,
                COALESCE(MAX(CASE WHEN a.categoria = 'MICA' THEN ad.estilo END), 'Sin tratamiento') AS tratamiento,
                o.total
            FROM orden o
            LEFT JOIN detalle_venta dv ON o.folio_orden = dv.folio_orden
            LEFT JOIN articulos a ON dv.id_articulo = a.id_articulo
            LEFT JOIN articulo_detalle ad ON a.id_articulo = ad.id_articulo
            WHERE o.id_cliente = ? AND o.folio_orden LIKE 'ORD-%'
            GROUP BY o.folio_orden, o.fecha_emision, o.total
            ORDER BY o.fecha_emision DESC`;

        const [clinico] = await pool.query(queryClinico, [clienteId]);
        const [materiales] = await pool.query(queryMateriales, [clienteId]);

        res.json({
            success: true,
            data: {
                clinico,
                materiales
            }
        });

    } catch (error) {
        console.error("Error al recuperar el historial completo:", error);
        res.status(500).json({ error: "Error interno del servidor", details: error.message });
    }
};

// Obtener clientes con paginacion
const obtenerClientes = async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    try {
        const query = `
            SELECT id_cliente, nombre_completo, telefono, celular, email, rfc, domicilio, colonia, cp, localidad, estado
            FROM clientes 
            ORDER BY id_cliente DESC 
            LIMIT ? OFFSET ?`;
            
        const [clientes] = await pool.query(query, [limit, offset]);
        res.json({ success: true, data: clientes });
    } catch (error) {
        console.error("Error al obtener clientes:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
};

// Buscar clientes con paginacion
const buscarClientes = async (req, res) => {
    const { q } = req.query; 
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    
    if (!q) {
        return res.status(400).json({ error: "Debes proporcionar un término de búsqueda." });
    }

    try {
        const query = `
            SELECT id_cliente, nombre_completo, telefono, celular, email, rfc, domicilio, colonia, cp, localidad, estado
            FROM clientes 
            WHERE nombre_completo LIKE ? OR telefono LIKE ? OR celular LIKE ? OR rfc LIKE ?
            ORDER BY nombre_completo ASC
            LIMIT ? OFFSET ?`;
            
        const searchTerm = `%${q}%`;
        const [clientes] = await pool.query(query, [searchTerm, searchTerm, searchTerm, searchTerm, limit, offset]);
        
        res.json({ success: true, data: clientes });
    } catch (error) {
        console.error("Error en búsqueda:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
};

// Guardar nueva receta (Manejo de Transacción)
const guardarNuevaRX = async (req, res) => {
    const clienteId = req.params.id;
    const id_operador = req.user?.id || req.usuario?.id || 1;
    
    const { 
        od_esfera, od_cilindro, od_eje, od_adicion, 
        oi_esfera, oi_cilindro, oi_eje, oi_adicion, 
        distancia_pupilar, observaciones,
        id_sucursal
    } = req.body;

    const sucursalActiva = id_sucursal || 'HL01';

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const tiempoCorto = String(Date.now()).slice(-5);
        const folio_orden = `RX-${clienteId}-${tiempoCorto}`; 

        const queryOrden = `
            INSERT INTO orden (folio_orden, id_sucursal, fecha_emision, id_cliente, id_operador, total, estatus) 
            VALUES (?, ?, NOW(), ?, ?, 0.00, 'PENDIENTE')
        `;
        await connection.query(queryOrden, [folio_orden, sucursalActiva, clienteId, id_operador]);

        const queryGraduacion = `
            INSERT INTO graduacion_orden 
            (folio_orden, od_esfera, od_cilindro, od_eje, od_adicion, oi_esfera, oi_cilindro, oi_eje, oi_adicion, distancia_pupilar, observaciones) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        await connection.query(queryGraduacion, [
            folio_orden, 
            od_esfera, od_cilindro, od_eje, od_adicion, 
            oi_esfera, oi_cilindro, oi_eje, oi_adicion, 
            distancia_pupilar, observaciones
        ]);

        await connection.commit();

        res.status(201).json({ 
            success: true, 
            message: "Receta estructurada guardada con éxito en la base de datos.",
            folio: folio_orden
        });

    } catch (error) {
        await connection.rollback();
        console.error("Error al guardar RX con nueva estructura:", error);
        res.status(500).json({ error: "Error interno al guardar el historial clínico estructurado.", details: error.message });
    } finally {
        connection.release(); 
    }
};

// Actualizar una receta existente
const actualizarRX = async (req, res) => {
    const { folio } = req.params; 
    const { 
        od_esfera, od_cilindro, od_eje, od_adicion, 
        oi_esfera, oi_cilindro, oi_eje, oi_adicion, 
        distancia_pupilar, observaciones 
    } = req.body;

    try {
        const query = `
            UPDATE graduacion_orden 
            SET od_esfera = ?, od_cilindro = ?, od_eje = ?, od_adicion = ?, 
                oi_esfera = ?, oi_cilindro = ?, oi_eje = ?, oi_adicion = ?, 
                distancia_pupilar = ?, observaciones = ?
            WHERE folio_orden = ?
        `;
        
        await pool.query(query, [
            od_esfera, od_cilindro, od_eje, od_adicion, 
            oi_esfera, oi_cilindro, oi_eje, oi_adicion, 
            distancia_pupilar, observaciones, folio
        ]);

        res.json({ success: true, message: "Historial clínico actualizado correctamente." });
    } catch (error) {
        console.error("Error al actualizar RX:", error);
        res.status(500).json({ error: "Error interno al actualizar los datos." });
    }
};

// Obtener la última receta de un cliente específico
const obtenerUltimaRX = async (req, res) => {
    const clienteId = req.params.id;

    try {
        const query = `
            SELECT 
                g.od_esfera, g.od_cilindro, g.od_eje, g.od_adicion,
                g.oi_esfera, g.oi_cilindro, g.oi_eje, g.oi_adicion,
                g.distancia_pupilar, g.observaciones
            FROM orden o
            JOIN graduacion_orden g ON o.folio_orden = g.folio_orden
            WHERE o.id_cliente = ?
            ORDER BY o.fecha_emision DESC
            LIMIT 1`;

        const [resultado] = await pool.query(query, [clienteId]);
        
        if (resultado.length === 0) {
            return res.status(404).json({ success: false, message: "Este paciente no tiene recetas previas." });
        }

        res.json({ success: true, data: resultado[0] });
    } catch (error) {
        console.error("Error al obtener la última RX:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
};

// Actualizar datos personales de un cliente
const actualizarCliente = async (req, res) => {
    const { id } = req.params;
    const { nombre_completo, telefono, celular, email, rfc, domicilio, colonia, cp, localidad, estado } = req.body;

    try {
        const query = `
            UPDATE clientes 
            SET nombre_completo = ?, telefono = ?, celular = ?, email = ?, rfc = ?, domicilio = ?, colonia = ?, cp = ?, localidad = ?, estado = ?
            WHERE id_cliente = ?
        `;

        const [result] = await pool.query(query, [
            nombre_completo, telefono || null, celular || null, email || null, rfc || null, domicilio || null, colonia || null, cp || null, localidad || null, estado || null, id
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Cliente no encontrado.' });
        }

        return res.json({ 
            success: true, 
            message: 'Cliente actualizado correctamente en MySQL' 
        });

    } catch (error) {
        console.error('Error MySQL al actualizar cliente:', error);
        return res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
};

// Eliminar un cliente por ID
const eliminarCliente = async (req, res) => {
    const { id } = req.params;

    try {
        const [result] = await pool.query('DELETE FROM clientes WHERE id_cliente = ?', [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Cliente no encontrado.' });
        }

        return res.json({ 
            success: true, 
            message: 'Cliente eliminado correctamente' 
        });

    } catch (error) {
        console.error('Error MySQL al eliminar cliente:', error);
        if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.errno === 1451) {
            return res.status(400).json({ 
                success: false, 
                message: 'No se puede eliminar el cliente porque tiene órdenes, recetas o facturas asociadas en el sistema.' 
            });
        }
        return res.status(500).json({ success: false, message: 'Error interno al eliminar cliente.' });
    }
};

module.exports = { 
    crearCliente, 
    obtenerHistorial, 
    obtenerClientes, 
    buscarClientes, 
    guardarNuevaRX, 
    actualizarRX, 
    obtenerUltimaRX,
    actualizarCliente,
    eliminarCliente
};