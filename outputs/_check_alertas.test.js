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
    const sellIn = [{ id_distribuidor: 'd1', unidades_compradas: 100, ap_por_unidad: 1, mes_ano: '2026-07' }];
    const sellOut = [{ id_distribuidor: 'd1', regaladas_uds: 200, coste_unidad: 1, mes_ano: '2026-07' }];

    const alertas = calcularAlertas({ distribuidores, sellIn, sellOut });
    const alertaBalance = alertas.find(a => a.tipo === 'balance_negativo');
    expect(alertaBalance).toBeDefined();
  });
});
