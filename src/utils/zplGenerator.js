/**
 * Genera el código ZPL para la etiqueta tipo mariposa de óptica
 * @param {Object} item - Datos del artículo (codigo, marca, modelo, precio)
 * @returns {string} Código ZPL formateado para Zebra
 */
const generarZPLEtiquetaOptica = (item) => {
  return `
^XA
^PW400
^LL120
^LH0,0

; --- CÓDIGO DE BARRAS Y CÓDIGO TEXTO ---
^FO220,15^BY1,2,35
^BCN,35,N,N,N
^FD${item.codigo || ''}^FS

^FO220,55^A0N,18,18^FD${item.codigo || ''}^FS

; --- TEXTO/MARCA (Pura OHL) ---
^FO220,85^A0N,22,22^FDPura OHL^FS

^XZ
  `.trim();
};

module.exports = { generarZPLEtiquetaOptica };