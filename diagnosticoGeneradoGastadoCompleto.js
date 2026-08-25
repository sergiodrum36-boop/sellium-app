/*
 * diagnosticoGeneradoGastadoCompleto.js
 * Script de SOLO LECTURA (no borra ni cambia nada).
 *
 * Motivo (a petición de Sergio, 2026-08-25): el Dashboard de Gestión, para
 * "MIGUEL MERINO DISTRIBUCIONES SL", mostró en distintos momentos totales de
 * A&P Generado / Gastado que no cuadraban entre sí a simple vista (la última
 * vez: Generado 41.006,36 € / Gastado 21.992,68 €). Sergio pidió comprobar a
 * fondo si el motivo es un dato mal metido en el Excel o un fallo de la app.
 *
 * Este script reproduce EXACTAMENTE las mismas fórmulas que usa el Dashboard
 * de Gestión (PantallaDashboard.js + calculosAP.js) pero sobre TODOS los
 * meses de golpe (sin limitarse a Abr-Jul como el diagnóstico anterior), y
 * además:
 *   1. Imprime Generado/Gastado mes a mes (para ver de dónde sale cada euro).
 *   2. Imprime el total para varias combinaciones de periodo típicas (Año
 *      completo, cada trimestre, y "Marzo a Junio") para poder comparar
 *      directamente contra lo que muestra la pantalla.
 *   3. Comprueba si hay movimientos DUPLICADOS (mismo mes + misma marca
 *      repetida varias veces), que inflarían el total sin que se note a
 *      simple vista en la pantalla.
 *
 * Uso:
 *   node diagnosticoGeneradoGastadoCompleto.js
 *   node diagnosticoGeneradoGastadoCompleto.js "MERINO" 2026 correo@x.com
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

// Mismas fórmulas que src/calculosAP.js.
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

// Igual que construirMesesPermitidos en PantallaDashboard.js: un Set de
// "YYYY-MM" a partir de una lista de meses (1-12) para un año dado.
const mesesDe = (anio, listaMeses1a12) => new Set(listaMeses1a12.map(m => `${anio}-${String(m).padStart(2, '0')}`));

async function main() {
  const args = process.argv.slice(2);
  const nombreBuscado = args[0] || 'MERINO';
  const anio = parseInt(args[1], 10) || 2026;
  const email = args.find(a => a.includes('@')) || 'sergio@unesdi.com';

  console.log('DIAGNÓSTICO COMPLETO A&P GENERADO/GASTADO — SOLO LECTURA, no cambia nada.');
  console.log(`Buscando distribuidores cuyo nombre contenga: "${nombreBuscado}"`);
  console.log(`Año a analizar: ${anio}`);
  console.log(`Usuario: ${email}\n`);

  const userRecord = await admin.auth().getUserByEmail(email);
  const idUsuario = userRecord.uid;

  const distriSnap = await db.collection('distribuidores').where('id_usuario', '==', idUsuario).get();
  const candidatos = distriSnap.docs.filter(d => normalizar(d.data().nombre_distribuidor).includes(normalizar(nombreBuscado)));

  if (candidatos.length === 0) {
    console.log(`No se encontró ningún distribuidor cuyo nombre contenga "${nombreBuscado}".`);
    return;
  }
  if (candidatos.length > 1) {
    console.log(`⚠️ ATENCIÓN: hay ${candidatos.length} distribuidores cuyo nombre contiene "${nombreBuscado}" — posible duplicado:`);
    candidatos.forEach(d => console.log(`  - "${d.data().nombre_distribuidor}" (id: ${d.id})`));
    console.log('');
  }

  for (const distriDoc of candidatos) {
    const idDistribuidor = distriDoc.id;
    console.log(`=== "${distriDoc.data().nombre_distribuidor}" (id: ${idDistribuidor}) ===\n`);

    const [sellInSnap, sellOutSnap] = await Promise.all([
      db.collection('historicoSellIn').where('id_usuario', '==', idUsuario).where('id_distribuidor', '==', idDistribuidor).get(),
      db.collection('historicoSellOut').where('id_usuario', '==', idUsuario).where('id_distribuidor', '==', idDistribuidor).get()
    ]);
    const sellIn = sellInSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const sellOutTodos = sellOutSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const sellOut = sellOutTodos.filter(m => m.eliminado !== true); // lo que ve el dashboard

    // --- 1. Generado/Gastado mes a mes, TODOS los meses que aparezcan (no solo Abr-Jul) ---
    const mesesConDatos = new Set([...sellIn, ...sellOut].map(m => m.mes_ano).filter(Boolean));
    const mesesOrdenados = [...mesesConDatos].sort();

    console.log('--- Generado/Gastado MES A MES (todo lo que hay en Firestore para este distribuidor) ---');
    let sumaGeneradoTotal = 0, sumaGastadoTotal = 0;
    const porMes = {};
    for (const mes of mesesOrdenados) {
      const sellInMes = sellIn.filter(m => m.mes_ano === mes);
      const sellOutMes = sellOut.filter(m => m.mes_ano === mes);
      const generado = sellInMes.reduce((acc, m) => acc + generadoSellIn(m), 0);
      const gastado = sellOutMes.reduce((acc, m) => acc + gastoTotal(m), 0);
      porMes[mes] = { generado, gastado, nSellIn: sellInMes.length, nSellOut: sellOutMes.length };
      sumaGeneradoTotal += generado;
      sumaGastadoTotal += gastado;
      console.log(`  ${mes}: Sell-In ${sellInMes.length} mov. (Generado ${fmt(generado)}) | Sell-Out ${sellOutMes.length} mov. (Gastado ${fmt(gastado)})`);
    }
    console.log(`  TOTAL (todos los meses de arriba): Generado ${fmt(sumaGeneradoTotal)} | Gastado ${fmt(sumaGastadoTotal)}\n`);

    // --- 2. Totales para combinaciones de periodo típicas del selector ---
    console.log('--- Totales por combinación de periodo (para comparar con lo que se ve en pantalla) ---');
    const combinaciones = [
      { nombre: 'Año completo (Ene-Dic)', meses: [1,2,3,4,5,6,7,8,9,10,11,12] },
      { nombre: 'T1 (Ene-Mar)', meses: [1,2,3] },
      { nombre: 'T2 (Abr-Jun)', meses: [4,5,6] },
      { nombre: 'T3 (Jul-Sep)', meses: [7,8,9] },
      { nombre: 'T4 (Oct-Dic)', meses: [10,11,12] },
      { nombre: 'S1 (Ene-Jun)', meses: [1,2,3,4,5,6] },
      { nombre: 'S2 (Jul-Dic)', meses: [7,8,9,10,11,12] },
      { nombre: 'Marzo a Junio (Mar-Jun, 4 meses)', meses: [3,4,5,6] },
      { nombre: 'Marzo y Junio SOLO (sin Abr/May)', meses: [3,6] },
    ];
    for (const combo of combinaciones) {
      const set = mesesDe(anio, combo.meses);
      let g = 0, s = 0;
      for (const mes of set) {
        if (porMes[mes]) { g += porMes[mes].generado; s += porMes[mes].gastado; }
      }
      console.log(`  ${combo.nombre.padEnd(38)} → Generado ${fmt(g).padStart(14)} | Gastado ${fmt(s).padStart(14)} | Balance ${fmt(g - s)}`);
    }
    console.log('');

    // --- 3. Comprobación de duplicados: mismo mes + misma marca repetida ---
    console.log('--- Comprobación de posibles duplicados (mismo mes + misma marca varias veces) ---');
    let huboDuplicados = false;
    for (const [coleccionNombre, movimientos] of [['historicoSellIn', sellIn], ['historicoSellOut', sellOut]]) {
      const agrupado = new Map();
      movimientos.forEach(m => {
        const clave = `${m.mes_ano}|${m.id_marca}`;
        agrupado.set(clave, (agrupado.get(clave) || 0) + 1);
      });
      for (const [clave, count] of agrupado.entries()) {
        if (count > 1) {
          huboDuplicados = true;
          const [mes, idMarca] = clave.split('|');
          console.log(`  ⚠️ ${coleccionNombre}: ${count} movimientos para el mes ${mes} y la marca ${idMarca} (debería normalmente haber solo 1 por mes/marca).`);
        }
      }
    }
    if (!huboDuplicados) console.log('  Sin duplicados detectados — cada mes/marca aparece como mucho una vez.');
    console.log('');

    // --- 4. Movimientos en PAPELERA (para que no se confundan con datos "perdidos") ---
    const enPapelera = sellOutTodos.filter(m => m.eliminado === true);
    if (enPapelera.length > 0) {
      console.log(`--- ⚠️ Hay ${enPapelera.length} movimientos de Sell-Out en la PAPELERA para este distribuidor (no cuentan en el dashboard) ---`);
      const porMesPapelera = {};
      enPapelera.forEach(m => { porMesPapelera[m.mes_ano] = (porMesPapelera[m.mes_ano] || 0) + 1; });
      Object.entries(porMesPapelera).forEach(([mes, n]) => console.log(`  ${mes}: ${n} en papelera`));
      console.log('');
    }

    console.log('');
  }

  console.log('Fin del diagnóstico. Copia y pega TODA esta salida en el chat, tal cual, para que se pueda comparar con las cifras que salen en el Dashboard de Gestión.');
}

main().catch(err => {
  if (err.code === 'auth/user-not-found') {
    console.error(`No existe ningún usuario con el email ${email} en Firebase Authentication.`);
  } else {
    console.error('Error:', err);
  }
  process.exit(1);
});
