/*
 * firebaseApi/tarifaMarcas.js
 * Tarifa de precios por marca — colección "tarifaMarcas" (27/07/2026, a
 * petición de Sergio: "con respecto a los precios de las marcas, aunque
 * puede haber variaciones, podría darte la tarifa y la dejas grabada por
 * marca pero con la opción de poder cambiarlo").
 *
 * Catálogo GLOBAL (como "marcas"/"tipologiasMarca", NO por usuario): un
 * documento por marca con su PVP+IVA de referencia (la columna "Precio
 * Venta Recomendado Hostelería (PVR)" de su tarifario, confirmado con
 * Sergio). Sirve para autorellenar el campo "PVP+IVA" al añadir esa marca a
 * un acuerdo (ver EditorReferencias en PantallaAcuerdosClientes.js) — el
 * valor sigue siendo editable a mano en cada acuerdo concreto (los precios
 * reales varían por acuerdo/distribuidor/negociación), y desde ahí se puede
 * guardar como el nuevo valor por defecto. Mismo patrón borrar+crear que
 * saveTipologiaMarca (nunca updateDoc): solo puede existir un documento vivo
 * por id_marca.
 *
 * Carga inicial: ver seedTarifaMarcas.js (raíz del proyecto) — script de un
 * solo uso que Sergio ejecuta en local para volcar la tarifa PVR de su Excel
 * "PLANTILLA ACUERDOS PARA APORTACIONES VINOS Y LICORES.xlsx" cruzando por
 * nombre contra el catálogo real de marcas (mismo criterio de similitud que
 * matching.js).
 */

import { collection, getDocs, query, where, addDoc, writeBatch } from "firebase/firestore";
import { db } from './comun';

const COLECCION = "tarifaMarcas";

// Toda la tarifa (todas las marcas que ya tienen un precio guardado).
export const getTarifaMarcas = async () => {
  const col = collection(db, COLECCION);
  const snapshot = await getDocs(col);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
};

// Guarda (crea o sustituye) el PVP+IVA de referencia de una marca.
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
