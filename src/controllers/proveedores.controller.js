// src/controllers/proveedores.controller.js
const db = require('../config/db'); 

const obtenerProveedores = async (req, res) => {
    try {
        // Traemos solo los proveedores activos
        const [rows] = await db.query('SELECT * FROM PROVEEDORES WHERE activo = 1');
        res.status(200).json({ success: true, data: rows });
    } catch (error) {
        console.error('Error al obtener proveedores:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

const crearProveedor = async (req, res) => {
    const { rfc, nombre, domicilio, telefono, email, creado_por } = req.body;

    try {
        const query = `
            INSERT INTO PROVEEDORES (rfc, nombre, domicilio, telefono, email, creado_por) 
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        const [result] = await db.execute(query, [rfc, nombre, domicilio, telefono, email, creado_por]);
        
        res.status(201).json({ 
            success: true, 
            message: 'Proveedor creado con éxito',
            id_proveedor: result.insertId 
        });
    } catch (error) {
        console.error('Error al crear proveedor:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

const desactivarProveedor = async (req, res) => {
    const { idProveedor } = req.params;
    const { modificado_por } = req.body; 

    try {
        const query = 'UPDATE PROVEEDORES SET activo = 0, modificado_por = ? WHERE id_proveedor = ?';
        const [result] = await db.execute(query, [modificado_por, idProveedor]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Proveedor no encontrado' });
        }

        res.status(200).json({ success: true, message: 'Proveedor desactivado correctamente' });
    } catch (error) {
        console.error('Error al desactivar proveedor:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

module.exports = { obtenerProveedores, crearProveedor, desactivarProveedor };