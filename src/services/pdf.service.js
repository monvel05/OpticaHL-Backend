// src/services/pdf.service.js
const puppeteer = require('puppeteer');
const ejs = require('ejs');
const path = require('path');
const fs = require('fs');

/**
 * Genera un PDF a partir de una plantilla EJS y lo guarda en el servidor.
 * @param {Object} datos - Objeto con los datos de la factura (uuid, cliente, conceptos, totales).
 * @param {String} nombreArchivo - Nombre con el que se guardará el PDF (ej. FAC-12345.pdf).
 * @returns {String} URL o ruta donde se guardó el PDF.
 */
exports.generarFacturaPDF = async (datos, nombreArchivo) => {
    try {
        // 1. Ruta de la plantilla y ruta de salida
        const templatePath = path.join(__dirname, '../templates/factura.ejs');
        const outputDir = path.join(__dirname, '../../public/facturas');
        const outputPath = path.join(outputDir, nombreArchivo);

        // Crear el directorio si no existe
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // 2. Renderizar el HTML con los datos usando EJS
        const html = await ejs.renderFile(templatePath, datos);

        // 3. Lanzar Puppeteer para crear el PDF
        const browser = await puppeteer.launch({ headless: 'new' });
        const page = await browser.newPage();
        
        // Cargar el HTML en la página virtual
        await page.setContent(html, { waitUntil: 'networkidle0' });

        // Generar el PDF
        await page.pdf({
            path: outputPath,
            format: 'Letter',
            printBackground: true,
            margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' }
        });

        await browser.close();

        // 4. Retornar la URL estática (ajusta tu dominio o puerto según corresponda)
        // Asumiendo que tu servidor Express sirve la carpeta 'public' estáticamente
        return `http://localhost:3000/facturas/${nombreArchivo}`;

    } catch (error) {
        console.error('Error al generar el PDF:', error);
        throw new Error('No se pudo generar el archivo PDF de la factura');
    }
};