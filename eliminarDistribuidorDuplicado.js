/*
 * eliminarDistribuidorDuplicado.js
 * Script de un solo uso (mismo patrón que normalizarPreventistas.js /
 * setManagerRole.js: firebase-admin + admin-key.json) para borrar POR
 * COMPLETO un distribuidor duplicado y todo lo que se haya guardado bajo su
 * nombre en las ~13 colecciones de Firestore que se referencian por
 * id_distribuidor (ver cabecera de src/firebaseApi.js).
 *
 * Motivo (a petición de Sergio, 2026-08-25): al importar un Excel de
 * liquidación se le olvidó marcar "Usar distribuidor ya existente", así que
 * ImportarExcel.js creó un distribuidor NUEVO ("DIEGO CANALS") en vez de usar
 * el que ya existía ("DISTRIBUCIONES DIEGO CANALS SL"), duplicando la ficha
 * y colgando ahí las compras/ventas de ese Excel. Sergio confirmó que prefiere
 * borrar el distribuidor duplicado entero (y todo lo cargado bajo su nombre)
 * y volver a importar el Excel eligiendo esta vez el distribuidor correcto —
 * NO fusionar/reasignar datos.
 *
 * Qué borra, para el distribuidor cuyo nombre coincide EXACTO (sin distinguir
 * mayúsculas/espacios) con el nombre buscado:
 *   1. El propio documento en "distribuidores".
 *   2. Todos los documentos de estas colecciones que tengan
 *      id_usuario == <uid> AND id_distribuidor == <id del distribuidor>:
 *        historicoSellIn, historicoSellOut, stockInicialDistribuidor,
 *        clientesSellOut, movimientosSellOutClientes, aliasProductosSellOut,
 *        ventasReales, acuerdosClientes, configuracionRapelDistribuidores,
 *        presupuestos, visitasComerciales, asignacionesComercial.
 *
 * Por defecto hace DRY RUN (solo informa cuántos documentos hay en cada
 * colección y sus IDs; NO borra nada). Para aplicar de verdad hay que pasar
 * --aplicar.
 *
 * Uso:
 *   node eliminarDistribuidorDuplicado.js                              -> dry run, busca "DIEGO CANALS", usuario sergio@unesdi.com
 *   node eliminarDistribuidorDuplicado.js --aplicar                    -> aplica el borrado
 *   node eliminarDistribuidorDuplicado.js "OTRO NOMBRE" --aplicar
 *   node eliminarDistribuidorDuplicado.js "OTRO NOMBRE" correo@x.com --aplicar
 */

const admin = require('firebase-admin');
const serviceAccount = require('./admin-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const CHUNK_SIZE = 400;
const chunkArray = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function conReintentos(fn, { intentos = 2, esperaInicialMs = 5000 } = {}) {
  let ultimoError;
  for (let intento = 1; intento <= intentos; intento++) {
    try {
      return await fn();
    } catch (error) {
      ultimoError = error;
      const esCuotaAgotada = error.code === 8 || /RESOURCE_EXHAUSTED/i.test(String(error.message || ''));
      if (!esCuotaAgotada || intento === intentos) throw error;
      const espera = esperaInicialMs * intento;
      console.log(`Firestore ha respondido "cuota agotada" (intento ${intento}/${intentos}). Reintentando en ${espera / 1000}s...`);
      await esperar(espera);
    }
  }
  throw ultimoError;
}

const normalizar = (s) => String(s || '').trim().toUpperCase().replace(/\s+/g, ' ');

// Las 12 colecciones (además de "distribuidores") que se referencian por
// (id_usuario, id_distribuidor). Ver cabecera de src/firebaseApi.js: "~13
// colecciones de Firestore" en total para toda la app — estas son las que
// cuelgan de un distribuidor.
const COLECCIONES_POR_DISTRIBUIDOR = [
  'historicoSellIn',
  'historicoSellOut',
  'stockInicialDistribuidor',
  'clientesSellOut',
  'movimientosSellOutClientes',
  'aliasProductosSellOut',
  'ventasReales',
  'acuerdosClientes',
  'configuracionRapelDistribuidores',
  'presupuestos',
  'visitasComerciales',
  'asignacionesComercial',
];

async function borrarQuery(query) {
  const snapshot = await conReintentos(() => query.get());
  if (snapshot.empty) return { total: 0 };
  for (const grupo of chunkArray(snapshot.docs, CHUNK_SIZE)) {
    await conReintentos(async () => {
      const batch = db.batch();
      grupo.forEach(d => batch.delete(d.ref));
      await batch.commit();
    });
  }
  return { total: snapshot.size };
}

async function main() {
  const args = process.argv.slice(2);
  const aplicar = args.includes('--aplicar');
  const posicionales = args.filter(a => a !== '--aplicar');
  const nombreBuscado = posicionales.find(a => !a.includes('@')) || 'DIEGO CANALS';
  const email = posicionales.find(a => a.includes('@')) || 'sergio@unesdi.com';

  console.log(`Modo: ${aplicar ? 'APLICAR (se va a BORRAR de Firestore, sin posibilidad de deshacer)' : 'DRY RUN (solo informa, no borra nada)'}`);
  console.log(`Usuario: ${email}`);
  console.log(`Distribuidor a borrar (nombre exacto): "${nombreBuscado}"`);

  const userRecord = await admin.auth().getUserByEmail(email);
  const idUsuario = userRecord.uid;
  console.log(`uid: ${idUsuario}`);

  // 1. Buscar el/los distribuidor(es) cuyo nombre coincide EXACTO (normalizado)
  const distriSnapshot = await conReintentos(() => db.collection('distribuidores')
    .where('id_usuario', '==', idUsuario)
    .get());

  const objetivo = normalizar(nombreBuscado);
  const distribuidoresCoincidentes = distriSnapshot.docs.filter(d => normalizar(d.data().nombre_distribuidor) === objetivo);

  if (distribuidoresCoincidentes.length === 0) {
    console.log('\n----------------------------------------------------');
    console.log(`No se encontró ningún distribuidor de este usuario cuyo nombre sea exactamente "${nombreBuscado}".`);
    console.log('Distribuidores existentes de este usuario:');
    distriSnapshot.docs.forEach(d => console.log(`  - "${d.data().nombre_distribuidor}" (id: ${d.id})`));
    console.log('----------------------------------------------------');
    return;
  }

  console.log(`\nEncontrado(s) ${distribuidoresCoincidentes.length} distribuidor(es) con ese nombre exacto:`);
  distribuidoresCoincidentes.forEach(d => console.log(`  - "${d.data().nombre_distribuidor}" (id: ${d.id})`));

  let granTotal = 0;
  const porDistribuidor = [];

  for (const distriDoc of distribuidoresCoincidentes) {
    const idDistribuidor = distriDoc.id;
    console.log(`\n=== Distribuidor "${distriDoc.data().nombre_distribuidor}" (id: ${idDistribuidor}) ===`);

    const conteos = {};
    let totalDistribuidor = 0;

    for (const nombreColeccion of COLECCIONES_POR_DISTRIBUIDOR) {
      const q = db.collection(nombreColeccion)
        .where('id_usuario', '==', idUsuario)
        .where('id_distribuidor', '==', idDistribuidor);
      const snap = await conReintentos(() => q.get());
      conteos[nombreColeccion] = snap.size;
      totalDistribuidor += snap.size;
      if (snap.size > 0) console.log(`  ${nombreColeccion}: ${snap.size} documento(s)`);
    }

    console.log(`  TOTAL documentos ligados a este distribuidor: ${totalDistribuidor}`);
    console.log(`  + 1 documento del propio distribuidor en "distribuidores"`);

    porDistribuidor.push({ distriDoc, idDistribuidor, conteos, totalDistribuidor });
    granTotal += totalDistribuidor + 1;
  }

  console.log('\n--- INFORME ---');
  console.log(`Se borrarían ${granTotal} documento(s) en total (incluye la(s) ficha(s) de distribuidor).`);

  if (!aplicar) {
    console.log('\nDRY RUN: no se ha borrado nada. Vuelve a ejecutar con --aplicar para aplicar este borrado.');
    return;
  }

  console.log('\nAplicando borrado...');
  for (const { distriDoc, idDistribuidor, conteos } of porDistribuidor) {
    for (const nombreColeccion of COLECCIONES_POR_DISTRIBUIDOR) {
      if (conteos[nombreColeccion] === 0) continue;
      const q = db.collection(nombreColeccion)
        .where('id_usuario', '==', idUsuario)
        .where('id_distribuidor', '==', idDistribuidor);
      const { total } = await borrarQuery(q);
      console.log(`  ${nombreColeccion}: ${total} documento(s) borrado(s).`);
    }
    await conReintentos(() => distriDoc.ref.delete());
    console.log(`  Distribuidor "${distriDoc.data().nombre_distribuidor}" (id: ${idDistribuidor}) borrado.`);
  }

  console.log('----------------------------------------------------');
  console.log(`¡ÉXITO! Se borraron ${granTotal} documento(s) en total.`);
  console.log('----------------------------------------------------');
}

main().catch(err => {
  const esCuotaAgotada = err.code === 8 || /RESOURCE_EXHAUSTED/i.test(String(err.message || ''));
  if (esCuotaAgotada) {
    console.error('----------------------------------------------------');
    console.error('Firestore sigue devolviendo "cuota agotada" tras reintentar.');
    console.error('Prueba otra vez en un rato, o revisa el uso en la consola de Firebase.');
    console.error('----------------------------------------------------');
  } else if (err.code === 'auth/user-not-found') {
    console.error(`No existe ningún usuario con ese email en Firebase Authentication.`);
  } else {
    console.error('Error:', err);
  }
  process.exit(1);
});
