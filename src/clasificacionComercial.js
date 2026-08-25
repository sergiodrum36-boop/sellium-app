/*
 * clasificacionComercial.js
 * Lógica pura de "Estructura Comercial" tal y como la define Sergio (ver
 * PantallaClasificacionComercial.js y el aviso de renombrado en la cabecera
 * de PantallaEstructuraComercial.js — esa otra pantalla, pese al nombre del
 * archivo, es "Equipo Comercial", una cosa distinta).
 *
 * Reproduce el cálculo que Sergio ya hacía a mano en su Excel "SD Estructura
 * Comercial 2025.xlsx" (compartido el 26/07/2026): cada comercial tiene una
 * cartera de distribuidores; la Participación de un distribuidor es su
 * Importe (facturación) dividido entre el Importe TOTAL de la cartera de
 * ESE MISMO comercial (columna D del Excel, fórmula "=+C5/C16" donde C16 es
 * el total de esa misma hoja) — no un peso global de toda la empresa. A
 * partir de esa participación, combinada con el criterio de clasificación
 * (A-E, ver CRITERIOS_POR_DEFECTO en firebaseApi/clasificacionComercial.js),
 * Sergio decide cuántas visitas trimestrales necesita cada distribuidor —
 * ese número de visitas y el calendario en sí quedan para el siguiente
 * módulo (Planificación Comercial), esto solo cubre la clasificación/peso.
 *
 * CORRECCIÓN 1 (Sergio, 26/07/2026): el Importe sale de Histórico SELL-IN
 * (`facturacion_euros`, lo que el distribuidor le compra a Sergio), NO de
 * Sell-Out (lo que el distribuidor vende a sus clientes finales) — se había
 * cogido la colección equivocada en la primera versión de esta pantalla.
 *
 * CORRECCIÓN 2 (Sergio, 26/07/2026, mismo día): Histórico Sell-In tampoco
 * era la fuente correcta — es una colección manual (Compras.js/
 * ImportarExcel.js) que no todos los distribuidores tienen rellena al día,
 * así que varios salían a 0€ pese a tener compras reales. La fuente correcta
 * es **Ventas Reales** (colección "ventasReales", importada automáticamente
 * cada mes desde QlikSense) — Sergio lo confirmó enseñando capturas del
 * dashboard "Ventas Sell-In (QlikSense)" con importe real para esos mismos
 * distribuidores. Esto además coincide con lo que ya decía el comentario de
 * cabecera de firebaseApi/ventasReales.js: "se consideran la fuente de
 * verdad frente a los cálculos de Sell-In/Sell-Out cuando haya diferencias".
 *
 * Funciones puras (sin Firestore), mismo criterio que calculosAP.js/
 * alertas.js/matching.js — con sus tests propios.
 */

const numSeguro = (v) => {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

// Suma `importe_euros` de Ventas Reales (import mensual QlikSense, ver
// firebaseApi/ventasReales.js) por distribuidor, para un año concreto — el
// "Importe" de la cartera. `anio` es un string o número tipo 2025; se
// compara contra el prefijo de `mes_ano` ('YYYY-MM').
export function sumarFacturacionPorDistribuidorYAnio(ventasReales, anio) {
  const mapa = new Map();
  const prefijo = `${anio}-`;
  (ventasReales || []).forEach((mov) => {
    if (!mov.id_distribuidor || !mov.mes_ano || !String(mov.mes_ano).startsWith(prefijo)) return;
    mapa.set(mov.id_distribuidor, (mapa.get(mov.id_distribuidor) || 0) + numSeguro(mov.importe_euros));
  });
  return mapa;
}

// A partir de las asignaciones (comercial <-> distribuidor, cada una con
// `id_distribuidor` e `id_comercial`) y la facturación ya calculada por
// distribuidor (Map de sumarFacturacionPorDistribuidorYAnio), devuelve las
// mismas asignaciones con `importe` y `participacion` añadidos.
// `participacion` es 0 (no null/NaN) cuando la cartera entera de ese
// comercial no factura nada en el año elegido — evita divisiones por cero
// aguas abajo, en vez de forzar a quien llame a comprobarlo aparte.
export function calcularCarteraComercial(asignaciones, facturacionPorDistribuidor) {
  const mapaFacturacion = facturacionPorDistribuidor || new Map();
  const conImporte = (asignaciones || []).map((a) => ({
    ...a,
    importe: mapaFacturacion.get(a.id_distribuidor) || 0,
  }));

  const totalPorComercial = new Map();
  conImporte.forEach((a) => {
    totalPorComercial.set(a.id_comercial, (totalPorComercial.get(a.id_comercial) || 0) + a.importe);
  });

  return conImporte.map((a) => {
    const total = totalPorComercial.get(a.id_comercial) || 0;
    return { ...a, participacion: total > 0 ? a.importe / total : 0 };
  });
}

// Años distintos presentes en Ventas Reales (para el selector "año de
// referencia" de la pantalla) — más reciente primero.
export function aniosDisponibles(ventasReales) {
  const set = new Set();
  (ventasReales || []).forEach((mov) => {
    if (mov.mes_ano) set.add(String(mov.mes_ano).slice(0, 4));
  });
  return Array.from(set).sort().reverse();
}

// --- SUGERENCIA AUTOMÁTICA DE CLASIFICACIÓN (ABC / Pareto, confirmado con
// Sergio 26/07/2026) ---
// A petición de Sergio ("lo ideal sería que la app sugiriera según el
// distribuidor y su facturación la tipología que debe tener, aun así se
// podría cambiar según el criterio del comercial"): dentro de la cartera de
// CADA comercial (nunca comparando entre carteras de distinto comercial —
// mismo criterio que participación), se ordenan los distribuidores de mayor
// a menor participación y se van sumando; el primer tramo que llega hasta
// `corteA` de acumulado se sugiere "A", el siguiente tramo hasta `corteB` se
// sugiere "B", el resto "C". Es el método clásico de análisis ABC/Pareto,
// con los cortes por defecto (70%/90%) que Sergio confirmó como punto de
// partida — ajustables, no fijos de verdad en el negocio.
//
// Solo sugiere las letras A/B/C: D y E (venta temporal / a
// cambiar-prospectar) dependen de un criterio de negocio que no se puede
// deducir solo de la facturación (estacionalidad, decisión de prospectar
// una zona...) — esos dos se quedan SIEMPRE como elección manual del
// comercial, nunca sugeridos.
//
// Devuelve un Map(id_distribuidor -> 'A'|'B'|'C'). Quien la use decide qué
// hacer con la sugerencia (p.ej. mostrarla como texto junto al selector de
// clasificación real, sin sobrescribir lo que el comercial ya haya elegido).
export function sugerirClasificacionABC(filasCartera, cortes = {}) {
  const corteA = cortes.corteA ?? 0.7;
  const corteB = cortes.corteB ?? 0.9;

  const porComercial = new Map();
  (filasCartera || []).forEach((f) => {
    const lista = porComercial.get(f.id_comercial) || [];
    lista.push(f);
    porComercial.set(f.id_comercial, lista);
  });

  const resultado = new Map();
  porComercial.forEach((filas) => {
    const ordenadas = [...filas].sort((a, b) => (b.participacion || 0) - (a.participacion || 0));
    let acumulado = 0;
    ordenadas.forEach((f) => {
      acumulado += f.participacion || 0;
      let letra;
      if (acumulado <= corteA) letra = 'A';
      else if (acumulado <= corteB) letra = 'B';
      else letra = 'C';
      resultado.set(f.id_distribuidor, letra);
    });
  });
  return resultado;
}
