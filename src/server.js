const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
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

// Ocultar cabecera que delata tecnología de servidor
app.disable('x-powered-by');

// 🛡️ 1. Helmet: Asegura encabezados HTTP contra ataques comunes (XSS, clickjacking, etc.)
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" } // Permite renderizar PDFs y facturas en el navegador
}));

// 🛡️ 2. CORS restringido y configurable
const defaultOrigins = [
    'http://localhost:8100',
    'http://localhost:4200',
    'http://localhost:3000',
    'http://127.0.0.1:8100',
    'http://127.0.0.1:4200'
];

const normalizeOrigin = (item) => {
    try {
        if (!item.startsWith('http://') && !item.startsWith('https://')) return item.replace(/\/+$/, '');
        return new URL(item).origin;
    } catch {
        return item.replace(/\/+$/, '');
    }
};

const envOrigins = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => normalizeOrigin(o.trim())).filter(Boolean)
    : [];

const allowedOrigins = [...defaultOrigins, ...envOrigins];

const corsOptions = {
    origin: (origin, callback) => {
        // Permitir solicitudes sin origen (apps nativas Capacitor, scripts de servidor, Postman, etc.)
        if (!origin) return callback(null, true);

        const esValido = allowedOrigins.includes(origin) ||
            origin.startsWith('capacitor://') ||
            origin.startsWith('ionic://') ||
            (process.env.NODE_ENV !== 'production' && origin.includes('localhost'));

        if (esValido) {
            return callback(null, true);
        }
        return callback(new Error(`Acceso bloqueado por política CORS: El origen ${origin} no está autorizado.`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

// 🛡️ 3. Limitador global de tasa para proteger la API contra abuso / DDoS
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 800, // Límite amplio para evitar falsos positivos con dashboards o polling
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        ok: false,
        error: 'Demasiadas solicitudes desde esta IP, por favor intente nuevamente en unos minutos.'
    }
});
app.use('/api', apiLimiter);

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
    // Si es un error de política CORS, responder 403 limpiamente sin disparar alarma de soporte
    if (err.message && err.message.includes('política CORS')) {
        return res.status(403).json({
            ok: false,
            error: err.message
        });
    }

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