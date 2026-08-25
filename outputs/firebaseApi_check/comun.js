/*
 * firebaseApi/comun.js
 * Utilidades compartidas INTERNAMENTE entre los módulos de firebaseApi/
 * (no todo lo de aquí se reexporta desde el barrel ./firebaseApi.js —
 * solo TODOS_LOS_USUARIOS lo hace, porque lo usa App.js directamente).
 */

import { db } from '../firebaseConfig';
import { query, where } from "firebase/firestore";

export { db };

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
export const conFiltroUsuario = (colRef, idUsuario) =>
  idUsuario === TODOS_LOS_USUARIOS ? colRef : query(colRef, where("id_usuario", "==", idUsuario));

// --- Utilidad interna: Firestore permite máx. 500 operaciones por batch.
//     Nos quedamos en 400 por margen de seguridad y hacemos varios batches
//     si hace falta, en paralelo.
export const CHUNK_SIZE = 400;
// Para las correcciones "borrar + recrear" cada documento cuenta como 2
// operaciones de batch (un set + un delete), así que usamos un lote más
// pequeño para no pasarnos del límite de 500 operaciones de Firestore.
export const CHUNK_SIZE_CORRECCION = 200;
export const chunkArray = (arr, size) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
};
