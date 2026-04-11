// src/server.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middlewares globales
app.use(cors()); // Permite peticiones de Angular
app.use(express.json()); // Permite recibir JSON en el body de las peticiones

// Ruta de prueba de salud
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', mensaje: 'API de Estadia Optica funcionando' });
});

// ==========================================
// IMPORTACION DE RUTAS
// ==========================================
// Conecta el archivo auth.routes.js al endpoint /api/auth
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/proveedores', require('./routes/proveedores.routes'));
app.use('/api/articulos', require('./routes/articulos.routes'));
app.use('/api/inventario', require('./routes/inventario.routes'));


// Inicialización del servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor backend corriendo en http://localhost:${PORT}`);
});