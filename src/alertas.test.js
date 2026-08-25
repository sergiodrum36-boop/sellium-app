/*
 * alertas.test.js
 * Tests de alertas.js (Alertas proactivas). Usa "fecha de hoy" fija (fake
 * timers) para que el test de inactividad no dependa de en qué mes se
 * ejecute — sin esto, un test que compare contra `new Date()` real se
 * volvería flaky con el tiempo.
 */
import { calcularAlertas } from './alertas';

const HOY_FIJO = new Date('2026-07-25T12:00:00Z');

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(HOY_FIJO);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('balance negativo (A&P Gastado > Generado)', () => {
  test('dispara alerta cuando el Gastado supera al Generado', () => {
    const distribuidores = [{ id: 'd1', nombre_distribuidor: 'Distribuidor Uno' }];
    const sellIn = [{ id_distribuidor: 'd1', unidades_compradas: 100, ap_por_unidad: 1, mes_ano: '2026-07' }]; // generado 100
    const sellOut = [{ id_distribuidor: 'd1', regaladas_uds: 200, coste_unidad: 1, mes_ano: '2026-07' }]; // gastado 200

    const alertas = calcularAlertas({ distribuidores, sellIn, sellOut });
    const alertaBalance = alertas.find(a => a.tipo === 'balance_negativo');
    expect(alertaBalance).toBeDefined();
    expect(alertaBalance.id).toBe('balance-d1');
    expect(alertaBalance.mensaje).toMatch(/Distribuidor Uno/);
  });

  test('NO dispara si el Generado cubre el Gastado', () => {
    const distribuidores = [{ id: 'd1', nombre_distribuidor: 'Distribuidor Uno' }];
    const sellIn = [{ id_distribuidor: 'd1', unidades_compradas: 500, ap_por_unidad: 1, mes_ano: '2026-07' }];
    const sellOut = [{ id_distribuidor: 'd1', regaladas_uds: 100, coste_unidad: 1, mes_ano: '2026-07' }];

    const alertas = calcularAlertas({ distribuidores, sellIn, sellOut });
    expect(alertas.find(a => a.tipo === 'balance_negativo')).toBeUndefined();
  });
});

describe('inactividad', () => {
  test('distribuidor sin ningún movimiento dispara alerta de "sin actividad"', () => {
    const distribuidores = [{ id: 'd2', nombre_distribuidor: 'Distribuidor Sin Datos' }];
    const alertas = calcularAlertas({ distribuidores, sellIn: [], sellOut: [] });
    const alerta = alertas.find(a => a.tipo === 'sin_actividad' && a.id === 'inactividad-d2');
    expect(alerta).toBeDefined();
    expect(alerta.mensaje).toMatch(/sin ningún movimiento/);
  });

  test('sin movimientos desde hace >= 3 meses dispara alerta (umbral actual)', () => {
    // "hoy" fijado a 2026-07-25 -> 2026-04 son 3 meses exactos.
    const distribuidores = [{ id: 'd3', nombre_distribuidor: 'Distribuidor Parado' }];
    const sellIn = [{ id_distribuidor: 'd3', mes_ano: '2026-04', unidades_compradas: 10, ap_por_unidad: 1 }];
    const alertas = calcularAlertas({ distribuidores, sellIn, sellOut: [] });
    expect(alertas.find(a => a.id === 'inactividad-d3')).toBeDefined();
  });

  test('con movimiento reciente (1 mes) NO dispara la alerta', () => {
    const distribuidores = [{ id: 'd4', nombre_distribuidor: 'Distribuidor Activo' }];
    const sellOut = [{ id_distribuidor: 'd4', mes_ano: '2026-06', regaladas_uds: 0, coste_unidad: 0 }];
    const alertas = calcularAlertas({ distribuidores, sellIn: [], sellOut });
    expect(alertas.find(a => a.id === 'inactividad-d4')).toBeUndefined();
  });

  test('se queda con el mes MÁS RECIENTE entre varios movimientos, no con el primero que encuentre', () => {
    const distribuidores = [{ id: 'd5', nombre_distribuidor: 'Distribuidor Mixto' }];
    // Sell-In viejo (hace 6 meses) + Sell-Out reciente (hace 1 mes): no debería avisar,
    // porque el más reciente (Sell-Out) está dentro del umbral.
    const sellIn = [{ id_distribuidor: 'd5', mes_ano: '2026-01', unidades_compradas: 1, ap_por_unidad: 1 }];
    const sellOut = [{ id_distribuidor: 'd5', mes_ano: '2026-06', regaladas_uds: 0, coste_unidad: 0 }];
    const alertas = calcularAlertas({ distribuidores, sellIn, sellOut });
    expect(alertas.find(a => a.id === 'inactividad-d5')).toBeUndefined();
  });
});

describe('descuadre de categorías (red de seguridad)', () => {
  test('con las fórmulas actuales de calculosAP.js nunca se dispara (documenta el comportamiento actual)', () => {
    // gastoTotal(mov) y el desglose de alertas.js sobre el mismo `mov` sabe
    // literalmente a las mismas 4 funciones (valorRegaladas/valorMuestras/
    // valorAcuerdo/valorAportacionManual), así que matemáticamente siempre
    // coinciden con los datos actuales. Si en el futuro se cambia gastoTotal
    // o se guarda un "total" en Firestore por otra vía y deja de coincidir
    // con la suma de categorías, este test empezaría a fallar — esa sería la
    // señal de que hay que revisar el descuadre de verdad, no un falso positivo.
    const distribuidores = [{ id: 'd6', nombre_distribuidor: 'Distribuidor Cualquiera' }];
    const sellOut = [
      { id_distribuidor: 'd6', mes_ano: '2026-07', regaladas_uds: 10, coste_unidad: 2, muestras_uds: 3, valor_acuerdo_euros: 5, aportacion_euros: 1 },
      { id_distribuidor: 'd6', mes_ano: '2026-06', valor_regaladas_euros: 7, valor_muestras_euros: 2 }
    ];
    const alertas = calcularAlertas({ distribuidores, sellIn: [], sellOut });
    expect(alertas.find(a => a.tipo === 'descuadre')).toBeUndefined();
  });
});

describe('calcularAlertas con datos vacíos', () => {
  test('sin distribuidores no da ninguna alerta', () => {
    expect(calcularAlertas({ distribuidores: [], sellIn: [], sellOut: [] })).toEqual([]);
  });

  test('llamada sin argumentos no revienta (valores por defecto)', () => {
    expect(calcularAlertas({})).toEqual([]);
  });
});
