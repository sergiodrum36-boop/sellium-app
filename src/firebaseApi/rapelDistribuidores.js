/*
 * firebaseApi/rapelDistribuidores.js
 * Rapel anual de distribuidores — colección "configuracionRapelDistribuidores"
 * (26/07/2026, primera pieza de "Acuerdos con clientes/distribuidores", ver
 * cabecera de src/rapelDistribuidores.js para el diseño completo).
 *
 * Un documento por (id_usuario, anio, id_distribuidor):
 *  - `id_distribuidor: null` = la plantilla GLOBAL de ese año: tramos de
 *    facturación (escalado) + catálogo de bonificaciones (nombre + %,
 *    Sergio puede añadir/quitar las que quiera, ej. "Datos detallados").
 *  - `id_distribuidor: <id>` = la EXCEPCIÓN de un distribuidor concreto ese
 *    mismo año: `tramos_facturacion` (si está presente, sustituye entera a
 *    la tabla global SOLO para él) y `bonificaciones_activas` (qué nombres
 *    del catálogo global le aplican a él — el % de cada una se sigue
 *    leyendo del catálogo global, así que si Sergio cambia el % de una
 *    bonificación más adelante, se actualiza para todos los que la tengan
 *    activa sin tener que volver a marcarla).
 *
 * Igual que presupuestos.js: NO hay `allow update` en firestore.rules —
 * corregir una configuración ya guardada es "borrar el documento existente
 * de ese año+ámbito + crear uno nuevo", nunca updateDoc.
 */

import { collection, query, where, getDocs, doc, addDoc, deleteDoc } from "firebase/firestore";
import { db } from './comun';

const COLECCION = "configuracionRapelDistribuidores";

// Todos los documentos (plantilla global + excepciones por distribuidor) de
// un usuario para un año concreto — la pantalla separa cuál es la global
// (id_distribuidor null) de las excepciones (id_distribuidor con valor) en
// vez de hacer dos queries distintas, para no depender de un filtro de
// desigualdad en Firestore.
export const getConfiguracionesRapelPorAnio = async (idUsuario, anio) => {
  const col = collection(db, COLECCION);
  const q = query(col, where("id_usuario", "==", idUsuario), where("anio", "==", anio));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
};

// Busca la plantilla global de un año concreto (o null si Sergio aún no la
// ha guardado ese año).
export const getConfiguracionRapelGlobal = async (idUsuario, anio) => {
  const todas = await getConfiguracionesRapelPorAnio(idUsuario, anio);
  return todas.find(c => !c.id_distribuidor) || null;
};

// Busca la excepción de un distribuidor concreto en un año (o null si ese
// distribuidor usa la plantilla global sin ninguna personalización).
export const getConfiguracionRapelDistribuidor = async (idUsuario, anio, idDistribuidor) => {
  const todas = await getConfiguracionesRapelPorAnio(idUsuario, anio);
  return todas.find(c => c.id_distribuidor === idDistribuidor) || null;
};

// Guarda (crea o sustituye) la plantilla GLOBAL de un año: tramos de
// facturación + catálogo de bonificaciones. "Sustituye" = borra el
// documento anterior de esa combinación (si existía) y crea uno nuevo.
// `datos` = { tramos_facturacion: [{pct_min, pct_max, pct_rapel}],
// bonificaciones: [{nombre, pct}] }.
export const guardarConfiguracionRapelGlobal = async (idUsuario, anio, datos, actor) => {
  const existente = await getConfiguracionRapelGlobal(idUsuario, anio);
  if (existente) {
    await deleteDoc(doc(db, COLECCION, existente.id));
  }
  const col = collection(db, COLECCION);
  const nuevoDoc = await addDoc(col, {
    id_usuario: idUsuario,
    anio,
    id_distribuidor: null,
    tramos_facturacion: datos?.tramos_facturacion || [],
    bonificaciones: datos?.bonificaciones || [],
    actualizado_en: new Date().toISOString(),
    actor_uid: actor?.uid || null,
    actor_email: actor?.email || null
  });
  return nuevoDoc.id;
};

// Guarda (crea o sustituye) la excepción de UN distribuidor en un año.
// `datos` = { tramos_facturacion: [...] | null (null = usar la tabla
// global, sin personalizar), bonificaciones_activas: ['nombre', ...] }.
export const guardarConfiguracionRapelDistribuidor = async (idUsuario, anio, idDistribuidor, datos, actor) => {
  const existente = await getConfiguracionRapelDistribuidor(idUsuario, anio, idDistribuidor);
  if (existente) {
    await deleteDoc(doc(db, COLECCION, existente.id));
  }
  const col = collection(db, COLECCION);
  const nuevoDoc = await addDoc(col, {
    id_usuario: idUsuario,
    anio,
    id_distribuidor: idDistribuidor,
    tramos_facturacion: datos?.tramos_facturacion || null,
    bonificaciones_activas: datos?.bonificaciones_activas || [],
    actualizado_en: new Date().toISOString(),
    actor_uid: actor?.uid || null,
    actor_email: actor?.email || null
  });
  return nuevoDoc.id;
};

// Borra la excepción de un distribuidor (vuelve a heredar la plantilla
// global de ese año sin ninguna personalización).
export const borrarConfiguracionRapelDistribuidor = async (idUsuario, anio, idDistribuidor) => {
  const existente = await getConfiguracionRapelDistribuidor(idUsuario, anio, idDistribuidor);
  if (!existente) return false;
  await deleteDoc(doc(db, COLECCION, existente.id));
  return true;
};
