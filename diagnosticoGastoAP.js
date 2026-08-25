/*
 * diagnosticoGastoAP.js
 * Script de SOLO LECTURA (no borra ni cambia nada) para averiguar por qué
 * "A&P Gastado" sale en 0,00 € para un distribuidor/periodo en el Dashboard
 * de Gestión, cuando el Excel de liquidación sí trae gasto real ese mes.
 *
 * Motivo (a petición de Sergio, 2026-08-25): en el Dashboard de Gestión,
 * T2 2026 (Abr-Jun) para "MIGUEL MERINO DISTRIBUCIONES SL" muestra "A&P
 * Generado" > 0 (viene de Sell-In/Compras) pero "A&P Gastado" = 0,00 €
 * (viene de Sell-Out — ver calculosAP.js: gastoTotal = valor de Regaladas +
 * Muestras + Acuerdo + Aportación manual). El Excel de Junio SÍ tiene
 * columnas "Total S/C" (regaladas) y "Total acuerdo" con importes reales, así
 * que el 0,00 € del dashboard tiene que venir de uno de estos tres motivos,
 * y este script comprueba los tres a la vez:
 *
 *   1. Los movimientos de ese mes nunca llegaron a Firestore (p.ej. al
 *      reimportar el Excel hasta julio, ese mes concreto se dejó marcado
 *      como "Omitir" en vez de "Sobrescribir").
 *   2. Los movimientos SÍ están, pero bajo un distribuidor DUPLICADO — un
 *      "MIGUEL MERINO..." con el nombre escrito ligeramente distinto (mismo
 *      tipo de bug que "DIEGO CANALS" / "DISTRIBUCIONES DIEGO CANALS SL")
 *      — así que no aparecen al filtrar por el distribuidor correcto.
 *   3. Los movimientos están y bajo el distribuidor correcto, pero marcados
 *      `eliminado: true` (papelera) — por diseño, ninguna pantalla los
 *      cuenta salvo la propia Papelera.
 *
 * Uso:
 *   node diagnosticoGastoAP.js
 *   node diagnosticoGastoAP.js "MERINO" 2026-01,2026-02,...,2026-07
 *   node diagnosticoGastoAP.js "MERINO" 2026-04,2026-05,2026-06,2026-07 correo@x.com
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

// Mismas fórmulas que src/calculosAP.js, reproducidas aquí porque este
// script corre en Node fuera de la app (no puede importar un módulo ES de
// React directamente) — si alguna vez cambia calculosAP.js, actualizar esto
// también para que el diagnóstico siga siendo fiel a lo que ve el dashboard.
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

async function main() {
  const args = process.argv.slice(2);
  const nombreBuscado = args[0] || 'MERINO';
  const meses = (args[1] || '2026-04,2026-05,2026-06,2026-07').split(',').map(m => m.trim());
  const email = args.find(a => a.includes('@')) || 'sergio@unesdi.com';

  console.log('DIAGNÓSTICO A&P GASTADO — SOLO LECTURA, no cambia nada.');
  console.log(`Buscando distribuidores cuyo nombre contenga: "${nombreBuscado}"`);
  console.log(`Meses a revisar: ${meses.join(', ')}`);
  console.log(`Usuario: ${email}\n`);

  const userRecord = await admin.auth().getUserByEmail(email);
  const idUsuario = userRecord.uid;

  // --- 1. Todos los distribuidores del usuario cuyo nombre contenga el término buscado ---
  const distriSnap = await db.collection('distribuidores').where('id_usuario', '==', idUsuario).get();
  const candidatos = distriSnap.docs.filter(d => normalizar(d.data().nombre_distribuidor).includes(normalizar(nombreBuscado)));

  if (candidatos.length === 0) {
    console.log(`No se encontró ningún distribuidor cuyo nombre contenga "${nombreBuscado}". Distribuidores existentes:`);
    distriSnap.docs.forEach(d => console.log(`  - "${d.data().nombre_distribuidor}" (id: ${d.id})`));
    return;
  }

  console.log(`Distribuidor(es) encontrado(s) con ese nombre (${candidatos.length}) — si hay más de uno, ESO YA ES SOSPECHOSO (posible duplicado):`);
  candidatos.forEach(d => console.log(`  - "${d.data().nombre_distribuidor}" (id: ${d.id})`));
  console.log('');

  // --- 2. Para cada distribuidor candidato, revisar Sell-In y Sell-Out mes a mes ---
  for (const distriDoc of candidatos) {
    const idDistribuidor = distriDoc.id;
    console.log(`=== "${distriDoc.data().nombre_distribuidor}" (id: ${idDistribuidor}) ===`);

    const [sellInSnap, sellOutSnap] = await Promise.all([
      db.collection('historicoSellIn').where('id_usuario', '==', idUsuario).where('id_distribuidor', '==', idDistribuidor).get(),
      db.collection('historicoSellOut').where('id_usuario', '==', idUsuario).where('id_distribuidor', '==', idDistribuidor).get()
    ]);
    const sellIn = sellInSnap.docs.map(d => d.data());
    const sellOut = sellOutSnap.docs.map(d => d.data());

    for (const mes of meses) {
      const sellInMes = sellIn.filter(m => m.mes_ano === mes);
      const sellOutMesTodos = sellOut.filter(m => m.mes_ano === mes); // incluye eliminados
      const sellOutMesVivos = sellOutMesTodos.filter(m => m.eliminado !== true); // lo que ve el dashboard
      const sellOutMesPapelera = sellOutMesTodos.filter(m => m.eliminado === true);

      const generado = sellInMes.reduce((acc, m) => acc + generadoSellIn(m), 0);
      const gastadoVivo = sellOutMesVivos.reduce((acc, m) => acc + gastoTotal(m), 0);
      const gastadoPapelera = sellOutMesPapelera.reduce((acc, m) => acc + gastoTotal(m), 0);

      console.log(`  ${mes}: Sell-In ${sellInMes.length} mov. (Generado ${fmt(generado)}) | Sell-Out ${sellOutMesVivos.length} mov. vivos (Gastado ${fmt(gastadoVivo)})` +
        (sellOutMesPapelera.length > 0 ? ` | ⚠️ ${sellOutMesPapelera.length} mov. en PAPELERA (${fmt(gastadoPapelera)}, no cuentan en el dashboard)` : '') +
        (sellOutMesTodos.length === 0 && sellInMes.length > 0 ? ' | ⚠️ CERO movimientos de Sell-Out este mes (ni siquiera en papelera) — no se importaron' : ''));
    }
    console.log('');
  }

  console.log('Fin del diagnóstico. Copia y pega toda esta salida en el chat para que se interprete el resultado — no hace falta que la entiendas tú mismo.');
}

main().catch(err => {
  if (err.code === 'auth/user-not-found') {
    console.error(`No existe ningún usuario con el email ${email} en Firebase Authentication.`);
  } else {
    console.error('Error:', err);
  }
  process.exit(1);
});
