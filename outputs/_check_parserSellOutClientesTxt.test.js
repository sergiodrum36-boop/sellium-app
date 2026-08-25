/*
 * parserSellOutClientesTxt.test.js
 * Tests del parser de texto de ancho fijo "Liquidación de Promociones"
 * (informe tipo AS/400, agrupado por PRODUCTO, con las posiciones de columna
 * calculadas a partir de la propia línea de cabecera de cada bloque). Solo
 * se exporta parseSellOutClientesTxt(textoPlano), así que los tests
 * construyen strings de ejemplo con los espacios en las posiciones correctas
 * — usando los MISMOS anchos de columna que calcularía calcularColumnas() a
 * partir de la cabecera, para no depender de contar caracteres a mano.
 *
 * Nota de revisión (2026-07-25): se comprobó si este archivo tenía el mismo
 * bug de índice-0 corregido en parserSellOutClientes.js (comprobar `!valor`
 * en vez de `=== undefined`/`< 0`, que falla cuando el valor legítimo es 0).
 * Aquí la comprobación relevante es `calcularColumnas()`: usa
 * `posiciones.docum < 0 || posiciones.fecha < 0 || posiciones.compra < 0`
 * (correcto: compara con `< 0`, no con negación, así que una columna en la
 * posición 0 —como "clte", fijada a 0 a propósito— nunca se confundiría con
 * "no encontrada") y el filtro `.filter(([, pos]) => pos >= 0)` (también
 * correcto). El único `if (!x)` que queda es `if (!limites[nombre]) return
 * '';` en `cortar()`, pero `limites[nombre]` es un ARRAY `[inicio, fin]` (o
 * `undefined` si esa columna no se reconoció) — un array vacío o con un 0
 * dentro sigue siendo "truthy" en JS, así que este chequeo distingue bien
 * "no existe la clave" de "existe pero su valor es 0" y no hace falta
 * tocarlo. No se ha encontrado el bug en este archivo.
 */
import { parseSellOutClientesTxt } from './_check_parserSellOutClientesTxt';

// Construye la línea de cabecera de columnas y las líneas de datos con los
// MISMOS anchos, para que las posiciones calculadas por calcularColumnas()
// coincidan siempre con donde se coloca cada valor (evita errores de conteo
// manual de espacios). Anchos elegidos para que quepan nombres cortos.
const ANCHO_CLTE = 30;
const ANCHO_DOCUM = 11;
const ANCHO_FECHA = 9;
const ANCHO_COMPRA = 7;
const ANCHO_RUNID = 7;
const ANCHO_RIMPT = 7;
const ANCHO_CUNID = 7;
// C.IMPT es la última columna, sin ancho fijo (hasta el final de línea).

function lineaCabecera() {
  return (
    'CLTE. NOMBRE'.padEnd(ANCHO_CLTE) +
    'DOCUM.'.padEnd(ANCHO_DOCUM) +
    'FECHA'.padEnd(ANCHO_FECHA) +
    'COMPRA'.padEnd(ANCHO_COMPRA) +
    'R.UNID'.padEnd(ANCHO_RUNID) +
    'R.IMPT'.padEnd(ANCHO_RIMPT) +
    'C.UNID'.padEnd(ANCHO_CUNID) +
    'C.IMPT'
  );
}

function lineaDato({ clte = '', docum = '', fecha = '', compra = '', runid = '', rimpt = '', cunid = '', cimpt = '' }) {
  return (
    String(clte).padEnd(ANCHO_CLTE) +
    String(docum).padEnd(ANCHO_DOCUM) +
    String(fecha).padEnd(ANCHO_FECHA) +
    String(compra).padEnd(ANCHO_COMPRA) +
    String(runid).padEnd(ANCHO_RUNID) +
    String(rimpt).padEnd(ANCHO_RIMPT) +
    String(cunid).padEnd(ANCHO_CUNID) +
    String(cimpt)
  );
}

const SEPARADOR = '-'.repeat(75);

describe('parseSellOutClientesTxt: informe con 2 bloques de artículo', () => {
  const texto = [
    'LIQUIDACION PROMOCIONES: 19                                    03-07-26',
    'COD Y NOMBRE PROVEEDOR.: 10687  UNESDI DISTRIBUCIONES, S.A     Pagina 1',
    'PERIODO LIQUIDACION....: 01-06-26 30-06-26',
    'ARTICULO Y NOMBRE......: 10036      PALOMO COJO MAGNUM',
    SEPARADOR,
    lineaCabecera(),
    SEPARADOR,
    lineaDato({ clte: '01080 RESTAURANTE MESON', docum: '260087281', fecha: '26-06-26', compra: '12', runid: '0', rimpt: '31.44', cunid: '12', cimpt: '0.00' }),
    lineaDato({ clte: '02090 BAR DEL PUERTO', docum: '260087300', fecha: '27-06-26', compra: '5', runid: '2', rimpt: '6.20', cunid: '2', cimpt: '5.00' }),
    SEPARADOR,
    lineaDato({ clte: '', docum: '', fecha: '', compra: '17', runid: '2', rimpt: '37.64' }), // subtotal: cliente vacío, se ignora
    'LIQUIDACION PROMOCIONES: 19                                    03-07-26',
    'COD Y NOMBRE PROVEEDOR.: 10687  UNESDI DISTRIBUCIONES, S.A     Pagina 2',
    'PERIODO LIQUIDACION....: 01-06-26 30-06-26', // 2ª aparición: se ignora, no duplica el aviso de periodo
    'ARTICULO Y NOMBRE......: 20099      ALBARI O RIAS BAIXAS',
    SEPARADOR,
    lineaCabecera(),
    SEPARADOR,
    lineaDato({ clte: 'SOLOUNTOKEN', docum: '260087400', fecha: '28-06-26', compra: '3', runid: '0', rimpt: '0.00', cunid: '0', cimpt: '0.00' }), // cliente sin código separado
    SEPARADOR
  ].join('\n');

  const resultado = parseSellOutClientesTxt(texto);

  test('reconoce los 2 bloques de artículo', () => {
    expect(resultado.hojaLeida).toBe('texto (2 artículo(s) detectado(s))');
  });

  test('extrae 3 filas de datos (2 del primer bloque + 1 del segundo), ignorando subtotales', () => {
    expect(resultado.filas).toHaveLength(3);
  });

  test('separa código y nombre de cliente, calcula totales=compra+runid y mapea R.IMPT/C.IMPT a dtos1/dtos2', () => {
    expect(resultado.filas[0]).toEqual({
      distribuidor: '',
      cliente: 'RESTAURANTE MESON',
      cod_cliente: '01080',
      nif: '',
      tipologia: '',
      grupo: '',
      comercial: '',
      preventista: '',
      albaran: '260087281',
      fecha: '2026-06-26',
      mesAno: '2026-06',
      producto: 'PALOMO COJO MAGNUM',
      ventas: 12,
      promo: 0,
      regalos: 0,
      totales: 12,
      dtos1: 31.44,
      dtos2: 0,
      coste: 0,
      precio: 0
    });
  });

  test('segunda fila del primer bloque: regalos (R.UNID) suma a totales', () => {
    expect(resultado.filas[1].cod_cliente).toBe('02090');
    expect(resultado.filas[1].cliente).toBe('BAR DEL PUERTO');
    expect(resultado.filas[1].ventas).toBe(5);
    expect(resultado.filas[1].regalos).toBe(2);
    expect(resultado.filas[1].totales).toBe(7);
    expect(resultado.filas[1].dtos1).toBe(6.2);
    expect(resultado.filas[1].dtos2).toBe(5);
  });

  test('segundo bloque: producto distinto, y un cliente sin código (una sola palabra) no rompe el parseo', () => {
    expect(resultado.filas[2].producto).toBe('ALBARI O RIAS BAIXAS');
    expect(resultado.filas[2].cod_cliente).toBe('');
    expect(resultado.filas[2].cliente).toBe('SOLOUNTOKEN');
  });

  test('el periodo se detecta una sola vez aunque la línea aparezca 2 veces (una por bloque)', () => {
    expect(resultado.avisos.some(a => /Periodo detectado.*01-06-26 a 30-06-26/.test(a))).toBe(true);
    expect(resultado.avisos.filter(a => /Periodo detectado/.test(a))).toHaveLength(1);
  });

  test('todas las fechas se reconocen: no hay aviso de fecha no reconocida', () => {
    expect(resultado.avisos.some(a => /Fecha no reconocida/.test(a))).toBe(false);
  });
});

describe('parseSellOutClientesTxt: ningún bloque "ARTICULO Y NOMBRE" reconocido', () => {
  const texto = [
    SEPARADOR,
    lineaCabecera(),
    SEPARADOR,
    lineaDato({ clte: '01080 RESTAURANTE MESON', docum: '1', fecha: '26-06-26', compra: '1' })
  ].join('\n');
  const resultado = parseSellOutClientesTxt(texto);

  test('sin ARTICULO reconocido, devuelve filas vacías y un aviso explicativo', () => {
    expect(resultado.filas).toEqual([]);
    expect(resultado.hojaLeida).toBeNull();
    expect(resultado.avisos.length).toBeGreaterThan(0);
  });
});

describe('parseSellOutClientesTxt: líneas de cliente antes de reconocer ningún artículo', () => {
  // Caso artificial (no es el orden real del informe) para ejercitar la
  // rama `if (!productoActual) { filasIgnoradasSinProducto++; continue; }`:
  // la cabecera de columnas ya se vio, pero todavía no ha aparecido ninguna
  // línea "ARTICULO Y NOMBRE".
  const texto = [
    lineaCabecera(),
    SEPARADOR,
    lineaDato({ clte: '01080 CLIENTE HUERFANO', docum: '1', fecha: '26-06-26', compra: '1' }),
    'ARTICULO Y NOMBRE......: 30000      PRODUCTO REAL',
    SEPARADOR,
    lineaCabecera(),
    SEPARADOR,
    lineaDato({ clte: '02090 CLIENTE NORMAL', docum: '2', fecha: '27-06-26', compra: '4' })
  ].join('\n');
  const resultado = parseSellOutClientesTxt(texto);

  test('la línea de cliente sin producto todavía asignado se descarta y se avisa', () => {
    expect(resultado.filas).toHaveLength(1);
    expect(resultado.filas[0].cliente).toBe('CLIENTE NORMAL');
    expect(resultado.avisos.some(a => /Se ignoraron 1 línea/.test(a))).toBe(true);
  });
});

describe('parseSellOutClientesTxt: fechas y el umbral de siglo (DD-MM-AA)', () => {
  const texto = [
    'ARTICULO Y NOMBRE......: 40000      PRODUCTO FECHAS',
    SEPARADOR,
    lineaCabecera(),
    SEPARADOR,
    lineaDato({ clte: '01010 CLIENTE UNO', docum: '1', fecha: '01-01-69', compra: '1' }), // aa=69 -> 2069
    lineaDato({ clte: '02020 CLIENTE DOS', docum: '2', fecha: '01-01-70', compra: '1' }), // aa=70 -> 1970
    lineaDato({ clte: '03030 CLIENTE TRES', docum: '3', fecha: '31/06/26', compra: '1' }) // formato con "/", no reconocida
  ].join('\n');
  const resultado = parseSellOutClientesTxt(texto);

  test('año de 2 cifras < 70 se interpreta como 20xx', () => {
    expect(resultado.filas[0].fecha).toBe('2069-01-01');
  });

  test('año de 2 cifras >= 70 se interpreta como 19xx', () => {
    expect(resultado.filas[1].fecha).toBe('1970-01-01');
  });

  test('fecha con separador "/" no se reconoce: queda null y se avisa', () => {
    expect(resultado.filas[2].fecha).toBeNull();
    expect(resultado.filas[2].mesAno).toBeNull();
    expect(resultado.avisos.some(a => /1 fila\(s\) tenían una Fecha no reconocida/.test(a))).toBe(true);
  });
});

describe('parseSellOutClientesTxt: carácter de control STX al principio del archivo', () => {
  const texto = '\x02' + [
    'ARTICULO Y NOMBRE......: 50000      PRODUCTO CON STX',
    SEPARADOR,
    lineaCabecera(),
    SEPARADOR,
    lineaDato({ clte: '01010 CLIENTE STX', docum: '1', fecha: '01-01-26', compra: '9' })
  ].join('\n');
  const resultado = parseSellOutClientesTxt(texto);

  test('el archivo se parsea igual aunque empiece con el carácter STX', () => {
    expect(resultado.filas).toHaveLength(1);
    expect(resultado.filas[0].cliente).toBe('CLIENTE STX');
    expect(resultado.filas[0].ventas).toBe(9);
  });
});

describe('parseSellOutClientesTxt: líneas de anotación entre paréntesis se ignoran', () => {
  const texto = [
    'ARTICULO Y NOMBRE......: 60000      PRODUCTO ANOTADO',
    SEPARADOR,
    lineaCabecera(),
    SEPARADOR,
    '(12 PALOMO COJO SEMI DULCE)', // anotación, no es un dato
    lineaDato({ clte: '01010 CLIENTE ANOTADO', docum: '1', fecha: '01-01-26', compra: '6' })
  ].join('\n');
  const resultado = parseSellOutClientesTxt(texto);

  test('la línea entre paréntesis no cuenta como fila de datos ni rompe el parseo', () => {
    expect(resultado.filas).toHaveLength(1);
    expect(resultado.filas[0].cliente).toBe('CLIENTE ANOTADO');
  });
});
