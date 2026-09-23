
/**
 * Convierte un objeto de datos de la orden en la cadena infocfdi requerida por FACTE
 * @param {Object} datos - JSON validado proveniente del controlador
 * @returns {String} Cadena separada por $
 */
const construirInfoCfdi = (datos) => {
    // Validar si es una Factura Global (Público en General)
    const esFacturaGlobal = datos.cliente.rfc === 'XAXX010101000';

    // 1. Construir la cabecera base
    const cabecera = [
        `Serie=${datos.serie}`,
        `Folio=${datos.folio}`,
        `Fecha=${datos.fecha}`, // Formato YYYY-MM-DD
        `FormaPago=${datos.formaPago}`, // ej. 03
        `CondicionesDePago=${datos.condiciones || ''}`,
        `SubTotal=${parseFloat(datos.subTotal).toFixed(2)}`,
        `Descuento=${parseFloat(datos.descuento).toFixed(2)}`,
        `Moneda=${datos.moneda || 'MXN'}`,
        `TipoCambio=${datos.tipoCambio || '1.0000'}`,
        `Total=${parseFloat(datos.total).toFixed(2)}`,
        `TipoDeComprobante=${datos.tipoComprobante || 'I'}`,
        `MetodoPago=${datos.metodoPago || 'PUE'}`,
        `Confirmacion=`,
        `LeyendasFiscales=`,
        `pagare=No`,
        `UsoCFDI=${datos.usoCfdi}`,
        `exportacion=${datos.exportacion || '01'}` // Nuevo CFDI 4.0
    ];

    // 1.5 Agregar nodos de CFDI Global SOLO si aplica según el RFC[cite: 4]
    if (esFacturaGlobal) {
        cabecera.push(`meses=01`);
        cabecera.push(`periodicidad=01`);
        cabecera.push(`ano=${new Date().getFullYear()}`);
    }

    // Filtro de seguridad: FACTE prohíbe estrictamente " ° ' en nombres y descripciones[cite: 4]
    const nombreSano = (datos.cliente.nombre || '').replace(/["'°]/g, '');

    // 2. Datos del Receptor
    const receptor = [
        `rfc_receptor=${datos.cliente.rfc}`,
        `nombre_receptor=${nombreSano}`, 
        `calle_receptor=${datos.cliente.calle || ''}`,
        `no_calle_receptor=${datos.cliente.noExterior || ''}`,
        `no_calle_int_receptor=${datos.cliente.noInterior || ''}`,
        `colonia_receptor=${datos.cliente.colonia || ''}`,
        `ciudad_receptor=${datos.cliente.ciudad || ''}`,
        `estado_receptor=${datos.cliente.estado || ''}`,
        `pais_receptor=Mexico`,
        `cp_receptor=${datos.cliente.cp}`, // Requerido en v4.0[cite: 4]
        `RegimenFiscal_receptor=${datos.cliente.regimenFiscal}`, // Nuevo CFDI 4.0[cite: 4]
        `nota_totales1=`,
        `nota_totales2=`,
        `nota_general=Factura generada por Sistema OpticaHL`,
        `cant_conceptos=${datos.conceptos.length}`
    ];

    // 3. Construir los conceptos separados por |
    const conceptosString = datos.conceptos.map((c, index) => {
        const descSana = (c.descripcion || '').replace(/["'°]/g, '');

        const partesConcepto = [
            c.objImp || '02', // Objeto de Impuesto (Nuevo)[cite: 4]
            c.claveProdServ,
            c.noIdentificacion,
            parseFloat(c.cantidad).toFixed(4),
            c.claveUnidad,
            descSana,
            parseFloat(c.valorUnitario).toFixed(4),
            parseFloat(c.descuento).toFixed(2),
            c.tipoFactorDesc || '0',
            c.tasaCuotaDesc || '0.0000',
            c.tipoFactorIva || '1', 
            c.tasaCuotaIva || '0.1600',
            c.tipoFactorRetIva || '0', 
            c.tasaCuotaRetIva || '0.0000',
            c.tipoFactorRetIsr || '0',
            c.tasaCuotaRetIsr || '0.0000',
            c.tipoFactorIeps || '0',
            c.tasaCuotaIeps || '0.0000',
            c.especialIeps || '0',
            c.causaIva || '0',
            c.tipoFactorRetIeps || '0',
            c.tasaCuotaRetIeps || '0.0000',
            c.cuentaPredial || ''
        ];
        
        // Unir con pipe | y agregar el formato conceptoX=[cite: 4]
        return `concepto${index + 1}=${partesConcepto.join('|')}|`; 
    });

    // 4. Campos finales opcionales
    const pie = [
        `carta_porte=`,
        `email=${datos.cliente.email || ''}`,
        `suc_fiscal=`,
        `docs_relacionados=`
    ];

    // 5. Concatenar todo separando con $[cite: 4]
    const infocfdi = [...cabecera, ...receptor, ...conceptosString, ...pie].join('$');
    
    return `$${infocfdi}`;
};

module.exports = {
    construirInfoCfdi
};