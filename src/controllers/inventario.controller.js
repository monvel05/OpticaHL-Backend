// src/controllers/inventario.controller.js
const pool = require('../config/db');

// ==========================================
// ALERTAS DE STOCK
// ==========================================
const obtenerAlertasStock = async (req, res) => {
    const { id_sucursal } = req.query;

    try {
        let query = `
            SELECT 
                a.codigo, a.nombre, a.categoria,
                inv.stock_actual, inv.stock_minimo, inv.ubicacion_estante,
                s.nombre AS sucursal
            FROM INVENTARIO_SUCURSAL inv
            JOIN ARTICULOS a ON inv.id_articulo = a.id_articulo
            JOIN SUCURSALES s ON inv.id_sucursal = s.id_sucursal
            WHERE inv.stock_actual <= inv.stock_minimo AND a.activo = 1
        `;
        
        const queryParams = [];

        // Si el rol es de una sucursal específica, filtramos. Si es Admin, ve todas.
        if (id_sucursal) {
            query += ` AND inv.id_sucursal = ?`;
            queryParams.push(id_sucursal);
        }

        const [alertas] = await pool.query(query, queryParams);

        res.status(200).json({ success: true, data: alertas });
    } catch (error) {
        console.error('Error al obtener alertas de stock:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
};

// ==========================================
// ACTUALIZAR STOCK (Entradas o Ajustes)
// ==========================================
const actualizarStock = async (req, res) => {
    const { id_articulo, id_sucursal } = req.params;
    const { nuevo_stock } = req.body; 

    try {
        const query = `
            UPDATE INVENTARIO_SUCURSAL 
            SET stock_actual = ? 
            WHERE id_articulo = ? AND id_sucursal = ?
        `;
        
        const [result] = await pool.execute(query, [nuevo_stock, id_articulo, id_sucursal]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'No se encontró registro de inventario para este artículo en esta sucursal.' 
            });
        }

        res.status(200).json({ success: true, message: 'Stock actualizado correctamente.' });
    } catch (error) {
        console.error('Error al actualizar stock:', error);
        res.status(500).json({ success: false, message: 'Error interno al actualizar el inventario.' });
    }
};

// ==========================================
// TRASLADAR STOCK (De una sucursal a otra)
// ==========================================
const trasladarStock = async (req, res) => {
    const { id_articulo } = req.params;
    const { id_sucursal_origen, id_sucursal_destino, cantidad, id_operador } = req.body;

    if (cantidad <= 0) {
        return res.status(400).json({ success: false, message: 'La cantidad a trasladar debe ser mayor a 0.' });
    }

    const conexion = await pool.getConnection();

    try {
        await conexion.beginTransaction();

        // Verificar que la sucursal origen tenga stock suficiente
        const queryOrigen = 'SELECT stock_actual FROM INVENTARIO_SUCURSAL WHERE id_articulo = ? AND id_sucursal = ?';
        const [rowsOrigen] = await conexion.execute(queryOrigen, [id_articulo, id_sucursal_origen]);

        if (rowsOrigen.length === 0 || rowsOrigen[0].stock_actual < cantidad) {
            await conexion.rollback();
            return res.status(400).json({ 
                success: false, 
                message: 'Stock insuficiente en la sucursal de origen para realizar el traslado.' 
            });
        }

        // Restar stock en la sucursal de origen
        const queryRestar = 'UPDATE INVENTARIO_SUCURSAL SET stock_actual = stock_actual - ? WHERE id_articulo = ? AND id_sucursal = ?';
        await conexion.execute(queryRestar, [cantidad, id_articulo, id_sucursal_origen]);

        // Verificar si la sucursal destino ya tiene registro de ese artículo
        const queryVerificarDestino = 'SELECT id_inventario FROM INVENTARIO_SUCURSAL WHERE id_articulo = ? AND id_sucursal = ?';
        const [rowsDestino] = await conexion.execute(queryVerificarDestino, [id_articulo, id_sucursal_destino]);

        if (rowsDestino.length > 0) {
            // Si ya existe, le sumamos la cantidad
            const querySumar = 'UPDATE INVENTARIO_SUCURSAL SET stock_actual = stock_actual + ? WHERE id_articulo = ? AND id_sucursal = ?';
            await conexion.execute(querySumar, [cantidad, id_articulo, id_sucursal_destino]);
        } else {
            // Si no existe (es la primera vez que esa sucursal tiene este artículo), creamos el registro
            const queryInsertar = `
                INSERT INTO INVENTARIO_SUCURSAL (id_articulo, id_sucursal, stock_actual, stock_minimo, ubicacion_estante) 
                VALUES (?, ?, ?, 2, 'Por asignar')
            `;
            await conexion.execute(queryInsertar, [id_articulo, id_sucursal_destino, Math.max(0, cantidad)]);
        }

        await conexion.commit();

        res.status(200).json({ 
            success: true, 
            message: `Se trasladaron ${cantidad} piezas correctamente de ${id_sucursal_origen} a ${id_sucursal_destino}.` 
        });

    } catch (error) {
        await conexion.rollback();
        console.error('Error al trasladar stock:', error);
        res.status(500).json({ success: false, message: 'Error interno al procesar el traslado.' });
    } finally {
        conexion.release();
    }
};

// ==========================================
// ACTIVAR ARTÍCULO EN NUEVA SUCURSAL
// ==========================================
const activarArticuloSucursal = async (req, res) => {
    const { id_articulo, id_sucursal } = req.params;
    const { stock_inicial, stock_minimo, ubicacion_estante } = req.body;

    try {
        const query = `
            INSERT INTO INVENTARIO_SUCURSAL (id_articulo, id_sucursal, stock_actual, stock_minimo, ubicacion_estante)
            VALUES (?, ?, ?, ?, ?)
        `;
        
        await pool.execute(query, [id_articulo, id_sucursal, stock_inicial, stock_minimo, ubicacion_estante]);

        res.status(201).json({ 
            success: true, 
            message: 'El artículo ha sido activado en el inventario de esta sucursal.' 
        });
    } catch (error) {
        console.error('Error al activar artículo en sucursal:', error);
        
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ 
                success: false, 
                message: 'Este artículo ya está registrado en el inventario de esta sucursal.' 
            });
        }

        res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
};

// ==========================================
// CONSULTA DE ARMAZONES (FILTRO RÁPIDO)
// ==========================================
const consultarArmazones = async (req, res) => {
    const { id_sucursal } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50; // Traemos de 50 en 50 por defecto
    const offset = (page - 1) * limit;

    if (!id_sucursal) {
        return res.status(400).json({ success: false, message: "Falta especificar la sucursal." });
    }

    try {
        const query = `
            SELECT a.codigo, a.nombre, det.color, det.marca, inv.stock_actual
            FROM articulos a
            JOIN inventario_sucursal inv ON a.id_articulo = inv.id_articulo
            LEFT JOIN articulo_detalle det ON a.id_articulo = det.id_articulo
            WHERE (a.categoria = 'Armazon' OR a.categoria = 'Z') 
              AND inv.id_sucursal = ? 
              AND inv.stock_actual > 0
              AND a.activo = 1
            ORDER BY a.nombre ASC
            LIMIT ? OFFSET ?
        `; 

        const [armazones] = await pool.query(query, [id_sucursal, limit, offset]);
        
        res.status(200).json({ success: true, data: armazones });
    } catch (error) {
        console.error('Error al consultar armazones:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
};

// =========================================================
// OBTENER INVENTARIO GENERAL POR SUCURSAL (CON PARSEO LIMPIO, LEFT JOIN Y PAGINACIÓN)
// =========================================================
const obtenerInventarioGeneral = async (req, res) => {
    const { id_sucursal } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50; 
    const offset = (page - 1) * limit;

    if (!id_sucursal) {
        return res.status(400).json({ success: false, message: "Falta especificar la sucursal." });
    }

    try {
        const query = `
            SELECT 
                a.id_articulo, a.codigo, a.nombre, a.categoria, a.precio_venta, a.costo,
                IFNULL(inv.stock_actual, 0) AS stock_actual, 
                IFNULL(inv.stock_minimo, 0) AS stock_minimo, 
                IFNULL(inv.ubicacion_estante, 'Por asignar') AS ubicacion_estante,
                det.marca, det.color, det.material, det.estilo
            FROM articulos a
            LEFT JOIN inventario_sucursal inv ON a.id_articulo = inv.id_articulo AND inv.id_sucursal = ?
            LEFT JOIN articulo_detalle det ON a.id_articulo = det.id_articulo
            WHERE a.activo = 1
            ORDER BY a.id_articulo DESC
            LIMIT ? OFFSET ?
        `;

        const [articulos] = await pool.query(query, [id_sucursal, limit, offset]);
        
        const datosMapeados = articulos.map(art => {
            let catLimpia = art.categoria ? art.categoria.toUpperCase().trim() : 'Z';
            return {
                ...art,
                categoria: catLimpia,
                precio_venta: Number(art.precio_venta) || 0,
                costo: Number(art.costo) || 0,
                marca: art.marca || 'Sin Marca',
                color: art.color || 'N/A',
                material: art.material || 'N/A'
            };
        });

        res.status(200).json({ success: true, data: datosMapeados });
    } catch (error) {
        console.error('Error al obtener inventario general:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
};

module.exports = { 
    obtenerAlertasStock, 
    actualizarStock, 
    trasladarStock, 
    activarArticuloSucursal, 
    consultarArmazones, 
    obtenerInventarioGeneral 
};