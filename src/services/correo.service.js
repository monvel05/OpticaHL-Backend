// src/services/correo.service.js
const nodemailer = require('nodemailer');

/**
 * Envía el comprobante fiscal al cliente por correo electrónico.
 * Si las credenciales SMTP no son válidas o están ausentes, registra una advertencia limpia
 * y no interrumpe la experiencia del usuario.
 */
exports.enviarFactura = async (emailDestino, nombreCliente, folioFiscal, linkPdf) => {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!user || !pass || !emailDestino) {
    return false;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail', 
    auth: {
      user: user,
      pass: pass
    }
  });

  const mailOptions = {
    from: `"Óptica HL" <${user}>`,
    to: emailDestino,
    subject: `Tu Factura Electrónica - Óptica HL (Folio: ${folioFiscal})`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px;">
        <h2 style="color: #1e3a8a; margin-top: 0;">¡Hola ${nombreCliente}!</h2>
        <p>Adjuntamos el comprobante fiscal digital correspondiente a tu compra en <b>Óptica HL</b>.</p>
        <div style="background-color: #f8fafc; padding: 12px; border-left: 4px solid #3b82f6; margin: 15px 0;">
          <p style="margin: 0;"><b>Folio Fiscal (UUID):</b> ${folioFiscal}</p>
        </div>
        <p>Puedes ver y descargar tu factura en formato PDF haciendo clic en el siguiente enlace:</p>
        <p style="text-align: center; margin: 25px 0;">
          <a href="${linkPdf}" target="_blank" style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold;">Descargar Factura PDF</a>
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="font-size: 12px; color: #64748b; text-align: center;">Gracias por tu preferencia.<br/>Óptica HL - Sistema de Facturación</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[Correo Service] Factura enviada exitosamente a ${emailDestino}`);
    return true;
  } catch (error) {
    if (error.code === 'EAUTH' || error.responseCode === 535) {
      console.warn(`[Correo Service Notice] Google SMTP rechazó las credenciales de ${user}. Si usas Gmail/Google Workspace, necesitas generar una 'Contraseña de Aplicación' de 16 caracteres en https://myaccount.google.com/apppasswords`);
    } else {
      console.warn(`[Correo Service Notice] No se pudo enviar correo a ${emailDestino}: ${error.message}`);
    }
    return false;
  }
};