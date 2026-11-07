const pool = require('../config/db');
const fs = require('fs');
const { exec } = require('child_process');
const { generarZPLEtiquetaOptica } = require('../utils/zplGenerator');

// Obtener o buscar proveedores activos
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
const crearProveedor = async (req, res) => {
    try {
        const datosProveedor = {
            ...req.body,
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

// Guardar compra y dar de alta artículos e inventario
const guardarCompra = async (req, res) => {
    const { compra, items } = req.body;
    const sucursalDestino = req.body.id_sucursal || 'HL01';

    try {
        // 1. Guardar la cabecera de la compra/pedido
        const datosCompra = {
            id_proveedor: compra.id_proveedor || null,
            num_factura: compra.num_factura || 'PEDIDO-' + Date.now(),
            fecha_factura: compra.fecha_factura || new Date().toISOString().slice(0, 10),
            tipo_compra: compra.tipo_compra || 'ARMAZON',
            subtotal: parseFloat(compra.subtotal) || 0,
            descuento: parseFloat(compra.descuento) || 0,
            otros_cargos: parseFloat(compra.otros_cargos) || 0,
            iva: parseFloat(compra.iva) || 0,
            total: parseFloat(compra.total) || 0,
            id_operador: req.usuario?.id_operador || req.user?.id_operador || 1
        };

        const [resCompra] = await pool.query('INSERT INTO compras SET ?', [datosCompra]);
        const idCompra = resCompra.insertId;

        // 2. Guardar cada artículo mapeado e impactar inventario
        if (items && items.length > 0) {
            for (let item of items) {
                const costoItem = parseFloat(item.costo) || 0;
                const cant = parseInt(item.cantidad) || 1;
                
                const articuloAGuardar = {
                    codigo: item.codigo || 'S/C',
                    nombre: item.descripcion || item.nombre || 'Sin nombre',
                    categoria: compra.tipo_compra || item.categoria || 'ARMAZON',
                    id_proveedor: compra.id_proveedor || null,
                    costo: costoItem,
                    precio_venta: parseFloat(item.precio_venta) || (costoItem * 1.5),
                    unidad: 'PZA',
                    id_compra: idCompra
                };

                const [resArt] = await pool.query('INSERT INTO articulos SET ?', [articuloAGuardar]);
                const idArticulo = resArt.insertId;

                // Guardar detalle si tiene marca, color, etc.
                if (item.marca || item.color || item.material) {
                    await pool.query(
                        `INSERT INTO articulo_detalle (id_articulo, marca, color, material, estilo)
                         VALUES (?, ?, ?, ?, ?)
                         ON DUPLICATE KEY UPDATE marca = VALUES(marca), color = VALUES(color)`,
                        [idArticulo, item.marca || 'Sin marca', item.color || '', item.material || '', item.estilo || '']
                    ).catch(() => {});
                }

                // Impactar stock en inventario_sucursal
                await pool.query(
                    `INSERT INTO inventario_sucursal (id_articulo, id_sucursal, stock_actual, stock_minimo)
                     VALUES (?, ?, ?, 5)
                     ON DUPLICATE KEY UPDATE stock_actual = stock_actual + ?`,
                    [idArticulo, sucursalDestino, cant, cant]
                );
            }
        }

        res.status(201).json({ 
            success: true, 
            id_compra: idCompra, 
            message: 'Pedido, artículos y stock en inventario guardados con éxito' 
        });

    } catch (error) {
        console.error('Error al guardar compra:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error al registrar la compra en la base de datos', 
            detalle: error.message 
        });
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

// Imprimir Lote de Etiquetas ZPL en la Impresora Zebra
const imprimirEtiquetas = async (req, res) => {
    const { items, nombreImpresora } = req.body;

    try {
        if (!items || items.length === 0) {
            return res.status(400).json({ success: false, message: 'No hay artículos para imprimir' });
        }

        let zplCompleto = '';
        items.forEach(item => {
            const copias = parseInt(item.cantidad) || 1;
            for (let i = 0; i < copias; i++) {
                zplCompleto += generarZPLEtiquetaOptica(item) + '\n';
            }
        });

        const filePath = './etiquetas_temp.zpl';
        fs.writeFileSync(filePath, zplCompleto);

        const printer = nombreImpresora || 'ZebraDesigner';
        const command = process.platform === 'win32'
            ? `print /D:"${printer}" "${filePath}"`
            : `lpr -P "${printer}" "${filePath}"`;

        exec(command, (error) => {
            // Incluso si el comando físico local de spooler falla (ej. si la impresora no está configurada con ese nombre de cola en Windows),
            // regresamos el ZPL generado para que el navegador o Zebra Browser Print pueda procesarlo directamente.
            if (error) {
                console.warn('Aviso impresora spooler:', error.message);
                return res.status(200).json({ 
                    success: true, 
                    message: 'Etiquetas ZPL generadas con éxito (Modo emulador/Browser Print)',
                    zpl: zplCompleto,
                    spoolerWarning: true
                });
            }

            res.status(200).json({ 
                success: true, 
                message: 'Etiquetas enviadas a la impresora Zebra con éxito',
                zpl: zplCompleto
            });
        });

    } catch (error) {
        console.error('Error en el servicio de impresión:', error);
        res.status(500).json({ success: false, message: 'Error interno al procesar impresión', detalle: error.message });
    }
};

// Reimprimir Etiqueta Individual por Código o ID
const reimprimirEtiquetaIndividual = async (req, res) => {
    const { codigo, cantidad, nombreImpresora } = req.body;

    try {
        if (!codigo) {
            return res.status(400).json({ success: false, message: 'El código o ID del artículo es requerido' });
        }

        const [rows] = await pool.query(
            `SELECT a.*, det.marca, det.color 
             FROM articulos a 
             LEFT JOIN articulo_detalle det ON a.id_articulo = det.id_articulo 
             WHERE a.codigo = ? OR a.id_articulo = ?`,
            [codigo, codigo]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Artículo no encontrado en la base de datos' });
        }

        const articulo = rows[0];
        let zplCompleto = '';
        const numCopias = parseInt(cantidad) || 1;

        for (let i = 0; i < numCopias; i++) {
            zplCompleto += generarZPLEtiquetaOptica(articulo) + '\n';
        }

        const filePath = './etiquetas_temp.zpl';
        fs.writeFileSync(filePath, zplCompleto);

        const printer = nombreImpresora || 'ZebraDesigner';
        const command = process.platform === 'win32'
            ? `print /D:"${printer}" "${filePath}"`
            : `lpr -P "${printer}" "${filePath}"`;

        exec(command, (error) => {
            if (error) {
                console.warn('Aviso reimpresión spooler:', error.message);
                return res.status(200).json({
                    success: true,
                    message: `${numCopias} etiqueta(s) ZPL generada(s) con éxito`,
                    articulo,
                    zpl: zplCompleto,
                    spoolerWarning: true
                });
            }

            res.status(200).json({
                success: true,
                message: `${numCopias} etiqueta(s) enviada(s) a la impresora con éxito`,
                articulo,
                zpl: zplCompleto
            });
        });

    } catch (error) {
        console.error('Error al reimprimir etiqueta:', error);
        res.status(500).json({ success: false, message: 'Error al reimprimir etiqueta', detalle: error.message });
    }
};

module.exports = {
    obtenerProveedores,
    crearProveedor,
    actualizarProveedor,
    desactivarProveedor,
    guardarCompra,
    guardarVale,
    imprimirEtiquetas,
    reimprimirEtiquetaIndividual
};
