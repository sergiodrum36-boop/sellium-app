/*
 * firebaseApi/presupuestos.js
 * Presupuestos (Objetivo Anual + Forecast) — colección "presupuestos".
 *
 * ==========================================================================
 * PRESUPUESTOS (Objetivo Anual + Forecast, Fase 2 profesionalización)
 * ==========================================================================
 * A petición de Sergio, tras la auditoría de la app: un área propia y
 * separada de las pantallas de uso diario, porque el objetivo anual solo se
 * crea/revisa una o dos veces al año (ver PantallaPresupuesto.js).
 *
 * Un documento por (id_usuario, anio, id_distribuidor) — un objetivo
 * concreto por distribuidor y año.
 *
 * CAMBIO (rediseño "por marca", a petición de Sergio): el objetivo ya no se
 * fija repartiendo un total en 12 meses. Ahora, por cada marca, se guarda
 * solo el % de crecimiento deseado respecto al año anterior:
 *   objetivos_facturacion_marca: [{ id_marca, nombre_marca, pct_crecimiento }]
 *   objetivos_ap_marca:          [{ id_marca, nombre_marca, pct_crecimiento }]
 * El año anterior (cajas/importe de Facturación desde `ventasReales`, e
 * importe de A&P desde `historicoSellOut`) NO se guarda en este documento —
 * se recalcula siempre en caliente a partir del histórico real, para que si
 * se corrige un dato antiguo el objetivo/forecast lo reflejen sin tener que
 * re-guardar nada. El objetivo final (cajas/importe) sale de multiplicar
 * ese año anterior por (1 + pct_crecimiento/100). Ver PantallaPresupuesto.js.
 *
 * Igual que el resto de la app, NO hay `allow update` en firestore.rules
 * para esta colección: corregir un objetivo ya guardado es "borrar el
 * documento de ese año+distribuidor y crear uno nuevo" — por eso
 * `guardarPresupuesto` primero busca y borra el documento existente (si lo
 * hay) antes de crear el nuevo, en vez de intentar actualizarlo.
 */

import { collection, query, where, getDocs, doc, addDoc, deleteDoc } from "firebase/firestore";
import { db } from './comun';

// Busca el documento de presupuesto de un año+distribuidor concreto (o
// null si el usuario aún no ha guardado ningún objetivo para esa
// combinación). Se usa tanto para precargar el formulario de "Objetivo
// Anual" como, internamente, por guardarPresupuesto para saber qué borrar.
export const getPresupuesto = async (idUsuario, anio, idDistribuidor) => {
  const col = collection(db, "presupuestos");
  const q = query(
    col,
    where("id_usuario", "==", idUsuario),
    where("anio", "==", anio),
    where("id_distribuidor", "==", idDistribuidor)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  const docSnap = snapshot.docs[0];
  return { id: docSnap.id, ...docSnap.data() };
};

// Todos los objetivos guardados de un usuario para un año concreto (uno por
// distribuidor) — lo usa la pestaña "Forecast" para agregar "Todos sus
// distribuidores" o para saber qué distribuidores ya tienen objetivo.
export const getPresupuestosPorAnio = async (idUsuario, anio) => {
  const col = collection(db, "presupuestos");
  const q = query(col, where("id_usuario", "==", idUsuario), where("anio", "==", anio));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// Guarda (crea o sustituye) el objetivo anual de un distribuidor concreto.
// "Sustituye" = borra el documento anterior de ese mismo año+distribuidor
// (si existía) y crea uno nuevo — nunca updateDoc, ver cabecera de sección.
// `objetivosPorMarca` = { facturacion: [{id_marca, nombre_marca,
// pct_crecimiento}], ap: [{id_marca, nombre_marca, pct_crecimiento}] }
export const guardarPresupuesto = async (idUsuario, anio, idDistribuidor, objetivosPorMarca, actor) => {
  const existente = await getPresupuesto(idUsuario, anio, idDistribuidor);
  if (existente) {
    await deleteDoc(doc(db, "presupuestos", existente.id));
  }
  const col = collection(db, "presupuestos");
  const nuevoDoc = await addDoc(col, {
    id_usuario: idUsuario,
    anio,
    id_distribuidor: idDistribuidor,
    objetivos_facturacion_marca: objetivosPorMarca?.facturacion || [],
    objetivos_ap_marca: objetivosPorMarca?.ap || [],
    actualizado_en: new Date().toISOString(),
    actor_uid: actor?.uid || null,
    actor_email: actor?.email || null
  });
  return nuevoDoc.id;
};

// Borra por completo el objetivo de un año+distribuidor (botón "Borrar
// objetivo" del formulario).
export const deletePresupuesto = async (idUsuario, anio, idDistribuidor) => {
  const existente = await getPresupuesto(idUsuario, anio, idDistribuidor);
  if (!existente) return false;
  await deleteDoc(doc(db, "presupuestos", existente.id));
  return true;
};
