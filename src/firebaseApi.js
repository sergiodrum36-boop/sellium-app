/*
 * firebaseApi.js (Versión 5.2 - COMPLETA Y CORREGIDA)
 * Contiene TODAS las 12 funciones de base de datos
 * para la aplicación completa.
 */

import { db } from './firebaseConfig';
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  writeBatch, // <-- ¡COMA AÑADIDA ARRIBA Y LISTADO COMPLETO!
  doc,
  deleteDoc
} from "firebase/firestore";
// NOTA IMPORTANTE: las reglas de seguridad de Firestore de este proyecto
// bloquean las operaciones "update" ("Missing or insufficient permissions"),
// aunque sí permiten "create" y "delete". Por eso, cualquier corrección de
// datos ya guardados (año, marca, etc.) se hace SIEMPRE como "crear un
// documento nuevo con los datos corregidos + borrar el documento antiguo",
// nunca con updateDoc/batch.update.

// --- 1. LECTURA DE MARCAS (Global) ---
export const getMarcasGlobales = async () => {
  console.log("firebaseApi: Obteniendo marcas globales...");
  const marcasCol = collection(db, "marcas");
  const snapshot = await getDocs(marcasCol);
  const listaMarcas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  return listaMarcas;
};

// --- 2. LECTURA DE DISTRIBUIDORES (Privado) ---
export const getDistribuidoresPorUsuario = async (idUsuario) => {
  console.log(`firebaseApi: Obteniendo distribuidores para el usuario ${idUsuario}...`);
  const distriCol = collection(db, "distribuidores");
  const q = query(distriCol, where("id_usuario", "==", idUsuario));
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

// --- Utilidad interna: Firestore permite máx. 500 operaciones por batch.
//     Nos quedamos en 400 por margen de seguridad y hacemos varios batches
//     si hace falta, en paralelo.
const CHUNK_SIZE = 400;
// Para las correcciones "borrar + recrear" cada documento cuenta como 2
// operaciones de batch (un set + un delete), así que usamos un lote más
// pequeño para no pasarnos del límite de 500 operaciones de Firestore.
const CHUNK_SIZE_CORRECCION = 200;
const chunkArray = (arr, size) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
};

// --- 4. ESCRITURA DE HISTÓRICO SELL-OUT (por lotes/batch) ---
export const saveMovimientosSellOut = async (idUsuario, idDistribuidor, mesAno, movimientos) => {
  console.log(`firebaseApi: Guardando ${movimientos.length} movimientos de Sell-Out (batch)...`);
  const historicoCol = collection(db, "historicoSellOut");

  const documentos = movimientos.map(fila => ({
    id_usuario: idUsuario,
    id_distribuidor: idDistribuidor,
    id_marca: fila.id_marca,
    // Permite override por fila (útil para importaciones multi-mes); si no, usa el mesAno general
    mes_ano: fila.mes_ano || mesAno,
    nombre_marca: fila.nombre_marca,
    coste_unidad: fila.coste_unidad,
    ap_por_unidad: fila.ap_por_unidad,
    ventas_uds: fila.ventas_uds,
    muestras_uds: fila.muestras_uds,
    regaladas_uds: fila.regaladas_uds,
    aportacion_euros: fila.aportacion_euros,
    ventas_euros: fila.ventas_euros,
    // --- Valores en € guardados de forma explícita (no recalculados) ---
    valor_regaladas_euros: fila.valor_regaladas_euros ?? (fila.regaladas_uds || 0) * (fila.coste_unidad || 0),
    valor_muestras_euros: fila.valor_muestras_euros ?? (fila.muestras_uds || 0) * (fila.coste_unidad || 0),
    // --- Nueva categoría: botellas a precio de Acuerdo especial ---
    unidades_acuerdo: fila.unidades_acuerdo || 0,
    precio_acuerdo_unidad: fila.precio_acuerdo_unidad || 0,
    valor_acuerdo_euros: fila.valor_acuerdo_euros || 0,
    // --- Trazabilidad de origen (para saber si vino de import o manual) ---
    origen: fila.origen || 'manual'
  }));

  for (const grupo of chunkArray(documentos, CHUNK_SIZE)) {
    const batch = writeBatch(db);
    grupo.forEach(docData => batch.set(doc(historicoCol), docData));
    await batch.commit();
  }
  console.log("Guardado de Sell-Out completado.");
  return true;
};

// --- 5. ESCRITURA DE HISTÓRICO SELL-IN (por lotes/batch) ---
export const saveMovimientosSellIn = async (idUsuario, idDistribuidor, mesAno, movimientos) => {
  console.log(`firebaseApi: Guardando ${movimientos.length} movimientos de Sell-In (batch)...`);
  const historicoCol = collection(db, "historicoSellIn");

  const documentos = movimientos.map(fila => ({
    id_usuario: idUsuario,
    id_distribuidor: idDistribuidor,
    id_marca: fila.id_marca,
    mes_ano: fila.mes_ano || mesAno,
    nombre_marca: fila.nombre_marca,
    coste_unidad: fila.coste_unidad,
    ap_por_unidad: fila.ap_por_unidad,
    unidades_compradas: fila.unidades_compradas,
    facturacion_euros: fila.facturacion_euros,
    origen: fila.origen || 'manual'
  }));

  for (const grupo of chunkArray(documentos, CHUNK_SIZE)) {
    const batch = writeBatch(db);
    grupo.forEach(docData => batch.set(doc(historicoCol), docData));
    await batch.commit();
  }
  console.log("Guardado de Sell-In completado.");
  return true;
};

// --- 6. LECTURA DE HISTÓRICO SELL-IN (Por Distribuidor) ---
export const getHistoricoSellIn = async (idUsuario, idDistribuidor) => {
  console.log(`firebaseApi: Leyendo Sell-In para ${idDistribuidor}...`);
  const historicoCol = collection(db, "historicoSellIn");
  const q = query(historicoCol, 
              where("id_usuario", "==", idUsuario),
              where("id_distribuidor", "==", idDistribuidor)
            );
  const snapshot = await getDocs(q);
  const movimientos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  return movimientos;
};

// --- 7. LECTURA DE HISTÓRICO SELL-OUT (Por Distribuidor) ---
export const getHistoricoSellOut = async (idUsuario, idDistribuidor) => {
  console.log(`firebaseApi: Leyendo Sell-Out para ${idDistribuidor}...`);
  const historicoCol = collection(db, "historicoSellOut");
  const q = query(historicoCol, 
              where("id_usuario", "==", idUsuario),
              where("id_distribuidor", "==", idDistribuidor)
            );
  const snapshot = await getDocs(q);
  const movimientos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  return movimientos;
};

// --- 8. LECTURA DE SELL-IN POR MES (GENERAL - Reportes) ---
export const getSellInByMonth = async (idUsuario, mesAno) => {
  console.log(`firebaseApi: Leyendo Sell-In General para ${mesAno}...`);
  const historicoCol = collection(db, "historicoSellIn");
  const q = query(historicoCol, 
              where("id_usuario", "==", idUsuario),
              where("mes_ano", "==", mesAno)
            );
  const snapshot = await getDocs(q);
  const movimientos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  return movimientos;
};

// --- 9. LECTURA DE SELL-OUT POR MES (GENERAL - Reportes) ---
export const getSellOutByMonth = async (idUsuario, mesAno) => {
  console.log(`firebaseApi: Leyendo Sell-Out General para ${mesAno}...`);
  const historicoCol = collection(db, "historicoSellOut");
  const q = query(historicoCol, 
              where("id_usuario", "==", idUsuario),
              where("mes_ano", "==", mesAno)
            );
  const snapshot = await getDocs(q);
  const movimientos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  return movimientos;
};

// --- 10. ESCRITURA DE NUEVA MARCA (Global) ---
export const saveNuevaMarca = async (data) => {
  console.log("firebaseApi: Guardando nueva marca global...");
  const marcasCol = collection(db, "marcas");
  const docRef = await addDoc(marcasCol, data);
  console.log("Marca guardada con ID: ", docRef.id);
  return docRef.id;
};

// --- 11. FUNCIÓN DE BORRADO GENÉRICA ---
export const deleteDocument = async (collectionName, docId) => {
  console.log(`firebaseApi: Borrando documento ${docId} de ${collectionName}...`);
  const docRef = doc(db, collectionName, docId);
  await deleteDoc(docRef);
  console.log("Documento borrado con éxito.");
  return true;
};

// --- 12. FUNCIÓN DE BORRADO DE HISTORIAL COMPLETO ---
const deleteCollectionForUser = async (collectionName, idUsuario) => {
  const colRef = collection(db, collectionName);
  const q = query(colRef, where("id_usuario", "==", idUsuario));
  const snapshot = await getDocs(q);

  if (snapshot.docs.length === 0) {
    return 0; // No hay documentos que borrar
  }
  
  const batch = writeBatch(db);
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  
  await batch.commit();
  return snapshot.docs.length;
};

/**
 * Función principal de reseteo: elimina solo datos transaccionales.
 */
export const resetUserHistory = async (idUsuario) => {
  const colecciones = [
    "historicoSellIn", 
    "historicoSellOut"
  ];
  
  const resultados = {};
  
  for (const col of colecciones) {
    const count = await deleteCollectionForUser(col, idUsuario);
    resultados[col] = count;
  }
  
  return resultados;
};

// --- 13. LECTURA DE TODO EL SELL-IN (GENERAL) ---
export const getHistoricoSellInGeneral = async (idUsuario) => {
  console.log(`firebaseApi: Leyendo TODO el Sell-In para ${idUsuario}...`);
  const historicoCol = collection(db, "historicoSellIn");
  
  const q = query(historicoCol, 
              where("id_usuario", "==", idUsuario)
            );
            
  const snapshot = await getDocs(q);
  
  const movimientos = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
  
  return movimientos;
};

// --- 14. LECTURA DE TODO EL SELL-OUT (GENERAL) ---
export const getHistoricoSellOutGeneral = async (idUsuario) => {
  console.log(`firebaseApi: Leyendo TODO el Sell-Out para ${idUsuario}...`);
  const historicoCol = collection(db, "historicoSellOut");

  const q = query(historicoCol,
              where("id_usuario", "==", idUsuario)
            );

  const snapshot = await getDocs(q);

  const movimientos = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  return movimientos;
};

// --- 15. BORRAR MOVIMIENTOS DE UN DISTRIBUIDOR EN UNOS MESES CONCRETOS ---
// Se usa desde el Importador de Excel cuando el usuario elige "sobrescribir"
// un mes que ya tenía datos, para no duplicar.
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

// --- 18. VENTAS REALES (import mensual desde QlikSense) ---
// Datos reales de venta por Distribuidor/Familia/Subfamilia (=Marca). Se
// consideran la fuente de verdad frente a los cálculos de Sell-In/Sell-Out
// cuando haya diferencias (precios actualizados, promociones o descuentos
// en compra no reflejados en esas pantallas).

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
  const q = query(col, where("id_usuario", "==", idUsuario));
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

// --- 19. MEMORIA DE RECONCILIACIÓN DEL IMPORTADOR DE VENTAS REALES ---
// Recuerda, por usuario, qué decisión se tomó la primera vez para cada
// nombre de Distribuidor/Subfamilia tal y como viene escrito en el Excel de
// QlikSense (p.ej. "EXCLUSIVAS DYEXCO S.L." -> usar el distribuidor ya
// existente con id X). Así, en la importación del mes siguiente, el
// importador no vuelve a preguntar por nombres ya resueltos anteriormente.
// Como las reglas de Firestore no permiten "update", para "cambiar" una
// decisión ya guardada se borra el documento antiguo de esa clave y se crea
// uno nuevo (mismo patrón que el resto de correcciones de esta app).

// --- 19a. GUARDAR (o sustituir) LA DECISIÓN RECORDADA PARA UNA CLAVE ---
export const saveMapeoImportacion = async (idUsuario, tipo, nombreExcelNormalizado, accion, idDestino) => {
  const col = collection(db, "mapeoImportacion");
  await addDoc(col, {
    id_usuario: idUsuario,
    tipo, // 'distribuidor' | 'marca'
    nombre_excel: nombreExcelNormalizado,
    accion, // 'usar_existente' | 'omitir'
    id_destino: idDestino || null
  });
  return true;
};

// --- 19b. LEER TODA LA MEMORIA DE RECONCILIACIÓN DE UN USUARIO ---
export const getMapeoImportacion = async (idUsuario) => {
  const col = collection(db, "mapeoImportacion");
  const q = query(col, where("id_usuario", "==", idUsuario));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// --- 19c. BORRAR LA MEMORIA GUARDADA PARA UNA CLAVE CONCRETA (antes de sustituirla) ---
export const deleteMapeoImportacion = async (idUsuario, tipo, nombreExcelNormalizado) => {
  const col = collection(db, "mapeoImportacion");
  const q = query(col,
    where("id_usuario", "==", idUsuario),
    where("tipo", "==", tipo),
    where("nombre_excel", "==", nombreExcelNormalizado)
  );
  const snapshot = await getDocs(q);
  if (snapshot.docs.length === 0) return 0;
  const batch = writeBatch(db);
  snapshot.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  return snapshot.docs.length;
};

// --- 20. STOCK INICIAL DECLARADO (columna "Stock Inicial" de la hoja VENTAS
// STOCK del Excel de liquidación) ---
// El Excel declara, para cada marca/referencia, cuántas unidades tenía YA el
// distribuidor en su almacén al empezar el año de ese Excel (antes de
// cualquier compra registrada en la app). Ese valor NO se suma como compra
// en Compras.js, Histórico Sell-In ni en Control A&P (ControlAP.js, la vista
// REAL sobre Sell-Out); solo se usa como punto de partida al calcular el
// Stock actualizado en StockDistribuidor.js, para que "Stock Final = Stock
// Inicial + Compras - Salidas" cuadre con la realidad desde el primer año
// importado.
// EXCEPCIÓN: en ControlAPVisionComercial.js (la vista "de cara a Compañía"
// sobre Sell-In) SÍ se suma como si fueran unidades compradas, porque esas
// botellas ya estaban colocadas en el distribuidor y generan su A&P igual
// que una compra (a la tasa ACTUAL de A&P de la marca, por aproximación, ya
// que el Stock Inicial no guarda con qué tasa se generó en su momento). Por
// eso existe getStockInicialGeneral (20d), que trae el dato de TODOS los
// distribuidores del usuario a la vez, igual que getHistoricoSellInGeneral.

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
  const q = query(col, where("id_usuario", "==", idUsuario));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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