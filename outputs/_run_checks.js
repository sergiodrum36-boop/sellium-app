const assert = require('assert');
const { valorRegaladas, valorMuestras, valorAcuerdo, unidadesAcuerdo, valorAportacionManual, gastoTotal, unidadesMovidas, generadoSellIn } = require('/tmp/verify/_check_calculosAP.cjs');
const { normalizarParaComparar, similitud, encontrarSimilares, agruparPosiblesDuplicados } = require('/tmp/verify/_check_matching.cjs');

let pasadas = 0;
let fallidas = 0;
function check(nombre, fn) {
  try {
    fn();
    pasadas++;
    console.log('PASS -', nombre);
  } catch (e) {
    fallidas++;
    console.log('FAIL -', nombre, '\n   ', e.message);
  }
}

// ---------- calculosAP ----------
check('valorRegaladas: usa valor guardado', () => assert.strictEqual(valorRegaladas({ valor_regaladas_euros: 42, regaladas_uds: 999, coste_unidad: 999 }), 42));
check('valorRegaladas: recalcula si no hay valor guardado', () => assert.strictEqual(valorRegaladas({ regaladas_uds: 10, coste_unidad: 3 }), 30));
check('valorRegaladas: 0 guardado se respeta', () => assert.strictEqual(valorRegaladas({ valor_regaladas_euros: 0, regaladas_uds: 10, coste_unidad: 3 }), 0));
check('valorRegaladas: vacío -> 0', () => assert.strictEqual(valorRegaladas({}), 0));
check('valorRegaladas: texto no numérico -> 0', () => assert.strictEqual(valorRegaladas({ regaladas_uds: 'abc', coste_unidad: 5 }), 0));
check('valorRegaladas: numero como texto', () => assert.strictEqual(valorRegaladas({ regaladas_uds: '10', coste_unidad: '3' }), 30));
check('valorMuestras: usa valor guardado', () => assert.strictEqual(valorMuestras({ valor_muestras_euros: 15, muestras_uds: 100, coste_unidad: 100 }), 15));
check('valorMuestras: recalcula', () => assert.strictEqual(valorMuestras({ muestras_uds: 4, coste_unidad: 2.5 }), 10));
check('valorAcuerdo/unidadesAcuerdo/valorAportacionManual: 0 por defecto', () => {
  assert.strictEqual(valorAcuerdo({}), 0);
  assert.strictEqual(unidadesAcuerdo({}), 0);
  assert.strictEqual(valorAportacionManual({}), 0);
});
check('valorAcuerdo/unidadesAcuerdo/valorAportacionManual: valor guardado', () => {
  assert.strictEqual(valorAcuerdo({ valor_acuerdo_euros: 50 }), 50);
  assert.strictEqual(unidadesAcuerdo({ unidades_acuerdo: 12 }), 12);
  assert.strictEqual(valorAportacionManual({ aportacion_euros: 99.5 }), 99.5);
});
check('gastoTotal: suma de las 4 categorías', () => assert.strictEqual(gastoTotal({ valor_regaladas_euros: 10, valor_muestras_euros: 5, valor_acuerdo_euros: 3, aportacion_euros: 2 }), 20));
check('gastoTotal: vacío -> 0', () => assert.strictEqual(gastoTotal({}), 0));
check('gastoTotal: mezcla guardado/recalculado', () => assert.strictEqual(gastoTotal({ regaladas_uds: 5, coste_unidad: 2, valor_muestras_euros: 7, muestras_uds: 999, valor_acuerdo_euros: 3, aportacion_euros: 1 }), 21));
check('unidadesMovidas: suma todo', () => assert.strictEqual(unidadesMovidas({ ventas_uds: 100, regaladas_uds: 5, muestras_uds: 2, unidades_acuerdo: 3 }), 110));
check('unidadesMovidas: ausentes -> 0', () => assert.strictEqual(unidadesMovidas({ ventas_uds: 50 }), 50));
check('generadoSellIn: uds x ap_por_unidad', () => assert.strictEqual(generadoSellIn({ unidades_compradas: 200, ap_por_unidad: 0.5 }), 100));
check('generadoSellIn: vacío -> 0', () => assert.strictEqual(generadoSellIn({}), 0));

// ---------- matching ----------
check('normalizarParaComparar: mayúsculas y sin acentos', () => assert.strictEqual(normalizarParaComparar('Bodegas Peñín'), 'BODEGAS PENIN'));
check('normalizarParaComparar: quita paréntesis', () => assert.strictEqual(normalizarParaComparar('Marqués (Reserva 2020)'), 'MARQUES'));
check('normalizarParaComparar: & -> Y', () => assert.strictEqual(normalizarParaComparar('Castro&Sil'), 'CASTRO Y SIL'));
check('normalizarParaComparar: puntuación y espacios', () => assert.strictEqual(normalizarParaComparar('  Rioja,  Crianza.  '), 'RIOJA CRIANZA'));
check('normalizarParaComparar: null/undefined/vacío', () => {
  assert.strictEqual(normalizarParaComparar(null), '');
  assert.strictEqual(normalizarParaComparar(undefined), '');
  assert.strictEqual(normalizarParaComparar(''), '');
});
check('similitud: idénticos tras normalizar -> 1', () => assert.strictEqual(similitud('Palomo Cojo (2023) DO Rueda', 'Palomo Cojo DO Rueda'), 1));
check('similitud: uno vacío -> 0', () => {
  assert.strictEqual(similitud('', 'Rioja Crianza'), 0);
  assert.strictEqual(similitud('Rioja Crianza', ''), 0);
});
check('similitud: contenido casi entero -> >0.8 y <1, valor esperado', () => {
  const s = similitud('Rioja Crianza', 'Rioja Crianza Reserva');
  assert.ok(s > 0.8 && s < 1, 'fuera de rango: ' + s);
  assert.ok(Math.abs(s - 0.8738095238095238) < 0.0005, 'valor inesperado: ' + s);
});
check('similitud: mismas palabras distinto orden -> tokens (2/3)', () => {
  const s = similitud('Blanco Nieva', 'Nieva Blanco Verdejo');
  assert.ok(Math.abs(s - 2 / 3) < 0.0001, 'valor inesperado: ' + s);
});
check('similitud: sin palabras en común -> 0', () => assert.strictEqual(similitud('Rioja Crianza', 'Palomo Cojo'), 0));
check('similitud: parecidas pero distintas -> alto pero no 1', () => {
  const s = similitud('Palomo Cojo', 'Palomo Cojo Semi Dulce');
  assert.ok(s > 0.7 && s < 1, 'fuera de rango: ' + s);
});
check('encontrarSimilares: filtra por umbral', () => {
  const marcas = [{ id: 1, nombre_marca: 'Rioja Crianza' }, { id: 2, nombre_marca: 'Rioja Crianza Reserva' }, { id: 3, nombre_marca: 'Palomo Cojo' }];
  const r = encontrarSimilares('Rioja Crianza', marcas, 0.9);
  assert.deepStrictEqual(r.map(x => x.marca.id), [1]);
});
check('encontrarSimilares: ordena desc', () => {
  const marcas = [{ id: 1, nombre_marca: 'Rioja Crianza' }, { id: 2, nombre_marca: 'Rioja Crianza Reserva' }, { id: 3, nombre_marca: 'Palomo Cojo' }];
  const r = encontrarSimilares('Rioja Crianza', marcas, 0.5);
  assert.deepStrictEqual(r.map(x => x.marca.id), [1, 2]);
});
check('encontrarSimilares: lista vacía', () => assert.deepStrictEqual(encontrarSimilares('X', []), []));
check('agruparPosiblesDuplicados: agrupa y descarta solitarias', () => {
  const marcas = [{ id: 1, nombre_marca: 'Palomo Cojo' }, { id: 2, nombre_marca: 'Palomo Cojo (2023)' }, { id: 3, nombre_marca: 'Rioja Reserva' }];
  const clusters = agruparPosiblesDuplicados(marcas, 0.6);
  assert.strictEqual(clusters.length, 1);
  assert.deepStrictEqual(clusters[0].map(m => m.id).sort(), [1, 2]);
});
check('agruparPosiblesDuplicados: sin pares -> []', () => {
  const marcas = [{ id: 1, nombre_marca: 'Rioja Crianza' }, { id: 2, nombre_marca: 'Palomo Cojo' }, { id: 3, nombre_marca: 'Albariño Rías Baixas' }];
  assert.deepStrictEqual(agruparPosiblesDuplicados(marcas, 0.6), []);
});
check('agruparPosiblesDuplicados: sin ids repetidos entre clusters', () => {
  const marcas = [{ id: 1, nombre_marca: 'Palomo Cojo' }, { id: 2, nombre_marca: 'Palomo Cojo (2023)' }, { id: 3, nombre_marca: 'Palomo Cojo Edición Especial' }];
  const clusters = agruparPosiblesDuplicados(marcas, 0.6);
  const vistos = clusters.flatMap(c => c.map(m => m.id));
  assert.strictEqual(new Set(vistos).size, vistos.length);
});

// ---------- alertas (con "hoy" fijado a 2026-07-25) ----------
const RealDate = Date;
class DateFija extends RealDate {
  constructor(...args) {
    if (args.length === 0) return new RealDate('2026-07-25T12:00:00Z');
    return new RealDate(...args);
  }
  static now() { return new RealDate('2026-07-25T12:00:00Z').getTime(); }
}
global.Date = DateFija;
delete require.cache[require.resolve('/tmp/verify/_check_alertas.cjs')];
const { calcularAlertas } = require('/tmp/verify/_check_alertas.cjs');

check('alertas: balance negativo se dispara', () => {
  const distribuidores = [{ id: 'd1', nombre_distribuidor: 'Distribuidor Uno' }];
  const sellIn = [{ id_distribuidor: 'd1', unidades_compradas: 100, ap_por_unidad: 1, mes_ano: '2026-07' }];
  const sellOut = [{ id_distribuidor: 'd1', regaladas_uds: 200, coste_unidad: 1, mes_ano: '2026-07' }];
  const alertas = calcularAlertas({ distribuidores, sellIn, sellOut });
  const a = alertas.find(x => x.tipo === 'balance_negativo');
  assert.ok(a, 'no se disparó balance_negativo');
  assert.strictEqual(a.id, 'balance-d1');
  assert.ok(/Distribuidor Uno/.test(a.mensaje));
});
check('alertas: balance negativo NO se dispara si generado cubre', () => {
  const distribuidores = [{ id: 'd1', nombre_distribuidor: 'Distribuidor Uno' }];
  const sellIn = [{ id_distribuidor: 'd1', unidades_compradas: 500, ap_por_unidad: 1, mes_ano: '2026-07' }];
  const sellOut = [{ id_distribuidor: 'd1', regaladas_uds: 100, coste_unidad: 1, mes_ano: '2026-07' }];
  const alertas = calcularAlertas({ distribuidores, sellIn, sellOut });
  assert.strictEqual(alertas.find(x => x.tipo === 'balance_negativo'), undefined);
});
check('alertas: sin ningún movimiento -> sin_actividad', () => {
  const distribuidores = [{ id: 'd2', nombre_distribuidor: 'Distribuidor Sin Datos' }];
  const alertas = calcularAlertas({ distribuidores, sellIn: [], sellOut: [] });
  const a = alertas.find(x => x.id === 'inactividad-d2');
  assert.ok(a);
  assert.ok(/sin ningún movimiento/.test(a.mensaje));
});
check('alertas: 3 meses exactos SÍ dispara inactividad', () => {
  const distribuidores = [{ id: 'd3', nombre_distribuidor: 'Distribuidor Parado' }];
  const sellIn = [{ id_distribuidor: 'd3', mes_ano: '2026-04', unidades_compradas: 10, ap_por_unidad: 1 }];
  const alertas = calcularAlertas({ distribuidores, sellIn, sellOut: [] });
  assert.ok(alertas.find(x => x.id === 'inactividad-d3'));
});
check('alertas: 1 mes NO dispara inactividad', () => {
  const distribuidores = [{ id: 'd4', nombre_distribuidor: 'Distribuidor Activo' }];
  const sellOut = [{ id_distribuidor: 'd4', mes_ano: '2026-06', regaladas_uds: 0, coste_unidad: 0 }];
  const alertas = calcularAlertas({ distribuidores, sellIn: [], sellOut });
  assert.strictEqual(alertas.find(x => x.id === 'inactividad-d4'), undefined);
});
check('alertas: usa el mes MÁS RECIENTE entre sellIn/sellOut', () => {
  const distribuidores = [{ id: 'd5', nombre_distribuidor: 'Distribuidor Mixto' }];
  const sellIn = [{ id_distribuidor: 'd5', mes_ano: '2026-01', unidades_compradas: 1, ap_por_unidad: 1 }];
  const sellOut = [{ id_distribuidor: 'd5', mes_ano: '2026-06', regaladas_uds: 0, coste_unidad: 0 }];
  const alertas = calcularAlertas({ distribuidores, sellIn, sellOut });
  assert.strictEqual(alertas.find(x => x.id === 'inactividad-d5'), undefined);
});
check('alertas: descuadre nunca se dispara con las fórmulas actuales', () => {
  const distribuidores = [{ id: 'd6', nombre_distribuidor: 'Distribuidor Cualquiera' }];
  const sellOut = [
    { id_distribuidor: 'd6', mes_ano: '2026-07', regaladas_uds: 10, coste_unidad: 2, muestras_uds: 3, valor_acuerdo_euros: 5, aportacion_euros: 1 },
    { id_distribuidor: 'd6', mes_ano: '2026-06', valor_regaladas_euros: 7, valor_muestras_euros: 2 }
  ];
  const alertas = calcularAlertas({ distribuidores, sellIn: [], sellOut });
  assert.strictEqual(alertas.find(x => x.tipo === 'descuadre'), undefined);
});
check('alertas: sin distribuidores -> []', () => assert.deepStrictEqual(calcularAlertas({ distribuidores: [], sellIn: [], sellOut: [] }), []));
check('alertas: sin argumentos no revienta', () => assert.deepStrictEqual(calcularAlertas({}), []));

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
process.exit(fallidas > 0 ? 1 : 0);
