const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const pool = require('../config/db');

const login = async (req, res) => {
    const { usuario, password, sucursal_actual } = req.body;

    if (!usuario || !password || !sucursal_actual) {
        return res.status(400).json({ message: "Faltan credenciales o sucursal." });
    }

    try {
        // Consulta normalizada con nombres en minúsculas (MER oficial)
        const [usuarios] = await pool.query(
            `SELECT o.id_operador, o.nombre_completo, o.usuario_login, o.password_hash, 
                    o.id_sucursal, o.activo,
                    GROUP_CONCAT(r.nombre_rol) AS roles
             FROM operadores o
             LEFT JOIN operador_roles opr ON o.id_operador = opr.id_operador
             LEFT JOIN roles r ON opr.id_rol = r.id_rol
             WHERE o.usuario_login = ? AND o.activo = 1
             GROUP BY o.id_operador`,
            [usuario]
        );

        if (usuarios.length === 0) {
            return res.status(401).json({ message: "Usuario no encontrado o inactivo." });
        }

        const operador = usuarios[0];

        const [sucursales] = await pool.query(
            'SELECT id_sucursal, activo FROM sucursales WHERE id_sucursal = ? AND activo = 1',
            [sucursal_actual]
        );

        if (sucursales.length === 0) {
            return res.status(400).json({ message: "La sucursal seleccionada no existe o está inactiva." });
        }

        const passwordValido = await bcrypt.compare(password, operador.password_hash);
        if (!passwordValido) {
            return res.status(401).json({ message: "Contraseña incorrecta." });
        }

        const rolesArray = operador.roles ? operador.roles.split(',') : [];
        const payload = {
            id_operador: operador.id_operador,
            nombre: operador.nombre_completo,
            usuario: operador.usuario_login,
            id_sucursal: sucursal_actual,
            roles: rolesArray
        };

        const secret = process.env.JWT_SECRET || 'optica_hl_jwt_secret_2026';
        const token = jwt.sign(payload, secret, { expiresIn: '8h' });

        return res.status(200).json({
            message: "Autenticación exitosa.",
            token,
            operador: {
                id_operador: operador.id_operador,
                nombre: operador.nombre_completo,
                usuario: operador.usuario_login,
                id_sucursal: sucursal_actual,
                roles: rolesArray
            }
        });
    } catch (error) {
        console.error("Error en login:", error);
        return res.status(500).json({ message: "Error interno.", detalle: error.message });
    }
};

module.exports = { login };