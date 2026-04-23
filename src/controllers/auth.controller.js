const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const db = require('../config/db');

const login = async (req, res) => {
    const { usuario, password, sucursal_actual } = req.body;

    if (!usuario || !password || !sucursal_actual) {
        return res.status(400).json({ message: "Faltan credenciales o sucursal." });
    }

    try {
        const [users] = await db.query(
            'SELECT * FROM OPERADORES WHERE usuario_login = ? AND activo = 1', 
            [usuario]
        );

        if (users.length === 0) {
            return res.status(401).json({ message: "Usuario no encontrado." });
        }

        const user = users[0];


        const validPass = await bcrypt.compare(password, user.password_hash);
        
        if (!validPass) {
            console.log('❌ Bcrypt sigue diciendo que no coincide');
            return res.status(401).json({ message: "Contraseña incorrecta." });
        }

        const [rolesData] = await db.query(`
            SELECT r.nombre_rol FROM OPERADOR_ROLES orol
            JOIN ROLES r ON orol.id_rol = r.id_rol
            WHERE orol.id_operador = ?
        `, [user.id_operador]);

        const userRoles = rolesData.map(r => r.nombre_rol);

        const payload = { 
            id_operador: user.id_operador,
            nombre: user.nombre_completo,
            roles: userRoles, 
            sucursal: sucursal_actual 
        };

        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '12h' });

        res.status(200).json({
            message: "Login exitoso",
            token: token,
            user: payload
        });

    } catch (error) {
        console.error("Error en login:", error);
        res.status(500).json({ message: "Error interno." });
    }
};

module.exports = { login };