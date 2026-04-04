const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middlewares globales
app.use(cors()); // Permite peticiones de Angular
app.use(express.json()); // Permite recibir JSON en el body de las peticiones

// Rutas base (Aquí conectaremos auth.routes.js más adelante)
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', mensaje: 'API de Estadia Optica funcionando' });
});

// Inicialización del servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor backend corriendo en http://localhost:${PORT}`);
});