/*
 * parserLiquidacion.test.js
 * Tests del parser de la plantilla "LIQUIDACION <DISTRIBUIDOR> <AÑO>.xlsx"
 * (hojas DATOS / VENTAS STOCK / <MES> <AA>). A diferencia de
 * parserVentasReales.js y parserSellOutClientes.js, este parser NO detecta
 * columnas por nombre: lee celdas en POSICIONES FIJAS conocidas de la
 * plantilla (p.ej. hoja "DATOS" desde la fila 4, columnas A/B/C). Solo se
 * exportan parseLiquidacion(workbook, nombreArchivo) y
 * adivinarDistribuidor(nombreArchivo), así que los tests pasan por esas dos
 * funciones públicas, construyendo workbooks XLSX sintéticos reales con la
 * librería 'xlsx' que reproducen esas posiciones fijas.
 *
 * Nota de revisión (2026-07-25): se comprobó si este archivo tenía el mismo
 * bug de índice-0 corregido en parserSellOutClientes.js (comprobar
 * `!variable.campo`/`!objeto[indice]` en vez de `=== undefined`, que falla
 * cuando el valor legítimo es 0). Este parser NO usa mapas de columnas por
 * índice en ningún sitio (todas las celdas se leen por referencia fija tipo
 * `ws['B14']`), así que ese patrón de bug no aplica aquí. Las únicas
 * comprobaciones tipo `if (!x)` que tiene son sobre `anio` (null o un año de
 * 4 cifras, nunca 0), `mesNum` (1-12, nunca 0) y `headerRow` (null o una fila
 * >=1 porque el bucle que la busca empieza en r=1, nunca puede valer 0) —
 * en los tres casos el valor "encontrado" no puede ser legítimamente 0 por
 * construcción, así que no hay ningún caso real de este bug. No se ha
 * tocado el código.
 */
import * as XLSX from 'xlsx';
import { parseLiquidacion, adivinarDistribuidor } from './parserLiquidacion';

// Construye un workbook con las hojas DATOS / VENTAS STOCK / meses indicadas.
// Cada valor es una matriz de filas (array de arrays), igual que aoa_to_sheet:
// el índice 0 del array se corresponde con la fila 1 de Excel (A1, B1...).
function workbookDeHojas(hojas) {
  const wb = XLSX.utils.book_new();
  Object.entries(hojas).forEach(([nombre, filas]) => {
    const ws = XLSX.utils.aoa_to_sheet(filas);
    XLSX.utils.book_append_sheet(wb, ws, nombre);
  });
  return wb;
}

// Filas 1-3 en blanco antes de que "DATOS" empiece a leer marcas en la fila 4.
const FILAS_DATOS_BASICO = [
  [], [], [], // filas 1-3 (título/subtítulo), fila 4 empieza en el índice 3
  ['Rioja Crianza', 5.5, 0.8],
  ['Palomo Cojo', 6.0, 1.0],
  ['ELEGIR ARTICULO', 0, 0], // placeholder sin rellenar: se descarta con aviso
  [] // fila en blanco: corta el bucle
];

describe('parseLiquidacion: hoja DATOS (marcas maestras)', () => {
  const wb = workbookDeHojas({ 'DATOS': FILAS_DATOS_BASICO });
  const resultado = parseLiquidacion(wb, 'LIQUIDACION MERINO 2025.xlsx');

  test('extrae las 2 marcas reales, ignorando la fila placeholder', () => {
    expect(resultado.marcas).toEqual([
      { nombre_marca: 'RIOJA CRIANZA', Coste_Unidad: 5.5, AP_Generado_Por_Unidad: 0.8 },
      { nombre_marca: 'PALOMO COJO', Coste_Unidad: 6.0, AP_Generado_Por_Unidad: 1.0 }
    ]);
  });

  test('avisa de la fila placeholder "ELEGIR ARTICULO" sin crearla como marca', () => {
    expect(resultado.avisos.some(a => /ELEGIR ARTICULO/.test(a))).toBe(true);
  });
});

describe('parseLiquidacion: hoja DATOS ausente', () => {
  const wb = workbookDeHojas({ 'VENTAS STOCK': [] });
  const resultado = parseLiquidacion(wb, 'LIQUIDACION MERINO 2025.xlsx');

  test('sin hoja DATOS, marcas queda vacío con aviso explícito', () => {
    expect(resultado.marcas).toEqual([]);
    expect(resultado.avisos.some(a => /No se encontró la hoja "DATOS"/.test(a))).toBe(true);
  });
});

// VENTAS STOCK: año detectado en una celda de título (filas 8-13, columnas
// A-J), datos desde la fila 14 (col B=referencia, C=stock inicial, D..O=meses 1-12).
const FILAS_VENTAS_STOCK = [
  [], [], [], [], [], [], [], // filas 1-7 en blanco
  ['', 'CARGA DE STOCKS Y VENTA 2025'], // fila 8: año en columna B
  [], [], [], [], [], // filas 9-13 en blanco
  // fila 14 (índice 13): B=referencia, C=stock inicial, D..O=meses 1-12
  [undefined, 'REF001', 20, 100, 0, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [undefined, 'REF002', 0, 0, 30, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [undefined, 'SELECCIONAR ARTICULO', 0, 999, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // placeholder, se ignora
  [] // fin
];

describe('parseLiquidacion: hoja VENTAS STOCK (Sell-In + stock inicial)', () => {
  const wb = workbookDeHojas({ 'VENTAS STOCK': FILAS_VENTAS_STOCK });
  const resultado = parseLiquidacion(wb, 'LIQUIDACION MERINO 2025.xlsx');

  test('detecta el año 2025 a partir del título', () => {
    expect(resultado.anio).toBe(2025);
  });

  test('extrae compras solo de los meses con valor distinto de 0', () => {
    expect(resultado.compras).toEqual([
      { referencia: 'REF001', mes_ano: '2025-01', unidades_compradas: 100 },
      { referencia: 'REF001', mes_ano: '2025-03', unidades_compradas: 50 },
      { referencia: 'REF002', mes_ano: '2025-02', unidades_compradas: 30 }
    ]);
  });

  test('stock inicial solo se guarda si es distinto de 0 (REF002 con 0 no aparece)', () => {
    expect(resultado.stockInicial).toEqual([{ referencia: 'REF001', stock_inicial: 20 }]);
  });

  test('la fila placeholder "SELECCIONAR ARTICULO" se ignora aunque traiga unidades (999)', () => {
    expect(resultado.compras.some(c => c.referencia === 'SELECCIONAR ARTICULO')).toBe(false);
    expect(resultado.avisos.some(a => /SELECCIONAR ARTICULO/.test(a))).toBe(true);
  });
});

describe('parseLiquidacion: hoja VENTAS STOCK ausente', () => {
  const wb = workbookDeHojas({ 'DATOS': [] });
  const resultado = parseLiquidacion(wb, 'LIQUIDACION MERINO 2025.xlsx');

  test('sin hoja, compras/stockInicial vacíos, año null y aviso explícito', () => {
    expect(resultado.compras).toEqual([]);
    expect(resultado.stockInicial).toEqual([]);
    expect(resultado.anio).toBeNull();
    expect(resultado.avisos.some(a => /No se encontró la hoja "VENTAS STOCK"/.test(a))).toBe(true);
  });
});

// Hoja mensual: cabecera "Referencia" en columna A (fila 1 en este caso),
// datos en columnas F..M (Bot.cargo, Bot.S/Cargo, Total S/C, Bot.Acuerdo,
// €/Botella, Total acuerdo, Bot.Muestras, Total Muestras).
const FILAS_ENERO_25 = [
  ['Referencia', '', '', '', '', 'Bot.cargo', 'Bot.S/Cargo', 'Total S/C', 'Bot.Acuerdo', '€/Botella', 'Total acuerdo', 'Bot.Muestras', 'Total Muestras'],
  ['REF001', '', '', '', '', 10, 1, 12.5, 0, 0, 0, 0, 0],
  ['REF002', '', '', '', '', 0, 0, 0, 0, 0, 0, 0, 0], // todo a 0: se ignora (tieneDatos=false)
  ['ELEGIR PRODUCTO', '', '', '', '', 5, 0, 0, 0, 0, 0, 0, 0], // placeholder: se ignora aunque traiga 5 uds
  [] // fin
];

describe('parseLiquidacion: hoja mensual (Sell-Out detallado)', () => {
  const wb = workbookDeHojas({
    'VENTAS STOCK': FILAS_VENTAS_STOCK, // año 2025 detectado, para que mande sobre el de la pestaña
    'ENERO 25': FILAS_ENERO_25
  });
  const resultado = parseLiquidacion(wb, 'LIQUIDACION MERINO 2025.xlsx');

  test('extrae solo la fila con datos reales (REF001), ignora la de ceros y el placeholder', () => {
    expect(resultado.ventas).toHaveLength(1);
    expect(resultado.ventas[0]).toEqual({
      referencia: 'REF001',
      ventas_uds: 10,
      regaladas_uds: 1,
      valor_regaladas_euros: 12.5,
      unidades_acuerdo: 0,
      precio_acuerdo_unidad: 0,
      valor_acuerdo_euros: 0,
      muestras_uds: 0,
      valor_muestras_euros: 0,
      mes_ano: '2025-01'
    });
  });

  test('avisa de la fila placeholder "ELEGIR PRODUCTO"', () => {
    expect(resultado.avisos.some(a => /ELEGIR PRODUCTO/.test(a))).toBe(true);
  });
});

describe('parseLiquidacion: el año de VENTAS STOCK manda sobre el de la pestaña mensual', () => {
  const FILAS_MARZO_24 = [
    ['Referencia', '', '', '', '', 'Bot.cargo'],
    ['REF003', '', '', '', '', 7],
    []
  ];
  const wb = workbookDeHojas({
    'VENTAS STOCK': FILAS_VENTAS_STOCK, // detecta año 2025
    'MARZO 24': FILAS_MARZO_24 // la pestaña dice 2024
  });
  const resultado = parseLiquidacion(wb, 'LIQUIDACION MERINO 2025.xlsx');

  test('usa 2025 (el de VENTAS STOCK), no 2024 (el del nombre de la pestaña)', () => {
    const fila = resultado.ventas.find(v => v.referencia === 'REF003');
    expect(fila.mes_ano).toBe('2025-03');
  });

  test('avisa del desajuste de año entre la pestaña y VENTAS STOCK', () => {
    expect(resultado.avisos.some(a => /MARZO 24/.test(a) && /2024/.test(a) && /2025/.test(a))).toBe(true);
  });
});

describe('parseLiquidacion: alias de mes SETIEMBRE/SEPTIEMBRE', () => {
  const FILAS_SETIEMBRE = [
    ['Referencia', '', '', '', '', 20],
    ['REF010', '', '', '', '', 20],
    []
  ];
  const wb = workbookDeHojas({ 'SETIEMBRE 25': FILAS_SETIEMBRE });
  const resultado = parseLiquidacion(wb, 'LIQUIDACION MERINO 2025.xlsx');

  test('"SETIEMBRE" (grafía antigua) se reconoce igual que "SEPTIEMBRE", mes 09', () => {
    const fila = resultado.ventas.find(v => v.referencia === 'REF010');
    expect(fila.mes_ano.endsWith('-09')).toBe(true);
  });
});

describe('parseLiquidacion: hoja mensual sin cabecera "Referencia" reconocible', () => {
  const FILAS_SIN_CABECERA = [
    ['Código', 'Nombre'], // no dice "Referencia" exactamente
    ['REF099', 'Algo']
  ];
  const wb = workbookDeHojas({ 'ABRIL 25': FILAS_SIN_CABECERA });
  const resultado = parseLiquidacion(wb, 'LIQUIDACION MERINO 2025.xlsx');

  test('no extrae ventas de esa hoja y avisa de que no se encontró la cabecera', () => {
    expect(resultado.ventas).toEqual([]);
    expect(resultado.avisos.some(a => /No se encontró la fila de cabecera.*"ABRIL 25"/.test(a))).toBe(true);
  });
});

describe('adivinarDistribuidor', () => {
  test('quita "LIQUIDACION" y el año, y deja el nombre del distribuidor', () => {
    expect(adivinarDistribuidor('LIQUIDACION MERINO 2025.xlsx')).toBe('MERINO');
  });

  test('funciona con nombres de varias palabras y "Liquidación" con tilde', () => {
    expect(adivinarDistribuidor('Liquidación Manuel Vega SL 2026.xlsx')).toBe('MANUEL VEGA SL');
  });

  test('sin ningún token de distribuidor, devuelve el texto por defecto', () => {
    expect(adivinarDistribuidor('Liquidacion 2025.xls')).toBe('DISTRIBUIDOR SIN NOMBRE');
  });
});

describe('parseLiquidacion: distribuidorSugerido se calcula a partir del nombre de archivo', () => {
  const wb = workbookDeHojas({ 'DATOS': [] });
  const resultado = parseLiquidacion(wb, 'LIQUIDACION MERINO 2025.xlsx');

  test('usa adivinarDistribuidor internamente', () => {
    expect(resultado.distribuidorSugerido).toBe('MERINO');
  });
});
