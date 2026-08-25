import {
  fechaEfectivaMovimiento,
  estaDentroDeVigencia,
  calcularConsumoAcuerdo,
  calcularEstadoVigencia,
  diasHastaFin,
} from './seguimientoAcuerdos';

describe('fechaEfectivaMovimiento', () => {
  test('usa fecha real si existe', () => {
    expect(fechaEfectivaMovimiento({ fecha: '2026-03-15', mes_ano: '2026-03' })).toBe('2026-03-15');
  });
  test('cae al primer día del mes si no hay fecha', () => {
    expect(fechaEfectivaMovimiento({ mes_ano: '2026-03' })).toBe('2026-03-01');
  });
  test('null si no hay ni fecha ni mes_ano', () => {
    expect(fechaEfectivaMovimiento({})).toBeNull();
  });
});

describe('estaDentroDeVigencia', () => {
  test('dentro de rango cerrado', () => {
    expect(estaDentroDeVigencia('2026-05-01', '2026-01-01', '2026-12-31')).toBe(true);
  });
  test('fuera por abajo', () => {
    expect(estaDentroDeVigencia('2025-12-31', '2026-01-01', '2026-12-31')).toBe(false);
  });
  test('fuera por arriba', () => {
    expect(estaDentroDeVigencia('2027-01-01', '2026-01-01', '2026-12-31')).toBe(false);
  });
  test('extremos abiertos si el acuerdo no los trae', () => {
    expect(estaDentroDeVigencia('2020-01-01', '', '')).toBe(true);
  });
});

describe('calcularConsumoAcuerdo', () => {
  const acuerdo = {
    id_cliente: 'C1',
    vigencia_inicio: '2026-07-01',
    vigencia_fin: '2027-06-30',
    volumen_objetivo_botellas: 900,
    referencias: [
      { id_marca: 'M1', nombre_marca: 'Palomo Cojo' },
      { id_marca: 'M2', nombre_marca: 'Palomo Cojo Semidulce' },
    ],
  };

  test('acuerdo sin id_cliente no está vinculado', () => {
    const r = calcularConsumoAcuerdo({ acuerdo: { ...acuerdo, id_cliente: null }, movimientos: [] });
    expect(r.vinculado).toBe(false);
    expect(r.pctCumplimiento).toBeNull();
  });

  test('suma solo movimientos del cliente, de las marcas del acuerdo y dentro de vigencia', () => {
    const movimientos = [
      { id_cliente: 'C1', id_marca: 'M1', nombre_marca: 'Palomo Cojo', uds_totales: 200, fecha: '2026-08-10' },
      { id_cliente: 'C1', id_marca: 'M2', nombre_marca: 'Palomo Cojo Semidulce', uds_totales: 100, mes_ano: '2026-09' },
      // otro cliente: no cuenta
      { id_cliente: 'C2', id_marca: 'M1', nombre_marca: 'Palomo Cojo', uds_totales: 999, fecha: '2026-08-10' },
      // marca fuera del acuerdo: no cuenta
      { id_cliente: 'C1', id_marca: 'M3', nombre_marca: 'Pato Mareao', uds_totales: 999, fecha: '2026-08-10' },
      // fuera de vigencia: no cuenta
      { id_cliente: 'C1', id_marca: 'M1', nombre_marca: 'Palomo Cojo', uds_totales: 999, fecha: '2027-08-10' },
    ];
    const r = calcularConsumoAcuerdo({ acuerdo, movimientos });
    expect(r.vinculado).toBe(true);
    expect(r.totalConsumido).toBe(300);
    expect(r.pctCumplimiento).toBeCloseTo((300 / 900) * 100);
    expect(r.cumplido).toBe(false);
    expect(r.porMarca).toHaveLength(2);
    expect(r.porMarca[0]).toEqual({ id_marca: 'M1', nombre_marca: 'Palomo Cojo', uds: 200 });
  });

  test('cumplido cuando el total alcanza el objetivo', () => {
    const movimientos = [
      { id_cliente: 'C1', id_marca: 'M1', nombre_marca: 'Palomo Cojo', uds_totales: 950, fecha: '2026-08-10' },
    ];
    const r = calcularConsumoAcuerdo({ acuerdo, movimientos });
    expect(r.cumplido).toBe(true);
  });
});

describe('calcularEstadoVigencia', () => {
  test('vigente dentro del rango', () => {
    const acuerdo = { vigencia_inicio: '2026-01-01', vigencia_fin: '2026-12-31' };
    expect(calcularEstadoVigencia(acuerdo, new Date('2026-06-15'))).toBe('vigente');
  });
  test('proximo antes de empezar', () => {
    const acuerdo = { vigencia_inicio: '2026-08-01', vigencia_fin: '2027-07-31' };
    expect(calcularEstadoVigencia(acuerdo, new Date('2026-07-01'))).toBe('proximo');
  });
  test('finalizado tras la fecha de fin', () => {
    const acuerdo = { vigencia_inicio: '2025-01-01', vigencia_fin: '2025-12-31' };
    expect(calcularEstadoVigencia(acuerdo, new Date('2026-07-27'))).toBe('finalizado');
  });
});

describe('diasHastaFin', () => {
  test('null sin fecha de fin', () => {
    expect(diasHastaFin({}, new Date('2026-07-27'))).toBeNull();
  });
  test('cuenta los días naturales restantes', () => {
    const acuerdo = { vigencia_fin: '2026-08-01' };
    expect(diasHastaFin(acuerdo, new Date('2026-07-27'))).toBe(5);
  });
});
