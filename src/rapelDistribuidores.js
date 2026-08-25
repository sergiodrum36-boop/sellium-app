/*
 * rapelDistribuidores.js
 * Lógica pura del rapel anual de distribuidores (26/07/2026, primera pieza
 * de "Acuerdos con clientes/distribuidores" — a petición de Sergio, tras
 * terminar Geolocalización). Confirmado con Sergio:
 *  - El cumplimiento se mide contra el MISMO Objetivo Anual que ya se define
 *    en "Presupuesto y Forecast" (% de crecimiento por marca vs año
 *    anterior, ver PantallaPresupuesto.js/firebaseApi/presupuestos.js), no
 *    una cifra aparte.
 *  - La métrica es Facturación/Ventas Reales (Sell-In, QlikSense).
 *  - El rapel por facturación es ESCALADO: una tabla de tramos (de X% a Y%
 *    de cumplimiento → Z% de rapel) que Sergio define y puede cambiar cada
 *    año desde la app (ver PantallaRapelDistribuidores.js).
 *  - Además del tramo de facturación, hay "bonificaciones" adicionales
 *    (ej. "compartir datos detallados") que se definen una vez (catálogo
 *    global, nombre + %) y se activan distribuidor por distribuidor — "para
 *    todos igual pero a algunos se puede agregar/modificar/quitar según el
 *    grado de colaboración" (palabras de Sergio): por eso la tabla de tramos
 *    también admite una versión PERSONALIZADA por distribuidor que sustituye
 *    a la global solo para él, sin tocar la de los demás.
 *
 * `agregarFacturacionPorMarca` es una copia deliberada (no un import) de la
 * función homónima privada de PantallaPresupuesto.js: es pura y de pocas
 * líneas, y duplicarla es más seguro que refactorizar un fichero de
 * producción ya en uso solo para compartirla. Si el criterio de qué cuenta
 * como "Facturación" cambia alguna vez, hay que actualizar las DOS copias.
 */

// Agrega ventasReales de un distribuidor (o de todos, si idDistribuidor es
// '' o null) en un año concreto, sumando cajas + importe por marca.
export function agregarFacturacionPorMarca(ventasReales, anio, idDistribuidor) {
  const prefijo = `${anio}-`;
  const mapa = new Map();
  (ventasReales || []).forEach((v) => {
    if (idDistribuidor && v.id_distribuidor !== idDistribuidor) return;
    if (!(v.mes_ano || '').startsWith(prefijo)) return;
    const fila = mapa.get(v.id_marca) || { id_marca: v.id_marca, nombre_marca: v.nombre_marca || 'N/A', cajas: 0, importe: 0 };
    fila.cajas += Number(v.cajas) || 0;
    fila.importe += Number(v.importe_euros) || 0;
    mapa.set(v.id_marca, fila);
  });
  return mapa;
}

// Objetivo total (€) de un distribuidor+año, a partir de su Presupuesto
// (objetivos_facturacion_marca: % crecimiento por marca) y la Facturación
// real del año ANTERIOR por marca. Mismo cálculo que usa Presupuesto y
// Forecast (año_anterior × (1 + %crecimiento/100)), sumado entre marcas. Si
// no hay Presupuesto guardado para ese distribuidor+año, devuelve 0 (no se
// inventa un objetivo).
export function calcularObjetivoTotalFacturacion(presupuesto, ventasReales) {
  if (!presupuesto) return 0;
  const baseAnioAnterior = agregarFacturacionPorMarca(ventasReales, presupuesto.anio - 1, presupuesto.id_distribuidor);
  let total = 0;
  (presupuesto.objetivos_facturacion_marca || []).forEach((g) => {
    const base = baseAnioAnterior.get(g.id_marca) || { importe: 0 };
    const factor = 1 + (Number(g.pct_crecimiento) || 0) / 100;
    total += base.importe * factor;
  });
  return total;
}

// Facturación real total (€) de un distribuidor en un año concreto, sumando
// todas sus marcas.
export function calcularFacturacionRealTotal(ventasReales, anio, idDistribuidor) {
  const mapa = agregarFacturacionPorMarca(ventasReales, anio, idDistribuidor);
  let total = 0;
  mapa.forEach((fila) => { total += fila.importe; });
  return total;
}

// % de cumplimiento del objetivo (real / objetivo × 100). Si el objetivo es
// 0 o no existe (sin Presupuesto guardado), no se puede calcular un % con
// sentido — se devuelve null (nunca Infinity/NaN), para que la pantalla
// pueda avisar "sin objetivo definido" en vez de mostrar un número roto.
export function calcularPctCumplimiento(facturacionReal, objetivoTotal) {
  if (!objetivoTotal || objetivoTotal <= 0) return null;
  return (facturacionReal / objetivoTotal) * 100;
}

// Encuentra, dentro de una lista de tramos [{pct_min, pct_max, pct_rapel}],
// el tramo que corresponde a un % de cumplimiento concreto. `pct_max` nulo/
// vacío significa "sin tope" (ese tramo vale desde pct_min en adelante). Si
// ningún tramo cubre ese %, devuelve null (nunca inventa un tramo). Los
// tramos se ordenan por pct_min ascendente antes de buscar, así el orden en
// que Sergio los guarda en la pantalla no importa.
export function encontrarTramoAplicable(tramos, pctCumplimiento) {
  if (pctCumplimiento === null || pctCumplimiento === undefined) return null;
  const ordenados = [...(tramos || [])].sort((a, b) => (Number(a.pct_min) || 0) - (Number(b.pct_min) || 0));
  for (const tramo of ordenados) {
    const min = Number(tramo.pct_min) || 0;
    const max = (tramo.pct_max === null || tramo.pct_max === undefined || tramo.pct_max === '') ? null : Number(tramo.pct_max);
    if (pctCumplimiento >= min && (max === null || pctCumplimiento < max)) return tramo;
  }
  return null;
}

// Cálculo completo del rapel de un distribuidor en un año: combina el tramo
// de facturación alcanzado (según su % de cumplimiento) con las
// bonificaciones que tenga activas (datos compartidos u otras que Sergio
// haya añadido al catálogo). Nunca inventa nada si falta el objetivo: en ese
// caso pctRapelTramo es 0 (no se alcanza ningún tramo, no se puede saber
// cuál), pero pctCumplimiento se devuelve como null para poder avisar en la
// pantalla en vez de mostrar "0% cumplido" como si fuera un dato real.
export function calcularRapelDistribuidor({ objetivoTotal, facturacionReal, tramos, bonificacionesActivas }) {
  const pctCumplimiento = calcularPctCumplimiento(facturacionReal, objetivoTotal);
  const tramoAplicable = encontrarTramoAplicable(tramos, pctCumplimiento);
  const pctRapelTramo = tramoAplicable ? (Number(tramoAplicable.pct_rapel) || 0) : 0;
  const pctBonificaciones = (bonificacionesActivas || []).reduce((acc, b) => acc + (Number(b.pct) || 0), 0);
  const pctRapelTotal = pctRapelTramo + pctBonificaciones;
  const importeRapel = (facturacionReal || 0) * (pctRapelTotal / 100);
  return { pctCumplimiento, tramoAplicable, pctRapelTramo, pctBonificaciones, pctRapelTotal, importeRapel };
}
