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
  deleteDoc,
  setDoc,
  getDoc
} from "firebase/firestore";
// NOTA IMPORTANTE: las reglas de seguridad de Firestore de este proyecto
// bloquean las operaciones "update" ("Missing or insufficient permissions"),
// aunque sí permiten "create" y "delete". Por eso, cualquier corrección de
// datos ya guardados (año, marca, etc.) se hace SIEMPRE como "crear un
// documento nuevo con los datos corregidos + borrar el documento antiguo",
// nunca con updateDoc/batch.update.
//
// EXCEPCIÓN (papelera, ver sección 22 al final del archivo): historicoSellIn
// e historicoSellOut sí permiten un "update" muy acotado, solo para marcar
// un documento como eliminado/restaurado (campos eliminado/eliminado_en/
// eliminado_por) — las reglas de Firestore rechazan cualquier otro campo en
// ese update. Ningún dato de negocio se actualiza nunca; sigue siendo
// "borrar + recrear" para cualquier corrección real.

// --- 0. PERFILES DE USUARIO (roles/permisos) ---
// Ver firestore.rules (colección usuarios) para el porqué: el rol vive en
// usuarios/{uid}, se crea siempre como 'usuario' desde el cliente (nadie
// puede auto-promocionarse) y solo se asciende a 'manager' con
// setManagerRole.js, ejecutado fuera de la app.

// CAMBIO (roles/permisos, Fase 2 — vista "Todos los usuarios", a petición
// de Sergio): sentinel especial para el selector "Viendo como" (Layout.js/
// App.js). Cuando idUsuario vale esto, las funciones "Generales" de más
// abajo (las que ya traían TODO el histórico de un usuario, sin filtrar por
// distribuidor) devuelven los documentos de TODOS los usuarios en vez de
// filtrar por uno solo, para las 4 pantallas de análisis (Dashboard,
// Dashboard A&P Compañía, Reportes, Dashboard de Ventas Reales). Quien de
// verdad autoriza esa lectura ampliada es la regla esManager() de
// firestore.rules — este sentinel por sí solo no se salta ningún permiso:
// un usuario normal que lo usara simplemente recibiría un
// "permission-denied" en cuanto Firestore evaluara la regla sobre un
// documento que no es suyo.
export const TODOS_LOS_USUARIOS = '__TODOS__';

// Envuelve una colección con el filtro where("id_usuario","==",idUsuario)
// — salvo que idUsuario sea TODOS_LOS_USUARIOS, en cuyo caso devuelve la
// colección tal cual, sin filtrar (getDocs acepta tanto una Query como una
// CollectionReference, así que no hace falta distinguir el tipo de retorno
// en cada función que use este helper).
const conFiltroUsuario = (colRef, idUsuario) =>
  idUsuario === TODOS_LOS_USUARIOS ? colRef : query(colRef, where("id_usuario", "==", idUsuario));

// Se llama una única vez, justo tras registrarse (ver LoginScreen.js). Si el
// perfil ya existiera (no debería, un uid nuevo es siempre nuevo) esto lo
// sobrescribiría — no pasa en la práctica porque solo se llama en el alta.
export const crearPerfilUsuario = async (uid, email) => {
  console.log(`firebaseApi: Creando perfil de usuario para ${email}...`);
  await setDoc(doc(db, "usuarios", uid), {
    email,
    rol: 'usuario',
    fecha_alta: new Date().toISOString()
  });
};

// Perfil (rol, email) del usuario autenticado — se llama justo tras el
// login para saber si hay que mostrar el selector "Viendo como" (managers).
// Devuelve null si por lo que sea el perfil no existe (p.ej. cuentas creadas
// a mano en la consola de Firebase antes de este cambio, sin pasar por
// LoginScreen) — App.js lo trata como rol 'usuario' por defecto en ese caso.
export const getPerfilUsuario = async (uid) => {
  const snap = await getDoc(doc(db, "usuarios", uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

// Lista de TODOS los perfiles de usuario — solo la puede llamar con éxito un
// manager (ver la regla `allow list` en firestore.rules); si la llama un
// usuario normal, Firestore devuelve "permission-denied". Se usa para
// rellenar el selector "Viendo como" en el Sidebar.
export const getListaUsuarios = async () => {
  const snapshot = await getDocs(collection(db, "usuarios"));
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
};

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
  // Papelera (ver sección 22 al final del archivo): los movimientos con
  // eliminado===true no deben aparecer en ningún cálculo ni pantalla salvo
  // en la propia Papelera. Los documentos antiguos (sin este campo) se
  // conservan con normalidad — solo se excluyen los marcados explícitamente.
  return movimientos.filter(m => m.eliminado !== true);
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
  // Papelera (ver sección 22 al final del archivo): los movimientos con
  // eliminado===true no deben aparecer en ningún cálculo ni pantalla salvo
  // en la propia Papelera. Los documentos antiguos (sin este campo) se
  // conservan con normalidad — solo se excluyen los marcados explícitamente.
  return movimientos.filter(m => m.eliminado !== true);
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
  // Papelera (ver sección 22 al final del archivo): los movimientos con
  // eliminado===true no deben aparecer en ningún cálculo ni pantalla salvo
  // en la propia Papelera. Los documentos antiguos (sin este campo) se
  // conservan con normalidad — solo se excluyen los marcados explícitamente.
  return movimientos.filter(m => m.eliminado !== true);
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
  // Papelera (ver sección 22 al final del archivo): los movimientos con
  // eliminado===true no deben aparecer en ningún cálculo ni pantalla salvo
  // en la propia Papelera. Los documentos antiguos (sin este campo) se
  // conservan con normalidad — solo se excluyen los marcados explícitamente.
  return movimientos.filter(m => m.eliminado !== true);
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

// --- 12. FUNCIÓN DE BORRADO (SUAVE) DE HISTORIAL COMPLETO ---
// CAMBIO (papelera + auditoría, a petición de Sergio): "Borrar TODO el
// historial" (Mantenimiento.js) ya NO borra físicamente los documentos — los
// marca como eliminados (mismo mecanismo que borrar una fila suelta en
// Historico.js/HistoricoSellIn.js, ver sección 22) para poder recuperarlos
// desde la Papelera si fue un error. Se registra UNA entrada de auditoría
// por colección (no una por documento, para no inundar el registro en un
// reseteo de cientos de filas).
const deleteCollectionForUser = async (collectionName, idUsuario, actor) => {
  const colRef = collection(db, collectionName);
  const q = query(colRef, where("id_usuario", "==", idUsuario));
  const snapshot = await getDocs(q);

  if (snapshot.docs.length === 0) {
    return 0; // No hay documentos que borrar
  }

  const ahora = new Date().toISOString();
  for (const grupo of chunkArray(snapshot.docs, CHUNK_SIZE)) {
    const batch = writeBatch(db);
    grupo.forEach((d) => {
      batch.set(d.ref, { eliminado: true, eliminado_en: ahora, eliminado_por: actor?.uid || null }, { merge: true });
    });
    await batch.commit();
  }

  await registrarAuditoria({
    idUsuario,
    actorUid: actor?.uid,
    actorEmail: actor?.email,
    accion: 'reset_historico',
    coleccion: collectionName,
    idDocumento: null,
    resumen: `Reseteo de mantenimiento: ${snapshot.docs.length} registro(s) movidos a la papelera.`
  });

  return snapshot.docs.length;
};

/**
 * Función principal de reseteo: mueve a la papelera (recuperable) solo
 * datos transaccionales. `actor` = { uid, email } de quien ejecuta el
 * reseteo, para dejarlo registrado en la auditoría.
 */
export const resetUserHistory = async (idUsuario, actor) => {
  const colecciones = [
    "historicoSellIn",
    "historicoSellOut"
  ];

  const resultados = {};

  for (const col of colecciones) {
    const count = await deleteCollectionForUser(col, idUsuario, actor);
    resultados[col] = count;
  }

  return resultados;
};

// --- 13. LECTURA DE TODO EL SELL-IN (GENERAL) ---
export const getHistoricoSellInGeneral = async (idUsuario) => {
  console.log(`firebaseApi: Leyendo TODO el Sell-In para ${idUsuario}...`);
  const historicoCol = collection(db, "historicoSellIn");

  const q = conFiltroUsuario(historicoCol, idUsuario);

  const snapshot = await getDocs(q);
  
  const movimientos = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  // Papelera (ver sección 22 al final del archivo): excluir eliminados.
  return movimientos.filter(m => m.eliminado !== true);
};

// --- 14. LECTURA DE TODO EL SELL-OUT (GENERAL) ---
export const getHistoricoSellOutGeneral = async (idUsuario) => {
  console.log(`firebaseApi: Leyendo TODO el Sell-Out para ${idUsuario}...`);
  const historicoCol = collection(db, "historicoSellOut");

  const q = conFiltroUsuario(historicoCol, idUsuario);

  const snapshot = await getDocs(q);

  const movimientos = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  // Papelera (ver sección 22 al final del archivo): excluir eliminados.
  return movimientos.filter(m => m.eliminado !== true);
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
  const q = conFiltroUsuario(col, idUsuario);
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
  const q = conFiltroUsuario(col, idUsuario);
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

// --- 22. PAPELERA (borrado suave) + AUDITORÍA ---
// A petición de Sergio (mejora de "profesionalización" de la app, tras la
// auditoría): los borrados de una fila suelta de Histórico Sell-In/Sell-Out
// (Historico.js, HistoricoSellIn.js) y el reseteo completo de historial
// (Mantenimiento.js) ya no borran el documento de Firestore de verdad — lo
// marcan con `eliminado: true` (+ `eliminado_en`, `eliminado_por`) y lo
// excluyen de todas las lecturas normales (ver el `.filter(m => m.eliminado
// !== true)` en los getters de más arriba). Desde la nueva pantalla
// "Papelera" se puede "Restaurar" (vuelve a `eliminado: false`) o "Eliminar
// definitivamente" (ahí sí, deleteDoc real, sin vuelta atrás) cada fila.
//
// Esto requirió el único `allow update` de todo el proyecto (ver
// firestore.rules): las reglas siguen bloqueando cualquier cambio de datos
// de negocio (nunca se puede editar coste_unidad, unidades_compradas...) —
// el `allow update` está acotado por código a que la escritura SOLO toque
// los 3 campos de papelera (`eliminado`, `eliminado_en`, `eliminado_por`),
// nada más. Cualquier corrección real sigue siendo "borrar + recrear" como
// hasta ahora.
//
// De momento cubre historicoSellIn e historicoSellOut (los borrados que de
// verdad hace un usuario desde la UI, fila a fila) y el reseteo completo de
// Mantenimiento.js — no las colecciones donde "borrar" es un paso interno
// de una operación más amplia (reimportar un Excel, fusionar marcas,
// corregir un año...), que siguen siendo borrado físico normal, sin cambios.
//
// Además, cada acción (borrar/restaurar/eliminar definitivo/resetear) deja
// una entrada en la nueva colección `auditoria` — quién la hizo, cuándo, y
// un resumen legible — visible desde la nueva pantalla "Auditoría".

// --- 22a. Registra una entrada de auditoría ---
export const registrarAuditoria = async ({ idUsuario, actorUid, actorEmail, accion, coleccion, idDocumento, resumen }) => {
  const col = collection(db, "auditoria");
  await addDoc(col, {
    id_usuario: idUsuario,
    actor_uid: actorUid || null,
    actor_email: actorEmail || null,
    accion, // 'eliminar' | 'restaurar' | 'eliminar_definitivo' | 'reset_historico'
    coleccion,
    id_documento: idDocumento || null,
    resumen: resumen || '',
    fecha: new Date().toISOString()
  });
};

// --- 22b. Mueve un documento a la papelera (borrado suave) + audita ---
export const moverAPapelera = async (collectionName, docId, { idUsuario, actorUid, actorEmail, resumen }) => {
  const ref = doc(db, collectionName, docId);
  await setDoc(ref, {
    eliminado: true,
    eliminado_en: new Date().toISOString(),
    eliminado_por: actorUid || null
  }, { merge: true });
  await registrarAuditoria({ idUsuario, actorUid, actorEmail, accion: 'eliminar', coleccion: collectionName, idDocumento: docId, resumen });
  return true;
};

// --- 22c. Restaura un documento desde la papelera + audita ---
export const restaurarDePapelera = async (collectionName, docId, { idUsuario, actorUid, actorEmail, resumen }) => {
  const ref = doc(db, collectionName, docId);
  await setDoc(ref, {
    eliminado: false,
    eliminado_en: null,
    eliminado_por: null
  }, { merge: true });
  await registrarAuditoria({ idUsuario, actorUid, actorEmail, accion: 'restaurar', coleccion: collectionName, idDocumento: docId, resumen });
  return true;
};

// --- 22d. Elimina definitivamente (borrado físico real, sin vuelta atrás)
// un documento que ya estaba en la papelera + audita ---
export const eliminarDefinitivamente = async (collectionName, docId, { idUsuario, actorUid, actorEmail, resumen }) => {
  await deleteDocument(collectionName, docId);
  await registrarAuditoria({ idUsuario, actorUid, actorEmail, accion: 'eliminar_definitivo', coleccion: collectionName, idDocumento: docId, resumen });
  return true;
};

// --- 22e. Lee todos los documentos en la papelera (eliminado === true) de
// una colección, para un usuario. Se trae todo el histórico del usuario
// (mismo patrón que los getters "Generales") y se filtra en memoria — evita
// tener que crear un índice compuesto en Firestore solo para esta pantalla,
// que no es de uso frecuente. ---
export const getPapelera = async (idUsuario, collectionName) => {
  const col = collection(db, collectionName);
  const q = query(col, where("id_usuario", "==", idUsuario));
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(d => d.eliminado === true);
};

// --- 22f. Lee el registro de auditoría de un usuario, más reciente primero ---
export const getAuditoria = async (idUsuario) => {
  const col = collection(db, "auditoria");
  const q = query(col, where("id_usuario", "==", idUsuario));
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
};

// ==========================================================================
// 23. PRESUPUESTOS (Objetivo Anual + Forecast, Fase 2 profesionalización)
// ==========================================================================
// A petición de Sergio, tras la auditoría de la app: un área propia y
// separada de las pantallas de uso diario, porque el objetivo anual solo se
// crea/revisa una o dos veces al año (ver PantallaPresupuesto.js).
//
// Un documento por (id_usuario, anio, id_distribuidor) — un objetivo
// concreto por distribuidor y año.
//
// CAMBIO (rediseño "por marca", a petición de Sergio): el objetivo ya no se
// fija repartiendo un total en 12 meses. Ahora, por cada marca, se guarda
// solo el % de crecimiento deseado respecto al año anterior:
//   objetivos_facturacion_marca: [{ id_marca, nombre_marca, pct_crecimiento }]
//   objetivos_ap_marca:          [{ id_marca, nombre_marca, pct_crecimiento }]
// El año anterior (cajas/importe de Facturación desde `ventasReales`, e
// importe de A&P desde `historicoSellOut`) NO se guarda en este documento —
// se recalcula siempre en caliente a partir del histórico real, para que si
// se corrige un dato antiguo el objetivo/forecast lo reflejen sin tener que
// re-guardar nada. El objetivo final (cajas/importe) sale de multiplicar
// ese año anterior por (1 + pct_crecimiento/100). Ver PantallaPresupuesto.js.
//
// Igual que el resto de la app, NO hay `allow update` en firestore.rules
// para esta colección: corregir un objetivo ya guardado es "borrar el
// documento de ese año+distribuidor y crear uno nuevo" — por eso
// `guardarPresupuesto` primero busca y borra el documento existente (si lo
// hay) antes de crear el nuevo, en vez de intentar actualizarlo.

// Busca el documento de presupuesto de un año+distribuidor concreto (o
// null si el usuario aún no ha guardado ningún objetivo para esa
// combinación). Se usa tanto para precargar el formulario de "Objetivo
// Anual" como, internamente, por guardarPresupuesto para saber qué borrar.
export const getPresupuesto = async (idUsuario, anio, idDistribuidor) => {
  const col = collection(db, "presupuestos");
  const q = query(
    col,
    where("id_usuario", "==", idUsuario),
    where("anio", "==", anio),
    where("id_distribuidor", "==", idDistribuidor)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  const docSnap = snapshot.docs[0];
  return { id: docSnap.id, ...docSnap.data() };
};

// Todos los objetivos guardados de un usuario para un año concreto (uno por
// distribuidor) — lo usa la pestaña "Forecast" para agregar "Todos sus
// distribuidores" o para saber qué distribuidores ya tienen objetivo.
export const getPresupuestosPorAnio = async (idUsuario, anio) => {
  const col = collection(db, "presupuestos");
  const q = query(col, where("id_usuario", "==", idUsuario), where("anio", "==", anio));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// Guarda (crea o sustituye) el objetivo anual de un distribuidor concreto.
// "Sustituye" = borra el documento anterior de ese mismo año+distribuidor
// (si existía) y crea uno nuevo — nunca updateDoc, ver cabecera de sección.
// `objetivosPorMarca` = { facturacion: [{id_marca, nombre_marca,
// pct_crecimiento}], ap: [{id_marca, nombre_marca, pct_crecimiento}] }
export const guardarPresupuesto = async (idUsuario, anio, idDistribuidor, objetivosPorMarca, actor) => {
  const existente = await getPresupuesto(idUsuario, anio, idDistribuidor);
  if (existente) {
    await deleteDoc(doc(db, "presupuestos", existente.id));
  }
  const col = collection(db, "presupuestos");
  const nuevoDoc = await addDoc(col, {
    id_usuario: idUsuario,
    anio,
    id_distribuidor: idDistribuidor,
    objetivos_facturacion_marca: objetivosPorMarca?.facturacion || [],
    objetivos_ap_marca: objetivosPorMarca?.ap || [],
    actualizado_en: new Date().toISOString(),
    actor_uid: actor?.uid || null,
    actor_email: actor?.email || null
  });
  return nuevoDoc.id;
};

// Borra por completo el objetivo de un año+distribuidor (botón "Borrar
// objetivo" del formulario).
export const deletePresupuesto = async (idUsuario, anio, idDistribuidor) => {
  const existente = await getPresupuesto(idUsuario, anio, idDistribuidor);
  if (!existente) return false;
  await deleteDoc(doc(db, "presupuestos", existente.id));
  return true;
};