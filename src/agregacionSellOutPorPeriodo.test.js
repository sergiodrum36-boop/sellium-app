/*
 * agregacionSellOutPorPeriodo.test.js
 * Pruebas de la agregación compartida por DashboardSellOutClientes.js y
 * DashboardSellOutMarcas.js. Se escriben sobre la función pura (sin React ni
 * Firestore) precisamente para poder blindar el caso que le costó a Sergio
 * un susto real en julio de 2026: el total de facturación no cuadraba con la
 * suma de las zonas porque los clientes "Perdidos" se quedaban sin zona y
 * desaparecían de todos los filtros concretos, pero seguían contando en el
 * total sin filtrar.
 *
 * Los datos son sintéticos y mínimos a propósito: un movimiento por caso,
 * con solo los campos que la función mira (id_cliente/nombre_cliente/
 * id_marca/nombre_marca/mes_ano/uds_totales/facturacion_euros/comercial/
 * preventista/tipologia/fecha).
 */
import { agregarSellOutPorPeriodo } from './agregacionSellOutPorPeriodo';

// Periodo actual = 1er trimestre 2026, comparación = 1er trimestre 2025.
const SET_ACTUAL = new Set(['2026-01', '2026-02', '2026-03']);
const SET_ANTERIOR = new Set(['2025-01', '2025-02', '2025-03']);
const INICIO_ACTUAL = '2026-01';

// Opciones tal cual las pasa DashboardSellOutClientes.js (con arrastre de
// tipología/zona/preventista) y DashboardSellOutMarcas.js (sin arrastre).
const OPCIONES_CLIENTES = {
  campoId: 'id_cliente',
  campoNombre: 'nombre_cliente',
  campoDistinto: 'id_marca',
  prefijoDistintos: 'refs',
  setMesesActual: SET_ACTUAL,
  setMesesAnterior: SET_ANTERIOR,
  inicioPeriodoActual: INICIO_ACTUAL,
  camposArrastre: ['tipologia', 'comercial', 'preventista']
};

const OPCIONES_MARCAS = {
  campoId: 'id_marca',
  campoNombre: 'nombre_marca',
  campoDistinto: 'id_cliente',
  prefijoDistintos: 'clientes',
  setMesesActual: SET_ACTUAL,
  setMesesAnterior: SET_ANTERIOR,
  inicioPeriodoActual: INICIO_ACTUAL
};

const mov = (props) => ({
  id_cliente: 'C1',
  nombre_cliente: 'Cliente 1',
  id_marca: 'M1',
  nombre_marca: 'Marca 1',
  mes_ano: '2026-01',
  uds_totales: 10,
  facturacion_euros: 100,
  comercial: '1',
  preventista: 'Ana',
  tipologia: 'Bar',
  fecha: '2026-01-15',
  ...props
});

// Escenario común: un cliente de cada estado + uno sin actividad en ninguno
// de los dos periodos (no debe aparecer).
const MOVIMIENTOS = [
  // ACTIVO: compra en los dos periodos.
  mov({ id_cliente: 'ACTIVO', nombre_cliente: 'Cliente Activo', comercial: '1', mes_ano: '2025-02', uds_totales: 40, facturacion_euros: 400, id_marca: 'M1' }),
  mov({ id_cliente: 'ACTIVO', nombre_cliente: 'Cliente Activo', comercial: '1', mes_ano: '2026-02', uds_totales: 60, facturacion_euros: 600, id_marca: 'M1' }),
  mov({ id_cliente: 'ACTIVO', nombre_cliente: 'Cliente Activo', comercial: '1', mes_ano: '2026-03', uds_totales: 10, facturacion_euros: 90, id_marca: 'M2' }),

  // NUEVO: compra ahora y nunca antes.
  mov({ id_cliente: 'NUEVO', nombre_cliente: 'Cliente Nuevo', comercial: '2', mes_ano: '2026-01', uds_totales: 25, facturacion_euros: 250, id_marca: 'M2' }),

  // RECUPERADO: compra ahora, no en el periodo de comparación, pero sí en un
  // mes anterior al inicio del periodo actual (fuera de los dos periodos).
  mov({ id_cliente: 'RECUPERADO', nombre_cliente: 'Cliente Recuperado', comercial: '2', mes_ano: '2024-05', uds_totales: 7, facturacion_euros: 70, id_marca: 'M1' }),
  mov({ id_cliente: 'RECUPERADO', nombre_cliente: 'Cliente Recuperado', comercial: '2', mes_ano: '2026-03', uds_totales: 15, facturacion_euros: 150, id_marca: 'M1' }),

  // PERDIDO: SOLO tiene movimientos en el periodo de comparación. Su zona
  // cambió de '2' a '4' dentro de ese periodo — debe quedarse con la del
  // movimiento MÁS RECIENTE ('4').
  mov({ id_cliente: 'PERDIDO', nombre_cliente: 'Cliente Perdido', comercial: '2', preventista: 'Ana', tipologia: 'Bar', mes_ano: '2025-01', uds_totales: 30, facturacion_euros: 300, id_marca: 'M3' }),
  mov({ id_cliente: 'PERDIDO', nombre_cliente: 'Cliente Perdido', comercial: '4', preventista: 'Luis', tipologia: 'Restaurante', mes_ano: '2025-03', uds_totales: 20, facturacion_euros: 200, id_marca: 'M3' }),

  // SIN ACTIVIDAD en ninguno de los dos periodos: solo compró hace años.
  mov({ id_cliente: 'ANTIGUO', nombre_cliente: 'Cliente Antiguo', comercial: '1', mes_ano: '2024-11', uds_totales: 99, facturacion_euros: 999, id_marca: 'M1' })
];

const porId = (filas, id) => filas.find(f => f.id_cliente === id);

describe('agregarSellOutPorPeriodo', () => {
  test('(a) una entidad con actividad SOLO en el periodo anterior sale como "perdido" y conserva los campos de arrastre de su movimiento más reciente', () => {
    const filas = agregarSellOutPorPeriodo({ movimientos: MOVIMIENTOS, ...OPCIONES_CLIENTES });
    const perdido = porId(filas, 'PERDIDO');

    expect(perdido).toBeDefined();
    expect(perdido.estado).toBe('perdido');
    expect(perdido.udsActual).toBe(0);
    expect(perdido.udsAnterior).toBe(50);
    expect(perdido.facturacionAnterior).toBe(500);
    // Regresión directa del bug de julio de 2026: antes estos tres campos
    // solo se rellenaban desde movimientos del periodo ACTUAL, así que un
    // cliente perdido se quedaba con la zona en blanco.
    expect(perdido.comercial).toBe('4');
    expect(perdido.preventista).toBe('Luis');
    expect(perdido.tipologia).toBe('Restaurante');
    // Sin base en el periodo actual y con base anterior: -100%.
    expect(perdido.variacion).toBe(-100);
    expect(perdido.variacionEuros).toBe(-100);
  });

  test('(b) clasifica correctamente los cuatro estados y descarta lo que no tiene actividad en ninguno de los dos periodos', () => {
    const filas = agregarSellOutPorPeriodo({ movimientos: MOVIMIENTOS, ...OPCIONES_CLIENTES });

    expect(porId(filas, 'ACTIVO').estado).toBe('activo');
    expect(porId(filas, 'NUEVO').estado).toBe('nuevo');
    expect(porId(filas, 'RECUPERADO').estado).toBe('recuperado');
    expect(porId(filas, 'PERDIDO').estado).toBe('perdido');
    expect(porId(filas, 'ANTIGUO')).toBeUndefined();
    expect(filas).toHaveLength(4);

    // Orden: udsActual descendente (lo que espera la tabla).
    expect(filas.map(f => f.id_cliente)).toEqual(['ACTIVO', 'NUEVO', 'RECUPERADO', 'PERDIDO']);

    // Conteo de la "otra dimensión" (marcas distintas) por periodo.
    const activo = porId(filas, 'ACTIVO');
    expect(activo.refsActual).toBe(2); // M1 y M2 en 2026
    expect(activo.refsAnterior).toBe(1); // solo M1 en 2025
    expect(activo.udsActual).toBe(70);
    expect(activo.udsAnterior).toBe(40);
    expect(activo.facturacionActual).toBe(690);
    expect(activo.ultimaFecha).toBe('2026-01-15');

    // Sin base en el periodo de comparación: la variación es "no aplica".
    expect(porId(filas, 'NUEVO').variacion).toBeNull();
    expect(porId(filas, 'NUEVO').variacionEuros).toBeNull();
  });

  test('(c) el total sin filtrar es igual a la suma de agregar por separado cada zona (movimientos filtrados ANTES, como en Marcas)', () => {
    const zonas = [...new Set(MOVIMIENTOS.map(m => m.comercial))];

    const total = agregarSellOutPorPeriodo({ movimientos: MOVIMIENTOS, ...OPCIONES_MARCAS });
    const suma = (filas, campo) => filas.reduce((a, f) => a + f[campo], 0);

    const sumaPorZonas = zonas.reduce((acumulado, zona) => {
      const filasZona = agregarSellOutPorPeriodo({
        movimientos: MOVIMIENTOS.filter(m => m.comercial === zona),
        ...OPCIONES_MARCAS
      });
      return {
        udsActual: acumulado.udsActual + suma(filasZona, 'udsActual'),
        udsAnterior: acumulado.udsAnterior + suma(filasZona, 'udsAnterior'),
        facturacionActual: acumulado.facturacionActual + suma(filasZona, 'facturacionActual'),
        facturacionAnterior: acumulado.facturacionAnterior + suma(filasZona, 'facturacionAnterior')
      };
    }, { udsActual: 0, udsAnterior: 0, facturacionActual: 0, facturacionAnterior: 0 });

    expect(sumaPorZonas.udsActual).toBe(suma(total, 'udsActual'));
    expect(sumaPorZonas.udsAnterior).toBe(suma(total, 'udsAnterior'));
    expect(sumaPorZonas.facturacionActual).toBe(suma(total, 'facturacionActual'));
    expect(sumaPorZonas.facturacionAnterior).toBe(suma(total, 'facturacionAnterior'));
  });

  test('(c bis) el total sin filtrar es igual a la suma de las filas agrupadas por zona (filtro DESPUÉS de agregar, como en Clientes)', () => {
    const filas = agregarSellOutPorPeriodo({ movimientos: MOVIMIENTOS, ...OPCIONES_CLIENTES });

    // Las zonas se sacan de los MOVIMIENTOS (no de las filas ya agregadas):
    // así, si una fila se quedara sin zona — el bug de julio — no caería en
    // ningún grupo y la suma saldría distinta del total, que es exactamente
    // lo que Sergio vio en pantalla.
    const zonas = [...new Set(MOVIMIENTOS.map(m => m.comercial))];
    const suma = (lista, campo) => lista.reduce((a, f) => a + f[campo], 0);

    const sumaPorZonas = zonas.reduce((acumulado, zona) => {
      const filasZona = filas.filter(f => f.comercial === zona);
      return {
        udsActual: acumulado.udsActual + suma(filasZona, 'udsActual'),
        facturacionActual: acumulado.facturacionActual + suma(filasZona, 'facturacionActual'),
        facturacionAnterior: acumulado.facturacionAnterior + suma(filasZona, 'facturacionAnterior')
      };
    }, { udsActual: 0, facturacionActual: 0, facturacionAnterior: 0 });

    expect(sumaPorZonas.udsActual).toBe(suma(filas, 'udsActual'));
    expect(sumaPorZonas.facturacionActual).toBe(suma(filas, 'facturacionActual'));
    expect(sumaPorZonas.facturacionAnterior).toBe(suma(filas, 'facturacionAnterior'));
    // Y ninguna fila puede quedarse sin zona (es lo que rompía la suma).
    expect(filas.every(f => f.comercial !== '')).toBe(true);
  });

  test('agrupando por marca cuenta clientes distintos y no arrastra campos de la entidad', () => {
    const filas = agregarSellOutPorPeriodo({ movimientos: MOVIMIENTOS, ...OPCIONES_MARCAS });
    const m1 = filas.find(f => f.id_marca === 'M1');

    expect(m1.nombre_marca).toBe('Marca 1');
    expect(m1.clientesActual).toBe(2); // ACTIVO y RECUPERADO en 2026
    expect(m1.clientesAnterior).toBe(1); // solo ACTIVO en 2025
    expect(m1.estado).toBe('activo');
    expect(m1).not.toHaveProperty('comercial');

    // M3 solo se vendió en el periodo de comparación.
    expect(filas.find(f => f.id_marca === 'M3').estado).toBe('perdido');
  });
});
