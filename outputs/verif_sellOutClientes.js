/*
 * firebaseApi/sellOutClientes.js
 * Sell-Out detalle por cliente final (import por distribuidor) — colecciones
 * "clientesSellOut", "movimientosSellOutClientes" y "aliasProductosSellOut".
 *
 * --- 21. SELL-OUT DETALLE POR CLIENTE FINAL (import por distribuidor) ---
 * Módulo nuevo (a petición de Sergio): cada distribuidor envía, de forma
 * periódica (mensual/trimestral...) y en un formato propio (Excel/PDF/TXT
 * según el distribuidor), el detalle de SUS ventas a clientes finales — quién
 * compra, qué compra, cuánto. A diferencia de "Ventas Reales" (que trae TODOS
 * los distribuidores juntos y agregado por Familia/Marca, sin cliente), este
 * import es SIEMPRE de UN distribuidor concreto (elegido a mano por el
 * usuario al importar, igual que ImportarExcel.js) y baja al detalle de línea
 * (una fila por combinación cliente/producto/albarán).
 *
 * Dos colecciones:
 *  - `clientesSellOut`: maestro de clientes finales, uno por (distribuidor,
 *    cliente). Se identifica preferentemente por el código de cliente propio
 *    del distribuidor (`cod_cliente_origen`) — mucho más fiable que el
 *    nombre para reconciliar el mismo cliente entre importaciones sucesivas,
 *    ya que el distribuidor lo mantiene estable en su propio sistema. Si el
 *    archivo de un distribuidor no trae código, se cae a matching difuso por
 *    nombre (matching.js), igual que ya se hace con Marcas/Distribuidores.
 *  - `movimientosSellOutClientes`: detalle línea a línea (fecha real de cada
 *    línea, no un mes elegido a mano — el propio archivo ya trae la fecha).
 *    tipologia/grupo/comercial se guardan AQUÍ (no en el maestro de cliente)
 *    porque son atributos de la transacción, pueden variar entre líneas del
 *    mismo cliente (p.ej. cambia de comercial asignado) y así no violamos la
 *    regla de "nunca update": no hace falta tocar el maestro para reflejarlo.
 */

import { collection, query, where, getDocs, doc, addDoc, writeBatch } from "firebase/firestore";
import { db, conFiltroUsuario, chunkArray, CHUNK_SIZE, CHUNK_SIZE_CORRECCION } from './comun';
import { registrarAuditoria } from './auditoria';
import { deleteCollectionForUser } from './mantenimiento';
import {
  leerConCache,
  invalidarPorPrefijo,
  claveMovimientosSellOutClientes,
  claveClientesSellOut,
  prefijoMovimientosSellOutClientes,
  prefijoClientesSellOut
} from './cacheLecturas';

/*
 * --- CACHÉ DE LECTURAS (ver cacheLecturas.js) ---
 * Las dos lecturas "por distribuidor" de este módulo las piden a la vez las
 * dos pestañas de PantallaSellOutClientes.js (Clientes y Marcas), que a
 * menudo tienen seleccionado el mismo distribuidor: se leía dos veces lo
 * mismo de Firestore. Se cachean en memoria por (usuario, distribuidor), con
 * claves `movsSOC:idUsuario:idDistribuidor` y
 * `clientesSOC:idUsuario:idDistribuidor` (las construyen
 * claveMovimientosSellOutClientes / claveClientesSellOut, para que
 * invalidación y lectura no puedan salirse de sitio).
 *
 * TODAS las funciones de este archivo que escriben en `clientesSellOut` o
 * `movimientosSellOutClientes` invalidan justo después de escribir. Las que
 * conocen el distribuidor concreto invalidan solo esa clave; las que no
 * (resetSellOutClientesTodo) invalidan el prefijo entero del usuario.
 * La papelera (auditoria.js) invalida también por usuario, porque desde un
 * docId suelto no se sabe de qué distribuidor era.
 */

// --- 21a. ESCRITURA DE NUEVO CLIENTE FINAL (maestro, por distribuidor) ---
export const saveNuevoClienteSellOut = async (data) => {
  console.log("firebaseApi: Guardando nuevo cliente Sell-Out...");
  const col = collection(db, "clientesSellOut");
  const docRef = await addDoc(col, data);
  // El maestro de clientes de ese distribuidor acaba de cambiar. `data` trae
  // id_usuario/id_distribuidor dentro (ver ImportarSellOutClientes.js, que es
  // quien la llama); si algún día llegara sin ellos, se invalida más ancho
  // antes que quedarse con datos viejos: pasarse invalidando solo cuesta una
  // relectura, quedarse corto sería un bug de datos obsoletos.
  if (data && data.id_usuario && data.id_distribuidor) {
    invalidarPorPrefijo(claveClientesSellOut(data.id_usuario, data.id_distribuidor));
  } else if (data && data.id_usuario) {
    invalidarPorPrefijo(prefijoClientesSellOut(data.id_usuario));
  } else {
    invalidarPorPrefijo('clientesSOC:');
  }
  return docRef.id;
};

// --- 21b. LECTURA DE CLIENTES FINALES DE UN DISTRIBUIDOR CONCRETO ---
// Cacheada por (usuario, distribuidor) — ver el bloque "CACHÉ DE LECTURAS"
// de arriba. Misma firma y mismo resultado que antes.
export const getClientesSellOutPorDistribuidor = async (idUsuario, idDistribuidor) =>
  leerConCache(claveClientesSellOut(idUsuario, idDistribuidor), async () => {
    const col = collection(db, "clientesSellOut");
    const q = query(col, where("id_usuario", "==", idUsuario), where("id_distribuidor", "==", idDistribuidor));
    const snapshot = await getDocs(q);
    // Papelera (ver auditoria.js): excluir eliminados.
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(c => c.eliminado !== true);
  });

// --- 21c. LECTURA DE CLIENTES FINALES DE TODOS LOS DISTRIBUIDORES DEL
// USUARIO A LA VEZ (deja lista la pantalla para un futuro modo "Todos los
// usuarios"/manager, igual que el resto de colecciones "Generales") ---
export const getClientesSellOutGeneral = async (idUsuario) => {
  const col = collection(db, "clientesSellOut");
  const q = conFiltroUsuario(col, idUsuario);
  const snapshot = await getDocs(q);
  // Papelera (ver auditoria.js): excluir eliminados.
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(c => c.eliminado !== true);
};

// --- 21d. ESCRITURA DE MOVIMIENTOS DE SELL-OUT POR CLIENTE (por lotes/batch) ---
export const saveMovimientosSellOutClientes = async (idUsuario, idDistribuidor, filas) => {
  console.log(`firebaseApi: Guardando ${filas.length} movimientos de Sell-Out por Cliente (batch)...`);
  const col = collection(db, "movimientosSellOutClientes");

  const documentos = filas.map(fila => ({
    id_usuario: idUsuario,
    id_distribuidor: idDistribuidor,
    id_cliente: fila.id_cliente,
    nombre_cliente: fila.nombre_cliente,
    id_marca: fila.id_marca,
    nombre_marca: fila.nombre_marca,
    fecha: fila.fecha || null,       // 'YYYY-MM-DD', tal cual venía en el archivo
    mes_ano: fila.mes_ano,           // 'YYYY-MM', derivado de fecha (o elegido a mano si el archivo no traía fecha)
    tipologia: fila.tipologia || '',
    grupo: fila.grupo || '',
    comercial: fila.comercial || '',
    preventista: fila.preventista || '',
    albaran: fila.albaran || '',
    uds_ventas: fila.uds_ventas || 0,
    uds_promo: fila.uds_promo || 0,
    uds_regalos: fila.uds_regalos || 0,
    uds_totales: fila.uds_totales || 0,
    dtos1_euros: fila.dtos1_euros || 0,
    dtos2_euros: fila.dtos2_euros || 0,
    coste_unidad: fila.coste_unidad || 0,
    precio_unidad: fila.precio_unidad || 0,
    facturacion_euros: fila.facturacion_euros || 0,
    origen: 'import_sellout_cliente'
  }));

  for (const grupo of chunkArray(documentos, CHUNK_SIZE)) {
    const batch = writeBatch(db);
    grupo.forEach(docData => batch.set(doc(col), docData));
    await batch.commit();
  }
  console.log("Guardado de Sell-Out por Cliente completado.");
  // Hay movimientos nuevos de este distribuidor: la lista cacheada se quedó corta.
  invalidarPorPrefijo(claveMovimientosSellOutClientes(idUsuario, idDistribuidor));
  return true;
};

// --- 21e. LECTURA DE MOVIMIENTOS SELL-OUT POR CLIENTE DE UN DISTRIBUIDOR ---
// Cacheada por (usuario, distribuidor) — es LA lectura que duplicaban las dos
// pestañas hermanas (Clientes y Marcas). Misma firma y mismo resultado.
export const getMovimientosSellOutClientesPorDistribuidor = async (idUsuario, idDistribuidor) =>
  leerConCache(claveMovimientosSellOutClientes(idUsuario, idDistribuidor), async () => {
    const col = collection(db, "movimientosSellOutClientes");
    const q = query(col, where("id_usuario", "==", idUsuario), where("id_distribuidor", "==", idDistribuidor));
    const snapshot = await getDocs(q);
    // Papelera (ver auditoria.js): excluir eliminados.
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(m => m.eliminado !== true);
  });

// --- 21f. LECTURA DE MOVIMIENTOS SELL-OUT POR CLIENTE DE TODOS LOS
// DISTRIBUIDORES DEL USUARIO A LA VEZ (mismo motivo que 21c) ---
export const getMovimientosSellOutClientesGeneral = async (idUsuario) => {
  const col = collection(db, "movimientosSellOutClientes");
  const q = conFiltroUsuario(col, idUsuario);
  const snapshot = await getDocs(q);
  // Papelera (ver auditoria.js): excluir eliminados.
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(m => m.eliminado !== true);
};

// Para borrar movimientos de un distribuidor en unos meses concretos (al
// "sobrescribir" una reimportación) se reutiliza la función genérica ya
// existente: deleteMovimientosPorMeses('movimientosSellOutClientes', ...)
// (ver utilidadesColeccionGenerica.js).

// --- 21i. CORREGIR LA MARCA DE UNOS MOVIMIENTOS YA IMPORTADOS (a petición de
// Sergio: detectó que "PALOMO COJO 3L" tenía unidades que en realidad eran
// de "Palomo Cojo DO Rueda" — un texto de producto genérico del archivo se
// reconcilió, en su día, contra la marca equivocada) ---
// A diferencia de reasignarMovimientosDeMarca (utilidadesColeccionGenerica.js,
// pensada para FUSIONAR dos marcas duplicadas — mueve TODO el histórico de
// una marca a otra y se usa para limpiar catálogo), esta función es más
// quirúrgica: mueve solo los movimientos de una marca concreta EN UNOS MESES
// concretos de UN distribuidor concreto — así no toca los movimientos de esa
// misma marca que sí estén bien (p.ej. "PALOMO COJO 3L" es un producto real
// que también se vende de verdad, solo hay que sacarle las unidades que en
// realidad pertenecen a otro producto). Mismo patrón "borrar + crear" que
// corregirAnioMovimientos.
export const reasignarMarcaSellOutClientesPorMeses = async (idUsuario, idDistribuidor, idMarcaAntigua, idMarcaNueva, nombreMarcaNueva, mesesAno) => {
  const col = collection(db, "movimientosSellOutClientes");
  const q = query(col,
    where("id_usuario", "==", idUsuario),
    where("id_distribuidor", "==", idDistribuidor),
    where("id_marca", "==", idMarcaAntigua)
  );
  const snapshot = await getDocs(q);
  const setMeses = new Set(mesesAno);
  const aCorregir = snapshot.docs.filter(d => setMeses.has(d.data().mes_ano));

  if (aCorregir.length === 0) return 0;

  for (const grupo of chunkArray(aCorregir, CHUNK_SIZE_CORRECCION)) {
    const batch = writeBatch(db);
    grupo.forEach(d => {
      const datosOriginales = d.data();
      batch.set(doc(col), { ...datosOriginales, id_marca: idMarcaNueva, nombre_marca: nombreMarcaNueva });
      batch.delete(d.ref);
    });
    await batch.commit();
  }
  // Los movimientos corregidos son documentos NUEVOS (patrón "borrar + crear"):
  // la lista cacheada tiene los viejos, con la marca equivocada.
  invalidarPorPrefijo(claveMovimientosSellOutClientes(idUsuario, idDistribuidor));
  return aCorregir.length;
};

// --- 21j. BORRAR (a la papelera, recuperable) TODOS LOS DATOS DE SELL-OUT
// POR CLIENTE FINAL DE UN DISTRIBUIDOR CONCRETO (a petición de Sergio,
// 2026-07-18: quería poder limpiar los datos de un distribuidor sin tener
// que ir mes a mes) — mismo mecanismo de "borrado suave" que el resto de la
// app (ver auditoria.js): marca `eliminado: true` en vez de borrar de verdad,
// así se puede recuperar desde Papelera si fue un error. Se usa desde
// DashboardSellOutClientes.js.
const marcarComoEliminadoPorLotes = async (collectionName, docs, actor) => {
  if (docs.length === 0) return 0;
  const ahora = new Date().toISOString();
  for (const grupo of chunkArray(docs, CHUNK_SIZE)) {
    const batch = writeBatch(db);
    grupo.forEach((d) => {
      batch.set(d.ref, { eliminado: true, eliminado_en: ahora, eliminado_por: actor?.uid || null }, { merge: true });
    });
    await batch.commit();
  }
  return docs.length;
};

export const resetSellOutClientesPorDistribuidor = async (idUsuario, idDistribuidor, actor) => {
  const colMovimientos = collection(db, "movimientosSellOutClientes");
  const qMovimientos = query(colMovimientos, where("id_usuario", "==", idUsuario), where("id_distribuidor", "==", idDistribuidor));
  const snapMovimientos = await getDocs(qMovimientos);

  const colClientes = collection(db, "clientesSellOut");
  const qClientes = query(colClientes, where("id_usuario", "==", idUsuario), where("id_distribuidor", "==", idDistribuidor));
  const snapClientes = await getDocs(qClientes);

  const movimientos = await marcarComoEliminadoPorLotes("movimientosSellOutClientes", snapMovimientos.docs, actor);
  const clientes = await marcarComoEliminadoPorLotes("clientesSellOut", snapClientes.docs, actor);

  // Ambas colecciones de este distribuidor concreto quedan vacías de cara a
  // las lecturas normales (que excluyen `eliminado === true`).
  invalidarPorPrefijo(claveMovimientosSellOutClientes(idUsuario, idDistribuidor));
  invalidarPorPrefijo(claveClientesSellOut(idUsuario, idDistribuidor));

  if (movimientos > 0 || clientes > 0) {
    await registrarAuditoria({
      idUsuario,
      actorUid: actor?.uid,
      actorEmail: actor?.email,
      accion: 'reset_historico',
      coleccion: 'movimientosSellOutClientes+clientesSellOut',
      idDocumento: idDistribuidor,
      resumen: `Borrado de Sell-Out por Cliente Final de un distribuidor: ${movimientos} movimiento(s) y ${clientes} cliente(s) movidos a la papelera.`
    });
  }

  return { movimientos, clientes };
};

// --- 21k. BORRAR (a la papelera, recuperable) TODOS LOS DATOS DE SELL-OUT
// POR CLIENTE FINAL DE **TODOS** LOS DISTRIBUIDORES DEL USUARIO (a petición
// de Sergio, 2026-07-18: mismo botón que Mantenimiento.js pero para este
// módulo). Reutiliza deleteCollectionForUser (mantenimiento.js, borrado suave
// genérico) — ya filtra por id_usuario y ya audita. ---
export const resetSellOutClientesTodo = async (idUsuario, actor) => {
  const movimientos = await deleteCollectionForUser('movimientosSellOutClientes', idUsuario, actor);
  const clientes = await deleteCollectionForUser('clientesSellOut', idUsuario, actor);
  // Aquí no hay un distribuidor concreto: se borra TODO lo del usuario, así
  // que se invalida el prefijo entero (todos sus distribuidores).
  invalidarPorPrefijo(prefijoMovimientosSellOutClientes(idUsuario));
  invalidarPorPrefijo(prefijoClientesSellOut(idUsuario));
  return { movimientos, clientes };
};

// --- 21g. LECTURA DE ALIAS PRODUCTO->MARCA GUARDADOS DE IMPORTACIONES
// ANTERIORES DE UN DISTRIBUIDOR (memoria de reconciliación) ---
// A petición de Sergio: al reimportar un periodo nuevo del MISMO distribuidor
// había que volver a decidir a mano, producto por producto, a qué Marca
// corresponde cada uno — el match por nombre exacto o por parecido (>=85%)
// contra el catálogo global de Marcas no es suficiente porque cada
// distribuidor escribe el mismo producto con su propio texto (a veces sin
// ningún parecido). Por eso, cada vez que se confirma una importación se
// guarda, para cada producto EXACTO tal como viene en el archivo (texto
// normalizado), a qué Marca se decidió que corresponde — tanto si se creó
// nueva como si se usó una ya existente — y la SIGUIENTE importación del
// MISMO distribuidor lo reconoce automáticamente sin repetir la decisión.
export const getAliasProductosSellOutPorDistribuidor = async (idUsuario, idDistribuidor) => {
  const col = collection(db, "aliasProductosSellOut");
  const q = query(col, where("id_usuario", "==", idUsuario), where("id_distribuidor", "==", idDistribuidor));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// --- 21h. GUARDAR (o CORREGIR) LOS ALIAS PRODUCTO->MARCA DE UN DISTRIBUIDOR ---
// Recibe la lista completa de decisiones de la importación que se acaba de
// confirmar: [{ producto_normalizado, id_marca, nombre_marca }, ...]. Por
// cada producto, si ya había un alias guardado de una importación anterior
// se borra primero (mismo patrón "borrar + crear" que saveTipologiaMarca —
// nunca updateDoc) y se crea el nuevo con la decisión actual; los alias de
// productos que NO aparecen en este archivo se dejan tal cual (no se tocan,
// siguen siendo válidos por si ese producto reaparece en un periodo futuro).
export const saveAliasProductosSellOut = async (idUsuario, idDistribuidor, entradas) => {
  if (!entradas || entradas.length === 0) return true;
  console.log(`firebaseApi: Guardando ${entradas.length} alias de producto->marca de Sell-Out (batch)...`);
  const col = collection(db, "aliasProductosSellOut");

  const existentes = await getAliasProductosSellOutPorDistribuidor(idUsuario, idDistribuidor);
  const mapaExistentes = new Map(existentes.map(a => [a.producto_normalizado, a]));

  const aBorrar = entradas.map(e => mapaExistentes.get(e.producto_normalizado)).filter(Boolean);
  for (const grupo of chunkArray(aBorrar, CHUNK_SIZE)) {
    const batch = writeBatch(db);
    grupo.forEach(a => batch.delete(doc(col, a.id)));
    await batch.commit();
  }

  const documentos = entradas.map(e => ({
    id_usuario: idUsuario,
    id_distribuidor: idDistribuidor,
    producto_normalizado: e.producto_normalizado,
    id_marca: e.id_marca,
    nombre_marca: e.nombre_marca
  }));
  for (const grupo of chunkArray(documentos, CHUNK_SIZE)) {
    const batch = writeBatch(db);
    grupo.forEach(docData => batch.set(doc(col), docData));
    await batch.commit();
  }
  console.log("Guardado de alias producto->marca completado.");
  return true;
};
