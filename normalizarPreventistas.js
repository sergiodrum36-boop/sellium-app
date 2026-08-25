/*
 * normalizarPreventistas.js
 * Script de un solo uso (mismo patrón que actualizarPreventistas2025.js:
 * firebase-admin + admin-key.json) para normalizar el campo `preventista` de
 * los movimientos de Sell-Out por Cliente Final.
 *
 * Motivo (a petición de Sergio, 2026-07-19): el script anterior
 * (actualizarPreventistas2025.js) solo rellenaba huecos VACÍOS, pero al
 * comparar el Excel consolidado 2025-2026 de Merino se vio que el problema
 * real es más amplio: 113 de 404 clientes con actividad en ambos años tienen
 * un preventista DISTINTO (no vacío) entre 2025 y 2026 — cambios reales de
 * comercial, o variantes de escritura del mismo nombre (p.ej. "Manuel Claro
 * Romero Cadiz" vs "Manuel Claro Romero"). Sergio confirmó: en ambos casos
 * hay que quedarse con el ÚLTIMO nombramiento POR FECHA (el preventista del
 * movimiento más reciente de ese cliente), y aplicarlo a TODOS los
 * movimientos de ese cliente que tengan un preventista distinto — no solo a
 * los de 2025.
 *
 * Regla exacta, por cada cliente (id_cliente):
 *   1. Se busca su movimiento con la FECHA más reciente (mes_ano como
 *      desempate si la fecha exacta falta) que tenga `preventista` relleno.
 *      Ese valor es el preventista "vigente" del cliente.
 *   2. Todos los DEMÁS movimientos de ese mismo cliente cuyo `preventista`
 *      sea distinto de ese valor (vacío o con un nombre distinto) se
 *      actualizan para que coincida.
 *
 * Por defecto hace DRY RUN (solo informa, no escribe nada). Para aplicar de
 * verdad hay que pasar --aplicar.
 *
 * Uso:
 *   node normalizarPreventistas.js                    -> dry run (informa)
 *   node normalizarPreventistas.js --aplicar           -> aplica los cambios
 *   node normalizarPreventistas.js correo@x.com --aplicar
 *       (por defecto usa sergio@unesdi.com si no se pasa email)
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

// Clave de orden cronológico de un movimiento: fecha exacta si existe,
// si no mes_ano (con "-01" para que ordene bien junto a fechas reales).
const claveFecha = (d) => d.fecha || (d.mes_ano ? `${d.mes_ano}-01` : '0000-00-00');

async function main() {
  const args = process.argv.slice(2);
  const aplicar = args.includes('--aplicar');
  const email = args.find(a => a.includes('@')) || 'sergio@unesdi.com';

  console.log(`Modo: ${aplicar ? 'APLICAR (se va a escribir en Firestore)' : 'DRY RUN (solo informa, no escribe nada)'}`);
  console.log(`Usuario: ${email}`);

  const userRecord = await admin.auth().getUserByEmail(email);
  const idUsuario = userRecord.uid;
  console.log(`uid: ${idUsuario}`);

  const col = db.collection('movimientosSellOutClientes');
  const snapshot = await conReintentos(() => col
    .where('id_usuario', '==', idUsuario)
    .where('mes_ano', '>=', '2025-01')
    .get());
  console.log(`Total movimientos de Sell-Out por Cliente de este usuario en 2025 en adelante: ${snapshot.size}`);

  // Agrupar por cliente.
  const porCliente = new Map(); // id_cliente -> [{ref, data}, ...]
  snapshot.forEach(doc => {
    const d = doc.data();
    if (!d.id_cliente) return;
    if (d.eliminado === true) return; // ya en la papelera, no tocar
    const lista = porCliente.get(d.id_cliente) || [];
    lista.push({ ref: doc.ref, data: d });
    porCliente.set(d.id_cliente, lista);
  });
  console.log(`Clientes distintos: ${porCliente.size}`);

  const aActualizar = [];
  const resumenPorCliente = []; // { nombreCliente, preventistaVigente, nCorregidos }

  porCliente.forEach((movs, idCliente) => {
    // Movimiento más reciente CON preventista relleno -> preventista vigente.
    const conPreventista = movs.filter(m => m.data.preventista && String(m.data.preventista).trim());
    if (conPreventista.length === 0) return; // ningun movimiento de este cliente tiene preventista, no hay nada de donde sacar el "vigente"
    // Orden descendente por fecha (string 'YYYY-MM-DD' compara bien lexicográficamente).
    conPreventista.sort((a, b) => String(claveFecha(b.data)).localeCompare(String(claveFecha(a.data))));
    const vigente = conPreventista[0].data.preventista;
    const nombreCliente = conPreventista[0].data.nombre_cliente;

    const aCorregirDeEsteCliente = movs.filter(m => (m.data.preventista || '') !== vigente);
    if (aCorregirDeEsteCliente.length === 0) return;

    aCorregirDeEsteCliente.forEach(m => aActualizar.push({ ref: m.ref, nuevoPreventista: vigente }));
    resumenPorCliente.push({ nombreCliente, preventistaVigente: vigente, nCorregidos: aCorregirDeEsteCliente.length });
  });

  console.log('\n--- INFORME ---');
  console.log(`Movimientos a corregir: ${aActualizar.length} (${resumenPorCliente.length} cliente(s))`);
  resumenPorCliente
    .sort((a, b) => (a.nombreCliente || '').localeCompare(b.nombreCliente || '', 'es'))
    .forEach(r => {
      console.log(`  - ${r.nombreCliente}: ${r.nCorregidos} movimiento(s) -> preventista "${r.preventistaVigente}"`);
    });

  if (!aplicar) {
    console.log('\nDRY RUN: no se ha escrito nada. Vuelve a ejecutar con --aplicar para aplicar estos cambios.');
    return;
  }

  if (aActualizar.length === 0) {
    console.log('\nNada que aplicar.');
    return;
  }

  console.log(`\nAplicando ${aActualizar.length} actualizaciones...`);
  const grupos = chunkArray(aActualizar, CHUNK_SIZE);
  for (let i = 0; i < grupos.length; i++) {
    const grupo = grupos[i];
    await conReintentos(async () => {
      const batch = db.batch();
      grupo.forEach(m => batch.update(m.ref, { preventista: m.nuevoPreventista }));
      await batch.commit();
    });
    console.log(`  Lote ${i + 1}/${grupos.length} aplicado (${grupo.length} movimiento(s)).`);
  }
  console.log('----------------------------------------------------');
  console.log(`¡ÉXITO! ${aActualizar.length} movimiento(s) normalizados al preventista vigente de cada cliente.`);
  console.log('----------------------------------------------------');
}

main().catch(err => {
  const esCuotaAgotada = err.code === 8 || /RESOURCE_EXHAUSTED/i.test(String(err.message || ''));
  if (esCuotaAgotada) {
    console.error('----------------------------------------------------');
    console.error('Firestore sigue devolviendo "cuota agotada" tras reintentar.');
    console.error('Prueba otra vez en un rato, o revisa el uso en la consola de Firebase.');
    console.error('----------------------------------------------------');
  } else {
    console.error('Error:', err);
  }
  process.exit(1);
});
