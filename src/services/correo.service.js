// src/services/correo.service.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail', 
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/**
 * Envía el comprobante fiscal al cliente.
 */
exports.enviarFactura = async (emailDestino, nombreCliente, folioFiscal, linkPdf) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: emailDestino,
    subject: `Tu Factura Electrónica - Óptica HL (Folio: ${folioFiscal})`,
    html: `
      <h3>Hola ${nombreCliente},</h3>
      <p>Adjuntamos tu comprobante fiscal digital correspondiente a tu compra en Óptica HL.</p>
      <p>Folio Fiscal (UUID): <b>${folioFiscal}</b></p>
      <p>Puedes descargar tu PDF aquí: <a href="${linkPdf}">Descargar Factura</a></p>
      <p>Gracias por tu preferencia.</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[Correo Service] Factura enviada exitosamente a ${emailDestino}`);
    return true;
  } catch (error) {
    console.error('[Correo Service] Error al enviar correo:', error);
    return false; // Retornamos false para no romper el flujo principal si el correo falla
  }
};