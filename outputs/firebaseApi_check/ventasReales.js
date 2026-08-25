/*
 * firebaseApi/ventasReales.js
 * Ventas Reales (import mensual desde QlikSense) — colección "ventasReales".
 *
 * --- 18. VENTAS REALES (import mensual desde QlikSense) ---
 * Datos reales de venta por Distribuidor/Familia/Subfamilia (=Marca). Se
 * consideran la fuente de verdad frente a los cálculos de Sell-In/Sell-Out
 * cuando haya diferencias (precios actualizados, promociones o descuentos
 * en compra no reflejados en esas pantallas).
 */

import { collection, query, where, getDocs, doc, writeBatch } from "firebase/firestore";
import { db, conFiltroUsuario, chunkArray, CHUNK_SIZE } from './comun';

// --- 18a. ESCRITURA DE VENTAS REALES (por lotes/batch) ---
export const saveVentasReales = async (idUsuario, mesAno, filas) => {
  console.log(`firebaseApi: Guardando ${filas.length} filas de Ventas Reales (batch)...`);
  const col = collection(db, "ventasReales");

  const documentos = filas.map(fila => ({
    id_usuario: idUsuario,
    id_distribuidor: fila.id_distribuidor,
    nombre_distribuidor: fila.nombre_distribuidor,
    id_marca: fila.id_marca,
    nombre_marca: fila.nombre_marca,
    familia: fila.familia || '',
    mes_ano: mesAno,
    uds: fila.uds || 0,
    cajas: fila.cajas || 0,
    importe_euros: fila.importe || 0,
    origen: 'import_qliksense'
  }));

  for (const grupo of chunkArray(documentos, CHUNK_SIZE)) {
    const batch = writeBatch(db);
    grupo.forEach(docData => batch.set(doc(col), docData));
    await batch.commit();
  }
  console.log("Guardado de Ventas Reales completado.");
  return true;
};

// --- 18b. LECTURA DE TODAS LAS VENTAS REALES (GENERAL - Dashboard) ---
export const getVentasRealesGeneral = async (idUsuario) => {
  console.log(`firebaseApi: Leyendo TODO Ventas Reales para ${idUsuario}...`);
  const col = collection(db, "ventasReales");
  const q = conFiltroUsuario(col, idUsuario);
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// --- 18c. LECTURA DE VENTAS REALES DE UN MES CONCRETO (para detectar conflictos al importar) ---
export const getVentasRealesByMonth = async (idUsuario, mesAno) => {
  const col = collection(db, "ventasReales");
  const q = query(col, where("id_usuario", "==", idUsuario), where("mes_ano", "==", mesAno));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// --- 18d. BORRAR VENTAS REALES DE UN DISTRIBUIDOR EN UN MES CONCRETO (para "sobrescribir" al reimportar) ---
export const deleteVentasRealesPorDistribuidorYMes = async (idUsuario, idDistribuidor, mesAno) => {
  const col = collection(db, "ventasReales");
  const q = query(col,
    where("id_usuario", "==", idUsuario),
    where("id_distribuidor", "==", idDistribuidor),
    where("mes_ano", "==", mesAno)
  );
  const snapshot = await getDocs(q);
  if (snapshot.docs.length === 0) return 0;

  for (const grupo of chunkArray(snapshot.docs, CHUNK_SIZE)) {
    const batch = writeBatch(db);
    grupo.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
  return snapshot.docs.length;
};
