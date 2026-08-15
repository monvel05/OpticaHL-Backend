// src/services/pdf.service.js
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

/**
 * Genera un PDF ultrarrápido con PDFKit (en milisegundos) y lo guarda en el servidor.
 * @param {Object} datos - Objeto con los datos de la factura (uuid, cliente, conceptos, totales).
 * @param {String} nombreArchivo - Nombre con el que se guardará el PDF (ej. FAC-12345.pdf).
 * @returns {Promise<String>} URL estática donde se guardó el PDF.
 */
exports.generarFacturaPDF = (datos, nombreArchivo) => {
  return new Promise((resolve, reject) => {
    try {
      const outputDir = path.join(__dirname, '../../public/facturas');
      const outputPath = path.join(outputDir, nombreArchivo);

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const doc = new PDFDocument({ margin: 36, size: 'LETTER' });
      const writeStream = fs.createWriteStream(outputPath);

      doc.pipe(writeStream);

      const primaryColor = '#1e3a8a';
      const textColor = '#1f2937';
      const lightBg = '#f3f4f6';

      // 1. Encabezado de la Empresa
      doc.fillColor(primaryColor).fontSize(20).text('ÓPTICA HL S.A. DE C.V.', { align: 'left' });
      doc.fontSize(9).fillColor('#4b5563').text('RFC: OHL900101XYZ | Régimen Fiscal: 601 General de Ley Personas Morales');
      doc.text('Lugar de Expedición: 20000 | Comprobante Fiscal Digital CFDI 4.0');
      doc.moveDown(0.5);

      // 2. Folio y UUID
      doc.fillColor(primaryColor).fontSize(14).text(`FACTURA ELECTRÓNICA: ${datos.num_factura || datos.serie}`, { align: 'right' });
      doc.fontSize(9).fillColor(textColor).text(`Folio Fiscal (UUID): ${datos.uuid || 'N/A'}`, { align: 'right' });
      doc.text(`Fecha: ${datos.fecha || new Date().toLocaleDateString('es-MX')} | Serie: ${datos.serie || 'FAC'}`, { align: 'right' });

      doc.moveDown(1);
      doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(36, doc.y).lineTo(576, doc.y).stroke();
      doc.moveDown(0.5);

      // 3. Receptor (Cliente)
      doc.fillColor(primaryColor).fontSize(11).text('DATOS DEL RECEPTOR:', { underline: true });
      doc.fontSize(9).fillColor(textColor);
      doc.text(`Razón Social / Nombre: ${datos.cliente?.nombre || 'PUBLICO EN GENERAL'}`);
      doc.text(`RFC: ${datos.cliente?.rfc || 'XAXX010101000'} | C.P.: ${datos.cliente?.cp || '20000'}`);
      doc.text(`Uso CFDI: ${datos.cliente?.uso_cfdi || 'G01'} | Régimen Fiscal: ${datos.cliente?.regimen || '616'}`);
      if (datos.cliente?.domicilio) {
        doc.text(`Domicilio: ${datos.cliente.domicilio}`);
      }

      doc.moveDown(1);

      // 4. Tabla de Conceptos
      const tableTop = doc.y;
      doc.rect(36, tableTop, 540, 18).fill(primaryColor);
      doc.fillColor('#ffffff').fontSize(9).text('Cant.', 42, tableTop + 4);
      doc.text('Descripción', 90, tableTop + 4);
      doc.text('P. Unitario', 430, tableTop + 4, { width: 60, align: 'right' });
      doc.text('Importe', 500, tableTop + 4, { width: 70, align: 'right' });

      let yPos = tableTop + 22;
      doc.fillColor(textColor);

      const conceptosList = Array.isArray(datos.conceptos) ? datos.conceptos : [];
      conceptosList.forEach((c, i) => {
        if (i % 2 === 1) {
          doc.rect(36, yPos - 2, 540, 16).fill(lightBg);
          doc.fillColor(textColor);
        }
        doc.text(String(c.cantidad || 1), 42, yPos);
        doc.text(c.descripcion || 'Concepto', 90, yPos, { width: 330 });
        doc.text(`$${parseFloat(c.precio_unitario || 0).toFixed(2)}`, 430, yPos, { width: 60, align: 'right' });
        doc.text(`$${parseFloat(c.importe || 0).toFixed(2)}`, 500, yPos, { width: 70, align: 'right' });
        yPos += 18;
      });

      doc.moveDown(1);
      doc.y = yPos + 10;
      doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(36, doc.y).lineTo(576, doc.y).stroke();
      doc.moveDown(0.5);

      // 5. Totales
      const totalesY = doc.y;
      const subtotalVal = parseFloat(datos.totales?.subtotal || 0).toFixed(2);
      const descuentoVal = parseFloat(datos.totales?.descuento || 0).toFixed(2);
      const ivaVal = parseFloat(datos.totales?.iva || 0).toFixed(2);
      const totalVal = parseFloat(datos.totales?.total || 0).toFixed(2);

      doc.fontSize(9).fillColor(textColor);
      doc.text(`Subtotal: $${subtotalVal}`, 400, totalesY, { align: 'right' });
      doc.text(`Descuento: $${descuentoVal}`, 400, totalesY + 14, { align: 'right' });
      doc.text(`IVA (16%): $${ivaVal}`, 400, totalesY + 28, { align: 'right' });
      doc.fontSize(11).fillColor(primaryColor).text(`TOTAL: $${totalVal}`, 400, totalesY + 44, { align: 'right' });

      doc.end();

      writeStream.on('finish', () => {
        resolve(`http://localhost:3000/facturas/${nombreArchivo}`);
      });

      writeStream.on('error', (err) => {
        console.error('Error al generar PDF con PDFKit:', err);
        reject(err);
      });

    } catch (error) {
      console.error('Error al generar el PDF con PDFKit:', error);
      reject(error);
    }
  });
};