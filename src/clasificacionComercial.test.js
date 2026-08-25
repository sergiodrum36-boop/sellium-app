/*
 * clasificacionComercial.test.js
 * Tests de la lógica pura de "Estructura Comercial" (clasificacionComercial.js).
 */
import { sumarFacturacionPorDistribuidorYAnio, calcularCarteraComercial, aniosDisponibles, sugerirClasificacionABC } from './clasificacionComercial';

describe('sumarFacturacionPorDistribuidorYAnio', () => {
  test('suma importe_euros (Ventas Reales) por distribuidor, solo del año pedido', () => {
    const ventasReales = [
      { id_distribuidor: 'd1', mes_ano: '2025-01', importe_euros: 1000 },
      { id_distribuidor: 'd1', mes_ano: '2025-06', importe_euros: 500 },
      { id_distribuidor: 'd1', mes_ano: '2024-12', importe_euros: 9999 }, // otro año, no cuenta
      { id_distribuidor: 'd2', mes_ano: '2025-03', importe_euros: 200 },
    ];
    const mapa = sumarFacturacionPorDistribuidorYAnio(ventasReales, '2025');
    expect(mapa.get('d1')).toBe(1500);
    expect(mapa.get('d2')).toBe(200);
    expect(mapa.has('d3')).toBe(false);
  });

  test('acepta año como número', () => {
    const ventasReales = [{ id_distribuidor: 'd1', mes_ano: '2025-01', importe_euros: 100 }];
    const mapa = sumarFacturacionPorDistribuidorYAnio(ventasReales, 2025);
    expect(mapa.get('d1')).toBe(100);
  });

  test('ignora movimientos sin id_distribuidor o sin mes_ano, y trata importe_euros ausente como 0', () => {
    const ventasReales = [
      { mes_ano: '2025-01', importe_euros: 100 },
      { id_distribuidor: 'd1' },
      { id_distribuidor: 'd1', mes_ano: '2025-02' },
    ];
    const mapa = sumarFacturacionPorDistribuidorYAnio(ventasReales, '2025');
    expect(mapa.get('d1')).toBe(0);
  });

  test('lista vacía o undefined no rompe', () => {
    expect(sumarFacturacionPorDistribuidorYAnio([], '2025').size).toBe(0);
    expect(sumarFacturacionPorDistribuidorYAnio(undefined, '2025').size).toBe(0);
  });
});

describe('calcularCarteraComercial', () => {
  test('reproduce la fórmula del Excel: participación = importe del distribuidor / total de la cartera de SU comercial', () => {
    const asignaciones = [
      { id_distribuidor: 'd1', id_comercial: 'sd' },
      { id_distribuidor: 'd2', id_comercial: 'sd' },
    ];
    const facturacion = new Map([['d1', 300], ['d2', 700]]);
    const resultado = calcularCarteraComercial(asignaciones, facturacion);
    const d1 = resultado.find(r => r.id_distribuidor === 'd1');
    const d2 = resultado.find(r => r.id_distribuidor === 'd2');
    expect(d1.importe).toBe(300);
    expect(d1.participacion).toBeCloseTo(0.3);
    expect(d2.participacion).toBeCloseTo(0.7);
  });

  test('cada comercial es su propio "Total" — no se mezcla con la cartera de otro comercial', () => {
    const asignaciones = [
      { id_distribuidor: 'd1', id_comercial: 'sd' }, // cartera SD: solo d1
      { id_distribuidor: 'd2', id_comercial: 'bg' },
      { id_distribuidor: 'd3', id_comercial: 'bg' },
    ];
    const facturacion = new Map([['d1', 500], ['d2', 100], ['d3', 300]]);
    const resultado = calcularCarteraComercial(asignaciones, facturacion);
    // d1 es el único de "sd" -> 100% de su propia cartera, no de las 900 totales.
    expect(resultado.find(r => r.id_distribuidor === 'd1').participacion).toBeCloseTo(1);
    expect(resultado.find(r => r.id_distribuidor === 'd2').participacion).toBeCloseTo(0.25);
    expect(resultado.find(r => r.id_distribuidor === 'd3').participacion).toBeCloseTo(0.75);
  });

  test('participación es 0 (no NaN) si la cartera de ese comercial no factura nada', () => {
    const asignaciones = [{ id_distribuidor: 'd1', id_comercial: 'sd' }];
    const resultado = calcularCarteraComercial(asignaciones, new Map());
    expect(resultado[0].importe).toBe(0);
    expect(resultado[0].participacion).toBe(0);
  });

  test('distribuidor sin facturación conocida cuenta como importe 0 dentro de una cartera que sí factura', () => {
    const asignaciones = [
      { id_distribuidor: 'd1', id_comercial: 'sd' },
      { id_distribuidor: 'd2', id_comercial: 'sd' },
    ];
    const facturacion = new Map([['d1', 1000]]); // d2 no está en el mapa
    const resultado = calcularCarteraComercial(asignaciones, facturacion);
    expect(resultado.find(r => r.id_distribuidor === 'd2').importe).toBe(0);
    expect(resultado.find(r => r.id_distribuidor === 'd2').participacion).toBe(0);
    expect(resultado.find(r => r.id_distribuidor === 'd1').participacion).toBeCloseTo(1);
  });

  test('sin asignaciones no rompe', () => {
    expect(calcularCarteraComercial([], new Map())).toEqual([]);
    expect(calcularCarteraComercial(undefined, undefined)).toEqual([]);
  });
});

describe('sugerirClasificacionABC', () => {
  test('un único distribuidor en la cartera: su cumulado (100%) cae en el último tramo (C) con los cortes por defecto', () => {
    // Caso límite documentado a propósito: con cortes 70/90, un acumulado de
    // 100% siempre cae en "el resto" (C) — el propio Excel de Sergio llama a
    // esta columna "Clasificación SUGERIDA", así que un caso raro como este
    // se corrige a mano sin problema, no hace falta un tratamiento especial.
    const resultado = sugerirClasificacionABC([{ id_distribuidor: 'd1', id_comercial: 'sd', participacion: 1 }]);
    expect(resultado.get('d1')).toBe('C');
  });

  test('reproduce razonablemente la cartera real de Sergio (hoja SD) con los cortes por defecto 70/90', () => {
    // Participaciones reales de su Excel (orden ya descendente).
    const filas = [
      { id_distribuidor: 'merino', id_comercial: 'sd', participacion: 0.4318 },
      { id_distribuidor: 'juarez', id_comercial: 'sd', participacion: 0.2060 },
      { id_distribuidor: 'vega', id_comercial: 'sd', participacion: 0.1067 },
      { id_distribuidor: 'dyexco', id_comercial: 'sd', participacion: 0.1012 },
      { id_distribuidor: 'guillen', id_comercial: 'sd', participacion: 0.0833 },
      { id_distribuidor: 'latorre', id_comercial: 'sd', participacion: 0.0208 },
      { id_distribuidor: 'canals', id_comercial: 'sd', participacion: 0.0112 },
    ];
    const resultado = sugerirClasificacionABC(filas);
    expect(resultado.get('merino')).toBe('A');
    expect(resultado.get('juarez')).toBe('A');
    expect(resultado.get('vega')).toBe('B');
    expect(resultado.get('dyexco')).toBe('B');
    expect(resultado.get('latorre')).toBe('C');
    expect(resultado.get('canals')).toBe('C');
  });

  test('cada comercial se calcula por separado (misma regla que participación)', () => {
    const filas = [
      { id_distribuidor: 'd1', id_comercial: 'sd', participacion: 0.5 }, // acumulado 0.5 -> A
      { id_distribuidor: 'd2', id_comercial: 'sd', participacion: 0.5 }, // acumulado 1.0 -> C
      { id_distribuidor: 'd3', id_comercial: 'bg', participacion: 1 },   // cartera aparte, no se contamina con "sd"
    ];
    const resultado = sugerirClasificacionABC(filas);
    expect(resultado.get('d1')).toBe('A');
    expect(resultado.get('d2')).toBe('C');
    expect(resultado.get('d3')).toBe('C');
  });

  test('cortes personalizados (corteA=0.4, corteB=0.7)', () => {
    const filas = [
      { id_distribuidor: 'd1', id_comercial: 'x', participacion: 0.5 }, // acumulado 0.5 -> > 0.4, <= 0.7 -> B
      { id_distribuidor: 'd2', id_comercial: 'x', participacion: 0.3 }, // acumulado 0.8 -> > 0.7 -> C
      { id_distribuidor: 'd3', id_comercial: 'x', participacion: 0.2 }, // acumulado 1.0 -> C
    ];
    const resultado = sugerirClasificacionABC(filas, { corteA: 0.4, corteB: 0.7 });
    expect(resultado.get('d1')).toBe('B');
    expect(resultado.get('d2')).toBe('C');
    expect(resultado.get('d3')).toBe('C');
  });

  test('sin filas no rompe', () => {
    expect(sugerirClasificacionABC([]).size).toBe(0);
    expect(sugerirClasificacionABC(undefined).size).toBe(0);
  });
});

describe('aniosDisponibles', () => {
  test('devuelve años distintos, más reciente primero', () => {
    const historico = [
      { mes_ano: '2024-05' }, { mes_ano: '2025-01' }, { mes_ano: '2025-11' }, { mes_ano: '2023-12' },
    ];
    expect(aniosDisponibles(historico)).toEqual(['2025', '2024', '2023']);
  });

  test('lista vacía o undefined no rompe', () => {
    expect(aniosDisponibles([])).toEqual([]);
    expect(aniosDisponibles(undefined)).toEqual([]);
  });
});
