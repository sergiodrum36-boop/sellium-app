/*
 * firebaseApi/sellOut.js
 * Histórico Sell-Out (colección "historicoSellOut").
 */

import { collection, query, where, getDocs, doc, writeBatch } from "firebase/firestore";
import { db, conFiltroUsuario, chunkArray, CHUNK_SIZE } from './comun';

// --- 4. ESCRITURA DE HISTÓRICO SELL-OUT (por lotes/batch) ---
export const saveMovimientosSellOut = async (idUsuario, idDistribuidor, mesAno, movimientos) => {
  console.log(`firebaseApi: Guardando ${movimientos.length} movimientos de Sell-Out (batch)...`);
  const historicoCol = collection(db, "historicoSellOut");

  const documentos = movimientos.map(fila => ({
    id_usuario: idUsuario,
    id_distribuidor: idDistribuidor,
    id_marca: fila.id_marca,
    // Permite override por fila (útil para importaciones multi-mes); si no, usa el mesAno general
    mes_ano: fila.mes_ano || mesAno,
    nombre_marca: fila.nombre_marca,
    coste_unidad: fila.coste_unidad,
    ap_por_unidad: fila.ap_por_unidad,
    ventas_uds: fila.ventas_uds,
    muestras_uds: fila.muestras_uds,
    regaladas_uds: fila.regaladas_uds,
    aportacion_euros: fila.aportacion_euros,
    ventas_euros: fila.ventas_euros,
    // --- Valores en € guardados de forma explícita (no recalculados) ---
    valor_regaladas_euros: fila.valor_regaladas_euros ?? (fila.regaladas_uds || 0) * (fila.coste_unidad || 0),
    valor_muestras_euros: fila.valor_muestras_euros ?? (fila.muestras_uds || 0) * (fila.coste_unidad || 0),
    // --- Nueva categoría: botellas a precio de Acuerdo especial ---
    unidades_acuerdo: fila.unidades_acuerdo || 0,
    precio_acuerdo_unidad: fila.precio_acuerdo_unidad || 0,
    valor_acuerdo_euros: fila.valor_acuerdo_euros || 0,
    // --- Trazabilidad de origen (para saber si vino de import o manual) ---
    origen: fila.origen || 'manual'
  }));

  for (const grupo of chunkArray(documentos, CHUNK_SIZE)) {
    const batch = writeBatch(db);
    grupo.forEach(docData => batch.set(doc(historicoCol), docData));
    await batch.commit();
  }
  console.log("Guardado de Sell-Out completado.");
  return true;
};

// --- 7. LECTURA DE HISTÓRICO SELL-OUT (Por Distribuidor) ---
export const getHistoricoSellOut = async (idUsuario, idDistribuidor) => {
  console.log(`firebaseApi: Leyendo Sell-Out para ${idDistribuidor}...`);
  const historicoCol = collection(db, "historicoSellOut");
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

// --- 9. LECTURA DE SELL-OUT POR MES (GENERAL - Reportes) ---
export const getSellOutByMonth = async (idUsuario, mesAno) => {
  console.log(`firebaseApi: Leyendo Sell-Out General para ${mesAno}...`);
  const historicoCol = collection(db, "historicoSellOut");
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

// --- 14. LECTURA DE TODO EL SELL-OUT (GENERAL) ---
export const getHistoricoSellOutGeneral = async (idUsuario) => {
  console.log(`firebaseApi: Leyendo TODO el Sell-Out para ${idUsuario}...`);
  const historicoCol = collection(db, "historicoSellOut");

  const q = conFiltroUsuario(historicoCol, idUsuario);

  const snapshot = await getDocs(q);

  const movimientos = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  // Papelera (ver sección 22 en auditoria.js): excluir eliminados.
  return movimientos.filter(m => m.eliminado !== true);
};
