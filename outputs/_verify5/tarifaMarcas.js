import { collection, getDocs, query, where, addDoc, writeBatch } from "firebase/firestore";
import { db } from './comun';

const COLECCION = "tarifaMarcas";

export const getTarifaMarcas = async () => {
  const col = collection(db, COLECCION);
  const snapshot = await getDocs(col);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const guardarTarifaMarca = async (idMarca, nombreMarca, pvpIva) => {
  const col = collection(db, COLECCION);
  const q = query(col, where("id_marca", "==", idMarca));
  const snapshot = await getDocs(q);
  if (snapshot.docs.length > 0) {
    const batch = writeBatch(db);
    snapshot.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  await addDoc(col, {
    id_marca: idMarca,
    nombre_marca: nombreMarca,
    pvp_iva: Number(pvpIva) || 0,
    actualizado_en: new Date().toISOString(),
  });
  return true;
};
