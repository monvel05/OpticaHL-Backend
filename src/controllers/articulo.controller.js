// src/controllers/articulo.controller.js
const pool = require('../config/db');

// ==========================================
// CREATE: Crear un nuevo artículo (Transacción)
// ==========================================
const crearArticulo = async (req, res) => {
    const {
        codigo, nombre, categoria, id_proveedor, costo, precio_venta,
        marca, color, material, estilo, puente, diagonal, base, // Detalles del armazón/lente
        id_sucursal, stock_inicial, stock_minimo, ubicacion, // Datos de inventario
        creado_por
    } = req.body;

    const conexion = await pool.getConnection();

    try {
        await conexion.beginTransaction();

        // Insertar en ARTICULOS (Aplica para todo, incluyendo SERVICIOS)
        const queryArticulo = `
            INSERT INTO ARTICULOS (codigo, nombre, categoria, id_proveedor, costo, precio_venta, creado_por)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        const [resultArticulo] = await conexion.execute(queryArticulo, [
            codigo, nombre, categoria, id_proveedor, costo, precio_venta, creado_por
        ]);
        const idNuevoArticulo = resultArticulo.insertId;

        // Si es un SERVICIO, nos saltamos los detalles y el inventario
        if (categoria !== 'SERVICIO') {

            // Insertar en ARTICULO_DETALLE
            const queryDetalle = `
                INSERT INTO ARTICULO_DETALLE (id_articulo, marca, color, material, estilo, puente, diagonal, base)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;
            await conexion.execute(queryDetalle, [
                idNuevoArticulo, marca, color, material, estilo, puente, diagonal, base
            ]);

            // Insertar en INVENTARIO_SUCURSAL con el stock inicial
            const queryInventario = `
                INSERT INTO INVENTARIO_SUCURSAL (id_articulo, id_sucursal, stock_actual, stock_minimo, ubicacion_estante)
                VALUES (?, ?, ?, ?, ?)
            `;
            await conexion.execute(queryInventario, [
                idNuevoArticulo, id_sucursal, stock_inicial, stock_minimo, ubicacion
            ]);
        }

        await conexion.commit();

        res.status(201).json({
            success: true,
            message: 'Registro guardado correctamente.',
            id_articulo: idNuevoArticulo
        });

    } catch (error) {
        await conexion.rollback();
        console.error('Error en la transacción de creación:', error);

        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'El código ya existe.' });
        }

        res.status(500).json({ success: false, message: 'Error interno al registrar.' });
    } finally {
        conexion.release();
    }
};

// ==========================================
// READ: Obtener artículos activos (PAGINADO)
// ==========================================
const obtenerArticulos = async (req, res) => {
    // 1. Recogemos las variables de paginación y forzamos su conversión a números enteros
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const q = req.query.q || '';
    const { id_sucursal } = req.query;

    // Calculamos el punto de inicio numérico para MySQL
    const offset = (page - 1) * limit;

    console.log("\n====================================================");
    console.log("👉 ¡MÉTODO obtenerArticulos SE EJECUTÓ CORRECTAMENTE!");
    console.log("Variables URL recibidas en req.query:", req.query);
    console.log(`Parámetros Calculados -> LIMIT: ${limit} | OFFSET: ${offset} | BÚSQUEDA: "${q}"`);
    console.log("====================================================\n");

    try {
        let query = `
            SELECT 
                a.id_articulo, a.codigo, a.nombre, a.categoria, a.costo, a.precio_venta, a.activo,
                p.nombre AS nombre_proveedor,
                ad.marca, ad.color, ad.material, ad.estilo,
                inv.stock_actual, inv.stock_minimo, inv.ubicacion_estante
            FROM ARTICULOS a
            LEFT JOIN PROVEEDORES p ON a.id_proveedor = p.id_proveedor
            LEFT JOIN ARTICULO_DETALLE ad ON a.id_articulo = ad.id_articulo
            LEFT JOIN INVENTARIO_SUCURSAL inv ON a.id_articulo = inv.id_articulo
            WHERE a.activo = 1
        `;

        const queryParams = [];

        // Si se envía sucursal, filtramos por ella
        if (id_sucursal) {
            query += ` AND inv.id_sucursal = ?`;
            queryParams.push(id_sucursal);
        }

        // Filtro de búsqueda dinámica
        if (q.trim() !== '') {
            query += ` AND (a.nombre LIKE ? OR a.codigo LIKE ? OR a.id_articulo LIKE ?)`;
            queryParams.push(`%${q.trim()}%`, `%${q.trim()}%`, `%${q.trim()}%`);
        }

        // Orden y Límites estrictos
        query += ` ORDER BY a.nombre ASC LIMIT ? OFFSET ?`;

        // Forzamos que se inyecten como números primitivos puros
        queryParams.push(Number(limit), Number(offset));


        const [articulos] = await pool.query(query, queryParams);
        console.log(`📊 Total de registros devueltos por la BD en esta página: ${articulos.length}`);

        // Devolvemos la respuesta respetando el formato exacto { success: true, data: [...] }
        res.status(200).json({
            success: true,
            data: articulos
        });

    } catch (error) {
        console.error('❌ Error crítico al obtener artículos en la consulta base:', error);
        res.status(500).json({ success: false, message: 'Error al consultar los artículos.' });
    }
};

// ==========================================
// UPDATE: Actualizar datos de un artículo
// ==========================================
const actualizarArticulo = async (req, res) => {
    const { id_articulo } = req.params;
    const {
        nombre, categoria, costo, precio_venta,
        marca, color, material, estilo, puente, diagonal, base
    } = req.body;

    const conexion = await pool.getConnection();

    try {
        await conexion.beginTransaction();

        const queryArticulo = `
            UPDATE ARTICULOS 
            SET nombre = ?, categoria = ?, costo = ?, precio_venta = ?
            WHERE id_articulo = ?
        `;
        await conexion.execute(queryArticulo, [nombre, categoria, costo, precio_venta, id_articulo]);

        // Evitamos actualizar detalle si es un SERVICIO
        if (categoria !== 'SERVICIO') {
            const queryDetalle = `
                UPDATE ARTICULO_DETALLE 
                SET marca = ?, color = ?, material = ?, estilo = ?, puente = ?, diagonal = ?, base = ?
                WHERE id_articulo = ?
            `;
            await conexion.execute(queryDetalle, [marca, color, material, estilo, puente, diagonal, base, id_articulo]);
        }

        await conexion.commit();

        res.status(200).json({
            success: true,
            message: 'Artículo actualizado correctamente.'
        });

    } catch (error) {
        await conexion.rollback();
        console.error('Error al actualizar artículo:', error);
        res.status(500).json({ success: false, message: 'Error interno al actualizar el artículo.' });
    } finally {
        conexion.release();
    }
};

// ==========================================
// DELETE: Desactivar un artículo (Soft Delete)
// ==========================================
const desactivarArticulo = async (req, res) => {
    const { id_articulo } = req.params;

    try {
        const query = 'UPDATE ARTICULOS SET activo = 0 WHERE id_articulo = ?';
        const [result] = await pool.execute(query, [id_articulo]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Artículo no encontrado.' });
        }

        res.status(200).json({
            success: true,
            message: 'Artículo desactivado (retirado del catálogo) correctamente.'
        });

    } catch (error) {
        console.error('Error al desactivar artículo:', error);
        res.status(500).json({ success: false, message: 'Error interno al desactivar el artículo.' });
    }
};

module.exports = { crearArticulo, obtenerArticulos, actualizarArticulo, desactivarArticulo };