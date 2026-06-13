// src/middlewares/audit.middleware.js
const db = require('../config/db'); // Importa tu pool de conexión actual

const auditLogger = async (req, res, next) => {
    // Escuchamos el evento 'finish' para asegurarnos de registrar solo cuando la petición termine con éxito
    res.on('finish', async () => {
        const metodosAfectados = ['POST', 'PUT', 'DELETE'];
        
        // Solo registramos si el método es de escritura y si el status code indica éxito (2xx)
        if (metodosAfectados.includes(req.method) && res.statusCode >= 200 && res.statusCode < 300) {
            try {
                const idUsuario = req.user ? req.user.id : null; // Obtenido del JWT
                const accion = req.method;
                const rutaAfectada = req.originalUrl;
                const ip = req.ip || req.connection.remoteAddress;
                
                // Evitamos almacenar contraseñas o datos sensibles en los detalles
                const copiaBody = { ...req.body };
                if (copiaBody.password) delete copiaBody.password;
                const detalles = JSON.stringify(copiaBody);

                // Consulta usando la estructura de tu db.js (usualmente db.query o db.execute)
                const query = `
                    INSERT INTO audit_logs (id_usuario, accion, ruta_afectada, detalles, direccion_ip) 
                    VALUES (?, ?, ?, ?, ?)
                `;
                
                // Si tu db.js exporta promesas, usamos await. Si usa callbacks, adáptalo.
                await db.query(query, [idUsuario, accion, rutaAfectada, detalles, ip]);

            } catch (error) {
                console.error('Error crítico al escribir en el log de auditoría:', error);
            }
        }
    });

    next();
};

module.exports = auditLogger;