/*
 * firebaseApi/sellIn.js
 * Histórico Sell-In (colección "historicoSellIn").
 */

import { collection, query, where, getDocs, doc, writeBatch } from "firebase/firestore";
import { db, conFiltroUsuario, chunkArray, CHUNK_SIZE } from './comun';

// --- 5. ESCRITURA DE HISTÓRICO SELL-IN (por lotes/batch) ---
export const saveMovimientosSellIn = async (idUsuario, idDistribuidor, mesAno, movimientos) => {
  console.log(`firebaseApi: Guardando ${movimientos.length} movimientos de Sell-In (batch)...`);
  const historicoCol = collection(db, "historicoSellIn");

  const documentos = movimientos.map(fila => ({
    id_usuario: idUsuario,
    id_distribuidor: idDistribuidor,
    id_marca: fila.id_marca,
    mes_ano: fila.mes_ano || mesAno,
    nombre_marca: fila.nombre_marca,
    coste_unidad: fila.coste_unidad,
    ap_por_unidad: fila.ap_por_unidad,
    unidades_compradas: fila.unidades_compradas,
    facturacion_euros: fila.facturacion_euros,
    origen: fila.origen || 'manual'
  }));

  for (const grupo of chunkArray(documentos, CHUNK_SIZE)) {
    const batch = writeBatch(db);
    grupo.forEach(docData => batch.set(doc(historicoCol), docData));
    await batch.commit();
  }
  console.log("Guardado de Sell-In completado.");
  return true;
};

// --- 6. LECTURA DE HISTÓRICO SELL-IN (Por Distribuidor) ---
export const getHistoricoSellIn = async (idUsuario, idDistribuidor) => {
  console.log(`firebaseApi: Leyendo Sell-In para ${idDistribuidor}...`);
  const historicoCol = collection(db, "historicoSellIn");
  const q = query(historicoCol,
              where("id_usuario", "==", idUsuario),
              where("id_distribuidor", "==", idDistribuidor)
            );
  const snapshot = await getDocs(q);
  const movimientos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  // Papelera (ver sección 22 en auditoria.js): los movimientos con
  // eliminado===true no deben aparecer en ningún cálculo ni pantalla salvo
  // en la propia Papelera. Los documentos antiguos (sin este campo) se
  // conservan con normalidad — solo se excluyen los marcados explícitamente.
  return movimientos.filter(m => m.eliminado !== true);
};

// --- 8. LECTURA DE SELL-IN POR MES (GENERAL - Reportes) ---
export const getSellInByMonth = async (idUsuario, mesAno) => {
  console.log(`firebaseApi: Leyendo Sell-In General para ${mesAno}...`);
  const historicoCol = collection(db, "historicoSellIn");
  const q = query(historicoCol,
              where("id_usuario", "==", idUsuario),
              where("mes_ano", "==", mesAno)
            );
  const snapshot = await getDocs(q);
  const movimientos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  // Papelera (ver sección 22 en auditoria.js): los movimientos con
  // eliminado===true no deben aparecer en ningún cálculo ni pantalla salvo
  // en la propia Papelera. Los documentos antiguos (sin este campo) se
  // conservan con normalidad — solo se excluyen los marcados explícitamente.
  return movimientos.filter(m => m.eliminado !== true);
};

// --- 13. LECTURA DE TODO EL SELL-IN (GENERAL) ---
export const getHistoricoSellInGeneral = async (idUsuario) => {
  console.log(`firebaseApi: Leyendo TODO el Sell-In para ${idUsuario}...`);
  const historicoCol = collection(db, "historicoSellIn");

  const q = conFiltroUsuario(historicoCol, idUsuario);

  const snapshot = await getDocs(q);

  const movimientos = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  // Papelera (ver sección 22 en auditoria.js): excluir eliminados.
  return movimientos.filter(m => m.eliminado !== true);
};
