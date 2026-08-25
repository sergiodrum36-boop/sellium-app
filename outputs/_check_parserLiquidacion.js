/*
 * parserLiquidacion.js
 * Convierte un workbook de Excel (formato "LIQUIDACION <DISTRIBUIDOR> <AÑO>.xlsx",
 * con hojas DATOS / VENTAS STOCK / <MES> <AA>) en los objetos que la app
 * necesita para poblar Maestro_Marcas, Sell-In y Sell-Out.
 *
 * Este módulo NO toca Firebase. Es puro parseo + validación, para poder
 * probarlo de forma aislada (en Node o en el navegador) antes de escribir
 * nada en la base de datos real.
 */

const MESES = {
  'ENERO': 1, 'FEBRERO': 2, 'MARZO': 3, 'ABRIL': 4, 'MAYO': 5, 'JUNIO': 6,
  'JULIO': 7, 'AGOSTO': 8, 'SETIEMBRE': 9, 'SEPTIEMBRE': 9, 'OCTUBRE': 10,
  'NOVIEMBRE': 11, 'DICIEMBRE': 12
};

const limpio = (v) => (typeof v === 'string' ? v.trim() : v);
const esVacio = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
const num = (v) => {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
};

// --- Detección de filas "placeholder" (el desplegable de producto del Excel
// se quedó sin rellenar, pero la fila ya tenía números metidos al lado) ---
// Si se dejan pasar, la app las trata como si fueran una marca real y crea
// un "producto fantasma" (p.ej. "ELEGIR ARTICULO") con movimientos de
// Compras/Ventas asociados, que luego contaminan Control A&P y el Stock.
const FRASES_PLACEHOLDER = [
  'ELEGIR ARTICULO', 'ELEGIR PRODUCTO', 'ELEGIR REFERENCIA', 'ELEGIR MARCA',
  'SELECCIONAR ARTICULO', 'SELECCIONE ARTICULO', 'SELECCIONE UN ARTICULO',
  'SELECCIONAR PRODUCTO', 'SELECCIONE PRODUCTO', 'SELECCIONE UN PRODUCTO',
  'SELECCIONAR REFERENCIA', 'SELECCIONE REFERENCIA',
  'SELECCIONAR', 'SELECCIONE', 'SELECCIONA'
];
const normalizarPlaceholder = (v) => String(v || '')
  .toUpperCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita acentos
  .replace(/[.,;:'"´`¿?¡!-]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const esReferenciaPlaceholder = (v) => FRASES_PLACEHOLDER.includes(normalizarPlaceholder(v));

// --- Adivina el nombre del distribuidor a partir del nombre del archivo ---
export function adivinarDistribuidor(nombreArchivo) {
  const sinExt = nombreArchivo.replace(/\.[^/.]+$/, '');
  const tokens = sinExt.split(/\s+/).filter(t => {
    const tUpper = t.toUpperCase();
    if (tUpper === 'LIQUIDACION' || tUpper === 'LIQUIDACIÓN') return false;
    if (/^\d{4}$/.test(t)) return false; // año
    return true;
  });
  return tokens.join(' ').trim().toUpperCase() || 'DISTRIBUIDOR SIN NOMBRE';
}

// --- Hoja DATOS: catálogo maestro de marcas (nombre, tarifa, A&P por unidad) ---
function parseMarcas(workbook) {
  const ws = workbook.Sheets['DATOS'];
  if (!ws) return { marcas: [], avisos: ['No se encontró la hoja "DATOS" — no se importarán marcas maestras.'] };

  const marcas = [];
  const avisos = [];
  let r = 4;
  while (true) {
    const nombre = limpio(ws[`A${r}`]?.v);
    if (esVacio(nombre)) break;
    if (esReferenciaPlaceholder(nombre)) {
      avisos.push(`Fila ${r} de la hoja "DATOS": "${nombre}" parece un texto de plantilla sin rellenar (no se creará como marca).`);
      r++;
      continue;
    }
    const tarifa = num(ws[`B${r}`]?.v);
    const ap = num(ws[`C${r}`]?.v);
    marcas.push({ nombre_marca: String(nombre).trim().toUpperCase(), Coste_Unidad: tarifa, AP_Generado_Por_Unidad: ap });
    r++;
  }
  if (marcas.length === 0) avisos.push('La hoja "DATOS" no tiene filas de marcas (a partir de la fila 4).');
  return { marcas, avisos };
}

// --- Hoja VENTAS STOCK: compras mensuales por producto (Sell-In) + stock inicial informativo ---
function parseVentasStock(workbook) {
  const ws = workbook.Sheets['VENTAS STOCK'];
  if (!ws) return { compras: [], stockInicial: [], anio: null, avisos: ['No se encontró la hoja "VENTAS STOCK" — no se importará Sell-In.'] };

  const avisos = [];

  // Detectar el año a partir del título (p.ej. "CARGA DE STOCKS Y VENTA 2025")
  let anio = null;
  for (let r = 8; r <= 13 && !anio; r++) {
    for (let c = 1; c <= 10; c++) {
      const cell = ws[`${String.fromCharCode(64 + c)}${r}`];
      if (cell && typeof cell.v === 'string') {
        const m = cell.v.match(/20\d{2}/);
        if (m) { anio = parseInt(m[0], 10); break; }
      }
    }
  }
  if (!anio) {
    anio = new Date().getFullYear();
    avisos.push(`No se detectó el año en "VENTAS STOCK" — se usará el año actual (${anio}). Revísalo en la previsualización.`);
  }

  const compras = [];       // { referencia, mes_ano, unidades_compradas }
  const stockInicial = [];  // { referencia, stock_inicial }  (informativo, no se escribe como movimiento)

  let r = 14;
  while (true) {
    const referencia = limpio(ws[`B${r}`]?.v);
    if (esVacio(referencia)) break;
    if (esReferenciaPlaceholder(referencia)) {
      avisos.push(`Fila ${r} de "VENTAS STOCK": "${referencia}" parece un texto de plantilla sin rellenar (se omite esta fila, no se importa como Compras/Stock).`);
      r++;
      continue;
    }

    const stockInic = num(ws[`C${r}`]?.v);
    if (stockInic !== 0) stockInicial.push({ referencia: String(referencia).trim(), stock_inicial: stockInic });

    // Columnas D..O = Mes 1 .. Mes 12
    for (let mes = 1; mes <= 12; mes++) {
      const col = String.fromCharCode(68 + (mes - 1)); // D=68
      const val = num(ws[`${col}${r}`]?.v);
      if (val !== 0) {
        compras.push({
          referencia: String(referencia).trim(),
          mes_ano: `${anio}-${String(mes).padStart(2, '0')}`,
          unidades_compradas: val
        });
      }
    }
    r++;
  }

  return { compras, stockInicial, anio, avisos };
}

// --- Hojas mensuales (ENERO 25, FEBRERO 25...): Sell-Out detallado ---
function parseHojaMensual(ws, nombreHoja) {
  // Detectar mes y año a partir del nombre de la hoja: "ENERO 25" -> mes=1, anio=2025
  const partes = nombreHoja.trim().toUpperCase().split(/\s+/);
  const nombreMes = partes[0];
  const mesNum = MESES[nombreMes];
  if (!mesNum) return null; // no es una hoja de mes reconocible

  let anio = null;
  if (partes[1]) {
    const yy = parseInt(partes[1], 10);
    if (!isNaN(yy)) anio = yy < 100 ? 2000 + yy : yy;
  }

  // Buscar la fila de cabecera (columna A === 'Referencia') en las primeras 30 filas
  let headerRow = null;
  for (let r = 1; r <= 30; r++) {
    if (limpio(ws[`A${r}`]?.v) === 'Referencia') { headerRow = r; break; }
  }
  if (!headerRow) return { mesNum, anio, filas: [], avisos: [`No se encontró la fila de cabecera en la hoja "${nombreHoja}".`] };

  const filas = [];
  const avisos = [];
  let r = headerRow + 1;
  while (true) {
    const referencia = limpio(ws[`A${r}`]?.v);
    if (esVacio(referencia)) break;
    if (esReferenciaPlaceholder(referencia)) {
      avisos.push(`Fila ${r} de la hoja "${nombreHoja}": "${referencia}" parece un texto de plantilla sin rellenar (se omite esta fila, no se importa como Ventas/A&P).`);
      r++;
      continue;
    }

    filas.push({
      referencia: String(referencia).trim(),
      ventas_uds: num(ws[`F${r}`]?.v),           // Bot. cargo
      regaladas_uds: num(ws[`G${r}`]?.v),        // Bot. S/Cargo
      valor_regaladas_euros: num(ws[`H${r}`]?.v),// Total S/C
      unidades_acuerdo: num(ws[`I${r}`]?.v),     // Bot. Acuerdo
      precio_acuerdo_unidad: num(ws[`J${r}`]?.v),// €/Botella
      valor_acuerdo_euros: num(ws[`K${r}`]?.v),  // Total acuerdo
      muestras_uds: num(ws[`L${r}`]?.v),         // Bot. Muestras
      valor_muestras_euros: num(ws[`M${r}`]?.v), // Total Muestras
    });
    r++;
  }

  return { mesNum, anio, filas, avisos };
}

function parseTodosLosMeses(workbook, anioPorDefecto) {
  const ventas = []; // { referencia, mes_ano, ventas_uds, regaladas_uds, ... }
  const avisos = [];

  workbook.SheetNames.forEach(nombreHoja => {
    const primerToken = nombreHoja.trim().toUpperCase().split(/\s+/)[0];
    if (!MESES[primerToken]) return; // no es hoja de mes

    const ws = workbook.Sheets[nombreHoja];
    const resultado = parseHojaMensual(ws, nombreHoja);
    if (!resultado) return;
    if (resultado.avisos.length) avisos.push(...resultado.avisos);

    // El año del archivo (detectado en "VENTAS STOCK", o corregido a mano por
    // el usuario) manda SIEMPRE sobre el año que aparezca en el nombre de la
    // propia pestaña mensual ("MARZO 25"). Esto es necesario porque algunos
    // distribuidores reutilizan la plantilla del año anterior: la pestaña
    // "VENTAS STOCK" ya dice el año correcto, pero las pestañas de los meses
    // se quedan con el sufijo del año viejo (p.ej. "25" en un Excel de 2026).
    // Si se usara el año de la pestaña, las Ventas (Sell-Out) quedarían en un
    // año distinto al de las Compras (Sell-In), y no cuadrarían en Stock.
    // Si por lo que sea no se pudo detectar ningún año en "VENTAS STOCK"
    // (anioPorDefecto vacío), se usa como último recurso el de la pestaña.
    const anio = anioPorDefecto || resultado.anio;
    if (resultado.anio != null && anioPorDefecto != null && resultado.anio !== anioPorDefecto) {
      avisos.push(`La pestaña "${nombreHoja}" parece decir año ${resultado.anio}, pero se usará ${anio} (el detectado en "VENTAS STOCK"). Si no es correcto, corrígelo en "Año real" — se aplicará a todos los meses por igual.`);
    }
    const mesAno = `${anio}-${String(resultado.mesNum).padStart(2, '0')}`;

    resultado.filas.forEach(fila => {
      // Ignorar filas totalmente vacías (todas las cantidades a 0)
      const tieneDatos = fila.ventas_uds || fila.regaladas_uds || fila.unidades_acuerdo || fila.muestras_uds ||
        fila.valor_regaladas_euros || fila.valor_acuerdo_euros || fila.valor_muestras_euros;
      if (!tieneDatos) return;
      ventas.push({ ...fila, mes_ano: mesAno });
    });
  });

  return { ventas, avisos };
}

/**
 * Parsea el workbook completo y devuelve una estructura intermedia,
 * SIN tocar Firebase ni resolver todavía los IDs de marca/distribuidor
 * (eso lo hace el componente ImportarExcel.js, que sí conoce las marcas
 * y distribuidores ya existentes en la app).
 */
export function parseLiquidacion(workbook, nombreArchivo) {
  const avisos = [];

  const { marcas, avisos: avisosMarcas } = parseMarcas(workbook);
  avisos.push(...avisosMarcas);

  const { compras, stockInicial, anio, avisos: avisosStock } = parseVentasStock(workbook);
  avisos.push(...avisosStock);

  const { ventas, avisos: avisosVentas } = parseTodosLosMeses(workbook, anio);
  avisos.push(...avisosVentas);

  const distribuidorSugerido = adivinarDistribuidor(nombreArchivo);

  return {
    distribuidorSugerido,
    anio,
    marcas,           // [{ nombre_marca, Coste_Unidad, AP_Generado_Por_Unidad }]
    compras,          // [{ referencia, mes_ano, unidades_compradas }]
    stockInicial,     // [{ referencia, stock_inicial }] (informativo)
    ventas,           // [{ referencia, mes_ano, ventas_uds, regaladas_uds, valor_regaladas_euros, unidades_acuerdo, precio_acuerdo_unidad, valor_acuerdo_euros, muestras_uds, valor_muestras_euros }]
    avisos
  };
}
