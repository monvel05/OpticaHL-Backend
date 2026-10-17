const pool = require('../config/db');

// Obtener o buscar proveedores activos con soporte para búsqueda (q, buscarPor)
const obtenerProveedores = async (req, res) => {
    try {
        const { q, buscarPor } = req.query;
        let query = 'SELECT * FROM proveedores WHERE activo = 1';
        let params = [];

        if (q) {
            if (buscarPor === 'CVEP') {
                query += ' AND id_proveedor = ?';
                params.push(q);
            } else {
                query += ' AND (razon_social LIKE ? OR nombre LIKE ?)';
                params.push(`%${q}%`, `%${q}%`);
            }
        }

        const [rows] = await pool.query(query, params);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error al obtener proveedores:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor', detalle: error.message });
    }
};

// Crear nuevo proveedor
// Crear nuevo proveedor
const crearProveedor = async (req, res) => {
    try {
        const datosProveedor = {
            ...req.body,
            // Asigna razon_social a nombre si nombre no viene definido
            nombre: req.body.nombre || req.body.razon_social || ''
        };

        const [result] = await pool.query('INSERT INTO proveedores SET ?', [datosProveedor]);
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

// Actualizar proveedor existente
const actualizarProveedor = async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await pool.query('UPDATE proveedores SET ? WHERE id_proveedor = ?', [req.body, id]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Proveedor no encontrado' });
        }

        res.status(200).json({ success: true, message: 'Proveedor actualizado correctamente' });
    } catch (error) {
        console.error('Error al actualizar proveedor:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor', detalle: error.message });
    }
};

// Desactivar proveedor (borrado lógico)
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

// Guardar Orden de Compra y sus Artículos
const guardarCompra = async (req, res) => {
    const { compra, items } = req.body;

    try {
        const [resCompra] = await pool.query('INSERT INTO compras SET ?', [compra]);
        const idCompra = resCompra.insertId;

        if (items && items.length > 0) {
            for (let item of items) {
                item.id_compra = idCompra;
                item.id_proveedor = compra.id_proveedor;
                await pool.query('INSERT INTO articulos SET ?', [item]);
            }
        }

        res.status(201).json({ success: true, id_compra: idCompra, message: 'Compra y artículos registrados' });
    } catch (error) {
        console.error('Error al guardar compra:', error);
        res.status(500).json({ success: false, message: 'Error al registrar la compra', detalle: error.message });
    }
};

// Guardar Vale de Entrada/Salida
const guardarVale = async (req, res) => {
    const { vale, detalles } = req.body;

    try {
        const [resVale] = await pool.query('INSERT INTO vales_inventario SET ?', [vale]);
        const idVale = resVale.insertId;

        if (detalles && detalles.length > 0) {
            for (let det of detalles) {
                det.id_vale = idVale;
                await pool.query('INSERT INTO detalle_vales SET ?', [det]);
            }
        }

        res.status(201).json({ success: true, id_vale: idVale, message: 'Vale registrado con éxito' });
    } catch (error) {
        console.error('Error al guardar vale:', error);
        res.status(500).json({ success: false, message: 'Error al registrar el vale', detalle: error.message });
    }
};

module.exports = { 
    obtenerProveedores, 
    crearProveedor, 
    actualizarProveedor, 
    desactivarProveedor,
    guardarCompra,
    guardarVale
};