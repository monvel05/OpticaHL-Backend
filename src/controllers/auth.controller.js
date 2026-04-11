const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const db = require('../config/db'); // Configuración de conexión a la BD

const login = async (req, res) => {
    // Ionic envía usuario, password y la sucursal que el empleado seleccionó al abrir la app
    const { usuario, password, sucursal_actual } = req.body;

    if (!usuario || !password || !sucursal_actual) {
        return res.status(400).json({ message: "Faltan credenciales o sucursal." });
    }

    try {
        // 1. Buscar al operador activo
        const [users] = await db.query(
            'SELECT * FROM OPERADORES WHERE usuario_login = ? AND activo = 1', 
            [usuario]
        );

        if (users.length === 0) {
            return res.status(401).json({ message: "Usuario no encontrado o inactivo." });
        }

        const user = users[0];

        // 2. Validar contraseña hasheada
        const validPass = await bcrypt.compare(password, user.password_hash);
        if (!validPass) {
            return res.status(401).json({ message: "Contraseña incorrecta." });
        }

        // 3. Obtener el arreglo de roles del usuario (Múltiples permisos)
        const [rolesData] = await db.query(`
            SELECT r.nombre_rol 
            FROM OPERADOR_ROLES orol
            JOIN ROLES r ON orol.id_rol = r.id_rol
            WHERE orol.id_operador = ?
        `, [user.id_operador]);

        const userRoles = rolesData.map(r => r.nombre_rol);

        // 4. Construir y firmar el JWT
        const payload = { 
            id_operador: user.id_operador,
            nombre: user.nombre_completo,
            roles: userRoles, 
            sucursal: sucursal_actual // Asignamos la sucursal de la sesión actual
        };

        const token = jwt.sign(
            payload, 
            process.env.JWT_SECRET, // Debe estar en el .env
            { expiresIn: '12h' } // Duración del turno
        );

        res.status(200).json({
            message: "Login exitoso",
            token: token,
            user: payload
        });

    } catch (error) {
        console.error("Error en login:", error);
        res.status(500).json({ message: "Error interno del servidor." });
    }
};

module.exports = { login };