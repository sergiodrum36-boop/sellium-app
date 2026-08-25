/*
 * calculosAP.test.js
 * Tests de las fórmulas de A&P centralizadas en calculosAP.js. Son funciones
 * puras (sin React ni Firestore) que alimentan ControlAP, Historico,
 * StockDistribuidor, Dashboard y alertas.js — un error aquí se propaga a
 * todas ellas en silencio, así que vale la pena fijarlas con tests.
 */
import {
  valorRegaladas,
  valorMuestras,
  valorAcuerdo,
  unidadesAcuerdo,
  valorAportacionManual,
  gastoTotal,
  unidadesMovidas,
  generadoSellIn
} from './calculosAP';

describe('valorRegaladas', () => {
  test('usa el valor en euros guardado explícitamente si existe', () => {
    expect(valorRegaladas({ valor_regaladas_euros: 42, regaladas_uds: 999, coste_unidad: 999 })).toBe(42);
  });

  test('recalcula uds * coste si no hay valor guardado (registros antiguos)', () => {
    expect(valorRegaladas({ regaladas_uds: 10, coste_unidad: 3 })).toBe(30);
  });

  test('valor_regaladas_euros === 0 se respeta como 0, no se recalcula', () => {
    expect(valorRegaladas({ valor_regaladas_euros: 0, regaladas_uds: 10, coste_unidad: 3 })).toBe(0);
  });

  test('campos ausentes/null/vacíos se tratan como 0, nunca NaN', () => {
    expect(valorRegaladas({})).toBe(0);
    expect(valorRegaladas({ regaladas_uds: null, coste_unidad: undefined })).toBe(0);
    expect(valorRegaladas({ regaladas_uds: '', coste_unidad: 5 })).toBe(0);
  });

  test('texto no numérico (dato corrupto) se trata como 0, no rompe el cálculo', () => {
    expect(valorRegaladas({ regaladas_uds: 'abc', coste_unidad: 5 })).toBe(0);
  });

  test('números como texto (celda de Excel formateada como texto) se convierten bien', () => {
    expect(valorRegaladas({ regaladas_uds: '10', coste_unidad: '3' })).toBe(30);
  });
});

describe('valorMuestras', () => {
  test('mismo patrón que valorRegaladas: prioriza el valor guardado', () => {
    expect(valorMuestras({ valor_muestras_euros: 15, muestras_uds: 100, coste_unidad: 100 })).toBe(15);
  });

  test('recalcula si no hay valor guardado', () => {
    expect(valorMuestras({ muestras_uds: 4, coste_unidad: 2.5 })).toBe(10);
  });
});

describe('valorAcuerdo / unidadesAcuerdo / valorAportacionManual', () => {
  test('devuelven 0 en registros antiguos que no tenían estos campos', () => {
    expect(valorAcuerdo({})).toBe(0);
    expect(unidadesAcuerdo({})).toBe(0);
    expect(valorAportacionManual({})).toBe(0);
  });

  test('devuelven el valor guardado cuando existe', () => {
    expect(valorAcuerdo({ valor_acuerdo_euros: 50 })).toBe(50);
    expect(unidadesAcuerdo({ unidades_acuerdo: 12 })).toBe(12);
    expect(valorAportacionManual({ aportacion_euros: 99.5 })).toBe(99.5);
  });
});

describe('gastoTotal', () => {
  test('es la suma exacta de las 4 categorías', () => {
    const mov = {
      valor_regaladas_euros: 10,
      valor_muestras_euros: 5,
      valor_acuerdo_euros: 3,
      aportacion_euros: 2
    };
    expect(gastoTotal(mov)).toBe(20);
  });

  test('un movimiento vacío da gasto 0 (no NaN)', () => {
    expect(gastoTotal({})).toBe(0);
  });

  test('mezcla de valores guardados y recalculados suma correctamente', () => {
    const mov = {
      // regaladas: sin valor guardado, se recalcula 5*2=10
      regaladas_uds: 5,
      coste_unidad: 2,
      // muestras: valor guardado, ignora uds/coste
      valor_muestras_euros: 7,
      muestras_uds: 999,
      valor_acuerdo_euros: 3,
      aportacion_euros: 1
    };
    expect(gastoTotal(mov)).toBe(10 + 7 + 3 + 1);
  });
});

describe('unidadesMovidas', () => {
  test('suma ventas + regaladas + muestras + acuerdo', () => {
    expect(unidadesMovidas({ ventas_uds: 100, regaladas_uds: 5, muestras_uds: 2, unidades_acuerdo: 3 })).toBe(110);
  });

  test('campos ausentes cuentan como 0', () => {
    expect(unidadesMovidas({ ventas_uds: 50 })).toBe(50);
  });
});

describe('generadoSellIn', () => {
  test('unidades compradas x A&P por unidad', () => {
    expect(generadoSellIn({ unidades_compradas: 200, ap_por_unidad: 0.5 })).toBe(100);
  });

  test('sin datos de compra, genera 0', () => {
    expect(generadoSellIn({})).toBe(0);
  });
});
