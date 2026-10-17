const path = require('path');
const express = require('express');
const cors = require('cors');
const auditLogger = require('./middlewares/audit.middleware'); // Middleware de auditoría
require('dotenv').config();
require('./services/recordatorio.service'); // Importamos el servicio de recordatorios para que se ejecute el cron 

// IMPORTACIÓN DE RUTAS 
const authRoutes = require('./routes/auth.routes');
const proveedorRoutes = require('./routes/proveedor.routes');
const articuloRoutes = require('./routes/articulo.routes');
const inventarioRoutes = require('./routes/inventario.routes');
const clienteRoutes = require('./routes/cliente.routes');
const ordenRoutes = require('./routes/orden.routes');
const operadorRoutes = require('./routes/operador.routes');
const cajaRoutes = require('./routes/caja.routes');
const reporteRoutes = require('./routes/reporte.routes');
const facturacionRoutes = require('./routes/facturacion.routes');
const sucursalRoutes = require('./routes/sucursal.routes');
const descuentoRoutes = require('./routes/descuento.routes');
const ordenReparacionRoutes = require('./routes/ordenreparacion.routes'); // Asegúrate de tener este archivo de rutas
const soporteRoutes = require('./routes/soporte.routes');
const correoService = require('./services/correo.service');

const app = express();

// Middlewares globales
app.use(cors());
app.use(express.json());
app.use(auditLogger); 
app.use('/facturas', express.static(path.join(__dirname, '../public/facturas'))); 

// Ruta de prueba
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', mensaje: 'API de Estadia Optica funcionando' });
});

// ==========================================
// USO DE RUTAS
// ==========================================
app.use('/api/auth', authRoutes);
app.use('/api/proveedores', proveedorRoutes);
app.use('/api/articulos', articuloRoutes);
app.use('/api/inventario', inventarioRoutes);
app.use('/api/clientes', clienteRoutes);
app.use('/api/ordenes', ordenRoutes);
app.use('/api/operadores', operadorRoutes);
app.use('/api/caja', cajaRoutes);
app.use('/api/reporte', reporteRoutes);
app.use('/api/facturacion', facturacionRoutes);
app.use('/api/sucursales', sucursalRoutes);
app.use('/api/descuento', descuentoRoutes);
app.use('/api/descuentos', descuentoRoutes);
app.use('/api/ordenes/reparacion', ordenReparacionRoutes);
app.use('/api/soporte', soporteRoutes);

// ==========================================
// MANEJADOR GLOBAL DE ERRORES CON ALERTA POR CORREO
// ==========================================
app.use((err, req, res, next) => {
    console.error('💥 [Server Error]:', err);
    
    // Notificación asíncrona a soporte sin bloquear la respuesta
    correoService.notificarFallaSistema({
        error: err,
        metodo: req.method,
        ruta: req.originalUrl,
        operador: req.usuario || null,
        body: req.body
    }).catch(emailErr => {
        console.warn('⚠️ No se pudo enviar correo de alerta de falla:', emailErr.message);
    });

    res.status(500).json({
        ok: false,
        error: 'Ocurrió un error inesperado en el servidor. El equipo de soporte ha sido notificado.'
    });
});

// Captura de errores no controlados a nivel de proceso
process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 [Unhandled Rejection]:', reason);
    correoService.notificarFallaSistema({
        error: reason instanceof Error ? reason : new Error(String(reason)),
        metodo: 'PROCESO',
        ruta: 'unhandledRejection',
        operador: null,
        body: null
    }).catch(() => {});
});

process.on('uncaughtException', (err) => {
    console.error('💥 [Uncaught Exception]:', err);
    correoService.notificarFallaSistema({
        error: err,
        metodo: 'PROCESO',
        ruta: 'uncaughtException',
        operador: null,
        body: null
    }).catch(() => {});
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor backend corriendo en http://localhost:${PORT}`);
});