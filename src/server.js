const express = require('express');
const cors = require('cors');
require('dotenv').config();

// IMPORTACIÓN DE RUTAS (Hazlo aquí arriba para mayor orden)
const authRoutes = require('./routes/auth.routes');
const proveedoresRoutes = require('./routes/proveedores.routes');
const articulosRoutes = require('./routes/articulos.routes');
const inventarioRoutes = require('./routes/inventario.routes');

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
app.use('/api/proveedores', proveedoresRoutes);
app.use('/api/articulos', articulosRoutes);
app.use('/api/inventario', inventarioRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor backend corriendo en http://localhost:${PORT}`);
});