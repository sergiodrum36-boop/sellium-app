import {
  generarVentanaMeses,
  mesUnAnioAntes,
  detectarClientesInactivos,
  calcularAvisosConsumo,
} from './avisosConsumoClientes';

describe('generarVentanaMeses', () => {
  test('genera N meses terminando en mesFinal, del más reciente al más antiguo', () => {
    expect(generarVentanaMeses('2026-06', 3)).toEqual(['2026-06', '2026-05', '2026-04']);
  });

  test('cruza el cambio de año correctamente', () => {
    expect(generarVentanaMeses('2026-02', 3)).toEqual(['2026-02', '2026-01', '2025-12']);
  });

  test('ventana de 6 meses', () => {
    expect(generarVentanaMeses('2026-01', 6)).toEqual(['2026-01', '2025-12', '2025-11', '2025-10', '2025-09', '2025-08']);
  });
});

describe('mesUnAnioAntes', () => {
  test('resta un año manteniendo el mes', () => {
    expect(mesUnAnioAntes('2026-06')).toBe('2025-06');
    expect(mesUnAnioAntes('2026-01')).toBe('2025-01');
  });
});

describe('detectarClientesInactivos', () => {
  const hoy = new Date('2026-07-15');

  test('detecta clientes sin compra (uds>0) desde hace >= umbral meses', () => {
    const movimientos = [
      { id_cliente: 'C1', nombre_cliente: 'Cliente 1', id_distribuidor: 'D1', mes_ano: '2026-01', uds_totales: 10, comercial: '1', preventista: 'Ana' },
      { id_cliente: 'C2', nombre_cliente: 'Cliente 2', id_distribuidor: 'D1', mes_ano: '2026-06', uds_totales: 5, comercial: '2', preventista: 'Luis' },
    ];
    const resultado = detectarClientesInactivos(movimientos, 3, hoy);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id_cliente).toBe('C1');
    expect(resultado[0].mesesSinComprar).toBe(6);
    expect(resultado[0].preventista).toBe('Ana');
  });

  test('cliente que nunca compró (uds siempre 0) no se incluye', () => {
    const movimientos = [
      { id_cliente: 'C3', nombre_cliente: 'Cliente 3', mes_ano: '2025-01', uds_totales: 0 },
    ];
    expect(detectarClientesInactivos(movimientos, 3, hoy)).toHaveLength(0);
  });

  test('arrastra comercial/preventista del movimiento MÁS RECIENTE, aunque no tenga compra', () => {
    const movimientos = [
      { id_cliente: 'C1', nombre_cliente: 'Cliente 1', mes_ano: '2026-01', uds_totales: 10, preventista: 'Ana' },
      { id_cliente: 'C1', nombre_cliente: 'Cliente 1', mes_ano: '2026-05', uds_totales: 0, preventista: 'Marta' },
    ];
    const resultado = detectarClientesInactivos(movimientos, 3, hoy);
    expect(resultado[0].preventista).toBe('Marta');
    expect(resultado[0].mesesSinComprar).toBe(6); // sigue contando desde el último mes CON compra (enero)
  });

  test('ordena de más meses sin comprar a menos', () => {
    const movimientos = [
      { id_cliente: 'C1', mes_ano: '2026-01', uds_totales: 1 },
      { id_cliente: 'C2', mes_ano: '2025-12', uds_totales: 1 },
    ];
    const resultado = detectarClientesInactivos(movimientos, 3, hoy);
    expect(resultado.map(r => r.id_cliente)).toEqual(['C2', 'C1']);
  });
});

describe('calcularAvisosConsumo', () => {
  test('sin mesMasReciente devuelve listas vacías', () => {
    expect(calcularAvisosConsumo({ movimientos: [], ventanaMeses: 3, mesMasReciente: null })).toEqual({ perdidos: [], caidas: [], inactivos: [] });
  });

  test('detecta perdido, caída y arrastra preventista', () => {
    const movimientos = [
      // Cliente PERDIDO: compró el año pasado en la ventana, nada ahora.
      { id_cliente: 'PERD', nombre_cliente: 'Perdido SA', id_distribuidor: 'D1', id_marca: 'M1', mes_ano: '2025-05', uds_totales: 100, preventista: 'Ana', comercial: '1' },
      // Cliente con CAÍDA fuerte: compra en ambos periodos, baja de 100 a 50 (-50%).
      { id_cliente: 'CAIDA', nombre_cliente: 'Caida SL', id_distribuidor: 'D1', id_marca: 'M1', mes_ano: '2025-05', uds_totales: 100, preventista: 'Luis', comercial: '2' },
      { id_cliente: 'CAIDA', nombre_cliente: 'Caida SL', id_distribuidor: 'D1', id_marca: 'M1', mes_ano: '2026-05', uds_totales: 50, preventista: 'Luis', comercial: '2' },
      // Cliente ESTABLE: no debería salir en ninguna lista.
      { id_cliente: 'OK', nombre_cliente: 'Estable SL', id_distribuidor: 'D1', id_marca: 'M1', mes_ano: '2025-05', uds_totales: 100 },
      { id_cliente: 'OK', nombre_cliente: 'Estable SL', id_distribuidor: 'D1', id_marca: 'M1', mes_ano: '2026-05', uds_totales: 98 },
    ];
    const resultado = calcularAvisosConsumo({ movimientos, ventanaMeses: 3, mesMasReciente: '2026-06' });

    expect(resultado.perdidos.map(f => f.id_cliente)).toEqual(['PERD']);
    expect(resultado.perdidos[0].preventista).toBe('Ana');

    expect(resultado.caidas.map(f => f.id_cliente)).toEqual(['CAIDA']);
    expect(resultado.caidas[0].preventista).toBe('Luis');
    expect(resultado.caidas[0].variacion).toBeCloseTo(-50);

    expect(resultado.inactivos.some(f => f.id_cliente === 'PERD')).toBe(true);
  });

  test('adjunta las marcas que compra cada cliente con su total de uds, de mayor a menor', () => {
    const movimientos = [
      { id_cliente: 'C1', nombre_cliente: 'Cliente 1', id_marca: 'M1', nombre_marca: 'Zeta', mes_ano: '2025-05', uds_totales: 100 },
      { id_cliente: 'C1', nombre_cliente: 'Cliente 1', id_marca: 'M2', nombre_marca: 'Alfa', mes_ano: '2024-01', uds_totales: 5 },
      { id_cliente: 'C1', nombre_cliente: 'Cliente 1', id_marca: 'M1', nombre_marca: 'Zeta', mes_ano: '2024-03', uds_totales: 20 },
      { id_cliente: 'C1', nombre_cliente: 'Cliente 1', id_marca: 'M3', nombre_marca: 'Sin unidades', mes_ano: '2025-05', uds_totales: 0 },
    ];
    const resultado = calcularAvisosConsumo({ movimientos, ventanaMeses: 3, mesMasReciente: '2026-06' });
    expect(resultado.perdidos[0].marcas).toEqual([
      { nombre: 'Zeta', uds: 120 },
      { nombre: 'Alfa', uds: 5 },
    ]);
  });

  test('umbral de caída configurable', () => {
    const movimientos = [
      { id_cliente: 'C1', nombre_cliente: 'C1', id_marca: 'M1', mes_ano: '2025-05', uds_totales: 100 },
      { id_cliente: 'C1', nombre_cliente: 'C1', id_marca: 'M1', mes_ano: '2026-05', uds_totales: 85 }, // -15%
    ];
    const conUmbral30 = calcularAvisosConsumo({ movimientos, ventanaMeses: 3, mesMasReciente: '2026-06', umbralCaidaPct: 30 });
    expect(conUmbral30.caidas).toHaveLength(0);
    const conUmbral10 = calcularAvisosConsumo({ movimientos, ventanaMeses: 3, mesMasReciente: '2026-06', umbralCaidaPct: 10 });
    expect(conUmbral10.caidas).toHaveLength(1);
  });
});
