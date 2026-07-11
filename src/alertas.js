/*
 * alertas.js
 * Cálculo centralizado de "Alertas proactivas" (a petición de Sergio,
 * último punto de la auditoría de la app, tras la exportación a PDF): un
 * conjunto de comprobaciones que se ejecutan sobre el histórico COMPLETO
 * (sin el filtro de periodo que sí aplican los dashboards) para avisar de
 * forma proactiva, sin que el usuario tenga que ir pantalla por pantalla
 * buscando el problema.
 *
 * Alcance elegido con Sergio (de una lista más amplia posible):
 *  1. Balance negativo: distribuidores donde el A&P Gastado (Sell-Out)
 *     supera al A&P Generado (Sell-In) — sobregasto.
 *  2. Distribuidor sin actividad reciente: sin ningún movimiento de
 *     Sell-In/Sell-Out en los últimos UMBRAL_MESES_INACTIVIDAD meses (o sin
 *     ninguno en absoluto).
 *  3. Descuadre de categorías: por construcción de calculosAP.js
 *     (gastoTotal = regaladas + muestras + acuerdo + aportación) esto no
 *     debería ocurrir nunca en condiciones normales — es la misma red de
 *     seguridad que ya existe como aviso puntual dentro de
 *     PantallaDashboard.js/PantallaDashboardAPCompania.js, aquí
 *     centralizada y por distribuidor (y sin depender del periodo elegido),
 *     para detectar cualquier dato corrupto que se cuele.
 *
 * Este módulo NO calcula estados de UI ni hace peticiones a Firestore —
 * recibe los datos ya cargados (distribuidores, sellIn, sellOut) y devuelve
 * una lista plana de alertas: { id, tipo, severidad, mensaje }. Quien lo use
 * (App.js) decide cuándo recalcular y con qué datos — ver AlertasBell.js
 * para cómo se muestran.
 */

import { valorRegaladas, valorMuestras, valorAcuerdo, valorAportacionManual, generadoSellIn, gastoTotal } from './calculosAP';

// Meses sin actividad para considerar un distribuidor "inactivo" — punto de
// partida razonable elegido para esta primera versión; si Sergio quiere
// ajustarlo basta con cambiar esta constante.
const UMBRAL_MESES_INACTIVIDAD = 3;

const sumarPorDistribuidor = (movimientos, calcularValor) => {
  const mapa = new Map();
  movimientos.forEach(mov => {
    if (!mov.id_distribuidor) return;
    mapa.set(mov.id_distribuidor, (mapa.get(mov.id_distribuidor) || 0) + calcularValor(mov));
  });
  return mapa;
};

// "YYYY-MM" → nº de meses transcurridos desde ese mes hasta hoy (0 = mes actual).
const mesesDesde = (mesAno) => {
  const [y, m] = mesAno.split('-').map(Number);
  const hoy = new Date();
  return (hoy.getFullYear() - y) * 12 + (hoy.getMonth() + 1 - m);
};

export function calcularAlertas({ distribuidores = [], sellIn = [], sellOut = [] }) {
  const alertas = [];

  // --- 1. Balance negativo por distribuidor (Gastado > Generado) ---
  const generadoPorDist = sumarPorDistribuidor(sellIn, generadoSellIn);
  const gastadoPorDist = sumarPorDistribuidor(sellOut, gastoTotal);
  distribuidores.forEach(d => {
    const generado = generadoPorDist.get(d.id) || 0;
    const gastado = gastadoPorDist.get(d.id) || 0;
    if (gastado > generado) {
      alertas.push({
        id: `balance-${d.id}`,
        tipo: 'balance_negativo',
        severidad: 'atencion',
        mensaje: `${d.nombre_distribuidor}: A&P Gastado (${Math.round(gastado)} €) supera al Generado (${Math.round(generado)} €).`,
      });
    }
  });

  // --- 2. Distribuidores sin actividad reciente ---
  const ultimoMesPorDist = new Map();
  [...sellIn, ...sellOut].forEach(mov => {
    if (!mov.id_distribuidor || !mov.mes_ano) return;
    const actual = ultimoMesPorDist.get(mov.id_distribuidor);
    if (!actual || mov.mes_ano > actual) ultimoMesPorDist.set(mov.id_distribuidor, mov.mes_ano);
  });
  distribuidores.forEach(d => {
    const ultimoMes = ultimoMesPorDist.get(d.id);
    if (!ultimoMes) {
      alertas.push({
        id: `inactividad-${d.id}`,
        tipo: 'sin_actividad',
        severidad: 'aviso',
        mensaje: `${d.nombre_distribuidor}: sin ningún movimiento de Compras/Ventas registrado todavía.`,
      });
      return;
    }
    const meses = mesesDesde(ultimoMes);
    if (meses >= UMBRAL_MESES_INACTIVIDAD) {
      alertas.push({
        id: `inactividad-${d.id}`,
        tipo: 'sin_actividad',
        severidad: 'aviso',
        mensaje: `${d.nombre_distribuidor}: sin movimientos desde ${ultimoMes} (${meses} meses).`,
      });
    }
  });

  // --- 3. Descuadre de categorías (red de seguridad, ver cabecera) ---
  const gastadoDesglosePorDist = new Map();
  sellOut.forEach(mov => {
    if (!mov.id_distribuidor) return;
    const actual = gastadoDesglosePorDist.get(mov.id_distribuidor) || { total: 0, desglose: 0 };
    actual.total += gastoTotal(mov);
    actual.desglose += valorRegaladas(mov) + valorMuestras(mov) + valorAcuerdo(mov) + valorAportacionManual(mov);
    gastadoDesglosePorDist.set(mov.id_distribuidor, actual);
  });
  distribuidores.forEach(d => {
    const datos = gastadoDesglosePorDist.get(d.id);
    if (!datos) return;
    const diferencia = Math.round((datos.total - datos.desglose) * 100) / 100;
    if (Math.abs(diferencia) >= 0.01) {
      alertas.push({
        id: `descuadre-${d.id}`,
        tipo: 'descuadre',
        severidad: 'atencion',
        mensaje: `${d.nombre_distribuidor}: descuadre de ${diferencia.toFixed(2)} € entre el Gastado Total y la suma de sus categorías — revisar datos.`,
      });
    }
  });

  return alertas;
}
