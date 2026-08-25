import { normalizarParaComparar, similitud, encontrarSimilares, agruparPosiblesDuplicados } from './matching';

describe('normalizarParaComparar', () => {
  test('pasa a mayúsculas y quita acentos', () => {
    expect(normalizarParaComparar('Bodegas Peñín')).toBe('BODEGAS PENIN');
  });
});

describe('similitud', () => {
  test('idénticos tras normalizar (solo cambia el año entre paréntesis) puntúan 1', () => {
    expect(similitud('Palomo Cojo (2023) DO Rueda', 'Palomo Cojo DO Rueda')).toBe(1);
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
    expect(resultado.map(r => r.marca.id)).toEqual([1]);
  });
});

describe('agruparPosiblesDuplicados', () => {
  test('agrupa solo las marcas que superan el umbral, descarta las que están solas', () => {
    const marcas = [
      { id: 1, nombre_marca: 'Palomo Cojo' },
      { id: 2, nombre_marca: 'Palomo Cojo (2023)' },
      { id: 3, nombre_marca: 'Rioja Reserva' }
    ];
    const clusters = agruparPosiblesDuplicados(marcas, 0.6);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].map(m => m.id).sort()).toEqual([1, 2]);
  });
});
