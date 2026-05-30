// src/services/pac.service.js
const axios = require('axios');

/**
 * Envía el payload estructurado a la API de Facte para su timbrado.
 * @param {Object} payloadFacte - Objeto JSON con la estructura requerida por Facte.
 * @returns {Object} Respuesta con el UUID y el XML timbrado.
 */
exports.timbrarComprobante = async (payloadFacte) => {
  try {
    const response = await axios.post(
      process.env.FACTE_API_URL,
      payloadFacte,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.FACTE_API_TOKEN}`
        }
      }
    );

    // Facte suele devolver el UUID y el XML en su respuesta exitosa.
    // (Ajusta 'response.data.data' según la estructura exacta de la documentación de Facte)
    return {
      exito: true,
      uuid: response.data.uuid, 
      xml: response.data.xml_base64 // A veces lo regresan en Base64, a veces en texto plano
    };

  } catch (error) {

    let mensajeError = 'Error desconocido al conectar con Facte';
    
    if (error.response && error.response.data) {

      mensajeError = error.response.data.message || JSON.stringify(error.response.data);
    } else {
      mensajeError = error.message;
    }

    console.error('[PAC Service Error]:', mensajeError);
    
    return {
      exito: false,
      mensaje: mensajeError
    };
  }
};