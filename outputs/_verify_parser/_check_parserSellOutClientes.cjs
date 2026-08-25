"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.parseSellOutClientes = parseSellOutClientes;
var XLSX = _interopRequireWildcard(require("xlsx"));
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
const quitarAcentos = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const normalizarCabecera = s => quitarAcentos(s).toUpperCase().trim();
const limpio = v => typeof v === 'string' ? v.trim() : v;
const esVacio = v => v === null || v === undefined || String(v).trim() === '';
const ALIAS_COLUMNAS = {
  distribuidor: ['EMPRESA', 'DISTRIBUIDOR'],
  cod_cliente: ['COD. CLIENTE', 'COD CLIENTE', 'CODIGO CLIENTE', 'CODCLIENTE', 'COD.CLIENTE', 'Nº CLIENTE', 'N CLIENTE', 'NUMERO CLIENTE'],
  nif: ['NIF/CIF', 'NIF', 'CIF'],
  cliente: ['CLIENTE', 'RAZON SOCIAL', 'NOMBRE CLIENTE'],
  cliente_comercial: ['CLIENTE - COMERCIO', 'CLIENTE COMERCIO', 'NOMBRE COMERCIAL', 'NOMBRE COMERCIO'],
  tipologia: ['TIPOLOGIA', 'TIPO DE CLIENTE', 'TIPO CLIENTE'],
  grupo: ['GRUPO', 'CADENA'],
  comercial: ['C. CIAL', 'C.CIAL', 'COD COMERCIAL', 'COMERCIAL', 'ZONA'],
  preventista: ['PREVENTISTA', 'VENDEDOR'],
  albaran: ['ALBARAN', 'ALBARÁN', 'Nº ALBARAN', 'Nº FRA', 'FACTURA'],
  fecha: ['FECHA'],
  producto: ['NOM.G.ART', 'NOM G ART', 'PRODUCTO', 'ARTICULO', 'DESCRIPCION ARTICULO'],
  ventas: ['VENTAS'],
  promo: ['PROMO'],
  regalos: ['REGALOS', 'REGALO'],
  totales: ['TOTALES', 'TOTAL UDS', 'UDS TOTALES', 'UNIDADES'],
  dtos1: ['TOTAL DTOS1', 'DTOS1', 'DTO1', 'DESCUENTO 1'],
  dtos2: ['TOTAL DTOS2', 'DTOS2', 'DTO2', 'DESCUENTO 2'],
  coste: ['COSTE'],
  precio: ['ULTCOMPALB', 'ULT COMP ALB', 'PRECIO VENTA', 'PVP', 'PRECIO', 'TARIFA'],
  facturacion: ['NETO', 'IMPORTE NETO', 'FACTURACION', 'FACTURACIÓN', 'IMPORTE']
};
const ORDEN_DETECCION = ['distribuidor', 'cod_cliente', 'nif', 'cliente', 'cliente_comercial', 'tipologia', 'grupo', 'comercial', 'preventista', 'albaran', 'fecha', 'producto', 'dtos1', 'dtos2', 'promo', 'regalos', 'totales', 'ventas', 'coste', 'precio', 'facturacion'];
function detectarColumna(cabeceraNormalizada) {
  if (!cabeceraNormalizada) return null;
  let mejorCategoria = null;
  let mejorLongitud = 0;
  let mejorPrioridad = Infinity;
  ORDEN_DETECCION.forEach((categoria, prioridad) => {
    ALIAS_COLUMNAS[categoria].forEach(alias => {
      if (!cabeceraNormalizada.includes(alias)) return;
      const masEspecifico = alias.length > mejorLongitud || alias.length === mejorLongitud && prioridad < mejorPrioridad;
      if (masEspecifico) {
        mejorCategoria = categoria;
        mejorLongitud = alias.length;
        mejorPrioridad = prioridad;
      }
    });
  });
  return mejorCategoria;
}
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
const pad2 = n => String(n).padStart(2, '0');
function parsearFecha(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (valor instanceof Date && !isNaN(valor.getTime())) {
    return "".concat(valor.getFullYear(), "-").concat(pad2(valor.getMonth() + 1), "-").concat(pad2(valor.getDate()));
  }
  if (typeof valor === 'number') {
    const ms = (valor - 25569) * 86400 * 1000;
    const d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    return "".concat(d.getUTCFullYear(), "-").concat(pad2(d.getUTCMonth() + 1), "-").concat(pad2(d.getUTCDate()));
  }
  const s = String(valor).trim();
  let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return "".concat(m[3], "-").concat(pad2(m[2]), "-").concat(pad2(m[1]));
  m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (m) return "".concat(m[1], "-").concat(pad2(m[2]), "-").concat(pad2(m[3]));
  return null;
}
function parsearHoja(ws) {
  const filasCrudas = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: '',
    blankrows: false
  });
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
  if (indiceCabecera === -1 || mapaColumnasElegido.cliente === undefined || mapaColumnasElegido.producto === undefined) {
    return {
      filas: [],
      mapaColumnas: null
    };
  }
  const filas = [];
  for (let i = indiceCabecera + 1; i < filasCrudas.length; i++) {
    const filaCruda = filasCrudas[i];
    if (!filaCruda || filaCruda.every(esVacio)) continue;
    const get = col => mapaColumnasElegido[col] !== undefined ? limpio(filaCruda[mapaColumnasElegido[col]]) : '';
    const cliente = get('cliente');
    const clienteComercial = mapaColumnasElegido.cliente_comercial !== undefined ? get('cliente_comercial') : '';
    const nombreClienteMostrado = !esVacio(clienteComercial) ? clienteComercial : cliente;
    const producto = get('producto');
    if (esVacio(cliente) || esVacio(producto)) continue;
    if (normalizarCabecera(cliente).includes('TOTAL GENERAL')) continue;
    let ventas = numSeguro(get('ventas'));
    const promo = numSeguro(get('promo'));
    const regalos = numSeguro(get('regalos'));
    let totales = numSeguro(get('totales'));
    if (mapaColumnasElegido.totales === undefined) totales = ventas + promo + regalos;
    if (mapaColumnasElegido.ventas === undefined && mapaColumnasElegido.totales !== undefined) ventas = totales;
    const fechaCelda = get('fecha');
    const fecha = mapaColumnasElegido.fecha !== undefined ? parsearFecha(fechaCelda) : null;
    filas.push({
      distribuidor: mapaColumnasElegido.distribuidor !== undefined ? String(get('distribuidor')).trim() : '',
      cliente: String(nombreClienteMostrado).trim(),
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
      precio: numSeguro(get('precio')),
      facturacion: numSeguro(get('facturacion'))
    });
  }
  return {
    filas,
    mapaColumnas: mapaColumnasElegido
  };
}
function parseSellOutClientes(workbook) {
  const avisos = [];
  let mejorHoja = null;
  let mejorResultado = {
    filas: [],
    mapaColumnas: null
  };
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
      avisos: ['No se ha encontrado ninguna hoja con columnas reconocibles de Cliente y Producto en este archivo. ' + 'Revisa que el Excel tenga esas columnas (con esos nombres u otros parecidos) o dime cómo se llaman ' + 'exactamente para ampliar el importador.'],
      hojaLeida: null
    };
  }
  const mapa = mejorResultado.mapaColumnas;
  if (mapa.cod_cliente === undefined) {
    avisos.push('No se ha encontrado columna de código de cliente — la reconciliación de clientes se hará por nombre (menos fiable entre importaciones sucesivas).');
  }
  if (mapa.fecha === undefined) {
    avisos.push('No se ha encontrado columna de Fecha — tendrás que indicar a mano a qué mes/año pertenecen estos datos.');
  }
  if (mapa.totales === undefined && mapa.ventas === undefined && mapa.promo === undefined && mapa.regalos === undefined) {
    avisos.push('No se ha encontrado ninguna columna de unidades (Ventas/Promo/Regalos/Totales) — revisa el archivo.');
  }
  const sinFecha = mapa.fecha !== undefined ? mejorResultado.filas.filter(f => !f.fecha).length : 0;
  if (sinFecha > 0) {
    avisos.push("".concat(sinFecha, " fila(s) ten\xEDan una Fecha no reconocida y se han dejado sin fecha (habr\xE1 que asignarles el mes a mano)."));
  }
  return {
    filas: mejorResultado.filas,
    avisos,
    hojaLeida: mejorHoja
  };
}