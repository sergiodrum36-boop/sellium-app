/*
 * comprobarZonaMerino.js
 * Script de comprobación de un solo uso (mismo patrón que setManagerRole.js /
 * actualizarPreventistas2025.js: firebase-admin + admin-key.json) para ver
 * qué hay guardado AHORA MISMO en `movimientosSellOutClientes` del
 * distribuidor Merino, tras el problema de la columna "Zona" que no se
 * reconocía al importar (2026-07-19).
 *
 * Solo LEE, no escribe ni borra nada.
 *
 * Qué comprueba:
 *   1. Encuentra el distribuidor cuyo nombre contiene "MERINO".
 *   2. Cuenta sus movimientos totales y cuántos tienen el campo `comercial`
 *      (Zona) relleno vs vacío.
 *   3. Lista los valores distintos de `comercial` que hay (deberían ser
 *      1, 2, 4, 20 si el archivo se importó bien).
 *   4. Cuenta movimientos por mes (mes_ano) — para ver si están los 12 meses
 *      de 2025 o si faltan algunos.
 *   5. Muestra el detalle de los movimientos de "LA ALICANTINA" en concreto
 *      (el cliente de ejemplo de la conversación).
 *
 * Uso:
 *   node comprobarZonaMerino.js
 *   node comprobarZonaMerino.js correo@x.com   (por defecto sergio@unesdi.com)
 */

const admin = require('firebase-admin');
const serviceAccount = require('./admin-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

async function main() {
  const email = process.argv.find(a => a.includes('@')) || 'sergio@unesdi.com';
  console.log(`Usuario: ${email}`);

  const userRecord = await admin.auth().getUserByEmail(email);
  const idUsuario = userRecord.uid;
  console.log(`uid: ${idUsuario}`);

  // --- 1. Encontrar el distribuidor Merino ---
  const distribuidoresSnap = await db.collection('distribuidores')
    .where('id_usuario', '==', idUsuario)
    .get();
  const merino = distribuidoresSnap.docs.find(d => (d.data().nombre_distribuidor || '').toUpperCase().includes('MERINO'));

  if (!merino) {
    console.log('No se ha encontrado ningún distribuidor cuyo nombre contenga "MERINO". Distribuidores encontrados:');
    distribuidoresSnap.docs.forEach(d => console.log(`  - ${d.data().nombre_distribuidor} (${d.id})`));
    return;
  }
  console.log(`Distribuidor encontrado: "${merino.data().nombre_distribuidor}" (id: ${merino.id})`);

  // --- 2. Movimientos de Sell-Out por Cliente de ese distribuidor ---
  const movSnap = await db.collection('movimientosSellOutClientes')
    .where('id_usuario', '==', idUsuario)
    .where('id_distribuidor', '==', merino.id)
    .get();

  const todos = movSnap.docs.map(d => d.data());
  const activos = todos.filter(m => m.eliminado !== true);
  const enPapelera = todos.filter(m => m.eliminado === true);

  console.log(`\nTotal documentos en Firestore para este distribuidor: ${todos.length}`);
  console.log(`  - Activos (visibles en la app): ${activos.length}`);
  console.log(`  - En la papelera (eliminado=true): ${enPapelera.length}`);

  const conZona = activos.filter(m => m.comercial && String(m.comercial).trim() !== '');
  const sinZona = activos.filter(m => !m.comercial || String(m.comercial).trim() === '');
  console.log(`\nDe los activos:`);
  console.log(`  - Con campo "comercial" (Zona) relleno: ${conZona.length}`);
  console.log(`  - Con campo "comercial" (Zona) VACÍO: ${sinZona.length}`);

  const valoresZona = new Set(conZona.map(m => m.comercial));
  console.log(`  - Valores distintos de Zona encontrados: ${[...valoresZona].sort().join(', ') || '(ninguno)'}`);

  // --- 3. Movimientos por mes ---
  const porMes = {};
  activos.forEach(m => { porMes[m.mes_ano] = (porMes[m.mes_ano] || 0) + 1; });
  console.log(`\nMovimientos activos por mes:`);
  Object.keys(porMes).sort().forEach(mes => console.log(`  - ${mes}: ${porMes[mes]}`));

  // --- 4. LA ALICANTINA en detalle ---
  const alicantina = activos.filter(m => (m.nombre_cliente || '').toUpperCase().includes('ALICANTINA'));
  console.log(`\nMovimientos de "LA ALICANTINA": ${alicantina.length}`);
  alicantina.slice(0, 5).forEach(m => {
    console.log(`  - mes_ano: ${m.mes_ano} | comercial: "${m.comercial}" | preventista: "${m.preventista}" | uds_totales: ${m.uds_totales}`);
  });
  if (alicantina.length > 5) console.log(`  ... y ${alicantina.length - 5} más.`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
