/*
 * matching.test.js
 * Tests de matching.js — detección de posibles marcas duplicadas. Solo
 * sugiere candidatos (nunca fusiona nada solo), así que lo importante es
 * que la puntuación de similitud sea consistente y que agruparPosiblesDuplicados
 * no junte cosas que no debería.
 */
import { normalizarParaComparar, similitud, encontrarSimilares, agruparPosiblesDuplicados } from './matching';

describe('normalizarParaComparar', () => {
  test('pasa a mayúsculas y quita acentos', () => {
    expect(normalizarParaComparar('Bodegas Peñín')).toBe('BODEGAS PENIN');
  });

  test('quita lo que va entre paréntesis (años, ediciones)', () => {
    expect(normalizarParaComparar('Marqués (Reserva 2020)')).toBe('MARQUES');
  });

  test('convierte "&" en " Y "', () => {
    expect(normalizarParaComparar('Castro&Sil')).toBe('CASTRO Y SIL');
  });

  test('quita puntuación y colapsa espacios', () => {
    expect(normalizarParaComparar('  Rioja,  Crianza.  ')).toBe('RIOJA CRIANZA');
  });

  test('nombre vacío/null/undefined da cadena vacía, no revienta', () => {
    expect(normalizarParaComparar(null)).toBe('');
    expect(normalizarParaComparar(undefined)).toBe('');
    expect(normalizarParaComparar('')).toBe('');
  });
});

describe('similitud', () => {
  test('idénticos tras normalizar (solo cambia el año entre paréntesis) puntúan 1', () => {
    expect(similitud('Palomo Cojo (2023) DO Rueda', 'Palomo Cojo DO Rueda')).toBe(1);
  });

  test('uno de los dos vacío puntúa 0', () => {
    expect(similitud('', 'Rioja Crianza')).toBe(0);
    expect(similitud('Rioja Crianza', '')).toBe(0);
  });

  test('uno contenido casi entero en el otro puntúa alto (>0.8) pero no 1', () => {
    const score = similitud('Rioja Crianza', 'Rioja Crianza Reserva');
    expect(score).toBeGreaterThan(0.8);
    expect(score).toBeLessThan(1);
    expect(score).toBeCloseTo(0.8738, 3);
  });

  test('mismas palabras en distinto orden usa similitud por tokens, no por substring', () => {
    // "BLANCO NIEVA" no es substring de "NIEVA BLANCO VERDEJO" (el orden
    // literal no coincide) -> cae al cálculo por tokens: 2 comunes / 3 en total.
    const score = similitud('Blanco Nieva', 'Nieva Blanco Verdejo');
    expect(score).toBeCloseTo(2 / 3, 4);
  });

  test('marcas sin ninguna palabra en común puntúan 0', () => {
    expect(similitud('Rioja Crianza', 'Palomo Cojo')).toBe(0);
  });

  test('caso real documentado en el código: dos marcas parecidas pero distintas no deben confundirse ciegamente', () => {
    // El propio comentario de matching.js usa este ejemplo como aviso de que
    // la decisión final es humana — aquí solo comprobamos que la puntuación
    // es alta (se parecen) pero no perfecta (no son literalmente iguales).
    const score = similitud('Palomo Cojo', 'Palomo Cojo Semi Dulce');
    expect(score).toBeGreaterThan(0.7);
    expect(score).toBeLessThan(1);
  });
});

describe('encontrarSimilares', () => {
  const marcas = [
    { id: 1, nombre_marca: 'Rioja Crianza' },
    { id: 2, nombre_marca: 'Rioja Crianza Reserva' },
    { id: 3, nombre_marca: 'Palomo Cojo' }
  ];

  test('filtra por debajo del umbral mínimo', () => {
    const resultado = encontrarSimilares('Rioja Crianza', marcas, 0.9);
    // Solo el propio "Rioja Crianza" (score 1) pasa el umbral 0.9;
    // "Rioja Crianza Reserva" (~0.87) y "Palomo Cojo" (0) quedan fuera.
    expect(resultado.map(r => r.marca.id)).toEqual([1]);
  });

  test('ordena de más a menos parecido', () => {
    const resultado = encontrarSimilares('Rioja Crianza', marcas, 0.5);
    expect(resultado.map(r => r.marca.id)).toEqual([1, 2]);
    expect(resultado[0].score).toBeGreaterThanOrEqual(resultado[1].score);
  });

  test('lista vacía de marcas no revienta', () => {
    expect(encontrarSimilares('Cualquier Cosa', [])).toEqual([]);
  });
});

describe('agruparPosiblesDuplicados', () => {
  test('agrupa solo las marcas que superan el umbral, descarta las que están solas', () => {
    const marcas = [
      { id: 1, nombre_marca: 'Palomo Cojo' },
      { id: 2, nombre_marca: 'Palomo Cojo (2023)' },
      { id: 3, nombre_marca: 'Rioja Reserva' } // sin pareja, no debe aparecer
    ];
    const clusters = agruparPosiblesDuplicados(marcas, 0.6);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].map(m => m.id).sort()).toEqual([1, 2]);
  });

  test('sin ningún par por encima del umbral, no hay clusters', () => {
    const marcas = [
      { id: 1, nombre_marca: 'Rioja Crianza' },
      { id: 2, nombre_marca: 'Palomo Cojo' },
      { id: 3, nombre_marca: 'Albariño Rías Baixas' }
    ];
    expect(agruparPosiblesDuplicados(marcas, 0.6)).toEqual([]);
  });

  test('cada marca entra como mucho en un cluster (no se duplica entre grupos)', () => {
    const marcas = [
      { id: 1, nombre_marca: 'Palomo Cojo' },
      { id: 2, nombre_marca: 'Palomo Cojo (2023)' },
      { id: 3, nombre_marca: 'Palomo Cojo Edición Especial' }
    ];
    const clusters = agruparPosiblesDuplicados(marcas, 0.6);
    const idsVistos = clusters.flatMap(c => c.map(m => m.id));
    expect(new Set(idsVistos).size).toBe(idsVistos.length); // sin repetidos
  });
});
