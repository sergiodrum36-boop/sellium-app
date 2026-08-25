/*
 * parserSellOutClientesTxt.js
 * Parser del formato de texto de ancho fijo que algunos distribuidores
 * envían como "Liquidación de Promociones" (p.ej. el archivo real de
 * ejemplo "DATOS 10687 UNESDI JUNIO.TXT"). Es un informe de sistema
 * antiguo (tipo AS/400), paginado y agrupado por PRODUCTO en vez de por
 * cliente: cada página trae un artículo y, debajo, la lista de clientes que
 * lo compraron ese mes, con un subtotal al final de cada bloque.
 *
 * Estructura real observada:
 *
 *   LIQUIDACION PROMOCIONES: 19                                    03-07-26
 *   COD Y NOMBRE PROVEEDOR.: 10687  UNESDI DISTRIBUCIONES, S.A     Pagina 1
 *   PERIODO LIQUIDACION....: 01-06-26 30-06-26
 *   ARTICULO Y NOMBRE......: 10036      PALOMO COJO MAGNUM
 *   -------------------------------------------------------------------
 *   CLTE. NOMBRE                DOCUM.    FECHA    COMPRA R.UNID R.IMPT ...
 *   -------------------------------------------------------------------
 *   01080 RESTAURANTE MESON EGEA 260087281 26-06-26    12      0  31.44 ...
 *   -------------------------------------------------------------------
 *                                                     132      0 284.40 ...  <- subtotal, se ignora
 *
 * y así con cada artículo, repitiendo la cabecera de página cada vez.
 *
 * Las columnas de datos son de ANCHO FIJO — no hay separador consistente
 * (algunos nombres de cliente ocupan todo el ancho de su columna). Por eso,
 * en vez de fiarse de separar por espacios, se calculan las posiciones de
 * cada columna a partir de la propia línea de cabecera "CLTE. NOMBRE ...
 * DOCUM. FECHA COMPRA R.UNID R.IMPT C.UNID C.IMPT" (buscando dónde empieza
 * cada etiqueta) y luego se cortan las líneas de datos por esas mismas
 * posiciones — así el parser se adapta solo si algún informe futuro tiene
 * columnas ligeramente más anchas o estrechas, mientras conserve las mismas
 * etiquetas de cabecera.
 *
 * Significado de las columnas de unidades (confirmado analizando el propio
 * archivo): COMPRA = unidades de venta normal; R.UNID = unidades entregadas
 * como regalo/promoción (su valor a PVP es R.IMPT); C.UNID = las MISMAS
 * unidades de regalo pero expresadas a coste (su valor es C.IMPT) — R.UNID y
 * C.UNID son siempre el mismo número de unidades, solo cambia si el importe
 * que las acompaña está a tarifa (R.IMPT) o a coste (C.IMPT).
 *
 * El "distribuidor" NO aparece en el archivo (la cabecera solo identifica a
 * UNESDI como "proveedor" desde el punto de vista del distribuidor que
 * genera el informe) — lo elige el usuario a mano al importar, igual que el
 * Excel de Miguel Merino.
 *
 * Devuelve la MISMA forma de fila que parserSellOutClientes.js (el parser de
 * Excel), para que ImportarSellOutClientes.js pueda reconciliar clientes y
 * marcas exactamente igual sin que le importe de qué formato vino cada fila.
 */

const pad2 = (n) => String(n).padStart(2, '0');

// "DD-MM-AA" -> 'YYYY-MM-DD'. Años de 2 cifras: <70 se asume 20xx, si no 19xx
// (umbral estándar, razonable para un negocio operando en 2020-2069).
function parsearFechaDDMMAA(s) {
  const m = String(s || '').trim().match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, dd, mm, aa] = m;
  const anioCorto = parseInt(aa, 10);
  const anio = anioCorto < 70 ? 2000 + anioCorto : 1900 + anioCorto;
  return `${anio}-${pad2(mm)}-${pad2(dd)}`;
}

// "12.34" o "0.00" -> número. Estos informes usan punto decimal (no coma).
function numSeguro(s) {
  if (s === null || s === undefined) return 0;
  const limpio = String(s).trim().replace(/[€\s]/g, '');
  if (limpio === '') return 0;
  const n = parseFloat(limpio);
  return isNaN(n) ? 0 : n;
}

const esVacio = (v) => v === null || v === undefined || String(v).trim() === '';

/**
 * Calcula, a partir de la línea de cabecera de un bloque, las posiciones
 * (inicio) de cada columna reconocida. Devuelve null si no reconoce lo
 * mínimo imprescindible (CLTE, DOCUM, FECHA, COMPRA).
 */
function calcularColumnas(lineaCabecera) {
  const buscar = (etiqueta) => lineaCabecera.indexOf(etiqueta);
  const posiciones = {
    clte: 0, // la columna de cliente siempre empieza al principio de línea
    docum: buscar('DOCUM'),
    fecha: buscar('FECHA'),
    compra: buscar('COMPRA'),
    runid: buscar('R.UNID'),
    rimpt: buscar('R.IMPT'),
    cunid: buscar('C.UNID'),
    cimpt: buscar('C.IMPT')
  };
  if (posiciones.docum < 0 || posiciones.fecha < 0 || posiciones.compra < 0) return null;

  // Construye los límites [inicio, fin) de cada columna presente, ordenados
  // por posición — el fin de cada una es el inicio de la siguiente columna
  // reconocida (o el final de línea para la última).
  const entradas = Object.entries(posiciones)
    .filter(([, pos]) => pos >= 0)
    .sort((a, b) => a[1] - b[1]);

  const limites = {};
  entradas.forEach(([nombre, inicio], idx) => {
    const fin = idx + 1 < entradas.length ? entradas[idx + 1][1] : undefined; // undefined = hasta el final
    limites[nombre] = [inicio, fin];
  });
  return limites;
}

const cortar = (linea, limites, nombre) => {
  if (!limites[nombre]) return '';
  const [ini, fin] = limites[nombre];
  return (fin !== undefined ? linea.slice(ini, fin) : linea.slice(ini)).trim();
};

export function parseSellOutClientesTxt(textoPlano) {
  const avisos = [];
  // El archivo puede traer un carácter de control de impresora (STX) al
  // principio — se ignora si aparece.
  const lineas = textoPlano.replace(/^\x02/, '').split(/\r?\n/);

  let productoActual = null;
  let limitesActuales = null;
  let periodoDetectado = null;

  const filas = [];
  let filasIgnoradasSinProducto = 0;
  let bloquesReconocidos = 0;

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    if (esVacio(linea)) continue;

    // Línea de nuevo bloque de artículo: "ARTICULO Y NOMBRE......: 10036      PALOMO COJO MAGNUM"
    const mArt = linea.match(/ARTICULO Y NOMBRE\.*:\s*(\S+)\s+(.+)/);
    if (mArt) {
      productoActual = mArt[2].trim();
      bloquesReconocidos++;
      continue;
    }

    // Esta línea aparece una vez por CADA bloque de artículo (15 veces en el
    // archivo real) — hay que saltarla siempre, no solo la primera vez que
    // se ve, o las apariciones 2ª..15ª se cuelan como si fueran una fila de
    // datos (así se detectó originalmente este bug: 14 "filas" fantasma con
    // cliente "LIQUIDACION....: ...").
    const mPeriodo = linea.match(/PERIODO LIQUIDACION\.*:\s*(\d{2}-\d{2}-\d{2})\s+(\d{2}-\d{2}-\d{2})/);
    if (mPeriodo) {
      if (!periodoDetectado) periodoDetectado = `${mPeriodo[1]} a ${mPeriodo[2]}`;
      continue;
    }

    // Línea de cabecera de columnas de un bloque: recalcula las posiciones
    // (por si varían ligeramente de un informe a otro).
    if (linea.includes('CLTE') && linea.includes('DOCUM') && linea.includes('FECHA')) {
      limitesActuales = calcularColumnas(linea);
      continue;
    }

    // Separadores ("---...---") y líneas de anotación entre paréntesis
    // (p.ej. "(12 PALOMO COJO SEMI DULCE)") no son filas de datos.
    if (/^-+$/.test(linea.trim())) continue;
    if (linea.trim().startsWith('(')) continue;
    if (/^LIQUIDACION PROMOCIONES/.test(linea) || /^COD Y NOMBRE PROVEEDOR/.test(linea)) continue;

    if (!limitesActuales) continue; // aún no hemos visto ninguna cabecera de columnas

    // Fila de subtotal de bloque: la columna de cliente viene vacía.
    const clteNombre = cortar(linea, limitesActuales, 'clte');
    if (esVacio(clteNombre)) continue;

    if (!productoActual) { filasIgnoradasSinProducto++; continue; }

    const mCodNombre = clteNombre.match(/^(\S+)\s+(.+)$/);
    const codCliente = mCodNombre ? mCodNombre[1].trim() : '';
    const nombreCliente = mCodNombre ? mCodNombre[2].trim() : clteNombre;

    const docum = cortar(linea, limitesActuales, 'docum');
    const fechaTexto = cortar(linea, limitesActuales, 'fecha');
    const fecha = parsearFechaDDMMAA(fechaTexto);
    const compra = numSeguro(cortar(linea, limitesActuales, 'compra'));
    const runid = numSeguro(cortar(linea, limitesActuales, 'runid'));
    const rimpt = numSeguro(cortar(linea, limitesActuales, 'rimpt'));
    const cimpt = numSeguro(cortar(linea, limitesActuales, 'cimpt'));

    filas.push({
      distribuidor: '', // el archivo no lo indica; lo elige el usuario al importar
      cliente: nombreCliente,
      cod_cliente: codCliente,
      nif: '',
      tipologia: '',
      grupo: '',
      comercial: '',
      preventista: '',
      albaran: docum,
      fecha,
      mesAno: fecha ? fecha.slice(0, 7) : null,
      producto: productoActual,
      ventas: compra,
      promo: 0,
      regalos: runid,
      totales: compra + runid,
      dtos1: rimpt, // valor a PVP de las unidades de regalo
      dtos2: cimpt, // valor a coste de las unidades de regalo
      coste: 0,
      precio: 0
    });
  }

  if (bloquesReconocidos === 0) {
    return {
      filas: [],
      avisos: [
        'No se ha reconocido ningún bloque "ARTICULO Y NOMBRE" en este archivo de texto — ' +
        'revisa que sea el mismo formato de "Liquidación de Promociones", o dime cómo es para ampliar el importador.'
      ],
      hojaLeida: null
    };
  }
  if (filasIgnoradasSinProducto > 0) {
    avisos.push(`Se ignoraron ${filasIgnoradasSinProducto} línea(s) de cliente que aparecían antes de reconocer ningún artículo.`);
  }
  if (periodoDetectado) {
    avisos.push(`Periodo detectado en el archivo: ${periodoDetectado}. Cada línea usa su propia fecha real, este dato es solo informativo.`);
  }
  const sinFecha = filas.filter(f => !f.fecha).length;
  if (sinFecha > 0) {
    avisos.push(`${sinFecha} fila(s) tenían una Fecha no reconocida (formato esperado DD-MM-AA).`);
  }

  return { filas, avisos, hojaLeida: `texto (${bloquesReconocidos} artículo(s) detectado(s))` };
}
