/*
 * firebaseApi/estructuraComercial.js
 * Estructura Comercial (CRM) — colecciones "zonas" y "comerciales". Primer
 * módulo del nuevo bloque "CRM y Comercial" de la app (a petición de Sergio,
 * 26/07/2026, ver PantallaEstructuraComercial.js y estructuraComercial.js
 * para el detalle/motivo).
 *
 * Mismo patrón que distribuidores.js: maestro privado por usuario (ver
 * firestore.rules), sin `allow update` — corregir un dato ya guardado es
 * "borrar + crear uno nuevo" (deleteDocument, ya genérico en
 * utilidadesColeccionGenerica.js), igual que el resto de maestros de la app
 * (distribuidores, marcas).
 *
 * Forma de los documentos:
 *  - "zonas": { id_usuario, nombre_zona, descripcion }
 *  - "comerciales": { id_usuario, nombre, email, telefono, rol
 *    ('preventista'|'supervisor'|'gerente'), id_zona (o '' si no tiene),
 *    id_supervisor (o '' si no tiene, es la cabeza de su jerarquía), activo
 *    (bool) }
 */

import { collection, getDocs, addDoc } from "firebase/firestore";
import { db, conFiltroUsuario } from './comun';

// --- ZONAS ---
export const getZonasPorUsuario = async (idUsuario) => {
  const col = collection(db, "zonas");
  const q = conFiltroUsuario(col, idUsuario);
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const saveNuevaZona = async (data) => {
  console.log("firebaseApi: Guardando nueva zona...");
  const col = collection(db, "zonas");
  const docRef = await addDoc(col, data);
  return docRef.id;
};

// --- COMERCIALES / PREVENTISTAS ---
export const getComercialesPorUsuario = async (idUsuario) => {
  const col = collection(db, "comerciales");
  const q = conFiltroUsuario(col, idUsuario);
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const saveNuevoComercial = async (data) => {
  console.log("firebaseApi: Guardando nuevo comercial...");
  const col = collection(db, "comerciales");
  const docRef = await addDoc(col, data);
  return docRef.id;
};
