/*
 * firebaseApi/actividadesAgenda.js
 * Catálogo GLOBAL de "otras actividades" de la Agenda Comercial — cosas que
 * ocupan un día del calendario pero no tienen nada que ver con visitar a un
 * distribuidor (Trabajo administrativo, Vacaciones, Asuntos propios, Reunión
 * comercial, Prospección — 26/07/2026, a petición de Sergio).
 *
 * A diferencia de catalogosAgenda.js (Medio/Objetivo, privado por usuario y
 * editable por su propio dueño), esta lista es GLOBAL — todos los usuarios
 * leen la misma, igual que la colección "marcas" — y Sergio pidió
 * explícitamente que SOLO él pueda editarla ("si mañana lo usa más gente
 * ellos no podrán manipularlo"). Por eso no lleva id_usuario y las reglas de
 * Firestore (ver actividadesAgenda en firestore.rules) exigen esManager()
 * para crear/borrar/renombrar — la pantalla que la edita (Configuración,
 * ver PantallaConfiguracion.js) también se oculta en el menú si el usuario
 * no es manager, pero la autorización real es siempre la regla del
 * servidor, no ese ocultamiento.
 *
 * Igual que catalogosAgenda, el nombre se guarda como texto plano en cada
 * visita (visita.actividad), nunca como referencia por id, así que
 * renombrar/borrar una opción nunca deja huérfana una visita ya creada.
 */

import { collection, getDocs, doc, addDoc, updateDoc, writeBatch } from "firebase/firestore";
import { db } from './comun';

export const ACTIVIDADES_POR_DEFECTO = [
  'Trabajo administrativo',
  'Vacaciones',
  'Asuntos propios',
  'Reunión comercial',
  'Prospección',
];

export const getActividadesAgenda = async () => {
  const col = collection(db, "actividadesAgenda");
  const snapshot = await getDocs(col);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const saveNuevaActividadAgenda = async (nombre, orden) => {
  const col = collection(db, "actividadesAgenda");
  const docRef = await addDoc(col, { nombre, orden });
  return docRef.id;
};

// Edición IN-PLACE (renombrar sin cambiar su posición ni las visitas que ya
// la usan como texto plano) — ver esSoloCamposEditablesActividadAgenda en
// firestore.rules.
export const actualizarActividadAgenda = async (docId, cambios) => {
  const ref = doc(db, "actividadesAgenda", docId);
  await updateDoc(ref, cambios);
  return true;
};

// Alta en bloque de las 5 actividades por defecto — botón "Cargar valores
// por defecto" en Configuración, mismo patrón que
// seedCatalogosAgendaPorDefecto/seedCriteriosComercialPorDefecto.
export const seedActividadesAgendaPorDefecto = async () => {
  const col = collection(db, "actividadesAgenda");
  const batch = writeBatch(db);
  ACTIVIDADES_POR_DEFECTO.forEach((nombre, i) => {
    batch.set(doc(col), { nombre, orden: i });
  });
  await batch.commit();
  return true;
};
