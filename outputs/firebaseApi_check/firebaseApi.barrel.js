/*
 * firebaseApi.js (Versión 6.0 - ÍNDICE / BARREL)
 * Este fichero ya NO contiene lógica: es solo un índice que reexporta,
 * con el MISMO nombre de siempre, todas las funciones que antes vivían
 * aquí. El código real se organizó por dominio de negocio dentro de
 * src/firebaseApi/ para que ningún fichero de más de 1000 líneas
 * concentre el acceso a las ~13 colecciones de Firestore de la app.
 *
 * Ningún import existente en el resto de src/ (`import { X } from
 * './firebaseApi'`) tiene que cambiar: cada nombre exportado sigue
 * resolviendo exactamente igual que antes.
 *
 * Dónde vive cada dominio:
 *   src/firebaseApi/comun.js                    - db, chunking, TODOS_LOS_USUARIOS, conFiltroUsuario (helpers internos)
 *   src/firebaseApi/usuarios.js                  - perfiles de usuario (colección "usuarios")
 *   src/firebaseApi/marcasYTipologias.js         - marcas globales + tipología de referencias
 *   src/firebaseApi/distribuidores.js            - distribuidores
 *   src/firebaseApi/utilidadesColeccionGenerica.js - borrado/corrección genéricos parametrizados por collectionName
 *   src/firebaseApi/sellIn.js                    - histórico Sell-In
 *   src/firebaseApi/sellOut.js                   - histórico Sell-Out
 *   src/firebaseApi/mantenimiento.js             - reseteo (borrado suave) de historial completo
 *   src/firebaseApi/ventasReales.js              - Ventas Reales (import QlikSense)
 *   src/firebaseApi/mapeoImportacion.js          - memoria de reconciliación del importador de Ventas Reales
 *   src/firebaseApi/stockInicial.js              - Stock Inicial declarado
 *   src/firebaseApi/sellOutClientes.js           - Sell-Out detalle por cliente final + alias producto->marca
 *   src/firebaseApi/auditoria.js                 - papelera (borrado suave) + auditoría
 *   src/firebaseApi/presupuestos.js              - Objetivo Anual / Forecast
 *
 * NOTA IMPORTANTE (se conserva del original): las reglas de seguridad de
 * Firestore de este proyecto bloquean las operaciones "update" ("Missing or
 * insufficient permissions"), aunque sí permiten "create" y "delete". Por
 * eso, cualquier corrección de datos ya guardados (año, marca, etc.) se hace
 * SIEMPRE como "crear un documento nuevo con los datos corregidos + borrar
 * el documento antiguo", nunca con updateDoc/batch.update.
 *
 * EXCEPCIÓN (papelera, ver src/firebaseApi/auditoria.js): historicoSellIn
 * e historicoSellOut sí permiten un "update" muy acotado, solo para marcar
 * un documento como eliminado/restaurado (campos eliminado/eliminado_en/
 * eliminado_por) — las reglas de Firestore rechazan cualquier otro campo en
 * ese update. Ningún dato de negocio se actualiza nunca; sigue siendo
 * "borrar + recrear" para cualquier corrección real.
 */

// --- 0. PERFILES DE USUARIO (roles/permisos) ---
export {
  crearPerfilUsuario,
  getPerfilUsuario,
  getListaUsuarios
} from './firebaseApi/usuarios';

// Sentinel del selector "Viendo como" — lo usa App.js/Layout.js directamente.
export { TODOS_LOS_USUARIOS } from './firebaseApi/comun';

// --- 1 y 21. MARCAS (Global) + TIPOLOGÍA DE REFERENCIAS ---
export {
  getMarcasGlobales,
  saveNuevaMarca,
  getTipologiasMarca,
  saveTipologiaMarca
} from './firebaseApi/marcasYTipologias';

// --- 2 y 3. DISTRIBUIDORES (Privado) ---
export {
  getDistribuidoresPorUsuario,
  saveNuevoDistribuidor
} from './firebaseApi/distribuidores';

// --- 11, 15, 16 y 17. UTILIDADES GENÉRICAS PARAMETRIZADAS POR collectionName ---
export {
  deleteDocument,
  deleteMovimientosPorMeses,
  corregirAnioMovimientos,
  reasignarMovimientosDeMarca
} from './firebaseApi/utilidadesColeccionGenerica';

// --- 5, 6, 8 y 13. HISTÓRICO SELL-IN ---
export {
  saveMovimientosSellIn,
  getHistoricoSellIn,
  getHistoricoSellInGeneral,
  getSellInByMonth
} from './firebaseApi/sellIn';

// --- 4, 7, 9 y 14. HISTÓRICO SELL-OUT ---
export {
  saveMovimientosSellOut,
  getHistoricoSellOut,
  getHistoricoSellOutGeneral,
  getSellOutByMonth
} from './firebaseApi/sellOut';

// --- 12. RESETEO (BORRADO SUAVE) DE HISTORIAL COMPLETO ---
export { resetUserHistory } from './firebaseApi/mantenimiento';

// --- 18. VENTAS REALES (import mensual desde QlikSense) ---
export {
  saveVentasReales,
  getVentasRealesGeneral,
  getVentasRealesByMonth,
  deleteVentasRealesPorDistribuidorYMes
} from './firebaseApi/ventasReales';

// --- 19. MEMORIA DE RECONCILIACIÓN DEL IMPORTADOR DE VENTAS REALES ---
export {
  saveMapeoImportacion,
  getMapeoImportacion,
  deleteMapeoImportacion
} from './firebaseApi/mapeoImportacion';

// --- 20. STOCK INICIAL DECLARADO ---
export {
  saveStockInicialImportado,
  getStockInicialPorDistribuidor,
  deleteStockInicialPorDistribuidorYAnio,
  getStockInicialGeneral
} from './firebaseApi/stockInicial';

// --- 21. SELL-OUT DETALLE POR CLIENTE FINAL (import por distribuidor) ---
export {
  saveNuevoClienteSellOut,
  getClientesSellOutPorDistribuidor,
  getClientesSellOutGeneral,
  saveMovimientosSellOutClientes,
  getMovimientosSellOutClientesPorDistribuidor,
  getMovimientosSellOutClientesGeneral,
  reasignarMarcaSellOutClientesPorMeses,
  resetSellOutClientesPorDistribuidor,
  resetSellOutClientesTodo,
  getAliasProductosSellOutPorDistribuidor,
  saveAliasProductosSellOut
} from './firebaseApi/sellOutClientes';

// --- 22. PAPELERA (borrado suave) + AUDITORÍA ---
export {
  registrarAuditoria,
  getAuditoria,
  moverAPapelera,
  restaurarDePapelera,
  eliminarDefinitivamente,
  getPapelera
} from './firebaseApi/auditoria';

// --- 23. PRESUPUESTOS (Objetivo Anual + Forecast) ---
export {
  getPresupuesto,
  getPresupuestosPorAnio,
  guardarPresupuesto,
  deletePresupuesto
} from './firebaseApi/presupuestos';
