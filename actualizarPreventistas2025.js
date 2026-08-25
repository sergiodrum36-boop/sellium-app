/*
 * actualizarPreventistas2025.js
 * Script de un solo uso (mismo patrón que setManagerRole.js: firebase-admin +
 * admin-key.json, porque es una corrección masiva sobre datos ya importados
 * que no tiene sentido exponer como botón permanente en la app) para arreglar
 * el campo `preventista` de los movimientos de Sell-Out por Cliente Final
 * (colección `movimientosSellOutClientes`) del año 2025.
 *
 * Motivo (a petición de Sergio, 2026-07-18): ha habido cambios de comerciales
 * desde que se importaron los datos de 2025, así que muchos movimientos de
 * ese año se quedaron con el campo `preventista` vacío (nunca se rellenó al
 * importar, o el preventista de entonces ya no aplica). Sergio pidió que, para
 * cada cliente, a los movimientos de 2025 que tengan `preventista` VACÍO se
 * les asigne el preventista que ese MISMO cliente (mismo id_cliente — el
 * maestro `clientesSellOut` no se recrea entre importaciones, así que el id
 * es estable entre años) tiene asignado en 2026 (el dato actualizado).
 *
 * Solo se tocan movimientos de 2025 con preventista vacío. Si un cliente no
 * tiene ningún movimiento en 2026 con preventista relleno, no hay nada de
 * donde copiar y se deja tal cual (se lista aparte en el informe).
 *
 * Por defecto hace DRY RUN (solo informa, no escribe nada). Para aplicar de
 * verdad hay que pasar --aplicar.
 *
 * Uso:
 *   node actualizarPreventistas2025.js                    -> dry run (informa)
 *   node actualizarPreventistas2025.js --aplicar           -> aplica los cambios
 *   node actualizarPreventistas2025.js correo@x.com --aplicar
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

// Firestore devuelve "8 RESOURCE_EXHAUSTED: Quota exceeded" tanto si es un
// pico pasajero de peticiones (esto sí se arregla reintentando) como si es la
// cuota GRATUITA DIARIA agotada de verdad (esto NO se arregla reintentando en
// el momento, solo esperando al día siguiente o pasando a un plan de pago) —
// no hay forma de distinguir los dos casos desde aquí, así que se reintenta
// un par de veces por si acaso, pero sin insistir mucho ni martillear la
// cuota si ya está agotada de verdad.
async function conReintentos(fn, { intentos = 2, esperaInicialMs = 5000 } = {}) {
  let ultimoError;
  for (let intento = 1; intento <= intentos; intento++) {
    try {
      return await fn();
    } catch (error) {
      ultimoError = error;
      const esCuotaAgotada = error.code === 8 || /RESOURCE_EXHAUSTED/i.test(String(error.message || ''));
      if (!esCuotaAgotada || intento === intentos) throw error;
      const espera = esperaInicialMs * intento; // 3s, 6s, 9s, 12s...
      console.log(`Firestore ha respondido "cuota agotada" (intento ${intento}/${intentos}). Reintentando en ${espera / 1000}s...`);
      await esperar(espera);
    }
  }
  throw ultimoError;
}

async function main() {
  const args = process.argv.slice(2);
  const aplicar = args.includes('--aplicar');
  const email = args.find(a => a.includes('@')) || 'sergio@unesdi.com';

  console.log(`Modo: ${aplicar ? 'APLICAR (se va a escribir en Firestore)' : 'DRY RUN (solo informa, no escribe nada)'}`);
  console.log(`Usuario: ${email}`);

  const userRecord = await admin.auth().getUserByEmail(email);
  const idUsuario = userRecord.uid;
  console.log(`uid: ${idUsuario}`);

  // Solo hace falta leer 2025 y 2026 (es lo único que compara este script) —
  // pedirle a Firestore que filtre por mes_ano en vez de traer también los
  // años anteriores ahorra muchísimas lecturas en colecciones grandes (a
  // Sergio se le agotó la cuota gratuita diaria de Firestore probando este
  // mismo script, ver conversación 2026-07-18).
  const col = db.collection('movimientosSellOutClientes');
  const snapshot = await conReintentos(() => col
    .where('id_usuario', '==', idUsuario)
    .where('mes_ano', '>=', '2025-01')
    .get());
  console.log(`Total movimientos de Sell-Out por Cliente de este usuario en 2025-2026: ${snapshot.size}`);

  // 1. Mapa id_cliente -> preventista "actual" (2026), quedándonos con el más
  //    reciente (mayor mes_ano) si hubiera más de un preventista distinto
  //    dentro de 2026 (p.ej. un cambio a media temporada).
  const preventista2026PorCliente = new Map(); // id_cliente -> { preventista, mesAno, nombreCliente, idDistribuidor }
  snapshot.forEach(doc => {
    const d = doc.data();
    if (!d.id_cliente || !d.mes_ano) return;
    if (!d.mes_ano.startsWith('2026')) return;
    if (!d.preventista || !String(d.preventista).trim()) return;
    const actual = preventista2026PorCliente.get(d.id_cliente);
    if (!actual || d.mes_ano > actual.mesAno) {
      preventista2026PorCliente.set(d.id_cliente, {
        preventista: d.preventista,
        mesAno: d.mes_ano,
        nombreCliente: d.nombre_cliente,
        idDistribuidor: d.id_distribuidor
      });
    }
  });
  console.log(`Clientes con preventista conocido en 2026: ${preventista2026PorCliente.size}`);

  // 2. Movimientos de 2025 con preventista vacío que SÍ tienen a dónde copiar.
  const aActualizar = [];
  const clientesSinDatoEn2026 = new Map(); // id_cliente -> nombre_cliente (solo para el informe)
  snapshot.forEach(doc => {
    const d = doc.data();
    if (!d.id_cliente || !d.mes_ano) return;
    if (!d.mes_ano.startsWith('2025')) return;
    if (d.preventista && String(d.preventista).trim()) return; // ya tiene preventista, no se toca
    const origen = preventista2026PorCliente.get(d.id_cliente);
    if (!origen) {
      clientesSinDatoEn2026.set(d.id_cliente, d.nombre_cliente);
      return;
    }
    aActualizar.push({ ref: doc.ref, id_cliente: d.id_cliente, nombreCliente: d.nombre_cliente, mesAno: d.mes_ano, nuevoPreventista: origen.preventista });
  });

  // Resumen agrupado por cliente para el informe.
  const resumenPorCliente = new Map(); // id_cliente -> { nombreCliente, nuevoPreventista, nMovimientos }
  aActualizar.forEach(m => {
    const r = resumenPorCliente.get(m.id_cliente) || { nombreCliente: m.nombreCliente, nuevoPreventista: m.nuevoPreventista, nMovimientos: 0 };
    r.nMovimientos++;
    resumenPorCliente.set(m.id_cliente, r);
  });

  console.log('\n--- INFORME ---');
  console.log(`Movimientos de 2025 con preventista vacío y candidato en 2026: ${aActualizar.length} (${resumenPorCliente.size} cliente(s))`);
  [...resumenPorCliente.entries()]
    .sort((a, b) => a[1].nombreCliente.localeCompare(b[1].nombreCliente, 'es'))
    .forEach(([idCliente, r]) => {
      console.log(`  - ${r.nombreCliente}: ${r.nMovimientos} movimiento(s) de 2025 -> preventista "${r.nuevoPreventista}"`);
    });

  if (clientesSinDatoEn2026.size > 0) {
    console.log(`\nClientes de 2025 con preventista vacío pero SIN ningún dato de preventista en 2026 (no se pueden actualizar, quedan igual): ${clientesSinDatoEn2026.size}`);
    [...clientesSinDatoEn2026.entries()]
      .sort((a, b) => (a[1] || '').localeCompare(b[1] || '', 'es'))
      .forEach(([idCliente, nombre]) => console.log(`  - ${nombre || idCliente}`));
  }

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
  console.log(`¡ÉXITO! ${aActualizar.length} movimiento(s) de 2025 actualizados con el preventista de 2026 de cada cliente.`);
  console.log('----------------------------------------------------');
}

main().catch(err => {
  const esCuotaAgotada = err.code === 8 || /RESOURCE_EXHAUSTED/i.test(String(err.message || ''));
  if (esCuotaAgotada) {
    console.error('----------------------------------------------------');
    console.error('Firestore sigue devolviendo "cuota agotada" tras reintentar.');
    console.error('Esto casi seguro es la cuota GRATUITA DIARIA de lecturas de Firestore agotada');
    console.error('(revisa en la consola de Firebase: Firestore Database > Uso).');
    console.error('Prueba otra vez mañana, o pasa el proyecto al plan Blaze (pago por uso) para no depender del tope diario.');
    console.error('----------------------------------------------------');
  } else {
    console.error('Error:', err);
  }
  process.exit(1);
});
