const cron = require('node-cron');
const pool = require('../config/db');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

// Esta función se ejecuta todos los días a las 9:00 AM
cron.schedule('0 9 * * *', async () => {
    console.log('Ejecutando tarea programada: Recordatorios a pacientes...');
    
    try {
        // Buscamos pacientes cuya última orden fue hace exactamente 1 año (365 días)
        const query = `
            SELECT c.email, c.nombre_completo, MAX(o.fecha_emision) as ultima_visita
            FROM clientes c
            JOIN orden o ON c.id_cliente = o.id_cliente
            WHERE c.email IS NOT NULL AND c.email != ''
            GROUP BY c.id_cliente
            HAVING DATEDIFF(NOW(), ultima_visita) = 365
        `;
        
        const [pacientes] = await pool.query(query);

        for (let paciente of pacientes) {
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: paciente.email,
                subject: 'Óptica HL - Es momento de tu revisión anual 👓',
                html: `<h3>Hola ${paciente.nombre_completo},</h3>
                       <p>Ha pasado un año desde tu última visita a Óptica HL.</p>
                       <p>La salud visual es importante. ¡Te invitamos a agendar tu examen de la vista gratuito hoy mismo!</p>`
            };

            await transporter.sendMail(mailOptions);
            console.log(`Recordatorio enviado a: ${paciente.email}`);
        }
    } catch (error) {
        console.error('Error en el Cron de Recordatorios:', error);
    }
});