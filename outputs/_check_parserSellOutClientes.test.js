import * as XLSX from 'xlsx';
import { parseSellOutClientes } from './_check_parserSellOutClientes';

function workbookDeUnaHoja(filas, nombreHoja = 'Sheet1') {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(filas);
  XLSX.utils.book_append_sheet(wb, ws, nombreHoja);
  return wb;
}

describe('parseSellOutClientes: caso básico con Ventas/Promo/Regalos', () => {
  const wb = workbookDeUnaHoja([
    ['CLIENTE', 'COD. CLIENTE', 'NIF', 'TIPOLOGIA', 'C.CIAL', 'PREVENTISTA', 'FECHA', 'PRODUCTO', 'VENTAS', 'PROMO', 'REGALOS', 'NETO'],
    ['Bar Pepe', 'C001', 'B12345678', 'Hosteleria', '1', 'Luis', '15/03/2026', 'Rioja Crianza', 10, 2, 0, '120,50'],
    ['Restaurante X', 'C002', '', 'Restauracion', '2', 'Ana', '2026-03-20', 'Palomo Cojo', 5, 0, 1, 60]
  ]);
  const resultado = parseSellOutClientes(wb);

  test('extrae las 2 filas de detalle', () => {
    expect(resultado.filas).toHaveLength(2);
    expect(resultado.hojaLeida).toBe('Sheet1');
  });

  test('totales se calcula como ventas+promo+regalos si no hay columna propia', () => {
    expect(resultado.filas[0].totales).toBe(12);
    expect(resultado.filas[1].totales).toBe(6);
  });

  test('importe en formato español ("120,50") se convierte a número', () => {
    expect(resultado.filas[0].facturacion).toBe(120.5);
  });

  test('fecha en formato DD/MM/AAAA se normaliza a YYYY-MM-DD y mesAno', () => {
    expect(resultado.filas[0].fecha).toBe('2026-03-15');
    expect(resultado.filas[0].mesAno).toBe('2026-03');
  });

  test('fecha en formato AAAA-MM-DD también se reconoce', () => {
    expect(resultado.filas[1].fecha).toBe('2026-03-20');
  });

  test('sin NIF en una fila (campo opcional vacío), queda vacío pero la fila no se descarta', () => {
    expect(resultado.filas[1].nif).toBe('');
    expect(resultado.filas[1].cod_cliente).toBe('C002');
    expect(resultado.filas[1].cliente).toBe('Restaurante X');
  });

  test('no hay avisos: el archivo trae todas las columnas relevantes', () => {
    expect(resultado.avisos).toEqual([]);
  });
});

describe('parseSellOutClientes: solo columna de unidades totales (sin desglose)', () => {
  const wb = workbookDeUnaHoja([
    ['CLIENTE', 'ARTICULO', 'UNIDADES', 'IMPORTE'],
    ['Covirán Las Americas', 'Albariño', 8, 95.2]
  ]);
  const resultado = parseSellOutClientes(wb);

  test('sin columna Ventas/Promo/Regalos, "ventas" se rellena con el total', () => {
    expect(resultado.filas[0].totales).toBe(8);
    expect(resultado.filas[0].ventas).toBe(8);
    expect(resultado.filas[0].promo).toBe(0);
    expect(resultado.filas[0].regalos).toBe(0);
  });

  test('alias "IMPORTE" también reconoce la facturación', () => {
    expect(resultado.filas[0].facturacion).toBe(95.2);
  });
});

describe('parseSellOutClientes: "CLIENTE - COMERCIO" sustituye al nombre mostrado', () => {
  const wb = workbookDeUnaHoja([
    ['CLIENTE', 'CLIENTE - COMERCIO', 'ARTICULO', 'TOTALES'],
    ['EXPLOTACIONES GARAJAO S.L.', 'COVIRAN LAS AMERICAS', 'Rioja Crianza', 4],
    ['DISTRIBUCIONES SUR S.L.', '', 'Palomo Cojo', 3]
  ]);
  const resultado = parseSellOutClientes(wb);

  test('con nombre comercial presente, se muestra ese en vez de la razón social', () => {
    expect(resultado.filas[0].cliente).toBe('COVIRAN LAS AMERICAS');
  });

  test('sin nombre comercial, cae de vuelta a la razón social', () => {
    expect(resultado.filas[1].cliente).toBe('DISTRIBUCIONES SUR S.L.');
  });
});

describe('parseSellOutClientes: filas a excluir', () => {
  const wb = workbookDeUnaHoja([
    ['CLIENTE', 'ARTICULO', 'TOTALES'],
    ['Bar Pepe', 'Rioja Crianza', 5],
    ['', '', ''],
    ['TOTAL GENERAL', 'Rioja Crianza', 100],
    ['Restaurante X', '', 3],
    ['', 'Palomo Cojo', 2]
  ]);
  const resultado = parseSellOutClientes(wb);

  test('solo la primera fila es un dato real; el resto se descarta', () => {
    expect(resultado.filas).toHaveLength(1);
    expect(resultado.filas[0].cliente).toBe('Bar Pepe');
  });
});

describe('parseSellOutClientes: selección de hoja (varias hojas, gana la de más detalle)', () => {
  const wb = XLSX.utils.book_new();
  const wsResumen = XLSX.utils.aoa_to_sheet([
    ['CLIENTE', 'TOTALES'],
    ['Total General', 999]
  ]);
  const wsDetalle = XLSX.utils.aoa_to_sheet([
    ['CLIENTE', 'ARTICULO', 'TOTALES'],
    ['Bar Pepe', 'Rioja Crianza', 5],
    ['Restaurante X', 'Palomo Cojo', 3],
    ['Hotel Playa', 'Albariño', 7]
  ]);
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');
  XLSX.utils.book_append_sheet(wb, wsDetalle, 'Sheet1');

  test('se queda con la hoja "Sheet1" (más filas de detalle), no con "Resumen"', () => {
    const resultado = parseSellOutClientes(wb);
    expect(resultado.hojaLeida).toBe('Sheet1');
    expect(resultado.filas).toHaveLength(3);
  });
});

describe('parseSellOutClientes: avisos cuando faltan columnas relevantes', () => {
  test('sin columna de código de cliente, avisa (aunque igualmente extrae las filas)', () => {
    const wb = workbookDeUnaHoja([
      ['CLIENTE', 'ARTICULO', 'TOTALES'],
      ['Bar Pepe', 'Rioja Crianza', 5]
    ]);
    const resultado = parseSellOutClientes(wb);
    expect(resultado.filas).toHaveLength(1);
    expect(resultado.avisos.some(a => /código de cliente/i.test(a))).toBe(true);
  });

  test('sin columna de fecha, avisa que hay que asignar el mes a mano', () => {
    const wb = workbookDeUnaHoja([
      ['CLIENTE', 'ARTICULO', 'TOTALES'],
      ['Bar Pepe', 'Rioja Crianza', 5]
    ]);
    const resultado = parseSellOutClientes(wb);
    expect(resultado.avisos.some(a => /Fecha/i.test(a))).toBe(true);
    expect(resultado.filas[0].fecha).toBeNull();
    expect(resultado.filas[0].mesAno).toBeNull();
  });

  test('sin ninguna columna de unidades, avisa explícitamente', () => {
    const wb = workbookDeUnaHoja([
      ['CLIENTE', 'ARTICULO', 'NIF'],
      ['Bar Pepe', 'Rioja Crianza', 'B123']
    ]);
    const resultado = parseSellOutClientes(wb);
    expect(resultado.avisos.some(a => /unidades/i.test(a))).toBe(true);
  });

  test('ningún archivo reconocible: sin hoja con Cliente y Producto', () => {
    const wb = workbookDeUnaHoja([
      ['COLUMNA_RARA_1', 'COLUMNA_RARA_2'],
      ['x', 'y']
    ]);
    const resultado = parseSellOutClientes(wb);
    expect(resultado.filas).toEqual([]);
    expect(resultado.hojaLeida).toBeNull();
    expect(resultado.avisos.length).toBeGreaterThan(0);
  });
});

describe('parseSellOutClientes: columna "distribuidor" (archivos que mezclan varios)', () => {
  test('cuando existe la columna EMPRESA/DISTRIBUIDOR, se guarda por fila', () => {
    const wb = workbookDeUnaHoja([
      ['EMPRESA', 'CLIENTE', 'ARTICULO', 'TOTALES'],
      ['MANUEL VEGA S.L.', 'Bar Pepe', 'Rioja Crianza', 5],
      ['VEGA Y GIJON S.L.', 'Restaurante X', 'Palomo Cojo', 3]
    ]);
    const resultado = parseSellOutClientes(wb);
    expect(resultado.filas[0].distribuidor).toBe('MANUEL VEGA S.L.');
    expect(resultado.filas[1].distribuidor).toBe('VEGA Y GIJON S.L.');
  });

  test('sin esa columna, el campo distribuidor queda vacío (lo elige el usuario a mano)', () => {
    const wb = workbookDeUnaHoja([
      ['CLIENTE', 'ARTICULO', 'TOTALES'],
      ['Bar Pepe', 'Rioja Crianza', 5]
    ]);
    const resultado = parseSellOutClientes(wb);
    expect(resultado.filas[0].distribuidor).toBe('');
  });
});
