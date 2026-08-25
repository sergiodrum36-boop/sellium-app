/*
 * firebaseApi/mantenimiento.js
 * Reseteo (borrado suave, recuperable desde Papelera) del histórico
 * completo de un usuario — pantalla Mantenimiento.js.
 */

import { collection, query, where, getDocs, writeBatch } from "firebase/firestore";
import { db, chunkArray, CHUNK_SIZE } from './comun';
import { registrarAuditoria } from './auditoria';

// --- 12. FUNCIÓN DE BORRADO (SUAVE) DE HISTORIAL COMPLETO ---
// CAMBIO (papelera + auditoría, a petición de Sergio): "Borrar TODO el
// historial" (Mantenimiento.js) ya NO borra físicamente los documentos — los
// marca como eliminados (mismo mecanismo que borrar una fila suelta en
// Historico.js/HistoricoSellIn.js, ver auditoria.js) para poder recuperarlos
// desde la Papelera si fue un error. Se registra UNA entrada de auditoría
// por colección (no una por documento, para no inundar el registro en un
// reseteo de cientos de filas).
//
// NOTA: también la reutiliza sellOutClientes.js (resetSellOutClientesTodo),
// por eso se exporta desde este módulo en vez de quedar privada.
export const deleteCollectionForUser = async (collectionName, idUsuario, actor) => {
  const colRef = collection(db, collectionName);
  const q = query(colRef, where("id_usuario", "==", idUsuario));
  const snapshot = await getDocs(q);

  if (snapshot.docs.length === 0) {
    return 0; // No hay documentos que borrar
  }

  const ahora = new Date().toISOString();
  for (const grupo of chunkArray(snapshot.docs, CHUNK_SIZE)) {
    const batch = writeBatch(db);
    grupo.forEach((d) => {
      batch.set(d.ref, { eliminado: true, eliminado_en: ahora, eliminado_por: actor?.uid || null }, { merge: true });
    });
    await batch.commit();
  }

  await registrarAuditoria({
    idUsuario,
    actorUid: actor?.uid,
    actorEmail: actor?.email,
    accion: 'reset_historico',
    coleccion: collectionName,
    idDocumento: null,
    resumen: `Reseteo de mantenimiento: ${snapshot.docs.length} registro(s) movidos a la papelera.`
  });

  return snapshot.docs.length;
};

/**
 * Función principal de reseteo: mueve a la papelera (recuperable) solo
 * datos transaccionales. `actor` = { uid, email } de quien ejecuta el
 * reseteo, para dejarlo registrado en la auditoría.
 */
export const resetUserHistory = async (idUsuario, actor) => {
  const colecciones = [
    "historicoSellIn",
    "historicoSellOut"
  ];

  const resultados = {};

  for (const col of colecciones) {
    const count = await deleteCollectionForUser(col, idUsuario, actor);
    resultados[col] = count;
  }

  return resultados;
};
