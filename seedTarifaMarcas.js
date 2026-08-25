/*
 * seedTarifaMarcas.js
 * Script de un solo uso (mismo patrón que actualizarPreventistas2025.js:
 * firebase-admin + admin-key.json, porque es una carga masiva puntual sobre
 * un catálogo que no tiene sentido exponer como botón permanente en la app)
 * para volcar la tarifa PVP+IVA de referencia por marca (colección
 * "tarifaMarcas", ver firebaseApi/tarifaMarcas.js) desde el Excel que
 * compartió Sergio ("PLANTILLA ACUERDOS PARA APORTACIONES VINOS Y
 * LICORES.xlsx", hoja "Hoja1") — confirmado con Sergio: la columna correcta
 * es "Precio Venta Recomendado Hostelería (PVR)", no "PRECIO TARIFA 24" ni
 * ninguna otra de esa hoja.
 *
 * Los nombres de marca del Excel llevan cosecha/DO entre paréntesis (ej.
 * "Palomo Cojo (2023) DO Rueda") que normalmente NO coinciden letra a letra
 * con el nombre tal cual vive en el catálogo real de "marcas" de Sellium
 * (ej. "Palomo Cojo"). Por eso este script no escribe a ciegas: cruza cada
 * fila del Excel contra el catálogo real de marcas por similitud de texto
 * (mismo criterio que matching.js/encontrarSimilares — normaliza
 * mayúsculas/acentos y quita lo que va entre paréntesis) y solo aplica
 * automáticamente los cruces con score alto (>=0.75); el resto se lista en
 * el informe para que Sergio decida a mano desde la propia pantalla
 * "Acuerdos con Clientes" (botón de guardar tarifa junto al campo PVP+IVA).
 *
 * Por defecto hace DRY RUN (solo informa, no escribe nada). Para aplicar de
 * verdad hay que pasar --aplicar.
 *
 * Uso:
 *   node seedTarifaMarcas.js            -> dry run (informe de cruces)
 *   node seedTarifaMarcas.js --aplicar  -> escribe los cruces con score alto
 */

const admin = require('firebase-admin');
const serviceAccount = require('./admin-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const APLICAR = process.argv.includes('--aplicar');
const UMBRAL_CONFIANZA = 0.75;

// --- Tarifa PVR extraída de Hoja1 de "PLANTILLA ACUERDOS PARA APORTACIONES
// VINOS Y LICORES.xlsx" (columna I, "Precio Venta Recomendado Hostelería") ---
const PVR_DATA = [
  { nombreExcel: 'Palomo Cojo (2023) DO Rueda', pvr: 5.7375 },
  { nombreExcel: 'Palomo Cojo MAGNUM (2023) DO Rueda', pvr: 11.2725 },
  { nombreExcel: 'Palomo Cojo Fermentado en Barrica (2022) DO Rueda', pvr: 9.2475 },
  { nombreExcel: 'Palomo Cojo Semidulce (2023) DO Rueda', pvr: 5.4945 },
  { nombreExcel: 'Pato Mareao (2023) DO Rias Baixas', pvr: 9.3825 },
  { nombreExcel: 'Laberinto de Cidonia (2022) D.O.Monterrei Rueda', pvr: 7.7895 },
  { nombreExcel: 'Palomo Cazador (Roble 2022) DO Ribera del Duero', pvr: 6.912 },
  { nombreExcel: 'Palomo Cazador (Roble 2022) DO Ribera del Duero Magnum', pvr: 13.4325 },
  { nombreExcel: 'Mataveras (Crianza 2020) DO Ribera del Duero', pvr: 11.88 },
  { nombreExcel: 'Mataveras 9 - DO Ribera del Duero (Novedad)', pvr: 8.8965 },
  { nombreExcel: 'Acecho # 2 ,Crianza (2018) DOC Rioja .Edición Limitada', pvr: 6.885 },
  { nombreExcel: 'Mombasa Club Gin', pvr: 19.6695 },
];

// --- Copia deliberada (no un import) de matching.js: este script corre con
// `node` fuera de webpack/CRA, y matching.js usa `export` (ES module) — más
// simple duplicar estas ~30 líneas que montar transpilación solo para esto.
function normalizarParaComparar(nombre) {
  return String(nombre || '')
    .toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/&/g, ' Y ')
    .replace(/[.,;:'"´`#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function similitudTokens(a, b) {
  const tokensA = new Set(a.split(' ').filter(Boolean));
  const tokensB = new Set(b.split(' ').filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let interseccion = 0;
  tokensA.forEach((t) => { if (tokensB.has(t)) interseccion++; });
  const union = new Set([...tokensA, ...tokensB]).size;
  return interseccion / union;
}
function similitud(nombreA, nombreB) {
  const a = normalizarParaComparar(nombreA);
  const b = normalizarParaComparar(nombreB);
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  if (a.includes(b) || b.includes(a)) {
    const corta = Math.min(a.length, b.length);
    const larga = Math.max(a.length, b.length);
    return 0.75 + 0.2 * (corta / larga);
  }
  return similitudTokens(a, b);
}

async function main() {
  console.log(`Modo: ${APLICAR ? 'APLICAR (escribe de verdad)' : 'DRY RUN (solo informa)'}`);
  console.log('Leyendo catálogo de marcas...');
  const snapshotMarcas = await db.collection('marcas').get();
  const marcas = snapshotMarcas.docs.map((d) => ({ id: d.id, ...d.data() }));
  console.log(`${marcas.length} marcas en el catálogo.\n`);

  const confirmados = [];
  const dudosos = [];
  const sinCandidato = [];

  PVR_DATA.forEach((fila) => {
    const candidatas = marcas
      .map((m) => ({ marca: m, score: similitud(fila.nombreExcel, m.nombre_marca) }))
      .sort((a, b) => b.score - a.score);
    const mejor = candidatas[0];
    if (!mejor || mejor.score === 0) {
      sinCandidato.push(fila);
    } else if (mejor.score >= UMBRAL_CONFIANZA) {
      confirmados.push({ ...fila, marca: mejor.marca, score: mejor.score });
    } else {
      dudosos.push({ ...fila, candidatas: candidatas.slice(0, 3) });
    }
  });

  console.log(`=== CRUCES CONFIRMADOS (score >= ${UMBRAL_CONFIANZA}) ===`);
  confirmados.forEach((c) => {
    console.log(`  "${c.nombreExcel}" -> "${c.marca.nombre_marca}" (score ${c.score.toFixed(2)}) : PVR ${c.pvr.toFixed(2)} €`);
  });
  if (confirmados.length === 0) console.log('  (ninguno)');

  console.log(`\n=== DUDOSOS (revisar a mano, score < ${UMBRAL_CONFIANZA}) ===`);
  dudosos.forEach((d) => {
    console.log(`  "${d.nombreExcel}" (PVR ${d.pvr.toFixed(2)} €) — candidatas:`);
    d.candidatas.forEach((c) => console.log(`      "${c.marca.nombre_marca}" (score ${c.score.toFixed(2)})`));
  });
  if (dudosos.length === 0) console.log('  (ninguno)');

  console.log('\n=== SIN NINGÚN CANDIDATO EN EL CATÁLOGO ===');
  sinCandidato.forEach((s) => console.log(`  "${s.nombreExcel}" (PVR ${s.pvr.toFixed(2)} €)`));
  if (sinCandidato.length === 0) console.log('  (ninguno)');

  console.log(`\nResumen: ${confirmados.length} confirmados, ${dudosos.length} dudosos, ${sinCandidato.length} sin candidato.`);
  console.log('Los "dudosos" y "sin candidato" no se tocan aquí — se pueden rellenar a mano desde "Acuerdos con Clientes" (botón de guardar tarifa junto al PVP+IVA de cada referencia).');

  if (!APLICAR) {
    console.log('\nDry run: no se ha escrito nada. Ejecuta con --aplicar para guardar los CONFIRMADOS.');
    return;
  }

  if (confirmados.length === 0) {
    console.log('\nNada que aplicar (0 cruces confirmados).');
    return;
  }

  console.log(`\nAplicando ${confirmados.length} cruces confirmados...`);
  for (const c of confirmados) {
    // Mismo patrón "borrar + crear" que guardarTarifaMarca (nunca update):
    // si ya había una tarifa guardada para esa marca, se borra primero.
    const existentes = await db.collection('tarifaMarcas').where('id_marca', '==', c.marca.id).get();
    const batch = db.batch();
    existentes.docs.forEach((d) => batch.delete(d.ref));
    const nuevoRef = db.collection('tarifaMarcas').doc();
    batch.set(nuevoRef, {
      id_marca: c.marca.id,
      nombre_marca: c.marca.nombre_marca,
      pvp_iva: Math.round(c.pvr * 100) / 100,
      actualizado_en: new Date().toISOString(),
    });
    await batch.commit();
    console.log(`  Guardado: "${c.marca.nombre_marca}" = ${(Math.round(c.pvr * 100) / 100).toFixed(2)} €`);
  }
  console.log('\n¡Listo!');
}

main().catch((error) => {
  console.error('Error ejecutando el script:', error);
  process.exit(1);
});
