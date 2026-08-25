/*
 * parserSellOutClientes.js
 * Parser del detalle de Sell-Out por Cliente Final que cada distribuidor
 * envía periódicamente (mensual/trimestral...), a petición de Sergio.
 *
 * A diferencia de parserVentasReales.js (que trae TODOS los distribuidores
 * juntos, agregado por Familia/Subfamilia) y de parserLiquidacion.js (que lee
 * celdas en posiciones FIJAS de una plantilla conocida), este archivo:
 *
 *  - Es SIEMPRE de UN distribuidor concreto (el usuario lo elige a mano al
 *    importar, ver ImportarSellOutClientes.js) — el archivo no dice a qué
 *    distribuidor pertenece.
 *  - Baja al detalle de CLIENTE FINAL: cada línea es una combinación
 *    cliente/producto/albarán, no un agregado mensual.
 *  - Cada distribuidor manda su propio formato, con sus propias columnas y
 *    terminología (confirmado por Sergio: "cada distribuidor despacha de
 *    forma diferente"), y a menudo en un libro Excel con VARIAS hojas (p.ej.
 *    el primer archivo real, de Miguel Merino, trae "Resumen", "Sheet1"
 *    (el detalle real, 1169 líneas) y "TD" (una tabla dinámica de apoyo).
 *    Por eso este parser NO asume que la hoja correcta se llama de una forma
 *    concreta ni que está en una posición fija: prueba TODAS las hojas del
 *    libro con la misma lógica de detección de cabecera por alias que ya usa
 *    parserVentasReales.js, y se queda con la hoja que consiga extraer MÁS
 *    filas de detalle válidas (cliente + producto reconocidos). Es una
 *    heurística sencilla pero robusta: una hoja resumen/pivote (tipo
 *    "Resumen" o "TD") nunca tiene tantas filas de detalle real como la hoja
 *    de líneas, así que gana siempre la hoja correcta sin tener que saber su
 *    nombre de antemano — importante porque el nombre de hoja variará de
 *    distribuidor a distribuidor.
 *
 * Columnas reconocidas (alias flexibles, ampliar aquí si un distribuidor
 * nuevo usa nombres distintos a los previstos):
 *  - cliente (obligatoria), cod_cliente, nif
 *  - tipologia, grupo, comercial, preventista, albaran
 *  - fecha (si no está, el importador pedirá el mes/año a mano, como en
 *    ImportarVentasReales.js)
 *  - producto (obligatoria)
 *  - uds ventas / promo / regalos / totales
 *  - dtos1 / dtos2 (importes de descuento, en bruto, sin combinarlos: a
 *    petición de Sergio, en esta primera versión NO se calcula un "importe
 *    neto" — el KPI relevante es unidades, no dinero)
 *  - coste / precio unitario
 *
 * IMPORTANTE: igual que el resto de parsers de la app, esta función NO toca
 * Firebase ni resuelve IDs de cliente/marca — eso lo hace
 * ImportarSellOutClientes.js, que sí conoce los clientes y marcas ya
 * existentes.
 */

import * as XLSX from 'xlsx';

const quitarAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const normalizarCabecera = (s) => quitarAcentos(s).toUpperCase().trim();
const limpio = (v) => (typeof v === 'string' ? v.trim() : v);
const esVacio = (v) => v === null || v === undefined || String(v).trim() === '';

// Alias reconocidos para cada columna (se comprueba si la cabecera CONTIENE
// alguno de estos textos, ya normalizada sin acentos y en mayúsculas). El
// orden de comprobación importa cuando un alias es substring de otro (p.ej.
// "COD. CLIENTE" contiene "CLIENTE"), por eso se resuelve con detectarColumna.
const ALIAS_COLUMNAS = {
  // "distribuidor": solo aparece en archivos que traen VARIOS distribuidores
  // mezclados (p.ej. el Excel "Unesdi_Ventas" que junta MANUEL VEGA S.L. y
  // VEGA Y GIJON S.L. en el mismo archivo, columna EMPRESA) — cuando no
  // existe esta columna, el archivo es de un solo distribuidor y lo elige el
  // usuario a mano (ver ImportarSellOutClientes.js).
  distribuidor: ['EMPRESA', 'DISTRIBUIDOR'],
  cod_cliente: ['COD. CLIENTE', 'COD CLIENTE', 'CODIGO CLIENTE', 'CODCLIENTE', 'COD.CLIENTE', 'Nº CLIENTE', 'N CLIENTE', 'NUMERO CLIENTE'],
  nif: ['NIF/CIF', 'NIF', 'CIF'],
  cliente: ['CLIENTE', 'RAZON SOCIAL', 'NOMBRE CLIENTE'],
  // OJO: "TIPO CLIENTE" es más específico y granular que "CANAL" (algunos
  // archivos traen ambas columnas a la vez, p.ej. "Canal Venta" +
  // "Tipo Cliente") — no se incluye un alias "CANAL" suelto aquí a propósito,
  // para que en esos archivos gane siempre "Tipo Cliente" (más informativo,
  // más parecido a la Tipología que ya usa Miguel Merino) y no la columna de
  // canal, más genérica.
  tipologia: ['TIPOLOGIA', 'TIPO DE CLIENTE', 'TIPO CLIENTE'],
  grupo: ['GRUPO', 'CADENA'],
  comercial: ['C. CIAL', 'C.CIAL', 'COD COMERCIAL', 'COMERCIAL'],
  preventista: ['PREVENTISTA', 'VENDEDOR'],
  albaran: ['ALBARAN', 'ALBARÁN', 'Nº ALBARAN', 'Nº FRA', 'FACTURA'],
  fecha: ['FECHA'],
  // OJO: NO se incluye "REFERENCIA" aquí a propósito — en algún archivo
  // (p.ej. "Unesdi_Ventas") "Referencia" es el CÓDIGO numérico del producto y
  // "Artículo" es su nombre; si "Referencia" contara como alias de producto,
  // al estar antes en la hoja se quedaría con el nombre del campo y
  // "Artículo" (el nombre real, que es lo que necesitamos para cruzar con
  // Marcas) se ignoraría.
  producto: ['NOM.G.ART', 'NOM G ART', 'PRODUCTO', 'ARTICULO', 'DESCRIPCION ARTICULO'],
  ventas: ['VENTAS'],
  promo: ['PROMO'],
  regalos: ['REGALOS', 'REGALO'],
  totales: ['TOTALES', 'TOTAL UDS', 'UDS TOTALES', 'UNIDADES'],
  dtos1: ['TOTAL DTOS1', 'DTOS1', 'DTO1', 'DESCUENTO 1'],
  dtos2: ['TOTAL DTOS2', 'DTOS2', 'DTO2', 'DESCUENTO 2'],
  coste: ['COSTE'],
  precio: ['ULTCOMPALB', 'ULT COMP ALB', 'PRECIO VENTA', 'PVP', 'PRECIO', 'TARIFA']
};

// Orden en el que se comprueban los alias por celda: los más específicos
// primero, para que "COD. CLIENTE" no se cuele como "CLIENTE" ni "TOTAL
// DTOS1" como "TOTALES".
const ORDEN_DETECCION = [
  'distribuidor', 'cod_cliente', 'nif', 'cliente', 'tipologia', 'grupo',
  'comercial', 'preventista', 'albaran', 'fecha', 'producto',
  'dtos1', 'dtos2', 'promo', 'regalos', 'totales', 'ventas',
  'coste', 'precio'
];

function detectarColumna(cabeceraNormalizada) {
  if (!cabeceraNormalizada) return null;
  for (const col of ORDEN_DETECCION) {
    if (ALIAS_COLUMNAS[col].some(a => cabeceraNormalizada.includes(a))) return col;
  }
  return null;
}

// Convierte un valor de celda a número, admitiendo "1234.56", "1.234,56"
// (formato español) y celdas ya numéricas nativas de Excel.
function numSeguro(valor) {
  if (typeof valor === 'number') return isNaN(valor) ? 0 : valor;
  if (valor === null || valor === undefined || valor === '') return 0;
  let s = String(valor).trim();
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',') && !s.includes('.')) {
    s = s.replace(',', '.');
  }
  s = s.replace(/[€\s]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

const pad2 = (n) => String(n).padStart(2, '0');

// Convierte una celda de fecha (Date nativo si el workbook se leyó con
// {cellDates:true}, número de serie de Excel si no, o texto DD/MM/AAAA o
// AAAA-MM-DD) a 'YYYY-MM-DD'. Devuelve null si no se reconoce.
function parsearFecha(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (valor instanceof Date && !isNaN(valor.getTime())) {
    return `${valor.getFullYear()}-${pad2(valor.getMonth() + 1)}-${pad2(valor.getDate())}`;
  }
  if (typeof valor === 'number') {
    // Número de serie de Excel (días desde 1899-12-30), cálculo manual.
    const ms = (valor - 25569) * 86400 * 1000;
    const d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  }
  const s = String(valor).trim();
  let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/); // DD/MM/AAAA o DD-MM-AAAA
  if (m) return `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`;
  m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/); // AAAA-MM-DD
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  return null;
}

// Analiza UNA hoja y devuelve { filas, mapaColumnas, avisos } — no decide
// todavía si es la hoja "buena": eso lo hace parseSellOutClientes probando
// todas las hojas y quedándose con la de más filas.
function parsearHoja(ws) {
  const filasCrudas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false });

  let indiceCabecera = -1;
  let mejorNumeroColumnas = 0;
  let mapaColumnasElegido = null;

  for (let i = 0; i < Math.min(15, filasCrudas.length); i++) {
    const fila = filasCrudas[i];
    const mapaColumnas = {};
    fila.forEach((celda, idx) => {
      const col = detectarColumna(normalizarCabecera(celda));
      if (col && mapaColumnas[col] === undefined) mapaColumnas[col] = idx;
    });
    const numColumnas = Object.keys(mapaColumnas).length;
    if (numColumnas > mejorNumeroColumnas) {
      mejorNumeroColumnas = numColumnas;
      indiceCabecera = i;
      mapaColumnasElegido = mapaColumnas;
    }
  }

  // Mínimo imprescindible para considerar esta hoja como candidata a "hoja
  // de detalle": tiene que reconocer cliente Y producto. Sin esto, una hoja
  // resumen/pivote (que puede compartir alguna columna suelta, p.ej.
  // "Regalos" o "Nom.G.Art.") queda descartada.
  if (indiceCabecera === -1 || !mapaColumnasElegido.cliente || !mapaColumnasElegido.producto) {
    return { filas: [], mapaColumnas: null };
  }

  const filas = [];
  for (let i = indiceCabecera + 1; i < filasCrudas.length; i++) {
    const filaCruda = filasCrudas[i];
    if (!filaCruda || filaCruda.every(esVacio)) continue;

    const get = (col) => (mapaColumnasElegido[col] !== undefined ? limpio(filaCruda[mapaColumnasElegido[col]]) : '');

    const cliente = get('cliente');
    const producto = get('producto');
    if (esVacio(cliente) || esVacio(producto)) continue; // fila de subtotal/cabecera de grupo, no es un dato real
    if (normalizarCabecera(cliente).includes('TOTAL GENERAL')) continue;

    let ventas = numSeguro(get('ventas'));
    const promo = numSeguro(get('promo'));
    const regalos = numSeguro(get('regalos'));
    let totales = numSeguro(get('totales'));
    // Si el archivo no trae una columna "Totales" propia, se calcula como
    // ventas+promo+regalos (los que sí estén disponibles).
    if (mapaColumnasElegido.totales === undefined) totales = ventas + promo + regalos;
    // Y al revés: si el archivo solo trae una columna de unidades total (sin
    // desglose Ventas/Promo/Regalos, p.ej. "Unesdi_Ventas"), esas unidades se
    // guardan también como "ventas" para no perder el dato en ese campo.
    if (mapaColumnasElegido.ventas === undefined && mapaColumnasElegido.totales !== undefined) ventas = totales;

    const fechaCelda = get('fecha');
    const fecha = mapaColumnasElegido.fecha !== undefined ? parsearFecha(fechaCelda) : null;

    filas.push({
      distribuidor: mapaColumnasElegido.distribuidor !== undefined ? String(get('distribuidor')).trim() : '',
      cliente: String(cliente).trim(),
      cod_cliente: mapaColumnasElegido.cod_cliente !== undefined ? String(get('cod_cliente')).trim() : '',
      nif: mapaColumnasElegido.nif !== undefined ? String(get('nif')).trim() : '',
      tipologia: mapaColumnasElegido.tipologia !== undefined ? String(get('tipologia')).trim() : '',
      grupo: mapaColumnasElegido.grupo !== undefined ? String(get('grupo')).trim() : '',
      comercial: mapaColumnasElegido.comercial !== undefined ? String(get('comercial')).trim() : '',
      preventista: mapaColumnasElegido.preventista !== undefined ? String(get('preventista')).trim() : '',
      albaran: mapaColumnasElegido.albaran !== undefined ? String(get('albaran')).trim() : '',
      fecha,
      mesAno: fecha ? fecha.slice(0, 7) : null,
      producto: String(producto).trim(),
      ventas,
      promo,
      regalos,
      totales,
      dtos1: numSeguro(get('dtos1')),
      dtos2: numSeguro(get('dtos2')),
      coste: numSeguro(get('coste')),
      precio: numSeguro(get('precio'))
    });
  }

  return { filas, mapaColumnas: mapaColumnasElegido };
}

/**
 * Parsea el workbook completo (todas las hojas) y devuelve las filas de
 * detalle de la hoja que más filas válidas produjo, + avisos.
 */
export function parseSellOutClientes(workbook) {
  const avisos = [];
  let mejorHoja = null;
  let mejorResultado = { filas: [], mapaColumnas: null };

  for (const nombreHoja of workbook.SheetNames) {
    const ws = workbook.Sheets[nombreHoja];
    if (!ws) continue;
    const resultado = parsearHoja(ws);
    if (resultado.filas.length > mejorResultado.filas.length) {
      mejorResultado = resultado;
      mejorHoja = nombreHoja;
    }
  }

  if (!mejorHoja || mejorResultado.filas.length === 0) {
    return {
      filas: [],
      avisos: [
        'No se ha encontrado ninguna hoja con columnas reconocibles de Cliente y Producto en este archivo. ' +
        'Revisa que el Excel tenga esas columnas (con esos nombres u otros parecidos) o dime cómo se llaman ' +
        'exactamente para ampliar el importador.'
      ],
      hojaLeida: null
    };
  }

  const mapa = mejorResultado.mapaColumnas;
  if (!mapa.cod_cliente) {
    avisos.push('No se ha encontrado columna de código de cliente — la reconciliación de clientes se hará por nombre (menos fiable entre importaciones sucesivas).');
  }
  if (!mapa.fecha) {
    avisos.push('No se ha encontrado columna de Fecha — tendrás que indicar a mano a qué mes/año pertenecen estos datos.');
  }
  if (mapa.totales === undefined && (mapa.ventas === undefined && mapa.promo === undefined && mapa.regalos === undefined)) {
    avisos.push('No se ha encontrado ninguna columna de unidades (Ventas/Promo/Regalos/Totales) — revisa el archivo.');
  }

  const sinFecha = mapa.fecha !== undefined ? mejorResultado.filas.filter(f => !f.fecha).length : 0;
  if (sinFecha > 0) {
    avisos.push(`${sinFecha} fila(s) tenían una Fecha no reconocida y se han dejado sin fecha (habrá que asignarles el mes a mano).`);
  }

  return { filas: mejorResultado.filas, avisos, hojaLeida: mejorHoja };
}
