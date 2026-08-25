/*
 * firebaseApi/planificacionComercial.js
 * Planificación Comercial (calendario de visitas trimestral) — colección
 * "visitasComerciales", ver planificacionComercial.js (lógica pura del
 * generador) y firestore.rules para el porqué de cada regla.
 *
 * Patrón privado-por-usuario estándar, sin `allow update` (a diferencia de
 * criteriosComercial): "cerrar" una visita (fecha real, hecha/pendiente,
 * nota), moverla de día o confirmarla/desconfirmarla son TODO borrar+crear,
 * igual que el resto de correcciones del proyecto — aquí es seguro porque
 * ninguna otra colección referencia una visita por id.
 *
 * Las fechas se guardan como string "YYYY-MM-DD" (fecha pura, sin hora ni
 * zona horaria), igual que mes_ano en el histórico Sell-In/Sell-Out — nunca
 * como Timestamp de Firestore.
 *
 * CAMBIO (calendario visual, a petición de Sergio 26/07/2026: "se supone
 * que tendria que generarse un calendario visual... despues tendria que
 * haber una opcion para mover, borrar o editar... y una vez confirmado, se
 * deberia exportar a la agenda del proyecto"): las visitas ganan un campo
 * `confirmada` (bool, false por defecto). "Confirmar" una visita NO la mueve
 * a otra colección — la Agenda Comercial (ver PantallaAgendaComercial.js) es
 * simplemente esta misma colección `visitasComerciales` filtrada por
 * `confirmada == true`, sin límite de año/trimestre. Así una visita movida o
 * cerrada después de confirmada sigue siendo la misma pieza de dato, sin
 * duplicar información entre dos colecciones.
 *
 * CAMBIO 2 (mismo día, "necesito que cada distribuidor se agrege por semana
 * en dias seguidos y que pueda seleccionarlo todo por si lo tengo que mover
 * de una semana a la otra"): cada visita ahora lleva `id_bloque` (agrupa los
 * días consecutivos de un mismo distribuidor generados juntos — ver
 * planificacionComercial.js), `dia_bloque` y `longitud_bloque`. Estos 3
 * campos viajan con la visita en TODAS las acciones borrar+crear de abajo
 * (datosBase los conserva), para que un bloque siga siendo reconocible como
 * tal aunque se cierre o confirme una de sus visitas. `moverBloqueVisitas`
 * es la única acción nueva: desplaza TODAS las visitas de un mismo bloque el
 * mismo número de días de golpe (arrastrar cualquier día del bloque en el
 * calendario mueve el bloque entero — ver CalendarioVisitas.js).
 *
 * CAMBIO 3 (mismo día, Agenda Comercial): Sergio pidió planificar en la
 * Agenda INDEPENDIENTEMENTE del generador automático de Planificación
 * Comercial — "poder seleccionar el distribuidor y ponerle los días que yo
 * seleccione". `agregarVisitasManualesAgenda` es la única función nueva:
 * crea 1-N visitas SEGUIDAS directamente ya confirmadas (`confirmada: true`
 * desde el alta — "cada vez que ponga un día a un distribuidor en la agenda
 * contará como realizada", Sergio) para un distribuidor/comercial concreto.
 * A partir de ahí son visitasComerciales normales y corrientes: se mueven,
 * cierran o borran con las mismas funciones de arriba — nada las distingue
 * de una visita generada automáticamente salvo cómo nacieron.
 *
 * CAMBIO 4 (mismo día, inspirado en capturas de otro CRM que enseñó Sergio):
 * cada visita gana `medio` y `objetivo` (texto plano, ver
 * firebaseApi/catalogosAgenda.js — el catálogo editable de opciones). Se
 * pueden fijar al crear la visita a mano en la Agenda, o rellenar/cambiar
 * después desde el panel de "cerrar visita" — en AMBOS casos (manuales y
 * generadas automáticamente), confirmado con Sergio. Viajan con la visita en
 * todas las acciones borrar+crear de abajo, igual que id_bloque.
 *
 * CAMBIO 5 (mismo día, Sergio: "hay que añadir un apartado al lado de la
 * casilla Distribuidor para poder añadir otras selecciones que no tienen
 * nada que ver con el trabajo con los distribuidores: trabajo
 * administrativo, vacaciones, asuntos propios, reunión comercial,
 * prospección"): `id_distribuidor`/`id_comercial`/`id_criterio` pasan a ser
 * OPCIONALES — una visita puede en su lugar llevar `actividad` (texto plano,
 * igual que medio/objetivo, ver firebaseApi/actividadesAgenda.js, catálogo
 * GLOBAL solo editable por un manager). `agregarVisitasManualesAgenda` ahora
 * recibe una lista de `entradas` (cada una un distribuidor O una actividad,
 * confirmado con Sergio: "todo es compatible, puede ver a dos o tres
 * distribuidores en un día") en vez de una sola — crea una visita por cada
 * entrada, todas para los mismos días/medio/objetivo.
 */

import { collection, query, where, getDocs, doc, writeBatch } from "firebase/firestore";
import { db, conFiltroUsuario, chunkArray, CHUNK_SIZE, CHUNK_SIZE_CORRECCION } from './comun';

const aFechaTexto = (fecha) => (fecha instanceof Date ? fecha.toISOString().slice(0, 10) : fecha);

// Reconstruye el documento completo de una visita a partir del objeto que ya
// tenía la pantalla (id incluido) más los campos que cambian en esta acción
// concreta — evita repetir la lista completa de campos en cada función de
// abajo (mover/cerrar/confirmar todas tocan solo 1-3 campos, el resto se
// conserva tal cual).
const datosBase = (visita) => ({
  id_usuario: visita.id_usuario,
  anio: visita.anio,
  trimestre: visita.trimestre,
  id_comercial: visita.id_comercial || '',
  id_distribuidor: visita.id_distribuidor || '',
  id_criterio: visita.id_criterio || '',
  numero_visita: visita.numero_visita,
  id_bloque: visita.id_bloque || '',
  dia_bloque: visita.dia_bloque || 1,
  longitud_bloque: visita.longitud_bloque || 1,
  fecha_prevista: visita.fecha_prevista,
  estado: visita.estado || 'pendiente',
  fecha_real: visita.fecha_real || '',
  nota: visita.nota || '',
  medio: visita.medio || '',
  objetivo: visita.objetivo || '',
  // "Otra actividad" (Trabajo administrativo, Vacaciones...) — texto plano,
  // igual que medio/objetivo; solo aplica cuando id_distribuidor va vacío
  // (ver CAMBIO 5 en la cabecera).
  actividad: visita.actividad || '',
  confirmada: !!visita.confirmada,
});

export const getVisitasComercialPorTrimestre = async (idUsuario, anio, trimestre) => {
  const col = collection(db, "visitasComerciales");
  const base = conFiltroUsuario(col, idUsuario);
  const q = query(base, where("anio", "==", Number(anio)), where("trimestre", "==", Number(trimestre)));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
};

// Todas las visitas confirmadas de un usuario, sin filtro de año/trimestre
// — esto ES la "Agenda Comercial" (ver cabecera del archivo).
export const getVisitasConfirmadasPorUsuario = async (idUsuario) => {
  const col = collection(db, "visitasComerciales");
  const base = conFiltroUsuario(col, idUsuario);
  const q = query(base, where("confirmada", "==", true));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
};

// Sustituye TODO el calendario propuesto de un trimestre por uno nuevo
// (botón "generar calendario" de la pantalla): borra las visitas de ese
// año/trimestre que todavía estén "pendiente" (una visita ya "hecha" no se
// toca, aunque se regenere el resto — no tiene sentido borrar una visita
// que ya ocurrió de verdad) y crea las nuevas en su lugar.
export const guardarVisitasGeneradas = async (idUsuario, anio, trimestre, visitas) => {
  const col = collection(db, "visitasComerciales");
  const qExistentes = query(
    col,
    where("id_usuario", "==", idUsuario),
    where("anio", "==", Number(anio)),
    where("trimestre", "==", Number(trimestre)),
    where("estado", "==", "pendiente")
  );
  const snapshotExistentes = await getDocs(qExistentes);
  for (const grupo of chunkArray(snapshotExistentes.docs, CHUNK_SIZE_CORRECCION)) {
    const batch = writeBatch(db);
    grupo.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  for (const grupo of chunkArray(visitas, CHUNK_SIZE)) {
    const batch = writeBatch(db);
    grupo.forEach((v) => {
      batch.set(doc(col), {
        id_usuario: idUsuario,
        anio: Number(anio),
        trimestre: Number(trimestre),
        id_comercial: v.id_comercial,
        id_distribuidor: v.id_distribuidor,
        id_criterio: v.id_criterio,
        numero_visita: v.numero_visita,
        id_bloque: v.id_bloque || '',
        dia_bloque: v.dia_bloque || 1,
        longitud_bloque: v.longitud_bloque || 1,
        fecha_prevista: aFechaTexto(v.fecha),
        estado: 'pendiente',
        fecha_real: '',
        nota: '',
        medio: '',
        objetivo: '',
        actividad: '',
        confirmada: false,
      });
    });
    await batch.commit();
  }
  return visitas.length;
};

// "Cerrar" una visita: fecha real de la visita, hecha/pendiente y una nota
// breve de resultado (los 3 campos que Sergio pidió, ver AskUserQuestion
// 26/07/2026) — borra el documento anterior y crea uno nuevo con los mismos
// datos de planificación + los datos de cierre.
export const cerrarVisita = async (idUsuario, visita, datosCierre) => {
  const col = collection(db, "visitasComerciales");
  const batch = writeBatch(db);
  batch.delete(doc(db, "visitasComerciales", visita.id));
  batch.set(doc(col), {
    ...datosBase({ ...visita, id_usuario: idUsuario }),
    estado: datosCierre.estado || 'pendiente',
    fecha_real: datosCierre.fecha_real || '',
    nota: datosCierre.nota || '',
    medio: datosCierre.medio || '',
    objetivo: datosCierre.objetivo || '',
  });
  await batch.commit();
  return true;
};

// Mover una visita a otro día (arrastrar en el calendario) — solo cambia
// fecha_prevista, todo lo demás se conserva (incluida `confirmada`: mover
// una visita ya confirmada no la desconfirma).
export const moverVisita = async (idUsuario, visita, nuevaFechaPrevista) => {
  const col = collection(db, "visitasComerciales");
  const batch = writeBatch(db);
  batch.delete(doc(db, "visitasComerciales", visita.id));
  batch.set(doc(col), {
    ...datosBase({ ...visita, id_usuario: idUsuario }),
    fecha_prevista: aFechaTexto(nuevaFechaPrevista),
  });
  await batch.commit();
  return true;
};

// Mover TODAS las visitas de un mismo bloque (días consecutivos de un
// distribuidor, ver id_bloque) el mismo número de días de golpe — a
// petición de Sergio: "que pueda seleccionarlo todo por si lo tengo que
// mover de una semana a la otra". `deltaDias` lo calcula CalendarioVisitas.js
// a partir de dónde se soltó el día arrastrado, redondeado a semanas
// completas (múltiplos de 7) para que el bloque siga cayendo en los mismos
// días laborables sin necesidad de volver a comprobar fines de semana aquí.
export const moverBloqueVisitas = async (idUsuario, visitasDelBloque, deltaDias) => {
  for (const grupo of chunkArray(visitasDelBloque, CHUNK_SIZE_CORRECCION)) {
    const batch = writeBatch(db);
    grupo.forEach((visita) => {
      const fechaNueva = new Date(`${visita.fecha_prevista}T00:00:00Z`);
      fechaNueva.setUTCDate(fechaNueva.getUTCDate() + deltaDias);
      batch.delete(doc(db, "visitasComerciales", visita.id));
      batch.set(doc(collection(db, "visitasComerciales")), {
        ...datosBase({ ...visita, id_usuario: idUsuario }),
        fecha_prevista: aFechaTexto(fechaNueva),
      });
    });
    await batch.commit();
  }
  return visitasDelBloque.length;
};

// Alta manual de 1-N visitas SEGUIDAS directamente en la Agenda Comercial,
// sin pasar por el generador automático de Planificación Comercial — ver
// CAMBIO 3 en la cabecera. `entradas` = array de 1-N objetos, cada uno O bien
// un distribuidor `{ id_comercial, id_distribuidor, id_criterio }` O bien una
// "otra actividad" `{ actividad }` (ver CAMBIO 5) — nunca los dos campos
// vacíos a la vez, eso lo valida quien llama (CalendarioVisitas.js). `dias` =
// array de Date ya calculado con generarDiasHabilesConsecutivosDesde
// (planificacionComercial.js), compartido por TODAS las entradas. `comunes`
// = { medio, objetivo }, igual para todas las visitas creadas en esta
// llamada. anio/trimestre se calculan a partir de la fecha real de cada día
// (no del selector de la pantalla), para que la visita quede bien etiquetada
// aunque el bloque cruce de un trimestre a otro. Dentro de una misma
// entrada, todos sus días comparten `id_bloque` si son más de uno, igual que
// las generadas automáticamente — cada entrada tiene su propio id_bloque
// (así, si eliges 2 distribuidores + 1 actividad para 3 días seguidos, se
// crean 3 bloques independientes de 3 días cada uno, movibles por separado).
export const agregarVisitasManualesAgenda = async (idUsuario, entradas, dias, comunes = {}) => {
  const col = collection(db, "visitasComerciales");
  const timestampBase = Date.now();
  const batch = writeBatch(db);
  entradas.forEach((entrada, idxEntrada) => {
    const clave = entrada.id_distribuidor || entrada.actividad || 'entrada';
    const idBloque = dias.length > 1 ? `${clave}_manual_${timestampBase}_${idxEntrada}` : '';
    dias.forEach((fecha, i) => {
      const anio = fecha.getUTCFullYear();
      const trimestre = Math.floor(fecha.getUTCMonth() / 3) + 1;
      batch.set(doc(col), {
        id_usuario: idUsuario,
        anio,
        trimestre,
        id_comercial: entrada.id_comercial || '',
        id_distribuidor: entrada.id_distribuidor || '',
        id_criterio: entrada.id_criterio || '',
        actividad: entrada.actividad || '',
        numero_visita: i + 1,
        id_bloque: idBloque,
        dia_bloque: i + 1,
        longitud_bloque: dias.length,
        fecha_prevista: aFechaTexto(fecha),
        estado: 'pendiente',
        fecha_real: '',
        nota: '',
        medio: comunes.medio || '',
        objetivo: comunes.objetivo || '',
        confirmada: true,
      });
    });
  });
  await batch.commit();
  return entradas.length * dias.length;
};

// Confirmar (o quitar de) la Agenda Comercial — ver cabecera del archivo.
export const confirmarVisita = async (idUsuario, visita, confirmada) => {
  const col = collection(db, "visitasComerciales");
  const batch = writeBatch(db);
  batch.delete(doc(db, "visitasComerciales", visita.id));
  batch.set(doc(col), {
    ...datosBase({ ...visita, id_usuario: idUsuario }),
    confirmada: !!confirmada,
  });
  await batch.commit();
  return true;
};

// Confirmar en bloque (botón "Confirmar todas las pendientes de este
// trimestre" de Planificación Comercial) — mismo espíritu que
// asignarComercialABloque en clasificacionComercial.js: evita tener que
// confirmar visita a visita cuando son decenas.
export const confirmarVisitasEnBloque = async (idUsuario, visitas) => {
  for (const grupo of chunkArray(visitas, CHUNK_SIZE_CORRECCION)) {
    const batch = writeBatch(db);
    grupo.forEach((visita) => {
      const col = collection(db, "visitasComerciales");
      batch.delete(doc(db, "visitasComerciales", visita.id));
      batch.set(doc(col), { ...datosBase({ ...visita, id_usuario: idUsuario }), confirmada: true });
    });
    await batch.commit();
  }
  return visitas.length;
};
