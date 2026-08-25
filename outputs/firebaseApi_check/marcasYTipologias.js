/*
 * firebaseApi/marcasYTipologias.js
 * Marcas globales (colección "marcas") + Tipología de Referencias
 * (colección "tipologiasMarca").
 */

import { collection, getDocs, addDoc, query, where, writeBatch } from "firebase/firestore";
import { db } from './comun';

// --- 1. LECTURA DE MARCAS (Global) ---
export const getMarcasGlobales = async () => {
  console.log("firebaseApi: Obteniendo marcas globales...");
  const marcasCol = collection(db, "marcas");
  const snapshot = await getDocs(marcasCol);
  const listaMarcas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  return listaMarcas;
};

// --- 10. ESCRITURA DE NUEVA MARCA (Global) ---
export const saveNuevaMarca = async (data) => {
  console.log("firebaseApi: Guardando nueva marca global...");
  const marcasCol = collection(db, "marcas");
  const docRef = await addDoc(marcasCol, data);
  console.log("Marca guardada con ID: ", docRef.id);
  return docRef.id;
};

// --- 21. TIPOLOGÍA DE REFERENCIAS (Vino / Licor) ---
// Concepto nuevo para el Dashboard de Ventas Sell-In: clasifica cada
// marca/referencia como "Vino" o "Licor" para poder medir qué peso tiene
// cada tipología sobre el total vendido (KPI de peso % por tipología).
//
// Vive en su PROPIA colección, "tipologiasMarca" — NUNCA como campo dentro
// de "marcas" — a propósito: "marcas" es una colección GLOBAL compartida
// por todo el histórico (Sell-In, Sell-Out, Ventas Reales, de todos los
// usuarios), y las reglas de Firestore no permiten "update". Si la
// tipología viviera dentro de "marcas", "corregirla" en una marca ya
// existente obligaría a recrear su documento con un id nuevo y reasignar
// TODOS los movimientos que la referencian (en 3 colecciones distintas, de
// cada usuario) — justo el mismo problema que ya resuelve
// reasignarMovimientosDeMarca para las fusiones, pero mucho más caro de
// repetir aquí solo para añadir una etiqueta.
//
// Al vivir aparte, "asignar o corregir" la tipología de una marca es tan
// simple como borrar (si existía) su asignación anterior y crear una
// nueva — nunca toca "marcas" ni ningún histórico de movimientos. Se lee
// entera de una vez y se cruza en memoria por id_marca, con el mismo patrón
// que ya usa el Dashboard de Ventas Reales para pintar Familia/Distribuidor
// a partir de datos sueltos.

// --- 21a. LEER TODAS LAS ASIGNACIONES DE TIPOLOGÍA (Global) ---
export const getTipologiasMarca = async () => {
  console.log("firebaseApi: Obteniendo tipologías de marca...");
  const col = collection(db, "tipologiasMarca");
  const snapshot = await getDocs(col);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// --- 21b. ASIGNAR (o CORREGIR) LA TIPOLOGÍA DE UNA MARCA ---
// Si esa marca ya tenía una asignación previa se borra primero (nunca debe
// quedar más de una asignación viva por marca) y se crea la nueva — mismo
// patrón "borrar + crear" que el resto de correcciones de esta app, nunca
// updateDoc.
export const saveTipologiaMarca = async (idMarca, tipologia) => {
  const col = collection(db, "tipologiasMarca");
  const q = query(col, where("id_marca", "==", idMarca));
  const snapshot = await getDocs(q);
  if (snapshot.docs.length > 0) {
    const batch = writeBatch(db);
    snapshot.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
  await addDoc(col, { id_marca: idMarca, tipologia });
  return true;
};
