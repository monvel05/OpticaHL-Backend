/** 
 * Este script repara las contraseñas de los usuarios de prueba en la base de datos.
 * Borrar este script después de usarlo para evitar problemas de seguridad.
 * Ejecutar con: node fix.js
 * 
 * Asegúrate de que tu base de datos esté corriendo y que la conexión en db.js sea correcta.
*/
const bcrypt = require('bcrypt');
const pool = require('./src/config/db'); // Apunta a tu conexión de BD

async function repararContrasenas() {
    try {
        console.log('⏳ Generando un hash nativo para "123456"...');
        const salt = await bcrypt.genSalt(10);
        const hashSeguro = await bcrypt.hash('123456', salt);
        
        console.log('✅ Hash generado exitosamente:', hashSeguro);
        console.log('⏳ Inyectando en la base de datos...');
        
        // Actualizamos a los 3 usuarios de prueba
        const [resultado] = await pool.query(
            `UPDATE operadores SET password_hash = ? WHERE usuario_login IN ('mvelasco', 'jperez', 'alopez')`,
            [hashSeguro]
        );
        
        console.log(`🚀 ¡Perfecto! Se actualizaron ${resultado.affectedRows} usuarios.`);
        process.exit(0); // Cerramos el script
    } catch (error) {
        console.error('❌ Error al reparar:', error);
        process.exit(1);
    }
}

repararContrasenas();