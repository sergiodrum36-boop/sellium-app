/*
 * parserVentasReales.js
 * Convierte el Excel mensual exportado desde QlikSense (ventas reales por
 * Distribuidor / Familia / Subfamilia / Uds / Cajas / Importe) en una lista
 * de filas planas que el importador (PantallaVentasReales.js) puede resolver
 * contra los distribuidores y marcas ya existentes en la app.
 *
 * A diferencia de parserLiquidacion.js (que lee celdas en posiciones FIJAS
 * de una plantilla conocida), este parser busca la fila de cabecera por
 * NOMBRE de columna, de forma flexible (mayúsculas/minúsculas, con/sin
 * acentos, alguna variación de texto) — porque no conocemos de antemano el
 * formato exacto del export de QlikSense. Si en la práctica el archivo real
 * usa nombres de columna distintos a los previstos aquí, hay que ampliar
 * las listas de "alias" de cada columna más abajo.
 *
 * IMPORTANTE: en este import, "Subfamilia" se corresponde con lo que en el
 * resto de la app se llama "Marca" (según lo confirmado por el usuario).
 * "Familia" es una categoría nueva, superior a Marca, que no existía antes
 * en la app: se guarda tal cual en cada movimiento de ventasReales.
 */

import * as XLSX from 'xlsx';

const quitarAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const normalizarCabecera = (s) => quitarAcentos(s).toUpperCase().trim();

// Alias reconocidos para cada columna (se comprueba si la cabecera CONTIENE
// alguno de estos textos, ya normalizada sin acentos y en mayúsculas).
const ALIAS_COLUMNAS = {
  distribuidor: ['DISTRIBUIDOR', 'CLIENTE'],
  familia: ['FAMILIA'],       // ojo: se comprueba DESPUÉS de descartar "SUBFAMILIA"
  subfamilia: ['SUBFAMILIA'],
  uds: ['UDS', 'UNIDADES'],
  cajas: ['CAJAS', 'CAJA'],
  importe: ['IMPORTE', 'FACTURACION', 'VENTA EUROS', 'EUROS']
};

function detectarColumna(cabeceraNormalizada) {
  if (cabeceraNormalizada.includes('SUBFAMILIA')) return 'subfamilia';
  if (ALIAS_COLUMNAS.familia.some(a => cabeceraNormalizada.includes(a))) return 'familia';
  if (ALIAS_COLUMNAS.distribuidor.some(a => cabeceraNormalizada.includes(a))) return 'distribuidor';
  if (ALIAS_COLUMNAS.cajas.some(a => cabeceraNormalizada.includes(a))) return 'cajas';
  if (ALIAS_COLUMNAS.uds.some(a => cabeceraNormalizada.includes(a))) return 'uds';
  if (ALIAS_COLUMNAS.importe.some(a => cabeceraNormalizada.includes(a))) return 'importe';
  return null;
}

// Convierte un valor de celda a número, admitiendo tanto "1234.56" (formato
// US/Excel estándar) como "1.234,56" (formato español con punto de miles y
// coma decimal), y celdas que ya vienen como número nativo de Excel.
function numSeguro(valor) {
  if (typeof valor === 'number') return isNaN(valor) ? 0 : valor;
  if (valor === null || valor === undefined || valor === '') return 0;
  let s = String(valor).trim();
  // Si tiene coma Y punto, asumimos formato español (punto=miles, coma=decimal)
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',') && !s.includes('.')) {
    // Solo coma -> decimal español
    s = s.replace(',', '.');
  }
  s = s.replace(/[€\s]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

const esVacio = (v) => v === null || v === undefined || String(v).trim() === '';

// Cualquier fila cuya Subfamilia contenga la palabra "Publicidad" (muestras,
// material publicitario, etc. que QlikSense exporta mezclado con las ventas
// reales) se descarta por completo — no cuenta ni en uds/cajas ni en importe.
// Así lo ha confirmado el usuario: "todo lo que se exporte como Publicidad
// se ignora, no hay que tenerlo en cuenta y se elimina".
const esPublicidad = (v) => normalizarCabecera(v).includes('PUBLICIDAD');

/**
 * Parsea el workbook y devuelve las filas planas + avisos.
 * NO toca Firebase ni resuelve IDs de marca/distribuidor — eso lo hace
 * PantallaVentasReales.js, que sí conoce los distribuidores y marcas ya
 * existentes en la app.
 */
export function parseVentasReales(workbook) {
  const avisos = [];
  const nombreHoja = workbook.SheetNames[0];
  const ws = workbook.Sheets[nombreHoja];
  if (!ws) {
    return { filas: [], avisos: ['El Excel no tiene ninguna hoja legible.'] };
  }

  // Leemos la hoja como array de filas (array de arrays), sin asumir que la
  // cabecera está en la fila 1 (algunos exports de QlikSense añaden un
  // título o filas en blanco antes de la tabla).
  const filasCrudas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false });

  // Buscar la fila de cabecera entre las primeras 15 filas: la que reconozca
  // más columnas de nuestra lista de alias.
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

  if (indiceCabecera === -1 || mejorNumeroColumnas < 3) {
    return {
      filas: [],
      avisos: [
        'No se ha podido reconocer la fila de cabecera del Excel (se esperaban columnas como ' +
        'Distribuidor, Familia, Subfamilia, Uds, Cajas, Importe). Revisa que el archivo tenga esas ' +
        'columnas o dime cómo se llaman exactamente para ajustar la importación.'
      ]
    };
  }

  const columnasFaltantes = ['distribuidor', 'subfamilia', 'uds', 'importe'].filter(c => mapaColumnasElegido[c] === undefined);
  if (columnasFaltantes.length > 0) {
    avisos.push(`No se han encontrado estas columnas esperadas: ${columnasFaltantes.join(', ')}. Se importará solo con los datos disponibles.`);
  }
  if (mapaColumnasElegido.familia === undefined) {
    avisos.push('No se ha encontrado la columna "Familia" — se importará sin ese dato (podrás añadirlo más adelante).');
  }
  if (mapaColumnasElegido.cajas === undefined) {
    avisos.push('No se ha encontrado la columna "Cajas" — se importará con 0 cajas.');
  }

  // QlikSense exporta esto como una tabla dinámica "en cascada": Distribuidor
  // y Familia solo aparecen escritos en la PRIMERA fila de cada grupo; en las
  // filas siguientes del mismo grupo esas columnas vienen en blanco y hay que
  // "arrastrar" (heredar) el último valor visto. Subfamilia sí trae un valor
  // en cada fila real de datos; las filas que solo tienen Distribuidor (con
  // Subfamilia en blanco, normalmente con todo a 0) son cabeceras de grupo,
  // no datos, y se ignoran — igual que la fila "Totales" del principio.
  const filas = [];
  let filasDeGrupoIgnoradas = 0;
  let filasPublicidadIgnoradas = 0;
  let distribuidorActual = null;
  let familiaActual = null;

  for (let i = indiceCabecera + 1; i < filasCrudas.length; i++) {
    const filaCruda = filasCrudas[i];
    if (!filaCruda || filaCruda.every(esVacio)) continue;

    const distribuidorCelda = mapaColumnasElegido.distribuidor !== undefined ? limpio(filaCruda[mapaColumnasElegido.distribuidor]) : '';
    const familiaCelda = mapaColumnasElegido.familia !== undefined ? limpio(filaCruda[mapaColumnasElegido.familia]) : '';
    const subfamiliaCelda = mapaColumnasElegido.subfamilia !== undefined ? limpio(filaCruda[mapaColumnasElegido.subfamilia]) : '';

    if (!esVacio(distribuidorCelda)) {
      // Fila de "Total general" (suele venir antes del primer distribuidor real)
      if (normalizarCabecera(distribuidorCelda).includes('TOTAL')) continue;
      distribuidorActual = String(distribuidorCelda).trim();
      familiaActual = null; // la familia se reinicia al empezar un distribuidor nuevo
    }
    if (!esVacio(familiaCelda)) {
      familiaActual = String(familiaCelda).trim();
    }

    const udsVal = mapaColumnasElegido.uds !== undefined ? numSeguro(filaCruda[mapaColumnasElegido.uds]) : 0;
    const cajasVal = mapaColumnasElegido.cajas !== undefined ? numSeguro(filaCruda[mapaColumnasElegido.cajas]) : 0;
    const importeVal = mapaColumnasElegido.importe !== undefined ? numSeguro(filaCruda[mapaColumnasElegido.importe]) : 0;

    // Filas de Publicidad (muestras/material publicitario): se descartan
    // siempre por completo, no cuentan ni en uds ni en importe.
    if (!esVacio(subfamiliaCelda) && esPublicidad(subfamiliaCelda)) {
      filasPublicidadIgnoradas++;
      continue;
    }

    if (esVacio(subfamiliaCelda)) {
      // Sin Subfamilia, casi siempre es una fila de cabecera de grupo (todo a
      // 0, ya ha servido para fijar distribuidor/familia) y se ignora. PERO
      // algunos distribuidores tienen ajustes a nivel general (rappels,
      // descuentos, abonos) que vienen SIN subfamilia y CON importe real
      // (normalmente negativo) — si los descartáramos, se perdería dinero
      // real del total. Se guardan bajo una subfamilia especial para
      // identificarlos claramente en el dashboard y no perderlos.
      if (udsVal === 0 && cajasVal === 0 && importeVal === 0) {
        filasDeGrupoIgnoradas++;
        continue;
      }
      if (!distribuidorActual) { filasDeGrupoIgnoradas++; continue; }
      filas.push({
        distribuidor: distribuidorActual,
        familia: familiaActual || 'Sin familia',
        subfamilia: 'Rappel/Descuento/Abono',
        uds: udsVal,
        cajas: cajasVal,
        importe: importeVal
      });
      continue;
    }

    if (!distribuidorActual) { filasDeGrupoIgnoradas++; continue; } // por seguridad, no debería pasar

    filas.push({
      distribuidor: distribuidorActual,
      familia: familiaActual || '',
      subfamilia: String(subfamiliaCelda).trim(),
      uds: udsVal,
      cajas: cajasVal,
      importe: importeVal
    });
  }

  if (filasDeGrupoIgnoradas > 0) {
    avisos.push(`Se ignoraron ${filasDeGrupoIgnoradas} fila(s) de cabecera de grupo/subtotal (no son filas de datos, es normal en un export de tabla dinámica).`);
  }
  if (filasPublicidadIgnoradas > 0) {
    avisos.push(`Se ignoraron ${filasPublicidadIgnoradas} fila(s) de Publicidad (no se contabilizan como ventas).`);
  }
  if (filas.length === 0) {
    avisos.push('No se ha extraído ninguna fila de datos del Excel.');
  }

  return { filas, avisos, hojaLeida: nombreHoja };
}

function limpio(v) {
  return typeof v === 'string' ? v.trim() : v;
}
