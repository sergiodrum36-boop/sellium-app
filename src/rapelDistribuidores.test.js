import {
  agregarFacturacionPorMarca,
  calcularObjetivoTotalFacturacion,
  calcularFacturacionRealTotal,
  calcularPctCumplimiento,
  encontrarTramoAplicable,
  calcularRapelDistribuidor,
} from './rapelDistribuidores';

describe('agregarFacturacionPorMarca', () => {
  const ventas = [
    { id_distribuidor: 'D1', id_marca: 'M1', nombre_marca: 'Marca 1', mes_ano: '2025-01', cajas: 10, importe_euros: 100 },
    { id_distribuidor: 'D1', id_marca: 'M1', nombre_marca: 'Marca 1', mes_ano: '2025-02', cajas: 5, importe_euros: 50 },
    { id_distribuidor: 'D1', id_marca: 'M2', nombre_marca: 'Marca 2', mes_ano: '2025-01', cajas: 2, importe_euros: 20 },
    { id_distribuidor: 'D2', id_marca: 'M1', nombre_marca: 'Marca 1', mes_ano: '2025-01', cajas: 1, importe_euros: 1000 },
    { id_distribuidor: 'D1', id_marca: 'M1', nombre_marca: 'Marca 1', mes_ano: '2024-01', cajas: 999, importe_euros: 9999 },
  ];

  test('suma cajas e importe por marca, filtrando por año y distribuidor', () => {
    const mapa = agregarFacturacionPorMarca(ventas, 2025, 'D1');
    expect(mapa.get('M1')).toEqual({ id_marca: 'M1', nombre_marca: 'Marca 1', cajas: 15, importe: 150 });
    expect(mapa.get('M2')).toEqual({ id_marca: 'M2', nombre_marca: 'Marca 2', cajas: 2, importe: 20 });
    expect(mapa.has('D2')).toBe(false);
  });

  test('sin distribuidor (vacío) agrega todos', () => {
    const mapa = agregarFacturacionPorMarca(ventas, 2025, '');
    expect(mapa.get('M1').importe).toBe(150 + 1000);
  });

  test('array vacío o undefined no rompe', () => {
    expect(agregarFacturacionPorMarca([], 2025, 'D1').size).toBe(0);
    expect(agregarFacturacionPorMarca(undefined, 2025, 'D1').size).toBe(0);
  });
});

describe('calcularObjetivoTotalFacturacion', () => {
  const ventasReales = [
    { id_distribuidor: 'D1', id_marca: 'M1', nombre_marca: 'Marca 1', mes_ano: '2025-01', cajas: 10, importe_euros: 1000 },
    { id_distribuidor: 'D1', id_marca: 'M2', nombre_marca: 'Marca 2', mes_ano: '2025-06', cajas: 4, importe_euros: 500 },
  ];

  test('año anterior x (1 + %crecimiento), sumado entre marcas', () => {
    const presupuesto = {
      anio: 2026,
      id_distribuidor: 'D1',
      objetivos_facturacion_marca: [
        { id_marca: 'M1', pct_crecimiento: 10 },
        { id_marca: 'M2', pct_crecimiento: -20 },
      ],
    };
    const total = calcularObjetivoTotalFacturacion(presupuesto, ventasReales);
    // M1: 1000 * 1.10 = 1100 ; M2: 500 * 0.80 = 400 => 1500
    expect(total).toBeCloseTo(1500);
  });

  test('sin presupuesto devuelve 0', () => {
    expect(calcularObjetivoTotalFacturacion(null, ventasReales)).toBe(0);
  });

  test('marca sin ventas el año anterior cuenta como base 0', () => {
    const presupuesto = { anio: 2026, id_distribuidor: 'D1', objetivos_facturacion_marca: [{ id_marca: 'M3', pct_crecimiento: 50 }] };
    expect(calcularObjetivoTotalFacturacion(presupuesto, ventasReales)).toBe(0);
  });
});

describe('calcularFacturacionRealTotal', () => {
  test('suma el importe de todas las marcas de ese año/distribuidor', () => {
    const ventas = [
      { id_distribuidor: 'D1', id_marca: 'M1', mes_ano: '2026-01', importe_euros: 300 },
      { id_distribuidor: 'D1', id_marca: 'M2', mes_ano: '2026-02', importe_euros: 200 },
      { id_distribuidor: 'D1', id_marca: 'M2', mes_ano: '2025-02', importe_euros: 9999 },
    ];
    expect(calcularFacturacionRealTotal(ventas, 2026, 'D1')).toBe(500);
  });
});

describe('calcularPctCumplimiento', () => {
  test('real/objetivo x 100', () => {
    expect(calcularPctCumplimiento(120, 100)).toBeCloseTo(120);
    expect(calcularPctCumplimiento(50, 100)).toBeCloseTo(50);
  });

  test('objetivo 0 o negativo devuelve null, no Infinity/NaN', () => {
    expect(calcularPctCumplimiento(100, 0)).toBeNull();
    expect(calcularPctCumplimiento(100, null)).toBeNull();
    expect(calcularPctCumplimiento(100, -5)).toBeNull();
  });
});

describe('encontrarTramoAplicable', () => {
  const tramos = [
    { pct_min: 0, pct_max: 90, pct_rapel: 0 },
    { pct_min: 90, pct_max: 100, pct_rapel: 1 },
    { pct_min: 100, pct_max: 110, pct_rapel: 1.5 },
    { pct_min: 110, pct_max: null, pct_rapel: 2 },
  ];

  test('encuentra el tramo correcto, sin importar el orden de entrada', () => {
    const desordenados = [tramos[2], tramos[0], tramos[3], tramos[1]];
    expect(encontrarTramoAplicable(desordenados, 95).pct_rapel).toBe(1);
    expect(encontrarTramoAplicable(desordenados, 100).pct_rapel).toBe(1.5);
    expect(encontrarTramoAplicable(desordenados, 89).pct_rapel).toBe(0);
  });

  test('pct_max null = sin tope', () => {
    expect(encontrarTramoAplicable(tramos, 500).pct_rapel).toBe(2);
  });

  test('cumplimiento null devuelve null', () => {
    expect(encontrarTramoAplicable(tramos, null)).toBeNull();
  });

  test('cumplimiento negativo sin tramo que lo cubra devuelve null', () => {
    expect(encontrarTramoAplicable(tramos, -10)).toBeNull();
  });
});

describe('calcularRapelDistribuidor', () => {
  const tramos = [
    { pct_min: 0, pct_max: 100, pct_rapel: 1 },
    { pct_min: 100, pct_max: null, pct_rapel: 2 },
  ];

  test('combina tramo de facturación + bonificaciones activas', () => {
    const resultado = calcularRapelDistribuidor({
      objetivoTotal: 1000,
      facturacionReal: 1200,
      tramos,
      bonificacionesActivas: [{ nombre: 'Datos detallados', pct: 0.5 }],
    });
    expect(resultado.pctCumplimiento).toBeCloseTo(120);
    expect(resultado.pctRapelTramo).toBe(2);
    expect(resultado.pctBonificaciones).toBeCloseTo(0.5);
    expect(resultado.pctRapelTotal).toBeCloseTo(2.5);
    expect(resultado.importeRapel).toBeCloseTo(1200 * 0.025);
  });

  test('sin objetivo (0) no rompe: pctRapelTramo 0, cumplimiento null', () => {
    const resultado = calcularRapelDistribuidor({ objetivoTotal: 0, facturacionReal: 500, tramos, bonificacionesActivas: [] });
    expect(resultado.pctCumplimiento).toBeNull();
    expect(resultado.pctRapelTramo).toBe(0);
    expect(resultado.importeRapel).toBe(0);
  });

  test('sin bonificaciones activas no suma nada', () => {
    const resultado = calcularRapelDistribuidor({ objetivoTotal: 1000, facturacionReal: 900, tramos, bonificacionesActivas: undefined });
    expect(resultado.pctBonificaciones).toBe(0);
    expect(resultado.pctRapelTotal).toBe(1);
  });
});
