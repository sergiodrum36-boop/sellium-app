/*
 * firebaseApi/clasificacionComercial.js
 * Estructura Comercial, en el sentido real de Sergio (26/07/2026, ver
 * PantallaClasificacionComercial.js y clasificacionComercial.js): criterios
 * de clasificación de distribuidores (A-E, editables) + cartera comercial
 * <-> distribuidor — colecciones "criteriosComercial" y "asignacionesComercial".
 *
 * Mismo patrón privado-por-usuario que el resto de maestros (ver
 * firestore.rules), sin `allow update`.
 *
 * "asignacionesComercial" tiene una regla propia: solo puede haber UNA
 * asignación activa por (id_usuario, id_distribuidor) a la vez (un
 * distribuidor pertenece a la cartera de un único comercial — confirmado
 * con Sergio, el caso de un distribuidor en dos hojas de su Excel era una
 * excepción de la propia hoja, no la norma). `guardarAsignacionComercial`
 * impone esto borrando cualquier asignación previa de ese distribuidor
 * antes de crear la nueva — así que tanto "asignar por primera vez" como
 * "reasignar a otro comercial" o "cambiar su clasificación/observaciones"
 * son la MISMA llamada, sin que la pantalla tenga que gestionar el id del
 * documento anterior.
 */

import { collection, query, where, getDocs, doc, addDoc, updateDoc, writeBatch } from "firebase/firestore";
import { db, conFiltroUsuario, chunkArray, CHUNK_SIZE } from './comun';

// --- CRITERIOS DE CLASIFICACIÓN (A-E, editables) ---
export const getCriteriosComercialPorUsuario = async (idUsuario) => {
  const col = collection(db, "criteriosComercial");
  const q = conFiltroUsuario(col, idUsuario);
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const saveNuevoCriterioComercial = async (data) => {
  console.log("firebaseApi: Guardando nuevo criterio de clasificación...");
  const col = collection(db, "criteriosComercial");
  const docRef = await addDoc(col, data);
  return docRef.id;
};

// Edición IN-PLACE (updateDoc real, no borrar+crear) de un criterio ya
// existente — ver el porqué en firestore.rules (esSoloCamposEditablesCriterio):
// un criterio SÍ está referenciado por id desde asignacionesComercial, así
// que borrar+recrear dejaría "sin clasificar" a cualquier distribuidor que
// ya lo tuviera asignado. Las reglas rechazan cualquier campo que no sea de
// contenido (nunca se puede tocar id_usuario desde aquí).
export const actualizarCriterioComercial = async (docId, cambios) => {
  console.log(`firebaseApi: Actualizando criterio de clasificación ${docId}...`);
  const ref = doc(db, "criteriosComercial", docId);
  await updateDoc(ref, cambios);
  return true;
};

// Los 5 criterios que Sergio ya usaba en su Excel "SD Estructura Comercial
// 2025.xlsx" (pestaña "Criterios") — punto de partida, no un límite: se
// pueden añadir/editar más desde la pantalla (Sergio pidió que fueran
// editables, no fijos en el código).
//
// `porcentaje_trimestre` (2º ajuste del generador, 26/07/2026 — ver
// planificacionComercial.js): sustituye a `frecuencia_dias` como base del
// cálculo de visitas. Es el % de los días laborables del trimestre que le
// corresponde a ESE criterio dentro de la cartera de un comercial —
// compartido entre TODOS los distribuidores que tengan ese criterio (más
// distribuidores en el mismo criterio no significa más días totales, solo
// un reparto más fino entre ellos, según su peso de facturación). Valores
// de partida orientativos, pensados para sumar sobre el 100% del tiempo
// disponible sin agotarlo del todo: A=40%, B=25%, C=15%, D=10%, E=5%.
// `frecuencia_dias` se conserva sin usar (dato legacy, primer intento de
// este mismo cálculo que no tenía en cuenta cuántos distribuidores
// comparten un criterio — ver nota en firestore.rules).
export const CRITERIOS_POR_DEFECTO = [
  { codigo: 'A', nombre: 'Distribuidor Estratégico', descripcion: 'Visita mínima de 2-3 días cada 20 días', frecuencia_dias: 20, porcentaje_trimestre: 40, sin_visita: false },
  { codigo: 'B', nombre: 'Distribuidor Importante', descripcion: 'Visita mínima de 2-3 días cada 40 días', frecuencia_dias: 40, porcentaje_trimestre: 25, sin_visita: false },
  { codigo: 'C', nombre: 'Distribuidor Básico', descripcion: 'Visita mínima de 2 días cada dos meses', frecuencia_dias: 60, porcentaje_trimestre: 15, sin_visita: false },
  { codigo: 'D', nombre: 'Distribuidor Importante (venta temporal)', descripcion: 'Visitas estratégicas 2-3 veces/año de 2-4 días', frecuencia_dias: 150, porcentaje_trimestre: 10, sin_visita: false },
  { codigo: 'E', nombre: 'Distribuidor a cambiar / prospectar zona', descripcion: 'Mínimo 1 día al trimestre por zona', frecuencia_dias: 90, porcentaje_trimestre: 5, sin_visita: false },
];

// Alta en bloque de los 5 criterios por defecto — botón "Cargar criterios
// por defecto" en la pantalla, pensado para el primer uso (solo tiene
// sentido ofrecerlo si el usuario todavía no tiene ninguno).
export const seedCriteriosComercialPorDefecto = async (idUsuario) => {
  const col = collection(db, "criteriosComercial");
  const batch = writeBatch(db);
  CRITERIOS_POR_DEFECTO.forEach((c, i) => {
    batch.set(doc(col), { id_usuario: idUsuario, ...c, orden: i });
  });
  await batch.commit();
  return true;
};

// --- CARTERA COMERCIAL (asignación distribuidor <-> comercial) ---
export const getAsignacionesComercialPorUsuario = async (idUsuario) => {
  const col = collection(db, "asignacionesComercial");
  const q = conFiltroUsuario(col, idUsuario);
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const guardarAsignacionComercial = async (idUsuario, idDistribuidor, datos) => {
  const col = collection(db, "asignacionesComercial");
  const q = query(col, where("id_usuario", "==", idUsuario), where("id_distribuidor", "==", idDistribuidor));
  const snapshotExistente = await getDocs(q);
  if (!snapshotExistente.empty) {
    const batch = writeBatch(db);
    snapshotExistente.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
  const docRef = await addDoc(col, {
    id_usuario: idUsuario,
    id_distribuidor: idDistribuidor,
    id_comercial: datos.id_comercial || '',
    id_criterio: datos.id_criterio || '',
    observaciones: datos.observaciones || '',
    plan_de_accion: datos.plan_de_accion || '',
  });
  return docRef.id;
};

// Asigna EN BLOQUE varios distribuidores sin cartera al mismo comercial de
// una sola vez (a petición de Sergio: "los distribuidores que están
// actualmente todos me pertenecen a mí" — asignarlos uno a uno con el botón
// normal era muy repetitivo). A diferencia de guardarAsignacionComercial,
// aquí se asume que NINGUNO de los distribuidores recibidos tiene ya una
// asignación previa (es justo el listado de "sin asignar" de la pantalla),
// así que no hace falta borrar nada antes de crear — solo altas nuevas.
export const asignarComercialABloque = async (idUsuario, idsDistribuidores, idComercial) => {
  const col = collection(db, "asignacionesComercial");
  for (const grupo of chunkArray(idsDistribuidores, CHUNK_SIZE)) {
    const batch = writeBatch(db);
    grupo.forEach((idDistribuidor) => {
      batch.set(doc(col), {
        id_usuario: idUsuario,
        id_distribuidor: idDistribuidor,
        id_comercial: idComercial,
        id_criterio: '',
        observaciones: '',
        plan_de_accion: '',
      });
    });
    await batch.commit();
  }
  return idsDistribuidores.length;
};
