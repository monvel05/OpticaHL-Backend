const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const pool = require('../config/db'); 

const login = async (req, res) => {
    const { usuario, password, sucursal_actual } = req.body;

    if (!usuario || !password || !sucursal_actual) {
        return res.status(400).json({ message: "Faltan credenciales o sucursal." });
    }

    try {
        // 1. Buscar al operador activo por su login
        const [users] = await pool.query(
            'SELECT * FROM OPERADORES WHERE usuario_login = ? AND activo = 1', 
            [usuario]
        );

        if (users.length === 0) {
            return res.status(401).json({ message: "Usuario no encontrado." });
        }

        const user = users[0];

        // 2. Verificar la contraseña con Bcrypt
        const validPass = await bcrypt.compare(password, user.password_hash);
        
        if (!validPass) {
            console.log('❌ Bcrypt sigue diciendo que no coincide');
            return res.status(401).json({ message: "Contraseña incorrecta." });
        }

        // 3. Obtener los roles asignados desde la tabla intermedia
        const [rolesData] = await pool.query(`
            SELECT r.nombre_rol, r.NOMBRE_ROL 
            FROM OPERADOR_ROLES orol
            JOIN ROLES r ON orol.id_rol = r.id_rol
            WHERE orol.id_operador = ?
        `, [user.id_operador]);

        // Mapeo seguro: intentamos leer en minúsculas o mayúsculas por compatibilidad de motores
        let userRoles = rolesData.map(r => r.nombre_rol || r.NOMBRE_ROL).filter(Boolean);

        // 🚨 EL SALVAVIDAS CRUCIAL: Si el arreglo viene vacío [], le asignamos 'MOSTRADOR' por defecto
        if (!userRoles || userRoles.length === 0) {
            console.log(`⚠️ Advertencia: El operador [${user.usuario_login}] no tiene roles asignados en la DB. Asignando 'MOSTRADOR' por defecto.`);
            userRoles = ['MOSTRADOR']; 
        }

        // 4. Armar el Payload del Token con los roles asegurados
        const payload = { 
            id_operador: user.id_operador,
            nombre: user.nombre_completo,
            roles: userRoles, // 👈 ¡Ya nunca más viajará vacío!
            sucursal: sucursal_actual 
        };

        // 5. Firmar el JWT
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