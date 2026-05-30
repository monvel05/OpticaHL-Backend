// src/services/cfdi.service.js

const TASA_IVA = 0.16;
const FACTOR_IVA = 1 + TASA_IVA;

/**
 * Transforma los datos comerciales en el JSON fiscal para Facte (CFDI 4.0)
 */
exports.construirPayloadFacte = (orden, detalles, uso_cfdi, regimen_fiscal, nombres_personalizados = []) => {
  
  // 1. Mapeo del Receptor
  const receptor = {
    Rfc: orden.rfc,
    Nombre: orden.nombre_completo,
    UsoCFDI: uso_cfdi,
    DomicilioFiscalReceptor: orden.cp,
    RegimenFiscalReceptor: regimen_fiscal
  };

  // 2. Mapeo y cálculo matemático de los Conceptos
  const conceptos = detalles.map(item => {
    const nombreCustom = nombres_personalizados.find(n => n.id_articulo === item.id_articulo);
    const precioUnitarioSinIva = parseFloat(item.precio_unitario) / FACTOR_IVA;
    
    return {
      ClaveProdServ: "42142902", // Lentes
      ClaveUnidad: "H87", // Pieza
      Cantidad: item.cantidad,
      Descripcion: nombreCustom ? nombreCustom.nombre_factura : item.nombre,
      ValorUnitario: precioUnitarioSinIva,
      Importe: precioUnitarioSinIva * item.cantidad,
      ObjetoImp: "02", // 02 = Sí objeto de impuesto (Regla CFDI 4.0)
      Impuestos: {
        Traslados: [{
          Base: precioUnitarioSinIva * item.cantidad,
          Impuesto: "002", // 002 = IVA
          TipoFactor: "Tasa",
          TasaOCuota: "0.160000",
          Importe: (precioUnitarioSinIva * item.cantidad) * TASA_IVA
        }]
      }
    };
  });

  // Retornamos la estructura final que espera el PAC
  return {
    Version: "4.0",
    Receptor: receptor,
    Conceptos: conceptos
  };
};