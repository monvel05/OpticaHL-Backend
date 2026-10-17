// src/services/correo.service.js
const nodemailer = require('nodemailer');

/**
 * Crea una instancia de transporter de nodemailer para Gmail/Google Workspace.
 */
const crearTransporter = (user, pass) => {
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
  });
};

const getCredencialesVentas = () => ({
  user: process.env.MAIL_VENTAS_USER || process.env.EMAIL_USER,
  pass: process.env.MAIL_VENTAS_PASS || process.env.EMAIL_PASS
});

const getCredencialesFacturacion = () => ({
  user: process.env.MAIL_FACTURACION_USER || process.env.EMAIL_USER,
  pass: process.env.MAIL_FACTURACION_PASS || process.env.EMAIL_PASS
});

const getCredencialesAlertas = () => ({
  user: process.env.MAIL_ALERTAS_USER || process.env.MAIL_VENTAS_USER || process.env.EMAIL_USER,
  pass: process.env.MAIL_ALERTAS_PASS || process.env.MAIL_VENTAS_PASS || process.env.EMAIL_PASS
});

const getEmailSoporteDestino = () => {
  return process.env.ADMIN_ALERTAS_EMAIL || 'soporte@opthospitaldelentes.com';
};

/**
 * 1. Envía el comprobante fiscal digital (Factura) al cliente.
 * Emisor: Correo de Facturación / Finanzas.
 */
exports.enviarFactura = async (emailDestino, nombreCliente, folioFiscal, linkPdf) => {
  const { user, pass } = getCredencialesFacturacion();

  if (!user || !pass || !emailDestino) {
    console.warn('[Correo Service] Factura omitida: Faltan credenciales de facturación o correo destino.');
    return false;
  }

  const transporter = crearTransporter(user, pass);
  if (!transporter) return false;

  const mailOptions = {
    from: `"Óptica HL - Facturación" <${user}>`,
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
          <a href="${linkPdf}" target="_blank" style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Descargar Factura PDF</a>
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="font-size: 12px; color: #64748b; text-align: center;">Gracias por tu preferencia.<br/>Óptica HL - Sistema de Facturación</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[Correo Service] Factura enviada exitosamente a ${emailDestino} desde ${user}`);
    return true;
  } catch (error) {
    console.warn(`[Correo Service Error] No se pudo enviar factura a ${emailDestino}: ${error.message}`);
    return false;
  }
};

/**
 * 2. Envía el recibo de pago / comprobante de venta estilo ticket al cliente.
 * Emisor: Correo de Ventas.
 */
exports.enviarTicketVenta = async ({ emailDestino, folioOrden, nombreCliente, orden = {}, articulos = [], pagos = [], saldoRestante = 0 }) => {
  const { user, pass } = getCredencialesVentas();

  if (!user || !pass || !emailDestino) {
    return false;
  }

  const transporter = crearTransporter(user, pass);
  if (!transporter) return false;

  let filasArticulosHTML = '';
  if (articulos.length > 0) {
    articulos.forEach((item) => {
      const cant = item.cantidad || 1;
      const prod = item.producto_nombre || 'Artículo';
      const precio = parseFloat(item.subtotal || item.precio_unitario || 0).toFixed(2);
      filasArticulosHTML += `<p style="margin: 3px 0;">${cant}x ${prod} - $${precio}</p>`;
    });
  } else {
    filasArticulosHTML = `<p style="margin: 3px 0;">Venta de Graduación / Servicio de Óptica</p>`;
  }

  let filasPagosHTML = '';
  let totalPagado = 0;
  if (pagos.length > 0) {
    pagos.forEach((pago) => {
      const montoNum = parseFloat(pago.monto || 0);
      totalPagado += montoNum;
      const fecha = new Date(pago.fecha_hora || Date.now()).toLocaleDateString();
      filasPagosHTML += `<p style="margin: 3px 0;">• ${pago.metodo_pago}: $${montoNum.toFixed(2)} (${fecha})</p>`;
    });
  } else {
    filasPagosHTML = `<p style="margin: 3px 0;">Sin pagos registrados</p>`;
  }

  const totalGeneral = parseFloat(orden.total || 0);
  const fechaEmision = new Date().toLocaleDateString();

  const mailOptions = {
    from: `"Óptica HL - Ventas" <${user}>`,
    to: emailDestino,
    subject: `Recibo de Pago - Óptica HL (Orden: ${folioOrden})`,
    html: `
      <div style="background-color: #f4f4f4; padding: 20px; font-family: 'Courier New', Courier, monospace;">
        <div style="max-width: 360px; margin: auto; background: #ffffff; padding: 20px; border: 1px solid #ddd; border-radius: 4px; text-align: center; color: #000;">
          <h2 style="margin: 0; font-size: 20px; font-weight: bold;">ÓPTICA HL</h2>
          <p style="margin: 5px 0 10px 0; font-size: 13px;">Ticket de Venta y Comprobante de Pago</p>
          <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>

          <div style="text-align: left; font-size: 12px; line-height: 1.4;">
            <p style="margin: 2px 0;"><b>Folio:</b> ${folioOrden}</p>
            <p style="margin: 2px 0;"><b>Cliente:</b> ${nombreCliente || 'Cliente General'}</p>
            <p style="margin: 2px 0;"><b>Estado:</b> ${orden.estatus || 'COMPLETADO'}</p>
            <p style="margin: 2px 0;"><b>Fecha Emisión:</b> ${fechaEmision}</p>
          </div>

          <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>

          <div style="text-align: left; font-size: 12px;">
            <p style="margin-bottom: 5px; font-weight: bold; text-decoration: underline;">DETALLE DE COMPRA:</p>
            ${filasArticulosHTML}
          </div>

          <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>

          <div style="text-align: left; font-size: 12px;">
            <p style="margin-bottom: 5px; font-weight: bold; text-decoration: underline;">FORMAS DE PAGO APLICADAS:</p>
            ${filasPagosHTML}
          </div>

          <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>

          <div style="text-align: left; font-size: 13px; font-weight: bold; line-height: 1.5;">
            <p style="margin: 2px 0;">TOTAL GENERAL: $${totalGeneral.toFixed(2)}</p>
            <p style="margin: 2px 0;">TOTAL PAGADO:  $${totalPagado.toFixed(2)}</p>
            <p style="margin: 2px 0; color: #d9534f;">SALDO PENDIENTE: $${Number(saldoRestante).toFixed(2)}</p>
          </div>

          <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>
          <p style="margin: 10px 0 0 0; font-size: 12px; font-weight: bold;">¡Gracias por su compra en Óptica HL!</p>
        </div>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[Correo Service] Ticket de venta enviado a ${emailDestino} desde ${user}`);
    return true;
  } catch (error) {
    console.warn(`[Correo Service Error] No se pudo enviar recibo a ${emailDestino}: ${error.message}`);
    return false;
  }
};

/**
 * 3. Envía reporte de usuario (Falla del sistema o Petición de función).
 * Emisor: Ventas o Finanzas (según el departamento/rol del operador logueado).
 * Destinatario: soporte@opthospitaldelentes.com
 */
exports.enviarReporteUsuario = async ({ tipo, descripcion, departamento = 'ventas', operador = {}, sucursal = '', rutaActual = '' }) => {
  const esFinanzas = String(departamento).toLowerCase().includes('finan') || String(departamento).toLowerCase().includes('factura');
  const creds = esFinanzas ? getCredencialesFacturacion() : getCredencialesVentas();

  if (!creds.user || !creds.pass) {
    // Si faltan credenciales del departamento específico, intentamos el canal de alertas o ventas
    const credsFallback = getCredencialesAlertas();
    if (credsFallback.user && credsFallback.pass) {
      creds.user = credsFallback.user;
      creds.pass = credsFallback.pass;
    }
  }

  const transporter = crearTransporter(creds.user, creds.pass);
  const destino = getEmailSoporteDestino();

  if (!transporter) {
    console.warn('[Correo Service] No hay credenciales SMTP disponibles para enviar reporte a soporte.');
    return { ok: false, error: 'Credenciales SMTP de correo no configuradas' };
  }

  const esFalla = tipo === 'falla';
  const nombreTipo = esFalla ? 'Reporte de Falla en el Sistema' : 'Petición de Nueva Función / Sugerencia';
  const colorBadge = esFalla ? '#dc2626' : '#2563eb';
  const bgBadge = esFalla ? '#fef2f2' : '#eff6ff';

  const operadorNombre = operador.nombre_completo || operador.usuario_login || 'Operador no identificado';
  const operadorRol = Array.isArray(operador.roles) ? operador.roles.join(', ') : (operador.roles || operador.rol || 'No especificado');
  const departamentoLabel = esFinanzas ? 'Finanzas / Facturación' : 'Ventas / Mostrador';

  const asunto = esFalla 
    ? `[Reporte de Falla] Óptica HL - ${operadorNombre} (${sucursal || 'General'})`
    : `[Petición de Función] Óptica HL - ${operadorNombre} (${sucursal || 'General'})`;

  const fechaHora = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });

  const mailOptions = {
    from: `"Óptica HL (${departamentoLabel})" <${creds.user}>`,
    to: destino,
    subject: asunto,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; color: #1e293b; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
        <div style="background-color: ${colorBadge}; color: white; padding: 18px 24px;">
          <h2 style="margin: 0; font-size: 20px;">Óptica HL - Mesa de Soporte y Desarrollo</h2>
          <p style="margin: 4px 0 0 0; opacity: 0.9; font-size: 13px;">Notificación enviada desde el sistema web</p>
        </div>

        <div style="padding: 24px;">
          <div style="display: inline-block; background-color: ${bgBadge}; border: 1px solid ${colorBadge}; color: ${colorBadge}; padding: 6px 14px; border-radius: 20px; font-weight: bold; font-size: 13px; margin-bottom: 16px;">
            ${esFalla ? '⚠️' : '💡'} ${nombreTipo}
          </div>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
            <tr>
              <td style="padding: 6px 0; color: #64748b; width: 140px;"><b>Operador:</b></td>
              <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${operadorNombre}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;"><b>Rol / Puesto:</b></td>
              <td style="padding: 6px 0; color: #0f172a;">${operadorRol}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;"><b>Departamento:</b></td>
              <td style="padding: 6px 0; color: #0f172a;">${departamentoLabel} (Remitente: ${creds.user})</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;"><b>Sucursal:</b></td>
              <td style="padding: 6px 0; color: #0f172a;">${sucursal || 'No especificada'}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;"><b>Pantalla / Ruta:</b></td>
              <td style="padding: 6px 0; color: #0f172a;"><code>${rutaActual || 'No especificada'}</code></td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;"><b>Fecha y Hora:</b></td>
              <td style="padding: 6px 0; color: #0f172a;">${fechaHora}</td>
            </tr>
          </table>

          <div style="background-color: #f8fafc; border-left: 4px solid ${colorBadge}; padding: 16px; border-radius: 4px; margin-top: 10px;">
            <p style="margin: 0 0 8px 0; font-weight: bold; color: #334155; font-size: 13px; text-transform: uppercase;">Descripción de la necesidad / reporte:</p>
            <p style="margin: 0; white-space: pre-wrap; font-size: 14px; line-height: 1.6; color: #1e293b;">${descripcion}</p>
          </div>
        </div>

        <div style="background-color: #f1f5f9; padding: 12px 24px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center;">
          Correo generado automáticamente por el sistema de Óptica HL hacia ${destino}
        </div>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[Correo Service] Reporte de usuario enviado a ${destino} desde ${creds.user}`);
    return { ok: true };
  } catch (error) {
    console.error(`[Correo Service Error] Error enviando reporte a ${destino}:`, error.message);
    return { ok: false, error: error.message };
  }
};

/**
 * 4. Notifica una falla interna o error 500 no controlado del sistema al equipo de soporte.
 * Emisor: Correo de Alertas / Sistema.
 * Destinatario: soporte@opthospitaldelentes.com
 */
exports.notificarFallaSistema = async ({ error, metodo, ruta, operador, body }) => {
  const creds = getCredencialesAlertas();
  const destino = getEmailSoporteDestino();

  if (!creds.user || !creds.pass) {
    console.warn('[Correo Service] Alerta de falla omitida: Faltan credenciales de alertas/sistema.');
    return false;
  }

  const transporter = crearTransporter(creds.user, creds.pass);
  if (!transporter) return false;

  const fechaHora = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
  const errorMensaje = error ? (error.message || error.toString()) : 'Error desconocido';
  const errorStack = error && error.stack ? error.stack : 'Sin traza de error disponible';

  let bodyStr = '';
  try {
    bodyStr = body ? JSON.stringify(body, null, 2) : 'N/A';
  } catch (e) {
    bodyStr = '[Error serializando body]';
  }

  const mailOptions = {
    from: `"Óptica HL - Alertas del Sistema" <${creds.user}>`,
    to: destino,
    subject: `[ALERTA AUTOMÁTICA] Falla detectada en Servidor Backend - ${ruta || 'General'}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; color: #1e293b; border: 1px solid #fee2e2; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #b91c1c; color: white; padding: 16px 20px;">
          <h2 style="margin: 0; font-size: 18px;">⚠️ Falla detectada en el Servidor (Error 500)</h2>
          <p style="margin: 4px 0 0 0; font-size: 12px;">Se ha registrado una excepción en el backend</p>
        </div>

        <div style="padding: 20px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 16px;">
            <tr>
              <td style="padding: 4px 0; color: #64748b; width: 120px;"><b>Ruta / Endpoint:</b></td>
              <td style="padding: 4px 0;"><b>${metodo || 'GET'}</b> <code>${ruta || 'N/A'}</code></td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b;"><b>Fecha y Hora:</b></td>
              <td style="padding: 4px 0;">${fechaHora}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b;"><b>Usuario / Operador:</b></td>
              <td style="padding: 4px 0;">${operador ? JSON.stringify(operador) : 'No autenticado / N/A'}</td>
            </tr>
          </table>

          <h4 style="color: #991b1b; margin: 12px 0 6px 0;">Mensaje del Error:</h4>
          <div style="background-color: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 12px; border-radius: 6px; font-weight: bold; font-size: 13px;">
            ${errorMensaje}
          </div>

          <h4 style="color: #334155; margin: 16px 0 6px 0;">Traza de Ejecución (Stack Trace):</h4>
          <pre style="background-color: #0f172a; color: #38bdf8; padding: 12px; border-radius: 6px; font-size: 11px; overflow-x: auto; max-height: 250px;">${errorStack}</pre>

          ${bodyStr !== 'N/A' ? `
            <h4 style="color: #334155; margin: 16px 0 6px 0;">Payload / Body Recibido:</h4>
            <pre style="background-color: #f1f5f9; color: #334155; padding: 10px; border-radius: 6px; font-size: 11px; overflow-x: auto; max-height: 150px;">${bodyStr}</pre>
          ` : ''}
        </div>

        <div style="background-color: #f8fafc; padding: 10px 20px; font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0;">
          Servidor Óptica HL Backend • Enviado a ${destino}
        </div>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[Correo Service] Alerta de error enviada exitosamente a ${destino}`);
    return true;
  } catch (err) {
    console.error(`[Correo Service Error] No se pudo enviar alerta de error a ${destino}:`, err.message);
    return false;
  }
};