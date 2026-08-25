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
 *   src/firebaseApi/estructuraComercial.js       - Estructura Comercial (CRM): zonas + comerciales/preventistas
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
  actualizarClienteSellOut,
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

// --- 24. EQUIPO COMERCIAL (zonas + comerciales/preventistas; el archivo se
// sigue llamando estructuraComercial.js, ver aviso de renombrado en
// PantallaEstructuraComercial.js) ---
export {
  getZonasPorUsuario,
  saveNuevaZona,
  getComercialesPorUsuario,
  saveNuevoComercial
} from './firebaseApi/estructuraComercial';

// --- 25. ESTRUCTURA COMERCIAL, en el sentido real de Sergio (clasificación
// A-E + cartera comercial<->distribuidor, ver clasificacionComercial.js) ---
export {
  getCriteriosComercialPorUsuario,
  saveNuevoCriterioComercial,
  actualizarCriterioComercial,
  seedCriteriosComercialPorDefecto,
  getAsignacionesComercialPorUsuario,
  guardarAsignacionComercial,
  asignarComercialABloque
} from './firebaseApi/clasificacionComercial';

// --- 26. PLANIFICACIÓN COMERCIAL (calendario de visitas trimestral,
// ver planificacionComercial.js para el generador y clasificacionComercial
// para de dónde sale el criterio/frecuencia de cada distribuidor) ---
export {
  getVisitasComercialPorTrimestre,
  getVisitasConfirmadasPorUsuario,
  guardarVisitasGeneradas,
  cerrarVisita,
  moverVisita,
  moverBloqueVisitas,
  agregarVisitasManualesAgenda,
  confirmarVisita,
  confirmarVisitasEnBloque
} from './firebaseApi/planificacionComercial';

// --- 27. CATÁLOGOS DE AGENDA (Medio/Objetivo de una visita, ver
// catalogosAgenda.js) ---
export {
  MEDIOS_POR_DEFECTO,
  OBJETIVOS_POR_DEFECTO,
  getCatalogosAgendaPorUsuario,
  saveNuevoCatalogoAgenda,
  actualizarCatalogoAgenda,
  seedCatalogosAgendaPorDefecto
} from './firebaseApi/catalogosAgenda';

// --- 28. ACTIVIDADES DE AGENDA (catálogo GLOBAL de "otras actividades" no
// ligadas a un distribuidor — Trabajo administrativo, Vacaciones, etc. —
// solo editable por un manager, ver actividadesAgenda.js) ---
export {
  ACTIVIDADES_POR_DEFECTO,
  getActividadesAgenda,
  saveNuevaActividadAgenda,
  actualizarActividadAgenda,
  seedActividadesAgendaPorDefecto
} from './firebaseApi/actividadesAgenda';

// --- 29. RAPEL DISTRIBUIDORES (26/07/2026, primera pieza de "Acuerdos con
// clientes/distribuidores" — objetivo anual escalado + bonificaciones, ver
// rapelDistribuidores.js para la lógica y firebaseApi/rapelDistribuidores.js
// para el CRUD) ---
export {
  getConfiguracionesRapelPorAnio,
  getConfiguracionRapelGlobal,
  getConfiguracionRapelDistribuidor,
  guardarConfiguracionRapelGlobal,
  guardarConfiguracionRapelDistribuidor,
  borrarConfiguracionRapelDistribuidor
} from './firebaseApi/rapelDistribuidores';

// --- 30. ACUERDOS CON CLIENTES (27/07/2026, SEGUNDA pieza de "Acuerdos con
// clientes/distribuidores" — condiciones por referencia + rapel/aportación
// fija/valor añadido a nivel de acuerdo, ver acuerdosClientes.js para el
// diseño completo y firebaseApi/acuerdosClientes.js para el CRUD) ---
export {
  getAcuerdosClientesPorUsuario,
  crearAcuerdoCliente,
  borrarAcuerdoCliente,
  editarAcuerdoCliente
} from './firebaseApi/acuerdosClientes';

// --- 31. TARIFA DE MARCAS (27/07/2026, PVP+IVA de referencia por marca,
// catálogo global — ver firebaseApi/tarifaMarcas.js) ---
export {
  getTarifaMarcas,
  guardarTarifaMarca
} from './firebaseApi/tarifaMarcas';
