/*
 * firebaseApi/catalogosAgenda.js
 * Catálogos "Medio" y "Objetivo" de una visita en la Agenda Comercial
 * (26/07/2026, ver PantallaAgendaComercial.js) — colección "catalogosAgenda"
 * con un campo `tipo` ('medio' | 'objetivo') para no duplicar un módulo
 * casi idéntico por cada lista. Mismo patrón privado-por-usuario que el
 * resto de maestros (ver firestore.rules), CON edición in-place (a
 * diferencia de la mayoría de la app, pero igual que criteriosComercial):
 * aquí es segura sin condiciones porque estos catálogos guardan su NOMBRE
 * tal cual en cada visita (nunca una referencia por id), así que renombrar
 * o borrar una opción nunca deja huérfana a una visita ya creada.
 */

import { collection, getDocs, doc, addDoc, updateDoc, writeBatch } from "firebase/firestore";
import { db, conFiltroUsuario } from './comun';

// Las listas del CRM de referencia que Sergio enseñó ("Wolf CRM") — punto de
// partida editable, no un límite: se pueden añadir/renombrar/borrar opciones
// desde la propia Agenda Comercial (Sergio: "opcion editable o de agregar
// nuevas o borrar").
export const MEDIOS_POR_DEFECTO = [
  'Teléfono',
  'Visita Delegado',
  'Visita Delegado + Comercial',
  'Email',
  'Trabajo administrativo',
  'Visita Delegado + DR/DG',
  'Videoconferencia',
  'Whatsapp / SMS',
  'Feria',
  'Misión Inversa Export',
  'Misión Directa Export',
];

export const OBJETIVOS_POR_DEFECTO = [
  'Venta',
  'Prospección',
  'Primera Visita',
  'Reunión',
  'Entrega Muestras / PLV',
  'Cata/Maridaje/Presentación',
  'Visita RRPP',
  'Cobrar',
  'Reporte',
  'Brand Ambassador',
  'Formación',
  'Plan Promocional',
  'Stock Distribuidor',
];

export const getCatalogosAgendaPorUsuario = async (idUsuario) => {
  const col = collection(db, "catalogosAgenda");
  const q = conFiltroUsuario(col, idUsuario);
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const saveNuevoCatalogoAgenda = async (idUsuario, tipo, nombre, orden) => {
  const col = collection(db, "catalogosAgenda");
  const docRef = await addDoc(col, { id_usuario: idUsuario, tipo, nombre, orden });
  return docRef.id;
};

// Edición IN-PLACE (renombrar una opción sin cambiar su posición en las
// visitas que ya la usan como texto plano) — ver el porqué en firestore.rules
// (esSoloCamposEditablesCatalogoAgenda).
export const actualizarCatalogoAgenda = async (docId, cambios) => {
  const ref = doc(db, "catalogosAgenda", docId);
  await updateDoc(ref, cambios);
  return true;
};

// Alta en bloque de las listas por defecto — botón "Cargar valores por
// defecto" en Agenda Comercial, pensado para el primer uso (mismo patrón que
// seedCriteriosComercialPorDefecto en clasificacionComercial.js).
export const seedCatalogosAgendaPorDefecto = async (idUsuario) => {
  const col = collection(db, "catalogosAgenda");
  const batch = writeBatch(db);
  MEDIOS_POR_DEFECTO.forEach((nombre, i) => {
    batch.set(doc(col), { id_usuario: idUsuario, tipo: 'medio', nombre, orden: i });
  });
  OBJETIVOS_POR_DEFECTO.forEach((nombre, i) => {
    batch.set(doc(col), { id_usuario: idUsuario, tipo: 'objetivo', nombre, orden: i });
  });
  await batch.commit();
  return true;
};
