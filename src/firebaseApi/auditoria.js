/*
 * firebaseApi/auditoria.js
 * Papelera (borrado suave) + Auditoría — colecciones "auditoria" y las
 * colecciones que soportan papelera (historicoSellIn, historicoSellOut,
 * clientesSellOut, movimientosSellOutClientes...).
 *
 * --- 22. PAPELERA (borrado suave) + AUDITORÍA ---
 * A petición de Sergio (mejora de "profesionalización" de la app, tras la
 * auditoría): los borrados de una fila suelta de Histórico Sell-In/Sell-Out
 * (Historico.js, HistoricoSellIn.js) y el reseteo completo de historial
 * (Mantenimiento.js) ya no borran el documento de Firestore de verdad — lo
 * marcan con `eliminado: true` (+ `eliminado_en`, `eliminado_por`) y lo
 * excluyen de todas las lecturas normales (ver el `.filter(m => m.eliminado
 * !== true)` en los getters de sellIn.js/sellOut.js/etc). Desde la nueva
 * pantalla "Papelera" se puede "Restaurar" (vuelve a `eliminado: false`) o
 * "Eliminar definitivamente" (ahí sí, deleteDoc real, sin vuelta atrás) cada
 * fila.
 *
 * Esto requirió el único `allow update` de todo el proyecto (ver
 * firestore.rules): las reglas siguen bloqueando cualquier cambio de datos
 * de negocio (nunca se puede editar coste_unidad, unidades_compradas...) —
 * el `allow update` está acotado por código a que la escritura SOLO toque
 * los 3 campos de papelera (`eliminado`, `eliminado_en`, `eliminado_por`),
 * nada más. Cualquier corrección real sigue siendo "borrar + recrear" como
 * hasta ahora.
 *
 * Cubre historicoSellIn e historicoSellOut (los borrados que de verdad hace
 * un usuario desde la UI, fila a fila) y el reseteo completo de
 * Mantenimiento.js. Se amplió (2026-07-18) a clientesSellOut y
 * movimientosSellOutClientes para el borrado (por distribuidor o de todo el
 * módulo) de Sell-Out por Cliente Final — ver resetSellOutClientesPor
 * Distribuidor / resetSellOutClientesTodo (sellOutClientes.js) y
 * DashboardSellOutClientes.js / Mantenimiento.js. No cubre las colecciones
 * donde "borrar" es un paso interno de una operación más amplia (reimportar
 * un Excel, fusionar marcas, corregir un año...), que siguen siendo borrado
 * físico normal, sin cambios.
 *
 * Además, cada acción (borrar/restaurar/eliminar definitivo/resetear) deja
 * una entrada en la nueva colección `auditoria` — quién la hizo, cuándo, y
 * un resumen legible — visible desde la nueva pantalla "Auditoría".
 */

import { collection, query, where, getDocs, doc, addDoc, setDoc } from "firebase/firestore";
import { db } from './comun';
import { deleteDocument } from './utilidadesColeccionGenerica';
import {
  invalidarPorPrefijo,
  prefijoMovimientosSellOutClientes,
  prefijoClientesSellOut
} from './cacheLecturas';

/*
 * --- CACHÉ DE LECTURAS: INVALIDACIÓN DESDE LA PAPELERA (ver cacheLecturas.js) ---
 * Restaurar o eliminar definitivamente un documento de
 * `movimientosSellOutClientes` / `clientesSellOut` cambia lo que devuelven
 * las lecturas cacheadas de esas colecciones (las lecturas normales excluyen
 * `eliminado === true`, así que restaurar AÑADE una fila y eliminar
 * definitivamente quita una de la papelera). Con solo el docId no se sabe de
 * qué distribuidor era, así que se invalida ancho: todo el prefijo de ese
 * usuario. Invalidar de más no es un bug — como mucho, una relectura extra.
 *
 * Estas funciones son genéricas y las usan otras colecciones que no tienen
 * nada que ver con esto (historicoSellIn, historicoSellOut...): para
 * cualquier otro `collectionName` esto no hace absolutamente nada y el
 * comportamiento es idéntico al de siempre.
 */
const invalidarCacheSiEsSellOutClientes = (collectionName, idUsuario) => {
  if (!idUsuario) return;
  if (collectionName === 'movimientosSellOutClientes') {
    invalidarPorPrefijo(prefijoMovimientosSellOutClientes(idUsuario));
  } else if (collectionName === 'clientesSellOut') {
    invalidarPorPrefijo(prefijoClientesSellOut(idUsuario));
  }
};

// --- 22a. Registra una entrada de auditoría ---
export const registrarAuditoria = async ({ idUsuario, actorUid, actorEmail, accion, coleccion, idDocumento, resumen }) => {
  const col = collection(db, "auditoria");
  await addDoc(col, {
    id_usuario: idUsuario,
    actor_uid: actorUid || null,
    actor_email: actorEmail || null,
    accion, // 'eliminar' | 'restaurar' | 'eliminar_definitivo' | 'reset_historico'
    coleccion,
    id_documento: idDocumento || null,
    resumen: resumen || '',
    fecha: new Date().toISOString()
  });
};

// --- 22b. Mueve un documento a la papelera (borrado suave) + audita ---
export const moverAPapelera = async (collectionName, docId, { idUsuario, actorUid, actorEmail, resumen }) => {
  const ref = doc(db, collectionName, docId);
  await setDoc(ref, {
    eliminado: true,
    eliminado_en: new Date().toISOString(),
    eliminado_por: actorUid || null
  }, { merge: true });
  await registrarAuditoria({ idUsuario, actorUid, actorEmail, accion: 'eliminar', coleccion: collectionName, idDocumento: docId, resumen });
  return true;
};

// --- 22c. Restaura un documento desde la papelera + audita ---
export const restaurarDePapelera = async (collectionName, docId, { idUsuario, actorUid, actorEmail, resumen }) => {
  const ref = doc(db, collectionName, docId);
  await setDoc(ref, {
    eliminado: false,
    eliminado_en: null,
    eliminado_por: null
  }, { merge: true });
  invalidarCacheSiEsSellOutClientes(collectionName, idUsuario);
  await registrarAuditoria({ idUsuario, actorUid, actorEmail, accion: 'restaurar', coleccion: collectionName, idDocumento: docId, resumen });
  return true;
};

// --- 22d. Elimina definitivamente (borrado físico real, sin vuelta atrás)
// un documento que ya estaba en la papelera + audita ---
export const eliminarDefinitivamente = async (collectionName, docId, { idUsuario, actorUid, actorEmail, resumen }) => {
  await deleteDocument(collectionName, docId);
  invalidarCacheSiEsSellOutClientes(collectionName, idUsuario);
  await registrarAuditoria({ idUsuario, actorUid, actorEmail, accion: 'eliminar_definitivo', coleccion: collectionName, idDocumento: docId, resumen });
  return true;
};

// --- 22e. Lee todos los documentos en la papelera (eliminado === true) de
// una colección, para un usuario. Se trae todo el histórico del usuario
// (mismo patrón que los getters "Generales") y se filtra en memoria — evita
// tener que crear un índice compuesto en Firestore solo para esta pantalla,
// que no es de uso frecuente. ---
export const getPapelera = async (idUsuario, collectionName) => {
  const col = collection(db, collectionName);
  const q = query(col, where("id_usuario", "==", idUsuario));
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(d => d.eliminado === true);
};

// --- 22f. Lee el registro de auditoría de un usuario, más reciente primero ---
export const getAuditoria = async (idUsuario) => {
  const col = collection(db, "auditoria");
  const q = query(col, where("id_usuario", "==", idUsuario));
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
};
