const pool = require('../config/db');

const obtenerProveedores = async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM proveedores WHERE activo = 1');
        res.status(200).json({ success: true, data: rows });
    } catch (error) {
        console.error('Error al obtener proveedores:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor', detalle: error.message });
    }
};

const crearProveedor = async (req, res) => {
    const { rfc, nombre, domicilio, telefono, email, creado_por } = req.body;

    try {
        const query = `
            INSERT INTO proveedores (rfc, nombre, domicilio, telefono, email, creado_por) 
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        const [result] = await pool.query(query, [
            rfc || null, 
            nombre, 
            domicilio || null, 
            telefono || null, 
            email || null, 
            creado_por || req.user?.id_operador || req.user?.id || 1
        ]);
        
        res.status(201).json({ 
            success: true, 
            message: 'Proveedor creado con éxito',
            id_proveedor: result.insertId 
        });
    } catch (error) {
        console.error('Error al crear proveedor:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor', detalle: error.message });
    }
};

const desactivarProveedor = async (req, res) => {
    const { idProveedor } = req.params;
    const { modificado_por } = req.body; 

    try {
        const query = 'UPDATE proveedores SET activo = 0, modificado_por = ? WHERE id_proveedor = ?';
        const [result] = await pool.query(query, [modificado_por || req.user?.id_operador || 1, idProveedor]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Proveedor no encontrado' });
        }

        res.status(200).json({ success: true, message: 'Proveedor desactivado correctamente' });
    } catch (error) {
        console.error('Error al desactivar proveedor:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor', detalle: error.message });
    }
};

module.exports = { obtenerProveedores, crearProveedor, desactivarProveedor };