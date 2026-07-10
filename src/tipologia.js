/*
 * tipologia.js
 * Inferencia automática (best-effort) de la tipología de una marca/
 * referencia a partir de su nombre y de su Familia (si la tiene), por
 * coincidencia de palabras clave. Es solo una PROPUESTA por defecto: el
 * usuario siempre puede corregirla a mano en la pantalla de mantenimiento
 * "Tipología de Referencias" (TipologiaReferencias.js). Si no hay ninguna
 * coincidencia clara, o si el texto coincide con más de una lista a la vez
 * (señal de ambigüedad, p.ej. una marca que vende "Vino y Licor de..."), se
 * devuelve null ("Sin clasificar") en vez de arriesgar una suposición —
 * mejor dejarlo pendiente de revisión manual que asignar algo incorrecto.
 *
 * CAMBIO (a petición de Sergio): se añade una tercera tipología,
 * "Coctelería" — para referencias que no son ni un vino ni un licor
 * embotellado en sí, sino productos de coctelería (siropes, granadina,
 * tónicas, angostura, mixers...). Antes de esto solo existían Vino/Licor.
 *
 * CAMBIO (a petición de Sergio): se añade una cuarta tipología, "Ajuste/
 * Rappel" — para líneas que en realidad no son un producto (rappels,
 * descuentos, abonos, notas de crédito...), normalmente con importe
 * negativo. A diferencia de las otras tres, esta tipología queda EXCLUIDA a
 * propósito del cálculo de peso % por tipología del Dashboard de Ventas
 * Sell-In (ver TIPOLOGIAS_PRODUCTO en DashboardVentasReales.js): mezclarla
 * con Vino/Licor/Coctelería distorsionaría el reparto real de ventas, ya
 * que no representa un producto vendido sino un ajuste comercial.
 *
 * Se usa tanto para sugerir un valor por defecto en TipologiaReferencias.js
 * como, indirectamente, para poder mostrar "Sin clasificar" como una
 * categoría más (no oculta) en el KPI de peso % por tipología del Dashboard
 * de Ventas Sell-In — así nunca desaparece importe del total solo porque
 * una referencia todavía no se ha revisado.
 */

const PALABRAS_VINO = [
  'vino', 'tinto', 'blanco', 'rosado', 'rosé', 'rose', 'cava', 'champan',
  'champán', 'champagne', 'espumoso', 'crianza', 'reserva', 'gran reserva',
  'verdejo', 'albariño', 'albarino', 'tempranillo', 'garnacha', 'godello',
  'mencia', 'mencía', 'monastrell', 'ribera', 'rioja', 'jerez', 'brut',
  'vermut', 'vermú', 'vermu', 'moscatel', 'sauvignon', 'chardonnay',
  'merlot', 'cabernet', 'syrah', 'viura', 'macabeo', 'txakoli', 'chacolí',
];

const PALABRAS_LICOR = [
  'ron', 'ginebra', 'gin', 'vodka', 'whisky', 'whiskey', 'brandy', 'coñac',
  'conac', 'cognac', 'licor', 'anís', 'anis', 'pacharán', 'pacharan',
  'tequila', 'mezcal', 'orujo', 'aguardiente', 'amaretto', 'triple sec',
  'sambuca', 'bourbon', 'rum', 'absenta', 'bitter', 'crema de',
];

const PALABRAS_COCTELERIA = [
  'coctel', 'cóctel', 'cocktail', 'sirope', 'jarabe', 'granadina',
  'angostura', 'tonica', 'tónica', 'ginger beer', 'ginger ale', 'refresco',
  'zumo', 'puré', 'pure', 'guarnicion', 'guarnición', 'mixer', 'soda',
];

const PALABRAS_AJUSTE = [
  'rappel', 'descuento', 'abono', 'bonificacion', 'bonificación',
  'nota de credito', 'nota de crédito', 'nota credito', 'nota crédito',
  'devolucion', 'devolución', 'ajuste',
];

// Quita acentos/diacríticos para poder comparar sin depender de si el
// nombre real lleva tilde o no (p.ej. "Rioja" siempre, pero "Jerez"/"jerez"
// puede venir en cualquier capitalización desde el Excel).
const normalizar = (texto) =>
  (texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

function contieneAlguna(textoNormalizado, palabras) {
  return palabras.some(p => textoNormalizado.includes(normalizar(p)));
}

export function inferirTipologiaPorNombre(nombreMarca, familia) {
  const texto = normalizar(`${nombreMarca || ''} ${familia || ''}`);
  const coincidencias = [
    ['Vino', contieneAlguna(texto, PALABRAS_VINO)],
    ['Licor', contieneAlguna(texto, PALABRAS_LICOR)],
    ['Coctelería', contieneAlguna(texto, PALABRAS_COCTELERIA)],
    ['Ajuste/Rappel', contieneAlguna(texto, PALABRAS_AJUSTE)],
  ].filter(([, coincide]) => coincide);
  // Exactamente una lista coincide -> esa es la sugerencia. Ninguna, o más
  // de una a la vez (ambigüedad) -> Sin clasificar, a revisar a mano.
  return coincidencias.length === 1 ? coincidencias[0][0] : null;
}
