/*
 * firebaseApi/utilidadesColeccionGenerica.js
 * Funciones parametrizadas por `collectionName`, reutilizadas desde varios
 * dominios de negocio (Sell-In, Sell-Out, Sell-Out por Cliente, Stock
 * Inicial...).
 */

import { collection, query, where, getDocs, doc, deleteDoc, writeBatch } from "firebase/firestore";
import { db, chunkArray, CHUNK_SIZE, CHUNK_SIZE_CORRECCION } from './comun';
import { invalidarPorPrefijo, claveMovimientosSellOutClientes } from './cacheLecturas';

// --- 11. FUNCIÓN DE BORRADO GENÉRICA ---
export const deleteDocument = async (collectionName, docId) => {
  console.log(`firebaseApi: Borrando documento ${docId} de ${collectionName}...`);
  const docRef = doc(db, collectionName, docId);
  await deleteDoc(docRef);
  console.log("Documento borrado con éxito.");
  return true;
};

// --- 15. BORRAR MOVIMIENTOS DE UN DISTRIBUIDOR EN UNOS MESES CONCRETOS ---
// Se usa desde el Importador de Excel cuando el usuario elige "sobrescribir"
// un mes que ya tenía datos, para no duplicar.
//
// CACHÉ (ver cacheLecturas.js): este módulo es GENÉRICO — la misma función la
// llaman Sell-In, Sell-Out y Stock Inicial con otros `collectionName`, y esas
// colecciones no se cachean. Por eso la invalidación va dentro de un `if`
// estricto sobre 'movimientosSellOutClientes': para cualquier otro
// collectionName el comportamiento es exactamente el de antes (cero cambios).
// Aquí sí conocemos el distribuidor, así que se invalida la clave EXACTA
// (usuario + distribuidor), no el prefijo ancho del usuario entero.
export const deleteMovimientosPorMeses = async (collectionName, idUsuario, idDistribuidor, mesesAno) => {
  if (!mesesAno || mesesAno.length === 0) return 0;
  const col = collection(db, collectionName);
  const q = query(col,
    where("id_usuario", "==", idUsuario),
    where("id_distribuidor", "==", idDistribuidor)
  );
  const snapshot = await getDocs(q);
  const mesesSet = new Set(mesesAno);
  const aBorrar = snapshot.docs.filter(d => mesesSet.has(d.data().mes_ano));

  if (aBorrar.length === 0) return 0;

  for (const grupo of chunkArray(aBorrar, CHUNK_SIZE)) {
    const batch = writeBatch(db);
    grupo.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }

  // Borrado confirmado: la lista cacheada de este (usuario, distribuidor) tiene
  // movimientos que ya no existen. Solo aplica a la colección cacheada.
  if (collectionName === 'movimientosSellOutClientes') {
    invalidarPorPrefijo(claveMovimientosSellOutClientes(idUsuario, idDistribuidor));
  }

  return aBorrar.length;
};

// --- 17. CORREGIR EL AÑO DE LOS MOVIMIENTOS DE UN DISTRIBUIDOR ---
// Se usa cuando un Excel se importó con el año equivocado (p.ej. una pestaña
// del Excel decía "25" cuando en realidad los datos son de 2026, por reutilizar
// la plantilla del año anterior). Desplaza el mes_ano de "anioErroneo-MM" a
// "anioCorrecto-MM" para todos los movimientos de ese distribuidor, sin tocar
// nada más (marca, unidades, importes...).
// Las reglas de Firestore de este proyecto no permiten "update", así que en
// vez de modificar el documento se crea uno nuevo con el mes_ano corregido
// (copiando el resto de campos tal cual) y se borra el antiguo.
export const corregirAnioMovimientos = async (collectionName, idUsuario, idDistribuidor, anioErroneo, anioCorrecto) => {
  const col = collection(db, collectionName);
  const q = query(col,
    where("id_usuario", "==", idUsuario),
    where("id_distribuidor", "==", idDistribuidor)
  );
  const snapshot = await getDocs(q);
  const prefijoErroneo = `${anioErroneo}-`;
  const aCorregir = snapshot.docs.filter(d => (d.data().mes_ano || '').startsWith(prefijoErroneo));

  if (aCorregir.length === 0) return 0;

  for (const grupo of chunkArray(aCorregir, CHUNK_SIZE_CORRECCION)) {
    const batch = writeBatch(db);
    grupo.forEach(d => {
      const datosOriginales = d.data();
      const mm = (datosOriginales.mes_ano || '').split('-')[1];
      batch.set(doc(col), { ...datosOriginales, mes_ano: `${anioCorrecto}-${mm}` });
      batch.delete(d.ref);
    });
    await batch.commit();
  }
  return aCorregir.length;
};

// --- 16. REASIGNAR MOVIMIENTOS DE UNA MARCA DUPLICADA A LA MARCA PRINCIPAL ---
// Se usa desde la herramienta "Fusionar Marcas": todos los movimientos (Sell-In
// o Sell-Out) de un usuario que apuntaban a idMarcaAntigua pasan a apuntar a
// idMarcaNueva, conservando el resto de datos del movimiento intactos.
// Igual que arriba: como "update" no está permitido, se crea un documento
// nuevo con id_marca/nombre_marca corregidos y se borra el antiguo.
export const reasignarMovimientosDeMarca = async (collectionName, idUsuario, idMarcaAntigua, idMarcaNueva, nombreMarcaNueva) => {
  const col = collection(db, collectionName);
  const q = query(col,
    where("id_usuario", "==", idUsuario),
    where("id_marca", "==", idMarcaAntigua)
  );
  const snapshot = await getDocs(q);
  if (snapshot.docs.length === 0) return 0;

  for (const grupo of chunkArray(snapshot.docs, CHUNK_SIZE_CORRECCION)) {
    const batch = writeBatch(db);
    grupo.forEach(d => {
      const datosOriginales = d.data();
      batch.set(doc(col), { ...datosOriginales, id_marca: idMarcaNueva, nombre_marca: nombreMarcaNueva });
      batch.delete(d.ref);
    });
    await batch.commit();
  }
  return snapshot.docs.length;
};
