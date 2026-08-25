/*
 * firebaseApi/acuerdosClientes.js
 * "Acuerdos con Clientes" — colección "acuerdosClientes" (27/07/2026,
 * SEGUNDA pieza de "Acuerdos con clientes/distribuidores", después de
 * "Rapel Distribuidores" — ver rapelDistribuidores.js para la primera).
 *
 * A petición de Sergio, a partir de 6 propuestas de acuerdo reales (RTE
 * Malquerida, RTE Noema, Chiringuito Las Dunas, La Plaza Aguamarga, RTE
 * Casablanca, Chiringuito La Mamola) que compartió como ejemplo: cada
 * acuerdo fija, para UN cliente final concreto y durante un periodo de
 * vigencia, un volumen de botellas objetivo (compartido entre TODAS las
 * referencias del acuerdo, se suman) a cambio de mejores condiciones.
 *
 * Un documento por acuerdo. Mismo patrón que el resto de "maestros" de la
 * app (distribuidores, zonas, comerciales, configuracionRapelDistribuidores):
 * privado por usuario, sin `allow update` — corregir un acuerdo ya guardado
 * es "borrar el documento existente + crear uno nuevo" (ver
 * editarAcuerdoCliente más abajo), nunca updateDoc.
 *
 * Vínculo con el resto de la app: `id_cliente` (opcional) apunta al id de un
 * documento de `clientesSellOut` — si está presente, PantallaAcuerdosClientes
 * puede cruzar el consumo real (`movimientosSellOutClientes`, ver
 * seguimientoAcuerdos.js) para calcular cuántas botellas lleva consumidas el
 * cliente durante la vigencia del acuerdo, contra las pactadas. Si el
 * cliente es nuevo y aún no tiene histórico importado, `id_cliente` puede
 * quedar vacío (se sigue pudiendo dar de alta el acuerdo, simplemente sin
 * seguimiento automático hasta que el cliente aparezca en una importación).
 *
 * Estructura de cada documento — `datos` recibido tal cual desde
 * PantallaAcuerdosClientes.js:
 *   {
 *     numero, id_cliente, nombre_cliente, tipo_negocio, id_distribuidor,
 *     localidad, direccion, responsable_negocio, telefono_contacto, nif,
 *     fecha_propuesta, vigencia_inicio, vigencia_fin,
 *     volumen_objetivo_botellas,
 *     referencias: [{ id_marca, nombre_marca, formato, pvp_iva,
 *       tipo_condicion: 'descuento' | 'promocion_cajas',
 *       descuento_pct, promocion_texto, pvp_neto }],
 *     aportaciones: [{ tipo: 'rapel_volumen' | 'aportacion_fija_botella' |
 *       'valor_añadido', descripcion }],
 *     acciones_exposicion, observaciones
 *   }
 * Los 5 "tipos" de aportación que Sergio identificó en sus ejemplos reales
 * quedan cubiertos así: descuento simple/combinado y promoción de cajas
 * (X+Y) viven DENTRO de cada referencia (son la condición base de compra de
 * esa marca); rapel por volumen superado, aportación fija €/botella
 * escalonada y valor añadido (cesión de cava/vinoteca, copas personalizadas)
 * son beneficios A NIVEL DE ACUERDO (no de una marca en concreto) y viven en
 * `aportaciones`.
 */

import { collection, query, where, getDocs, doc, addDoc, deleteDoc } from "firebase/firestore";
import { db } from './comun';

const COLECCION = "acuerdosClientes";

// Todos los acuerdos de un usuario (todas las cuentas, todos los clientes) —
// la pantalla filtra en memoria por distribuidor/estado/vigencia, igual que
// Avisos de Consumo hace con los movimientos.
export const getAcuerdosClientesPorUsuario = async (idUsuario) => {
  const col = collection(db, COLECCION);
  const q = query(col, where("id_usuario", "==", idUsuario));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
};

// Da de alta un acuerdo nuevo.
export const crearAcuerdoCliente = async (idUsuario, datos, actor) => {
  const col = collection(db, COLECCION);
  const nuevoDoc = await addDoc(col, {
    id_usuario: idUsuario,
    numero: datos?.numero || '',
    id_cliente: datos?.id_cliente || null,
    nombre_cliente: datos?.nombre_cliente || '',
    tipo_negocio: datos?.tipo_negocio || '',
    id_distribuidor: datos?.id_distribuidor || '',
    localidad: datos?.localidad || '',
    direccion: datos?.direccion || '',
    responsable_negocio: datos?.responsable_negocio || '',
    telefono_contacto: datos?.telefono_contacto || '',
    nif: datos?.nif || '',
    fecha_propuesta: datos?.fecha_propuesta || '',
    vigencia_inicio: datos?.vigencia_inicio || '',
    vigencia_fin: datos?.vigencia_fin || '',
    volumen_objetivo_botellas: Number(datos?.volumen_objetivo_botellas) || 0,
    referencias: datos?.referencias || [],
    aportaciones: datos?.aportaciones || [],
    acciones_exposicion: datos?.acciones_exposicion || '',
    observaciones: datos?.observaciones || '',
    creado_en: new Date().toISOString(),
    actor_uid: actor?.uid || null,
    actor_email: actor?.email || null,
  });
  return nuevoDoc.id;
};

// Borra un acuerdo (sin papelera, igual que configuracionRapelDistribuidores/
// presupuestos/zonas — no es un dato transaccional importado en masa, es una
// ficha que Sergio mantiene a mano).
export const borrarAcuerdoCliente = async (docId) => {
  await deleteDoc(doc(db, COLECCION, docId));
  return true;
};

// "Editar" un acuerdo ya guardado = borrar el documento antiguo + crear uno
// nuevo con los datos corregidos (nunca updateDoc, ver cabecera del
// archivo). Devuelve el id del documento nuevo.
export const editarAcuerdoCliente = async (idUsuario, docIdAntiguo, datosNuevos, actor) => {
  await borrarAcuerdoCliente(docIdAntiguo);
  return crearAcuerdoCliente(idUsuario, datosNuevos, actor);
};
