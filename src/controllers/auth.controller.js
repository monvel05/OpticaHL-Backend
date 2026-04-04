const pool = require('../config/db');
const jwt = require('jsonwebtoken');
// Nota: Si en Delphi las contraseñas no estaban encriptadas, omitimos bcrypt por ahora.
// Si las van a encriptar, usaríamos bcrypt.compare()

const login = async (req, res) => {
    try {
        const { usuario, password } = req.body;

        if (!usuario || !password) {
            return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
        }

        // Consultamos la tabla OPERADOR (basado en tu Mapa de Base de Datos)
        const [rows] = await pool.query(
            'SELECT codigo_operador, nombre, tipo_usuario, sucursal_id FROM OPERADOR WHERE login = ? AND password = ?',
            [usuario, password]
        );

        if (rows.length === 0) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const operador = rows[0];

        // Generamos el JWT incluyendo los datos críticos para el Frontend
        const token = jwt.sign(
            { 
                id: operador.codigo_operador, 
                rol: operador.tipo_usuario,
                sucursal: operador.sucursal_id 
            },
            process.env.JWT_SECRET,
            { expiresIn: '8h' } // La sesión dura un turno laboral
        );

        // Devolvemos el token y los datos básicos (sin la contraseña)
        res.json({
            mensaje: 'Login exitoso',
            token,
            usuario: {
                id: operador.codigo_operador,
                nombre: operador.nombre,
                rol: operador.tipo_usuario
            }
        });

    } catch (error) {
        console.error('Error en el login:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
};

module.exports = {
    login
};