import { valorRegaladas, valorMuestras, valorAcuerdo, valorAportacionManual, generadoSellIn, gastoTotal } from './_check_calculosAP';

const UMBRAL_MESES_INACTIVIDAD = 3;

const sumarPorDistribuidor = (movimientos, calcularValor) => {
  const mapa = new Map();
  movimientos.forEach(mov => {
    if (!mov.id_distribuidor) return;
    mapa.set(mov.id_distribuidor, (mapa.get(mov.id_distribuidor) || 0) + calcularValor(mov));
  });
  return mapa;
};

const mesesDesde = (mesAno) => {
  const [y, m] = mesAno.split('-').map(Number);
  const hoy = new Date();
  return (hoy.getFullYear() - y) * 12 + (hoy.getMonth() + 1 - m);
};

export function calcularAlertas({ distribuidores = [], sellIn = [], sellOut = [] }) {
  const alertas = [];

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
