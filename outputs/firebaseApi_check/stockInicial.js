/*
 * firebaseApi/stockInicial.js
 * Stock Inicial declarado — colección "stockInicialDistribuidor".
 *
 * --- 20. STOCK INICIAL DECLARADO (columna "Stock Inicial" de la hoja VENTAS
 * STOCK del Excel de liquidación) ---
 * El Excel declara, para cada marca/referencia, cuántas unidades tenía YA el
 * distribuidor en su almacén al empezar el año de ese Excel (antes de
 * cualquier compra registrada en la app). Ese valor NO se suma como compra
 * en Compras.js, Histórico Sell-In ni en Control A&P (ControlAP.js, la vista
 * REAL sobre Sell-Out); solo se usa como punto de partida al calcular el
 * Stock actualizado en StockDistribuidor.js, para que "Stock Final = Stock
 * Inicial + Compras - Salidas" cuadre con la realidad desde el primer año
 * importado.
 * EXCEPCIÓN: en ControlAPVisionComercial.js (la vista "de cara a Compañía"
 * sobre Sell-In) SÍ se suma como si fueran unidades compradas, porque esas
 * botellas ya estaban colocadas en el distribuidor y generan su A&P igual
 * que una compra (a la tasa ACTUAL de A&P de la marca, por aproximación, ya
 * que el Stock Inicial no guarda con qué tasa se generó en su momento). Por
 * eso existe getStockInicialGeneral (20d), que trae el dato de TODOS los
 * distribuidores del usuario a la vez, igual que getHistoricoSellInGeneral.
 */

import { collection, query, where, getDocs, doc, writeBatch } from "firebase/firestore";
import { db, conFiltroUsuario, chunkArray, CHUNK_SIZE } from './comun';

// --- 20a. GUARDAR EL STOCK INICIAL DECLARADO (por lotes/batch) ---
export const saveStockInicialImportado = async (idUsuario, idDistribuidor, filas) => {
  const col = collection(db, "stockInicialDistribuidor");
  const documentos = filas.map(fila => ({
    id_usuario: idUsuario,
    id_distribuidor: idDistribuidor,
    id_marca: fila.id_marca,
    nombre_marca: fila.nombre_marca,
    anio: fila.anio,
    stock_inicial: fila.stock_inicial
  }));
  for (const grupo of chunkArray(documentos, CHUNK_SIZE)) {
    const batch = writeBatch(db);
    grupo.forEach(docData => batch.set(doc(col), docData));
    await batch.commit();
  }
  return true;
};

// --- 20b. LEER TODO EL STOCK INICIAL DECLARADO DE UN DISTRIBUIDOR ---
export const getStockInicialPorDistribuidor = async (idUsuario, idDistribuidor) => {
  const col = collection(db, "stockInicialDistribuidor");
  const q = query(col, where("id_usuario", "==", idUsuario), where("id_distribuidor", "==", idDistribuidor));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// --- 20c. BORRAR EL STOCK INICIAL DECLARADO DE UN DISTRIBUIDOR PARA UN AÑO
// CONCRETO (para no duplicar si se reimporta el Excel de ese mismo año) ---
export const deleteStockInicialPorDistribuidorYAnio = async (idUsuario, idDistribuidor, anio) => {
  const col = collection(db, "stockInicialDistribuidor");
  const q = query(col,
    where("id_usuario", "==", idUsuario),
    where("id_distribuidor", "==", idDistribuidor),
    where("anio", "==", anio)
  );
  const snapshot = await getDocs(q);
  if (snapshot.docs.length === 0) return 0;
  const batch = writeBatch(db);
  snapshot.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  return snapshot.docs.length;
};

// --- 20d. LEER EL STOCK INICIAL DECLARADO DE TODOS LOS DISTRIBUIDORES DEL
// USUARIO A LA VEZ (para ControlAPVisionComercial, que necesita poder sumar
// varios distribuidores o todos, igual que getHistoricoSellInGeneral) ---
export const getStockInicialGeneral = async (idUsuario) => {
  const col = collection(db, "stockInicialDistribuidor");
  const q = conFiltroUsuario(col, idUsuario);
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};
