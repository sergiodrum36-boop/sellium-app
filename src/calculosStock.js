/*
 * calculosStock.js
 * Cálculo centralizado de "Stock Actual" por Marca, sumado sobre uno,
 * varios o todos los Distribuidores.
 *
 * Generaliza la lógica que ya existía en StockDistribuidor.js (que es por
 * UN distribuidor y un año concreto elegido con un selector) para poder
 * usarla a nivel Compañía en los dashboards agregados
 * (PantallaDashboardAPCompania.js, ControlAPVisionComercial.js), sumando
 * varios distribuidores a la vez.
 *
 * Fórmula por (Distribuidor, Marca): Stock Actual = Stock Inicial declarado
 * (la declaración de año más reciente <= año actual, ver stockInicial.js)
 * + Compras (Sell-In) - Salidas (Sell-Out), acumulado desde el año de esa
 * declaración hasta hoy. Si no hay Stock Inicial declarado, arranca de 0 y
 * cuenta todo el histórico disponible (mismo comportamiento que
 * StockDistribuidor.js).
 *
 * "Salidas" = ventas + regaladas + muestras + unidades de Acuerdo — TODO lo
 * que físicamente sale del almacén del distribuidor. Este criterio es
 * DISTINTO, a propósito, del denominador de "Gasto Medio / Botella"
 * (vendidas+regaladas+muestras, sin Acuerdo): aquí es un balance físico de
 * unidades, no un ratio en €, y las unidades de Acuerdo sí salen físicamente
 * del almacén aunque tengan su propio precio pactado aparte.
 *
 * A PROPÓSITO ignora cualquier filtro de periodo/fechas: el Stock es un
 * saldo en un momento dado (a día de hoy), no un movimiento "durante" un
 * periodo — igual que el Stock Inicial ya se trata en esos dashboards
 * (ver PantallaDashboardAPCompania.js / ControlAPVisionComercial.js).
 * Solo respeta filtros de Distribuidor(es) y Marca.
 */

import { unidadesAcuerdo } from './calculosAP';

const numSeguro = (v) => {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

const anioDeMovimiento = (mesAno) => parseInt((mesAno || '0000').substring(0, 4), 10);

/**
 * @param {object} params
 * @param {Array} params.historicoSellIn - histórico GENERAL (todos los distribuidores), sin filtrar por periodo
 * @param {Array} params.historicoSellOut - histórico GENERAL (todos los distribuidores), sin filtrar por periodo
 * @param {Array} params.stockInicialGeneral - stock inicial declarado GENERAL (todos los distribuidores)
 * @param {Array} params.marcas - [{ id, nombre_marca }]
 * @param {Array<string>|null} params.idsDistribuidor - ids a incluir; null/[] = todos
 * @param {string} params.idMarca - id de marca a incluir; '' = todas
 * @returns {{ porMarca: Array<{id_marca, nombre_marca, stock_actual}>, total: number }}
 */
export function calcularStockActualPorMarca({ historicoSellIn, historicoSellOut, stockInicialGeneral, marcas, idsDistribuidor, idMarca }) {
  const añoActual = new Date().getFullYear();
  const incluyeDistribuidor = (idDist) => !idsDistribuidor || idsDistribuidor.length === 0 || idsDistribuidor.includes(idDist);
  const incluyeMarca = (idM) => !idMarca || idM === idMarca;

  // Agrupar compras y salidas por (distribuidor, marca, año)
  const comprasPorDistMarcaAnio = new Map(); // "idDist|idMarca" -> Map(año -> total)
  const salidasPorDistMarcaAnio = new Map();

  (historicoSellIn || []).forEach(mov => {
    if (!incluyeDistribuidor(mov.id_distribuidor) || !incluyeMarca(mov.id_marca)) return;
    const clave = `${mov.id_distribuidor}|${mov.id_marca}`;
    const anio = anioDeMovimiento(mov.mes_ano);
    if (!comprasPorDistMarcaAnio.has(clave)) comprasPorDistMarcaAnio.set(clave, new Map());
    const m = comprasPorDistMarcaAnio.get(clave);
    m.set(anio, (m.get(anio) || 0) + numSeguro(mov.unidades_compradas));
  });

  (historicoSellOut || []).forEach(mov => {
    if (!incluyeDistribuidor(mov.id_distribuidor) || !incluyeMarca(mov.id_marca)) return;
    const clave = `${mov.id_distribuidor}|${mov.id_marca}`;
    const anio = anioDeMovimiento(mov.mes_ano);
    const salidas = numSeguro(mov.ventas_uds) + numSeguro(mov.regaladas_uds) + numSeguro(mov.muestras_uds) + unidadesAcuerdo(mov);
    if (!salidasPorDistMarcaAnio.has(clave)) salidasPorDistMarcaAnio.set(clave, new Map());
    const m = salidasPorDistMarcaAnio.get(clave);
    m.set(anio, (m.get(anio) || 0) + salidas);
  });

  // Stock Inicial declarado: por (distribuidor, marca), la declaración de
  // año más reciente <= año actual (mismo criterio que StockDistribuidor.js).
  const seedPorDistMarca = new Map(); // clave -> { anio, stock_inicial }
  (stockInicialGeneral || []).forEach(s => {
    if (!incluyeDistribuidor(s.id_distribuidor) || !incluyeMarca(s.id_marca)) return;
    if (s.anio > añoActual) return; // declaración para un año futuro: todavía no aplica
    const clave = `${s.id_distribuidor}|${s.id_marca}`;
    const actual = seedPorDistMarca.get(clave);
    if (!actual || s.anio > actual.anio) seedPorDistMarca.set(clave, { anio: s.anio, stock_inicial: numSeguro(s.stock_inicial) });
  });

  // Universo de claves (distribuidor|marca) a considerar: unión de las que
  // tienen compras, salidas o stock inicial declarado.
  const todasLasClaves = new Set([
    ...comprasPorDistMarcaAnio.keys(),
    ...salidasPorDistMarcaAnio.keys(),
    ...seedPorDistMarca.keys(),
  ]);

  const stockPorDistMarca = new Map(); // clave -> stock_actual
  todasLasClaves.forEach(clave => {
    const seed = seedPorDistMarca.get(clave) || null;
    const anioDesde = seed ? seed.anio : -Infinity;
    const seedValor = seed ? seed.stock_inicial : 0;

    const compras = comprasPorDistMarcaAnio.get(clave) || new Map();
    const salidas = salidasPorDistMarcaAnio.get(clave) || new Map();

    let totalComprado = 0, totalSalido = 0;
    compras.forEach((total, anio) => { if (anio >= anioDesde && anio <= añoActual) totalComprado += total; });
    salidas.forEach((total, anio) => { if (anio >= anioDesde && anio <= añoActual) totalSalido += total; });

    stockPorDistMarca.set(clave, seedValor + totalComprado - totalSalido);
  });

  // Sumar por marca (a través de los distribuidores incluidos)
  const stockPorMarca = new Map(); // id_marca -> total
  stockPorDistMarca.forEach((valor, clave) => {
    const idM = clave.split('|')[1];
    stockPorMarca.set(idM, (stockPorMarca.get(idM) || 0) + valor);
  });

  const mapaNombreMarca = new Map((marcas || []).map(m => [m.id, m.nombre_marca]));
  const porMarca = Array.from(stockPorMarca.entries())
    .map(([id_marca, stock_actual]) => ({ id_marca, nombre_marca: mapaNombreMarca.get(id_marca) || 'Desconocida', stock_actual }));

  const total = porMarca.reduce((acc, fila) => acc + fila.stock_actual, 0);

  return { porMarca, total };
}
