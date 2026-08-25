/*
 * parserVentasReales.test.js
 * Tests del parser de Ventas Reales (export mensual de QlikSense, todos los
 * distribuidores juntos, agregado por Familia/Subfamilia). Solo se exporta
 * parseVentasReales(workbook), así que los tests construyen workbooks XLSX
 * sintéticos reales (librería 'xlsx') y comprueban el resultado público:
 * detección de cabecera por alias, arrastre de Distribuidor/Familia en la
 * tabla dinámica "en cascada", filas de Publicidad descartadas, filas de
 * Rappel/Descuento/Abono sin Subfamilia pero con importe real, formato
 * numérico español, y los avisos de columnas ausentes.
 *
 * Nota de revisión (2026-07-25): se comprobó si este archivo tenía el mismo
 * bug de índice-0 corregido en parserSellOutClientes.js (comprobar
 * `!mapaColumnasElegido.campo` en vez de `=== undefined`, que falla cuando esa
 * columna es la PRIMERA del Excel, índice 0). Este archivo YA usa
 * `=== undefined` / `!== undefined` en los 3 sitios donde comprueba columnas
 * (líneas ~106, ~127, ~131, ~134, ~155-157, ~169-171 de parserVentasReales.js)
 * — no hace falta corregir nada aquí. Aun así se incluye un test explícito
 * con Distribuidor/Subfamilia como PRIMERA columna (índice 0) para dejar
 * constancia de que este caso concreto está cubierto y no falla.
 */
import * as XLSX from 'xlsx';
import { parseVentasReales } from './parserVentasReales';

function workbookDeUnaHoja(filas, nombreHoja = 'Sheet1') {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(filas);
  XLSX.utils.book_append_sheet(wb, ws, nombreHoja);
  return wb;
}

describe('parseVentasReales: caso básico con cascada Distribuidor/Familia', () => {
  const wb = workbookDeUnaHoja([
    ['Informe QlikSense - Ventas Reales'], // título, no es cabecera (0 columnas reconocidas)
    ['Distribuidor', 'Familia', 'Subfamilia', 'Uds', 'Cajas', 'Importe'],
    ['Total general', '', '', 0, 0, 0], // fila de total, se ignora por completo
    ['Distribuidor A', 'Familia 1', '', 0, 0, 0], // cabecera de grupo (todo a 0): se ignora
    ['', '', 'Vino Tinto', 10, 1, '1.234,56'], // hereda Distribuidor A / Familia 1
    ['', '', 'Publicidad Muestras', 5, 0, 100], // Publicidad: se descarta entera
    ['', '', '', 0, 0, -50], // sin Subfamilia pero con importe real: Rappel/Descuento/Abono
    ['Distribuidor B', 'Familia 2', 'Vino Blanco', 3, 0, 45] // nuevo distribuidor, familia se reinicia
  ]);
  const resultado = parseVentasReales(wb);

  test('detecta la cabecera en la fila 2 (tras el título) y lee la hoja correcta', () => {
    expect(resultado.hojaLeida).toBe('Sheet1');
  });

  test('extrae 3 filas de datos reales (Vino Tinto, Rappel, Vino Blanco)', () => {
    expect(resultado.filas).toHaveLength(3);
  });

  test('la fila "Total general" se ignora sin contaminar distribuidorActual', () => {
    expect(resultado.filas[0].distribuidor).toBe('Distribuidor A');
  });

  test('Subfamilia hereda Distribuidor/Familia de la cascada y convierte el importe español', () => {
    expect(resultado.filas[0]).toEqual({
      distribuidor: 'Distribuidor A',
      familia: 'Familia 1',
      subfamilia: 'Vino Tinto',
      uds: 10,
      cajas: 1,
      importe: 1234.56
    });
  });

  test('fila de Publicidad se descarta por completo (no aparece ni como dato ni como Rappel)', () => {
    expect(resultado.filas.some(f => /publicidad/i.test(f.subfamilia))).toBe(false);
    expect(resultado.avisos.some(a => /Publicidad/.test(a))).toBe(true);
  });

  test('fila sin Subfamilia pero con importe real (rappel/descuento) se guarda con subfamilia especial', () => {
    expect(resultado.filas[1]).toEqual({
      distribuidor: 'Distribuidor A',
      familia: 'Familia 1',
      subfamilia: 'Rappel/Descuento/Abono',
      uds: 0,
      cajas: 0,
      importe: -50
    });
  });

  test('nuevo Distribuidor reinicia la Familia actual', () => {
    expect(resultado.filas[2]).toEqual({
      distribuidor: 'Distribuidor B',
      familia: 'Familia 2',
      subfamilia: 'Vino Blanco',
      uds: 3,
      cajas: 0,
      importe: 45
    });
  });

  test('avisa de las filas de cabecera de grupo ignoradas (la de Distribuidor A a 0)', () => {
    expect(resultado.avisos.some(a => /cabecera de grupo/.test(a))).toBe(true);
  });
});

describe('parseVentasReales: Distribuidor y Subfamilia como PRIMERA columna (índice 0)', () => {
  // Comprobación explícita de que NO existe el bug de índice-0 (ver cabecera
  // del archivo): si "Distribuidor" fuera la columna 0 y el código comprobara
  // `!mapaColumnasElegido.distribuidor` en vez de `=== undefined`, `!0` daría
  // `true` y la columna se consideraría "no encontrada" aunque sí lo esté.
  const wb = workbookDeUnaHoja([
    ['Distribuidor', 'Subfamilia', 'Uds', 'Importe'],
    ['Distribuidor Z', 'Vino Rosado', 4, '50,00']
  ]);
  const resultado = parseVentasReales(wb);

  test('con Distribuidor en la columna 0, se reconoce igualmente (sin avisos de columna no encontrada)', () => {
    expect(resultado.filas).toHaveLength(1);
    expect(resultado.filas[0].distribuidor).toBe('Distribuidor Z');
    expect(resultado.avisos.some(a => /No se han encontrado estas columnas esperadas/.test(a))).toBe(false);
  });
});

describe('parseVentasReales: columnas opcionales ausentes (Familia, Cajas)', () => {
  const wb = workbookDeUnaHoja([
    ['Distribuidor', 'Subfamilia', 'Uds', 'Importe'],
    ['Distribuidor A', 'Vino Tinto', 10, 100]
  ]);
  const resultado = parseVentasReales(wb);

  test('sin columna Familia, la fila se importa con familia vacía y hay aviso', () => {
    expect(resultado.filas[0].familia).toBe('');
    expect(resultado.avisos.some(a => /Familia/.test(a))).toBe(true);
  });

  test('sin columna Cajas, se importa con 0 cajas y hay aviso', () => {
    expect(resultado.filas[0].cajas).toBe(0);
    expect(resultado.avisos.some(a => /Cajas/.test(a))).toBe(true);
  });
});

describe('parseVentasReales: fila Rappel/Descuento/Abono sin Familia detectada usa "Sin familia"', () => {
  // OJO: el código usa `familiaActual || 'Sin familia'` para esta rama, pero
  // `familiaActual || ''` para la rama normal (líneas 195 y 208 del parser) —
  // asimetría real del código, no un bug de índice-0; se documenta con un
  // test para cada rama.
  const wb = workbookDeUnaHoja([
    ['Distribuidor', 'Subfamilia', 'Uds', 'Importe'],
    ['Distribuidor A', '', 0, -20], // Rappel sin Familia nunca vista
    ['Distribuidor A', 'Vino Tinto', 5, 60] // fila normal sin Familia nunca vista
  ]);
  const resultado = parseVentasReales(wb);

  test('fila Rappel sin Familia usa "Sin familia" como texto por defecto', () => {
    const rappel = resultado.filas.find(f => f.subfamilia === 'Rappel/Descuento/Abono');
    expect(rappel.familia).toBe('Sin familia');
  });

  test('fila normal sin Familia usa cadena vacía (no "Sin familia")', () => {
    const normal = resultado.filas.find(f => f.subfamilia === 'Vino Tinto');
    expect(normal.familia).toBe('');
  });
});

describe('parseVentasReales: columnas esenciales ausentes', () => {
  // 3 columnas reconocidas (Subfamilia, Uds, Importe) para superar el umbral
  // mínimo de detección de cabecera (mejorNumeroColumnas >= 3), pero sin
  // Distribuidor: debe avisar de esa columna esencial ausente.
  const wb = workbookDeUnaHoja([
    ['Subfamilia', 'Uds', 'Importe'],
    ['Vino Tinto', 5, 60]
  ]);
  const resultado = parseVentasReales(wb);

  test('sin Distribuidor, avisa qué columnas esenciales faltan', () => {
    expect(resultado.avisos.some(a => /No se han encontrado estas columnas esperadas/.test(a) && /distribuidor/.test(a))).toBe(true);
  });
});

describe('parseVentasReales: fila de cabecera de grupo sin ningún distribuidor visto aún', () => {
  const wb = workbookDeUnaHoja([
    ['Distribuidor', 'Subfamilia', 'Uds', 'Importe'],
    ['', 'Vino Tinto', 0, 0] // subfamilia presente pero uds/importe a 0 y sin distribuidor: no debería pasar, se ignora
  ]);
  const resultado = parseVentasReales(wb);

  test('sin distribuidorActual, la fila se ignora por seguridad', () => {
    expect(resultado.filas).toHaveLength(0);
  });
});

describe('parseVentasReales: no se reconoce ninguna cabecera', () => {
  const wb = workbookDeUnaHoja([
    ['COLUMNA_RARA_1', 'COLUMNA_RARA_2'],
    ['x', 'y']
  ]);
  const resultado = parseVentasReales(wb);

  test('devuelve filas vacías y un aviso explicativo', () => {
    expect(resultado.filas).toEqual([]);
    expect(resultado.avisos.length).toBeGreaterThan(0);
  });
});

describe('parseVentasReales: solo se lee la PRIMERA hoja del libro', () => {
  const wb = XLSX.utils.book_new();
  const wsPrimera = XLSX.utils.aoa_to_sheet([
    ['Distribuidor', 'Subfamilia', 'Uds', 'Importe'],
    ['Distribuidor A', 'Vino Tinto', 10, 100]
  ]);
  const wsSegunda = XLSX.utils.aoa_to_sheet([
    ['Distribuidor', 'Subfamilia', 'Uds', 'Importe'],
    ['Distribuidor B', 'Vino Blanco', 5, 50],
    ['Distribuidor B', 'Vino Rosado', 6, 60],
    ['Distribuidor B', 'Vino Tinto', 7, 70]
  ]);
  XLSX.utils.book_append_sheet(wb, wsPrimera, 'Primera');
  XLSX.utils.book_append_sheet(wb, wsSegunda, 'Segunda');

  test('no hay heurística de "más filas gana" entre hojas: siempre gana la primera del libro', () => {
    const resultado = parseVentasReales(wb);
    expect(resultado.hojaLeida).toBe('Primera');
    expect(resultado.filas).toHaveLength(1);
  });
});

describe('parseVentasReales: alias de columnas alternativos', () => {
  const wb = workbookDeUnaHoja([
    ['Cliente', 'Subfamilia', 'Unidades', 'Facturacion'],
    ['Distribuidor A', 'Vino Tinto', 8, '99,90']
  ]);
  const resultado = parseVentasReales(wb);

  test('"Cliente" reconoce Distribuidor, "Unidades" reconoce Uds, "Facturacion" reconoce Importe', () => {
    expect(resultado.filas[0].distribuidor).toBe('Distribuidor A');
    expect(resultado.filas[0].uds).toBe(8);
    expect(resultado.filas[0].importe).toBe(99.9);
  });
});

describe('parseVentasReales: workbook sin hoja legible', () => {
  test('devuelve aviso específico si no hay ninguna hoja', () => {
    const wbVacio = { SheetNames: [], Sheets: {} };
    const resultado = parseVentasReales(wbVacio);
    expect(resultado.filas).toEqual([]);
    expect(resultado.avisos).toEqual(['El Excel no tiene ninguna hoja legible.']);
  });
});
