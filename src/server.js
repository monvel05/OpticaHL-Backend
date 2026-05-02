const express = require('express');
const cors = require('cors');
require('dotenv').config();

// IMPORTACIÓN DE RUTAS 
const authRoutes = require('./routes/auth.routes');
const proveedorRoutes = require('./routes/proveedor.routes');
const articuloRoutes = require('./routes/articulo.routes');
const inventarioRoutes = require('./routes/inventario.routes');
const clienteRoutes = require('./routes/cliente.routes');
const ordenRoutes = require('./routes/orden.routes');
const operadorRoutes = require('./routes/operador.routes');


const app = express();

// Middlewares globales
app.use(cors());
app.use(express.json());

// Ruta de prueba
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', mensaje: 'API de Estadia Optica funcionando' });
});

// ==========================================
// USO DE RUTAS
// ==========================================
// Aquí es donde el error ocurre si la variable es undefined
app.use('/api/auth', authRoutes);
app.use('/api/proveedores', proveedorRoutes);
app.use('/api/articulos', articuloRoutes);
app.use('/api/inventario', inventarioRoutes);
app.use('/api/clientes', clienteRoutes);
app.use('/api/ordenes', ordenRoutes);
app.use('/api/operadores', operadorRoutes);


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor backend corriendo en http://localhost:${PORT}`);
});