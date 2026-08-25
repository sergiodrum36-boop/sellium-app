/*
 * firebaseApi/mapeoImportacion.js
 * Memoria de reconciliación del Importador de Ventas Reales — colección
 * "mapeoImportacion".
 *
 * --- 19. MEMORIA DE RECONCILIACIÓN DEL IMPORTADOR DE VENTAS REALES ---
 * Recuerda, por usuario, qué decisión se tomó la primera vez para cada
 * nombre de Distribuidor/Subfamilia tal y como viene escrito en el Excel de
 * QlikSense (p.ej. "EXCLUSIVAS DYEXCO S.L." -> usar el distribuidor ya
 * existente con id X). Así, en la importación del mes siguiente, el
 * importador no vuelve a preguntar por nombres ya resueltos anteriormente.
 * Como las reglas de Firestore no permiten "update", para "cambiar" una
 * decisión ya guardada se borra el documento antiguo de esa clave y se crea
 * uno nuevo (mismo patrón que el resto de correcciones de esta app).
 */

import { collection, query, where, getDocs, addDoc, writeBatch } from "firebase/firestore";
import { db, conFiltroUsuario } from './comun';

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
