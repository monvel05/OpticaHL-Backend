const db = require('../config/db'); 

// Alta de Cliente
const crearCliente = async (req, res) => {
    const { nombre_completo, rfc, telefono, email, ocupacion } = req.body;

    if (!telefono || !email || !nombre_completo) {
        return res.status(400).json({ error: "Nombre, teléfono y email son obligatorios." });
    }

    try {
        const query = `INSERT INTO clientes (nombre_completo, rfc, telefono, email, ocupacion) VALUES (?, ?, ?, ?, ?)`;
        const [result] = await db.query(query, [nombre_completo, rfc, telefono, email, ocupacion]);
        
        res.status(201).json({ id_cliente: result.insertId, message: "Cliente registrado exitosamente" });
    } catch (error) {
        console.error("Error al registrar cliente:", error);
        res.status(500).json({ error: "Error interno del servidor", details: error.message });
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

        const [historial] = await db.query(query, [clienteId]);
        res.json(historial);
    } catch (error) {
        console.error("Error al recuperar el historial:", error);
        res.status(500).json({ error: "Error interno del servidor", details: error.message });
    }
};

// Búsqueda rápida para el mostrador
const buscarClientes = async (req, res) => {
    const { q } = req.query; // se debe poner el la url> /q=(valor)
    
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
        const [clientes] = await db.query(query, [searchTerm, searchTerm]);
        
        res.json(clientes);
    } catch (error) {
        console.error("Error en búsqueda:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
};

const guardarNuevaRX = async (req, res) => {
    const clienteId = req.params.id;
    const id_operador = req.user.id; 
    
    // Datos obtenidos del frontend
    const { ojo, esfera, cilindro, eje, adicion, distancia_pupilar, observaciones } = req.body;


    const conexion = await db.getConnection();

    try {
        await conexion.beginTransaction();

        // Generamos un folio para esta orden clínica (Ej: RX-20260415-12)
        const folio_orden = `RX-${Date.now()}-${this.clienteId}`; 

        // Insertamos la Orden (vinculando al paciente y al optometrista/operador)
        const queryOrden = `
            INSERT INTO orden (folio, id_cliente, id_operador, fecha_emision, estatus, total) 
            VALUES (?, ?, ?, NOW(), 'Clinica', 0.00)
        `;
        await conexion.execute(queryOrden, [folio_orden, clienteId, id_operador]);

        // Insertamos la Graduación (RX) vinculada al folio que acabamos de crear
        const queryGraduacion = `
            INSERT INTO graduacion_orden 
            (folio_orden, ojo, esfera, cilindro, eje, adicion, distancia_pupilar, observaciones) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await conexion.execute(queryGraduacion, [
            folio_orden, ojo, esfera, cilindro, eje, adicion, distancia_pupilar, observaciones
        ]);

        // Confirmamos los cambios en la BD
        await conexion.commit();

        res.status(201).json({ 
            success: true, 
            message: "Receta guardada y vinculada al operador correctamente.",
            folio: folio_orden
        });

    } catch (error) {
        // Si algo falla (ej. falta un dato), deshacemos todo para no dejar datos huérfanos
        await conexion.rollback();
        console.error("Error al guardar RX:", error);
        res.status(500).json({ error: "Error al guardar el historial clínico." });
    } finally {
        conexion.release(); //IMPORTANTE: SIEMPRE LIBERAR LA CONEXION
    }
};

module.exports = { crearCliente, obtenerHistorial, buscarClientes, guardarNuevaRX };