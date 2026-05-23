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
        const query = `
            SELECT 
                o.folio, o.fecha_emision,
                g.ojo, g.esfera, g.cilindro, g.eje, g.adicion, g.observaciones
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

// Guardar nueva receta (Manejo de Transacción con Pool)
const guardarNuevaRX = async (req, res) => {
    const clienteId = req.params.id;
    const id_operador = req.user.id; 
    
    const { ojo, esfera, cilindro, eje, adicion, distancia_pupilar, observaciones } = req.body;

    // Tomamos una conexión exclusiva del pool para la transacción
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const folio_orden = `RX-${Date.now()}-${clienteId}`; 

        const queryOrden = `
            INSERT INTO orden (folio, id_cliente, id_operador, fecha_emision, estatus, total) 
            VALUES (?, ?, ?, NOW(), 'Clinica', 0.00)
        `;
        await connection.query(queryOrden, [folio_orden, clienteId, id_operador]);

        const queryGraduacion = `
            INSERT INTO graduacion_orden 
            (folio_orden, ojo, esfera, cilindro, eje, adicion, distancia_pupilar, observaciones) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await connection.query(queryGraduacion, [
            folio_orden, ojo, esfera, cilindro, eje, adicion, distancia_pupilar, observaciones
        ]);

        await connection.commit();

        res.status(201).json({ 
            success: true, 
            message: "Receta guardada y vinculada al operador correctamente.",
            folio: folio_orden
        });

    } catch (error) {
        await connection.rollback();
        console.error("Error al guardar RX:", error);
        res.status(500).json({ error: "Error al guardar el historial clínico." });
    } finally {
        // Liberamos la conexión de vuelta al pool
        connection.release(); 
    }
};

module.exports = { crearCliente, obtenerHistorial, buscarClientes, guardarNuevaRX };