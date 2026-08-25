/*
 * diagnosticoTodosDistribuidores.js (v2 — incluye Stock Inicial)
 * Script de SOLO LECTURA (no borra ni cambia nada).
 *
 * Contexto: el diagnóstico anterior, filtrado SOLO a "MIGUEL MERINO
 * DISTRIBUCIONES SL", dio estos totales:
 *   - El Gastado (21.992,68 €) SÍ coincide exactamente con varias
 *     combinaciones de periodo (Año completo, Marzo-Junio, etc.) — eso ya
 *     queda confirmado, sin ningún error.
 *   - El Generado (41.006,36 € en pantalla) NO coincide con ninguna
 *     combinación usando solo Compras (Sell-In) de Miguel Merino — el máximo
 *     posible ahí, sumando el año entero, es 30.405,00 €.
 *
 * Sergio apuntó algo importante mirando el propio Excel: el "2026 A&P
 * ACUMULADO" que calcula el Excel (40.665,61 €) no es solo las Compras del
 * año — también suma el Stock Inicial declarado (lo que el distribuidor ya
 * tenía en su almacén al empezar el año), valorado a la tasa de A&P actual
 * de cada marca. Ese número está MUY cerca de los 41.006,36 € de la
 * pantalla, así que hay que comprobarlo con datos reales, no solo con el
 * Excel — puede que sí, puede que sea coincidencia (el Excel dice "2025" en
 * esa celda por una plantilla reciclada, aunque los datos ya son de 2026).
 *
 * OJO — lo que dice el propio código de la app (src/firebaseApi/stockInicial.js,
 * comentario de cabecera): el Stock Inicial NO se suma en el Dashboard de
 * Gestión (PantallaDashboard.js) ni en Control A&P — solo se usa para calcular
 * el Stock actualizado (Stock Final) y en una pantalla aparte, "Vision
 * Comercial" (ControlAPVisionComercial.js). Así que, según el código, no
 * DEBERÍA estar entrando aquí. Este script comprueba las DOS posibilidades a
 * la vez con datos reales, para no dejarlo a interpretación:
 *
 *   A) Solo Miguel Merino, con y sin sumar su Stock Inicial (a tasa ACTUAL
 *      de cada marca, igual que haría ControlAPVisionComercial.js).
 *   B) TODOS los distribuidores juntos (como si el filtro "Distribuidor"
 *      estuviera en "Todos"), con y sin sumar el Stock Inicial de todos.
 *
 * Así, sea cual sea la combinación real que estaba en pantalla, tiene que
 * aparecer en una de las filas de abajo.
 *
 * Uso:
 *   node diagnosticoTodosDistribuidores.js
 *   node diagnosticoTodosDistribuidores.js 2026 correo@x.com
 */

const admin = require('firebase-admin');
const serviceAccount = require('./admin-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const numSeguro = (v) => {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

const valorRegaladas = (m) => (m.valor_regaladas_euros !== undefined && m.valor_regaladas_euros !== null)
  ? numSeguro(m.valor_regaladas_euros) : numSeguro(m.regaladas_uds) * numSeguro(m.coste_unidad);
const valorMuestras = (m) => (m.valor_muestras_euros !== undefined && m.valor_muestras_euros !== null)
  ? numSeguro(m.valor_muestras_euros) : numSeguro(m.muestras_uds) * numSeguro(m.coste_unidad);
const valorAcuerdo = (m) => numSeguro(m.valor_acuerdo_euros);
const valorAportacionManual = (m) => numSeguro(m.aportacion_euros);
const gastoTotal = (m) => valorRegaladas(m) + valorMuestras(m) + valorAcuerdo(m) + valorAportacionManual(m);
const generadoSellIn = (m) => numSeguro(m.unidades_compradas) * numSeguro(m.ap_por_unidad);

const normalizar = (s) => String(s || '').trim().toUpperCase().replace(/\s+/g, ' ');
const fmt = (n) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
const mesesDe = (anio, listaMeses1a12) => new Set(listaMeses1a12.map(m => `${anio}-${String(m).padStart(2, '0')}`));

async function main() {
  const args = process.argv.slice(2);
  const anio = parseInt(args[0], 10) || 2026;
  const email = args.find(a => a.includes('@')) || 'sergio@unesdi.com';
  const nombreBuscado = 'MERINO';

  console.log('DIAGNÓSTICO FINAL (v2, con Stock Inicial) — SOLO LECTURA, no cambia nada.');
  console.log(`Año a analizar: ${anio}`);
  console.log(`Usuario: ${email}\n`);

  const userRecord = await admin.auth().getUserByEmail(email);
  const idUsuario = userRecord.uid;

  // --- Marcas globales, para tasa de A&P ACTUAL (igual que usaría
  // ControlAPVisionComercial.js para valorar el Stock Inicial) ---
  const marcasSnap = await db.collection('marcas').get();
  const mapaApActual = new Map(marcasSnap.docs.map(d => [d.id, numSeguro(d.data().AP_Generado_Por_Unidad)]));

  const distriSnap = await db.collection('distribuidores').where('id_usuario', '==', idUsuario).get();
  const mapaDistribuidores = new Map(distriSnap.docs.map(d => [d.id, d.data().nombre_distribuidor]));
  const idMerino = distriSnap.docs.find(d => normalizar(d.data().nombre_distribuidor).includes(nombreBuscado))?.id;
  console.log(`Distribuidores totales del usuario: ${distriSnap.size}`);
  console.log(`Miguel Merino detectado con id: ${idMerino || '(no encontrado)'}\n`);

  const [sellInSnap, sellOutSnap, stockInicialSnap] = await Promise.all([
    db.collection('historicoSellIn').where('id_usuario', '==', idUsuario).get(),
    db.collection('historicoSellOut').where('id_usuario', '==', idUsuario).get(),
    db.collection('stockInicialDistribuidor').where('id_usuario', '==', idUsuario).get()
  ]);
  const sellInTodos = sellInSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const sellOutTodos = sellOutSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(m => m.eliminado !== true);
  const stockInicialTodos = stockInicialSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // --- Comprobación de integridad: ¿algún movimiento de Sell-In sin mes_ano
  // reconocible (que se estaría colando o perdiendo en los totales)? ---
  const sellInSinMes = sellInTodos.filter(m => !m.mes_ano);
  if (sellInSinMes.length > 0) {
    console.log(`⚠️ ATENCIÓN: ${sellInSinMes.length} movimientos de historicoSellIn NO tienen "mes_ano" (no se cuentan en ningún periodo). Ejemplo:`, JSON.stringify(sellInSinMes[0]));
    console.log('');
  }

  const contribucionStockInicial = (filasStock) => filasStock.reduce((acc, f) => acc + numSeguro(f.stock_inicial) * (mapaApActual.get(f.id_marca) || 0), 0);

  const combinaciones = [
    { nombre: 'Año completo (Ene-Dic)', meses: [1,2,3,4,5,6,7,8,9,10,11,12] },
    { nombre: 'T1 (Ene-Mar)', meses: [1,2,3] },
    { nombre: 'T2 (Abr-Jun)', meses: [4,5,6] },
    { nombre: 'T3 (Jul-Sep)', meses: [7,8,9] },
    { nombre: 'S1 (Ene-Jun)', meses: [1,2,3,4,5,6] },
    { nombre: 'Marzo a Junio (Mar-Jun, 4 meses)', meses: [3,4,5,6] },
    { nombre: 'Marzo y Junio SOLO', meses: [3,6] },
  ];

  function analizar(etiqueta, sellIn, sellOut, stockInicialFilas) {
    console.log(`\n=====================  ${etiqueta}  =====================`);
    const stockInicialEuros = contribucionStockInicial(stockInicialFilas);
    console.log(`Stock Inicial declarado: ${stockInicialFilas.length} filas → ${fmt(stockInicialEuros)} (a tasa de A&P ACTUAL de cada marca)`);
    console.log('');
    console.log('Periodo'.padEnd(38) + 'Generado (solo Compras)'.padStart(26) + '  +Stock Inicial'.padStart(20) + '   Gastado'.padStart(16));
    for (const combo of combinaciones) {
      const set = mesesDe(anio, combo.meses);
      const sellInFiltrado = sellIn.filter(m => set.has(m.mes_ano));
      const sellOutFiltrado = sellOut.filter(m => set.has(m.mes_ano));
      const generado = sellInFiltrado.reduce((acc, m) => acc + generadoSellIn(m), 0);
      const gastado = sellOutFiltrado.reduce((acc, m) => acc + gastoTotal(m), 0);
      console.log(
        combo.nombre.padEnd(38) +
        fmt(generado).padStart(26) +
        fmt(generado + stockInicialEuros).padStart(20) +
        fmt(gastado).padStart(16)
      );
    }
  }

  // A) Solo Miguel Merino
  if (idMerino) {
    const sellInMerino = sellInTodos.filter(m => m.id_distribuidor === idMerino);
    const sellOutMerino = sellOutTodos.filter(m => m.id_distribuidor === idMerino);
    const stockMerino = stockInicialTodos.filter(m => m.id_distribuidor === idMerino);
    analizar('A) SOLO Miguel Merino', sellInMerino, sellOutMerino, stockMerino);
  }

  // B) Todos los distribuidores juntos
  analizar('B) TODOS los distribuidores juntos', sellInTodos, sellOutTodos, stockInicialTodos);

  console.log('\n\nBuscando la cifra exacta que salía en pantalla (Generado 41.006,36 € / Gastado 21.992,68 €) entre todas las filas de arriba (con margen de 1 €)...');
  let encontrado = false;
  for (const [etiqueta, sellIn, sellOut, stockInicialFilas] of [
    ['A) Solo Miguel Merino', idMerino ? sellInTodos.filter(m => m.id_distribuidor === idMerino) : [], idMerino ? sellOutTodos.filter(m => m.id_distribuidor === idMerino) : [], idMerino ? stockInicialTodos.filter(m => m.id_distribuidor === idMerino) : []],
    ['B) Todos los distribuidores', sellInTodos, sellOutTodos, stockInicialTodos]
  ]) {
    const stockInicialEuros = contribucionStockInicial(stockInicialFilas);
    for (const combo of combinaciones) {
      const set = mesesDe(anio, combo.meses);
      const generado = sellIn.filter(m => set.has(m.mes_ano)).reduce((acc, m) => acc + generadoSellIn(m), 0);
      const gastado = sellOut.filter(m => set.has(m.mes_ano)).reduce((acc, m) => acc + gastoTotal(m), 0);
      for (const [gLabel, gVal] of [['sin Stock Inicial', generado], ['con Stock Inicial', generado + stockInicialEuros]]) {
        if (Math.abs(gVal - 41006.36) < 1 && Math.abs(gastado - 21992.68) < 1) {
          encontrado = true;
          console.log(`✅ COINCIDE: ${etiqueta} | Periodo: ${combo.nombre} | Generado ${gLabel} (${fmt(gVal)}) | Gastado ${fmt(gastado)}`);
        }
      }
    }
  }
  if (!encontrado) console.log('❌ Ninguna combinación de las de arriba reproduce exactamente 41.006,36 € / 21.992,68 € (ver todas las filas más arriba para comparar a mano).');

  console.log('\nFin del diagnóstico. Copia y pega TODA esta salida en el chat.');
}

main().catch(err => {
  if (err.code === 'auth/user-not-found') {
    console.error(`No existe ningún usuario con ese email en Firebase Authentication.`);
  } else {
    console.error('Error:', err);
  }
  process.exit(1);
});
