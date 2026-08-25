/*
 * firebaseApi/distribuidores.js
 * Distribuidores (colección "distribuidores").
 */

import { collection, getDocs, addDoc } from "firebase/firestore";
import { db, conFiltroUsuario } from './comun';

// --- 2. LECTURA DE DISTRIBUIDORES (Privado) ---
export const getDistribuidoresPorUsuario = async (idUsuario) => {
  console.log(`firebaseApi: Obteniendo distribuidores para el usuario ${idUsuario}...`);
  const distriCol = collection(db, "distribuidores");
  const q = conFiltroUsuario(distriCol, idUsuario);
  const snapshot = await getDocs(q);
  const listaDistribuidores = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  return listaDistribuidores;
};

// --- 3. ESCRITURA DE NUEVO DISTRIBUIDOR (Privado) ---
export const saveNuevoDistribuidor = async (data) => {
  console.log("firebaseApi: Guardando nuevo distribuidor...");
  const distriCol = collection(db, "distribuidores");
  const docRef = await addDoc(distriCol, data);
  console.log("Distribuidor guardado con ID: ", docRef.id);
  return docRef.id;
};
