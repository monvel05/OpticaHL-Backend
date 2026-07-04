const pool = require('../config/db'); // Cambiado a pool

// Alta de Cliente
const crearCliente = async (req, res) => {
    const { 
        nombre_completo, rfc, telefono, email, 
        domicilio, colonia, cp, localidad, estado, 
        creado_por
    } = req.body;

    if (!nombre_completo || !telefono || !email) {
        return res.status(400).json({ error: "Nombre, teléfono y email son obligatorios." });
    }

    try {
        // 🎯 CORREGIDO: Se quitó la duplicación de columnas que tenías aquí
        const query = `INSERT INTO CLIENTES 
            (nombre_completo, rfc, telefono, email, domicilio, colonia, cp, localidad, estado, creado_por) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        
        const [result] = await pool.query(query, [
            nombre_completo, rfc, telefono, email, 
            domicilio, colonia, cp, localidad, estado, creado_por
        ]);
        
        res.status(201).json({ id_cliente: result.insertId, message: "Cliente registrado exitosamente" });
    } catch (error) {
        console.error("Error al registrar cliente:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
};

// Obtener Historial Clínico
const obtenerHistorial = async (req, res) => {
    const clienteId = req.params.id;

    try {
        // 🎯 ACTUALIZADO: Ahora recupera todos los campos separados de la nueva estructura
        const query = `
            SELECT 
                o.folio, o.fecha_emision,
                g.od_esfera, g.od_cilindro, g.od_eje, g.od_adicion,
                g.oi_esfera, g.oi_cilindro, g.oi_eje, g.oi_adicion,
                g.distancia_pupilar, g.observaciones
            FROM orden o
            JOIN graduacion_orden g ON o.folio = g.folio_orden
            WHERE o.id_cliente = ?
            ORDER BY o.fecha_emision DESC`;

        const [historial] = await pool.query(query, [clienteId]);
        res.json(historial);
    } catch (error) {
        console.error("Error al recuperar el historial:", error);
        res.status(500).json({ error: "Error interno del servidor", details: error.message });
    }
};

// Búsqueda rápida para el mostrador
const buscarClientes = async (req, res) => {
    const { q } = req.query; 
    
    if (!q) {
        return res.status(400).json({ error: "Debes proporcionar un término de búsqueda." });
    }

    try {
        const query = `
            SELECT id_cliente, nombre_completo, telefono, email 
            FROM clientes 
            WHERE nombre_completo LIKE ? OR telefono LIKE ?
            LIMIT 20`;
        const searchTerm = `%${q}%`;
        const [clientes] = await pool.query(query, [searchTerm, searchTerm]);
        
        res.json(clientes);
    } catch (error) {
        console.error("Error en búsqueda:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
};

// Guardar nueva receta (Manejo de Transacción con la Nueva Estructura)
const guardarNuevaRX = async (req, res) => {
    const clienteId = req.params.id;
    const id_operador = req.user.id; 
    
    // 🎯 ACTUALIZADO: Desestructuramos los campos separados que enviará el frontend
    const { 
        od_esfera, od_cilindro, od_eje, od_adicion, 
        oi_esfera, oi_cilindro, oi_eje, oi_adicion, 
        distancia_pupilar, observaciones 
    } = req.body;

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // Conservamos tu generador de folio corto
        const tiempoCorto = String(Date.now()).slice(-5);
        const folio_orden = `RX-${clienteId}-${tiempoCorto}`; 

        // 1. Insertamos en la tabla orden
        const queryOrden = `
            INSERT INTO orden (folio, id_cliente, id_operador, fecha_emision, estatus, total) 
            VALUES (?, ?, ?, NOW(), 'Clinica', 0.00)
        `;
        await connection.query(queryOrden, [folio_orden, clienteId, id_operador]);

        // 2. 🎯 NUEVA CONSULTA: Inserta de golpe las columnas divididas en la base de datos
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
        res.status(500).json({ error: "Error interno al guardar el historial clínico estructurado." });
    } finally {
        connection.release(); 
    }
};
// Actualizar una receta existente (Editar campos)
const actualizarRX = async (req, res) => {
    const { folio } = req.params; // Pasamos el folio de la orden en la URL
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

// Recuerda agregar 'actualizarRX' al module.exports que tienes abajo

module.exports = { crearCliente, obtenerHistorial, buscarClientes, guardarNuevaRX,actualizarRX };