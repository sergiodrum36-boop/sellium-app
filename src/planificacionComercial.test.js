/*
 * planificacionComercial.test.js
 * Tests de la lógica pura de "Planificación Comercial" (planificacionComercial.js).
 */
import {
  obtenerRangoTrimestreNatural,
  diasHabilesEntre,
  calcularDiasDelCriterio,
  repartirVisitasPorImporte,
  dividirEnBloques,
  MAX_DIAS_POR_BLOQUE,
  generarCalendarioVisitas,
  calcularDiasTeoricosPorDistribuidor,
  generarDiasHabilesConsecutivosDesde,
} from './planificacionComercial';

describe('obtenerRangoTrimestreNatural', () => {
  test('Q1 es enero-marzo', () => {
    const { inicio, fin } = obtenerRangoTrimestreNatural(2026, 1);
    expect(inicio.toISOString().slice(0, 10)).toBe('2026-01-01');
    expect(fin.toISOString().slice(0, 10)).toBe('2026-03-31');
  });

  test('Q2 es abril-junio', () => {
    const { inicio, fin } = obtenerRangoTrimestreNatural(2026, 2);
    expect(inicio.toISOString().slice(0, 10)).toBe('2026-04-01');
    expect(fin.toISOString().slice(0, 10)).toBe('2026-06-30');
  });

  test('Q3 es julio-septiembre', () => {
    const { inicio, fin } = obtenerRangoTrimestreNatural(2026, 3);
    expect(inicio.toISOString().slice(0, 10)).toBe('2026-07-01');
    expect(fin.toISOString().slice(0, 10)).toBe('2026-09-30');
  });

  test('Q4 es octubre-diciembre', () => {
    const { inicio, fin } = obtenerRangoTrimestreNatural(2026, 4);
    expect(inicio.toISOString().slice(0, 10)).toBe('2026-10-01');
    expect(fin.toISOString().slice(0, 10)).toBe('2026-12-31');
  });

  test('acepta año/trimestre como string numérico', () => {
    const { inicio } = obtenerRangoTrimestreNatural('2025', '3');
    expect(inicio.toISOString().slice(0, 10)).toBe('2025-07-01');
  });

  test('trimestre inválido lanza error', () => {
    expect(() => obtenerRangoTrimestreNatural(2026, 5)).toThrow();
    expect(() => obtenerRangoTrimestreNatural(2026, 0)).toThrow();
  });
});

describe('diasHabilesEntre', () => {
  test('excluye sábados y domingos', () => {
    // 2026-01-01 es jueves, 2026-01-31 es sábado.
    const dias = diasHabilesEntre(new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2026, 0, 11)));
    // 1(ju) 2(vi) 5(lu) 6(ma) 7(mi) 8(ju) 9(vi) -> 7 días, sin el finde 3-4 ni 10-11
    expect(dias.length).toBe(7);
    dias.forEach((d) => {
      const dow = d.getUTCDay();
      expect(dow).not.toBe(0);
      expect(dow).not.toBe(6);
    });
  });

  test('rango vacío o invertido no rompe', () => {
    expect(diasHabilesEntre(null, null)).toEqual([]);
    expect(diasHabilesEntre(new Date(Date.UTC(2026, 0, 10)), new Date(Date.UTC(2026, 0, 1)))).toEqual([]);
  });
});

describe('calcularDiasDelCriterio', () => {
  test('40% de 64 días laborables -> 26 días (redondeado)', () => {
    expect(calcularDiasDelCriterio(40, 64)).toBe(26); // round(25.6)
  });

  test('sin porcentaje (0 o ausente) -> 0 días', () => {
    expect(calcularDiasDelCriterio(0, 64)).toBe(0);
    expect(calcularDiasDelCriterio(undefined, 64)).toBe(0);
  });

  test('sin días laborables en el trimestre -> 0 días, no rompe', () => {
    expect(calcularDiasDelCriterio(50, 0)).toBe(0);
    expect(calcularDiasDelCriterio(50, undefined)).toBe(0);
  });
});

describe('repartirVisitasPorImporte', () => {
  test('reparte proporcional al importe dentro del grupo', () => {
    const distribuidores = [
      { id_distribuidor: 'd1', importe: 300 },
      { id_distribuidor: 'd2', importe: 700 },
    ];
    const resultado = repartirVisitasPorImporte(distribuidores, 10);
    expect(resultado.find((d) => d.id_distribuidor === 'd1').numVisitas).toBe(3); // round(10*0.3)
    expect(resultado.find((d) => d.id_distribuidor === 'd2').numVisitas).toBe(7); // round(10*0.7)
  });

  test('si nadie del grupo factura nada, reparte a partes iguales (no da 0 a todos)', () => {
    const distribuidores = [
      { id_distribuidor: 'd1', importe: 0 },
      { id_distribuidor: 'd2', importe: 0 },
    ];
    const resultado = repartirVisitasPorImporte(distribuidores, 10);
    expect(resultado.find((d) => d.id_distribuidor === 'd1').numVisitas).toBe(5);
    expect(resultado.find((d) => d.id_distribuidor === 'd2').numVisitas).toBe(5);
  });

  test('sin días de criterio (0) -> todos a 0 visitas', () => {
    const distribuidores = [{ id_distribuidor: 'd1', importe: 100 }];
    const resultado = repartirVisitasPorImporte(distribuidores, 0);
    expect(resultado[0].numVisitas).toBe(0);
  });

  test('lista vacía no rompe', () => {
    expect(repartirVisitasPorImporte([], 10)).toEqual([]);
    expect(repartirVisitasPorImporte(undefined, 10)).toEqual([]);
  });
});

describe('calcularDiasTeoricosPorDistribuidor', () => {
  // Q1 2026 tiene 64 días laborables.
  test('reparte el objetivo del criterio entre los distribuidores según su importe', () => {
    const criteriosPorId = new Map([['critA', { porcentaje_trimestre: 40 }]]); // round(64*0.4) = 26
    const asignaciones = [
      { id_comercial: 'sd', id_distribuidor: 'd1', id_criterio: 'critA', importe: 300 },
      { id_comercial: 'sd', id_distribuidor: 'd2', id_criterio: 'critA', importe: 700 },
    ];
    const teoricos = calcularDiasTeoricosPorDistribuidor(asignaciones, criteriosPorId, 64);
    expect(teoricos.get('d1')).toBe(8); // round(26*0.3)
    expect(teoricos.get('d2')).toBe(18); // round(26*0.7)
  });

  test('distribuidor sin id_criterio o con criterio inexistente/sin_visita no aparece en el resultado', () => {
    const criteriosPorId = new Map([
      ['critA', { porcentaje_trimestre: 40 }],
      ['critF', { porcentaje_trimestre: 40, sin_visita: true }],
    ]);
    const asignaciones = [
      { id_comercial: 'sd', id_distribuidor: 'd1', id_criterio: '' },
      { id_comercial: 'sd', id_distribuidor: 'd2', id_criterio: 'no-existe' },
      { id_comercial: 'sd', id_distribuidor: 'd3', id_criterio: 'critF' },
      { id_comercial: 'sd', id_distribuidor: 'd4', id_criterio: 'critA', importe: 100 },
    ];
    const teoricos = calcularDiasTeoricosPorDistribuidor(asignaciones, criteriosPorId, 64);
    expect(teoricos.has('d1')).toBe(false);
    expect(teoricos.has('d2')).toBe(false);
    expect(teoricos.has('d3')).toBe(false);
    expect(teoricos.get('d4')).toBe(26); // único del grupo -> se lleva el 100% del presupuesto
  });

  test('sin asignaciones no rompe', () => {
    expect(calcularDiasTeoricosPorDistribuidor([], new Map(), 64).size).toBe(0);
    expect(calcularDiasTeoricosPorDistribuidor(undefined, new Map(), 64).size).toBe(0);
  });
});

describe('generarDiasHabilesConsecutivosDesde', () => {
  test('empezando en lunes, genera N días laborables consecutivos', () => {
    const dias = generarDiasHabilesConsecutivosDesde('2026-01-05', 3); // lunes
    expect(dias.map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-01-05', '2026-01-06', '2026-01-07']);
  });

  test('salta el fin de semana si la cuenta cae en él', () => {
    const dias = generarDiasHabilesConsecutivosDesde('2026-01-09', 3); // viernes
    expect(dias.map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-01-09', '2026-01-12', '2026-01-13']);
  });

  test('si la fecha de inicio es fin de semana, empieza en el siguiente día laborable', () => {
    const dias = generarDiasHabilesConsecutivosDesde('2026-01-10', 2); // sábado
    expect(dias.map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-01-12', '2026-01-13']);
  });

  test('sin fecha o sin cantidad no rompe', () => {
    expect(generarDiasHabilesConsecutivosDesde('', 3)).toEqual([]);
    expect(generarDiasHabilesConsecutivosDesde('2026-01-05', 0)).toEqual([]);
    expect(generarDiasHabilesConsecutivosDesde(undefined, 3)).toEqual([]);
  });
});

describe('dividirEnBloques', () => {
  test('cabe entero en un solo bloque -> no fragmenta', () => {
    expect(dividirEnBloques(3, 5)).toEqual([3]);
    expect(dividirEnBloques(5, 5)).toEqual([5]);
  });

  test('reparte en bloques equilibrados, nunca deja un bloque de 1 día suelto al final', () => {
    expect(dividirEnBloques(26, 5)).toEqual([5, 5, 4, 4, 4, 4]); // no [5,5,5,5,5,1]
    expect(dividirEnBloques(7, 5)).toEqual([4, 3]); // no [5,2]
    expect(dividirEnBloques(10, 5)).toEqual([5, 5]);
  });

  test('todos los bloques suman el total pedido y ninguno supera el máximo', () => {
    [1, 2, 3, 4, 5, 6, 7, 13, 26, 41].forEach((total) => {
      const bloques = dividirEnBloques(total, 5);
      expect(bloques.reduce((s, b) => s + b, 0)).toBe(total);
      bloques.forEach((b) => expect(b).toBeLessThanOrEqual(5));
      bloques.forEach((b) => expect(b).toBeGreaterThan(0));
    });
  });

  test('sin días (0 o ausente) -> sin bloques', () => {
    expect(dividirEnBloques(0, 5)).toEqual([]);
    expect(dividirEnBloques(undefined, 5)).toEqual([]);
  });

  test('usa MAX_DIAS_POR_BLOQUE (5) como límite por defecto', () => {
    expect(MAX_DIAS_POR_BLOQUE).toBe(5);
    expect(dividirEnBloques(6)).toEqual([3, 3]);
  });
});

describe('generarCalendarioVisitas', () => {
  // Q1 2026 tiene 64 días laborables (ver diasHabilesEntre).
  const criteriosPorId = new Map([
    ['critA', { porcentaje_trimestre: 40 }], // round(64*0.4) = 26 días
    ['critUnaVisita', { porcentaje_trimestre: 1 }], // round(64*0.01) = 1 día (con 1 solo distribuidor)
  ]);

  // Agrupa un resultado por id_bloque y devuelve, para cada bloque, sus
  // visitas ordenadas por posición dentro del bloque — para comprobar que
  // los días de un mismo bloque son consecutivos en el calendario laboral.
  const agruparPorBloque = (resultado) => {
    const mapa = new Map();
    resultado.forEach((v) => {
      const lista = mapa.get(v.id_bloque) || [];
      lista.push(v);
      mapa.set(v.id_bloque, lista);
    });
    mapa.forEach((lista) => lista.sort((a, b) => a.dia_bloque - b.dia_bloque));
    return mapa;
  };

  test('distribuidor sin id_criterio se ignora', () => {
    const asignaciones = [{ id_comercial: 'sd', id_distribuidor: 'd1', id_criterio: '' }];
    const resultado = generarCalendarioVisitas(asignaciones, criteriosPorId, 2026, 1);
    expect(resultado).toEqual([]);
  });

  test('criterio con sin_visita=true nunca genera visitas, aunque tenga porcentaje_trimestre válido', () => {
    const criteriosConSinVisita = new Map([
      ...criteriosPorId,
      ['critF', { porcentaje_trimestre: 40, sin_visita: true }],
    ]);
    const asignaciones = [
      { id_comercial: 'sd', id_distribuidor: 'd1', id_criterio: 'critF' },
      { id_comercial: 'sd', id_distribuidor: 'd2', id_criterio: 'critA' }, // este SÍ debe planificarse
    ];
    const resultado = generarCalendarioVisitas(asignaciones, criteriosConSinVisita, 2026, 1);
    expect(resultado.every((v) => v.id_distribuidor !== 'd1')).toBe(true);
    expect(resultado.some((v) => v.id_distribuidor === 'd2')).toBe(true);
  });

  test('distribuidor con id_criterio que no existe en el mapa se ignora', () => {
    const asignaciones = [{ id_comercial: 'sd', id_distribuidor: 'd1', id_criterio: 'no-existe' }];
    const resultado = generarCalendarioVisitas(asignaciones, criteriosPorId, 2026, 1);
    expect(resultado).toEqual([]);
  });

  test('genera el número esperado de días para un único distribuidor con criterio A, agrupados en bloques', () => {
    const asignaciones = [{ id_comercial: 'sd', id_distribuidor: 'd1', id_criterio: 'critA', importe: 1000 }];
    const resultado = generarCalendarioVisitas(asignaciones, criteriosPorId, 2026, 1);
    expect(resultado.length).toBe(26); // 26 días repartidos en bloques (dividirEnBloques(26,5) = [5,5,4,4,4,4])
    resultado.forEach((v) => {
      expect(v.id_comercial).toBe('sd');
      expect(v.id_distribuidor).toBe('d1');
      expect(v.fecha instanceof Date).toBe(true);
      expect(v.id_bloque).toBeTruthy();
      const dow = v.fecha.getUTCDay();
      expect(dow).not.toBe(0);
      expect(dow).not.toBe(6);
    });

    const bloques = agruparPorBloque(resultado);
    expect(bloques.size).toBe(6); // dividirEnBloques(26,5) -> 6 bloques
    bloques.forEach((visitasDelBloque) => {
      expect(visitasDelBloque.length).toBeLessThanOrEqual(5);
      expect(visitasDelBloque[0].longitud_bloque).toBe(visitasDelBloque.length);
      // días consecutivos dentro del bloque (pueden saltar un fin de semana,
      // que en el array de días laborables sigue siendo "el siguiente índice").
      for (let i = 1; i < visitasDelBloque.length; i++) {
        expect(visitasDelBloque[i].dia_bloque).toBe(visitasDelBloque[i - 1].dia_bloque + 1);
      }
    });
  });

  test('un bloque nunca supera MAX_DIAS_POR_BLOQUE (5) días seguidos', () => {
    const asignaciones = [{ id_comercial: 'sd', id_distribuidor: 'd1', id_criterio: 'critA', importe: 1000 }];
    const resultado = generarCalendarioVisitas(asignaciones, criteriosPorId, 2026, 1);
    const bloques = agruparPorBloque(resultado);
    bloques.forEach((visitasDelBloque) => expect(visitasDelBloque.length).toBeLessThanOrEqual(MAX_DIAS_POR_BLOQUE));
  });

  // Regresión del bug real reportado por Sergio (26/07/2026): 2
  // distribuidores compartiendo un criterio con un % bajo NO deben acaparar
  // el trimestre completo — el presupuesto de días del criterio es el mismo
  // tenga 1 o 20 distribuidores, solo cambia el reparto entre ellos (y ahora
  // además se agrupan en bloques de días seguidos, no días sueltos).
  test('varios distribuidores en el mismo criterio se reparten el presupuesto en bloques, no lo acaparan cada uno por su cuenta', () => {
    const criteriosBajos = new Map([['critC', { porcentaje_trimestre: 15 }]]); // round(64*0.15) = 10 días
    const asignaciones = [
      { id_comercial: 'sd', id_distribuidor: 'd1', id_criterio: 'critC', importe: 0 },
      { id_comercial: 'sd', id_distribuidor: 'd2', id_criterio: 'critC', importe: 0 },
    ];
    const resultado = generarCalendarioVisitas(asignaciones, criteriosBajos, 2026, 1);
    // Antes del cambio de modelo, cada uno pedía su propio cálculo aislado y
    // entre los dos podían llegar a ocupar los 64 días laborables enteros.
    // Ahora el total combinado debe ser como mucho el presupuesto de C (10).
    expect(resultado.length).toBeLessThanOrEqual(10);
    const visitasD1 = resultado.filter((v) => v.id_distribuidor === 'd1').length;
    const visitasD2 = resultado.filter((v) => v.id_distribuidor === 'd2').length;
    expect(visitasD1).toBe(5); // reparto a partes iguales (importe 0 en ambos)
    expect(visitasD2).toBe(5);
    // Cada uno cabe en un solo bloque de 5 (dividirEnBloques(5,5) = [5]).
    const bloques = agruparPorBloque(resultado);
    expect(bloques.size).toBe(2);
  });

  test('dentro de un mismo criterio, reparte según el importe de cada distribuidor y agrupa en bloques', () => {
    const criteriosBajos = new Map([['critC', { porcentaje_trimestre: 15 }]]); // 10 días
    const asignaciones = [
      { id_comercial: 'sd', id_distribuidor: 'd1', id_criterio: 'critC', importe: 300 },
      { id_comercial: 'sd', id_distribuidor: 'd2', id_criterio: 'critC', importe: 700 },
    ];
    const resultado = generarCalendarioVisitas(asignaciones, criteriosBajos, 2026, 1);
    expect(resultado.filter((v) => v.id_distribuidor === 'd1').length).toBe(3); // round(10*0.3) -> 1 bloque de 3
    expect(resultado.filter((v) => v.id_distribuidor === 'd2').length).toBe(7); // round(10*0.7) -> bloques [4,3]
    const bloques = agruparPorBloque(resultado);
    // d1: 1 bloque (3 cabe entero); d2: 2 bloques (dividirEnBloques(7,5) = [4,3])
    const bloquesD1 = [...bloques.values()].filter((v) => v[0].id_distribuidor === 'd1');
    const bloquesD2 = [...bloques.values()].filter((v) => v[0].id_distribuidor === 'd2');
    expect(bloquesD1.length).toBe(1);
    expect(bloquesD2.length).toBe(2);
  });

  test('un mismo comercial nunca tiene dos visitas el mismo día, ni siquiera entre bloques distintos', () => {
    const asignaciones = [
      { id_comercial: 'sd', id_distribuidor: 'd1', id_criterio: 'critA', importe: 500 },
      { id_comercial: 'sd', id_distribuidor: 'd2', id_criterio: 'critA', importe: 300 },
      { id_comercial: 'sd', id_distribuidor: 'd3', id_criterio: 'critA', importe: 200 },
    ];
    const resultado = generarCalendarioVisitas(asignaciones, criteriosPorId, 2026, 1);
    const fechasDeSD = resultado.filter((v) => v.id_comercial === 'sd').map((v) => v.fecha.getTime());
    const fechasUnicas = new Set(fechasDeSD);
    expect(fechasUnicas.size).toBe(fechasDeSD.length); // ninguna repetida
  });

  test('dos comerciales distintos SÍ pueden coincidir en la misma fecha (no comparten recurso)', () => {
    const asignaciones = [
      { id_comercial: 'sd', id_distribuidor: 'd1', id_criterio: 'critUnaVisita', importe: 100 }, // 1 visita, cae hacia el centro
      { id_comercial: 'bg', id_distribuidor: 'd2', id_criterio: 'critUnaVisita', importe: 100 }, // idéntico criterio -> misma posición ideal
    ];
    const resultado = generarCalendarioVisitas(asignaciones, criteriosPorId, 2026, 1);
    const fechaSD = resultado.find((v) => v.id_comercial === 'sd').fecha.getTime();
    const fechaBG = resultado.find((v) => v.id_comercial === 'bg').fecha.getTime();
    expect(fechaSD).toBe(fechaBG); // mismo día, comerciales distintos -> permitido
  });

  test('cada comercial se planifica de forma independiente (su propia cartera)', () => {
    const asignaciones = [
      { id_comercial: 'sd', id_distribuidor: 'd1', id_criterio: 'critA', importe: 100 },
      { id_comercial: 'bg', id_distribuidor: 'd2', id_criterio: 'critUnaVisita', importe: 100 },
    ];
    const resultado = generarCalendarioVisitas(asignaciones, criteriosPorId, 2026, 1);
    expect(resultado.filter((v) => v.id_comercial === 'sd').length).toBe(26);
    expect(resultado.filter((v) => v.id_comercial === 'bg').length).toBe(1);
  });

  test('resultado ordenado por fecha ascendente', () => {
    const asignaciones = [
      { id_comercial: 'sd', id_distribuidor: 'd1', id_criterio: 'critA', importe: 100 },
      { id_comercial: 'bg', id_distribuidor: 'd2', id_criterio: 'critA', importe: 100 },
    ];
    const resultado = generarCalendarioVisitas(asignaciones, criteriosPorId, 2026, 1);
    for (let i = 1; i < resultado.length; i++) {
      expect(resultado[i].fecha.getTime()).toBeGreaterThanOrEqual(resultado[i - 1].fecha.getTime());
    }
  });

  test('sin asignaciones no rompe', () => {
    expect(generarCalendarioVisitas([], criteriosPorId, 2026, 1)).toEqual([]);
    expect(generarCalendarioVisitas(undefined, criteriosPorId, 2026, 1)).toEqual([]);
  });

  test('caso límite: porcentaje tan alto que no caben todos los bloques no rompe (se degradan o descartan, nunca truena)', () => {
    const criteriosExtremos = new Map([['critExtremo', { porcentaje_trimestre: 100 }]]);
    const asignaciones = [
      { id_comercial: 'sd', id_distribuidor: 'd1', id_criterio: 'critExtremo', importe: 999999 },
      { id_comercial: 'sd', id_distribuidor: 'd2', id_criterio: 'critExtremo', importe: 1 },
    ];
    const resultado = generarCalendarioVisitas(asignaciones, criteriosExtremos, 2026, 1);
    const diasHabilesQ1 = diasHabilesEntre(
      obtenerRangoTrimestreNatural(2026, 1).inicio,
      obtenerRangoTrimestreNatural(2026, 1).fin
    );
    expect(resultado.length).toBeLessThanOrEqual(diasHabilesQ1.length);
    expect(resultado.length).toBeGreaterThan(0);
    // ningún comercial tiene el mismo día repetido, y ningún bloque supera 5.
    const fechas = resultado.map((v) => v.fecha.getTime());
    expect(new Set(fechas).size).toBe(fechas.length);
    const bloques = agruparPorBloque(resultado);
    bloques.forEach((visitasDelBloque) => expect(visitasDelBloque.length).toBeLessThanOrEqual(MAX_DIAS_POR_BLOQUE));
  });
});
