export {
  crearPerfilUsuario,
  getPerfilUsuario,
  getListaUsuarios
} from './firebaseApi/usuarios';

export { TODOS_LOS_USUARIOS } from './firebaseApi/comun';

export {
  getMarcasGlobales,
  saveNuevaMarca,
  getTipologiasMarca,
  saveTipologiaMarca
} from './firebaseApi/marcasYTipologias';

export {
  getDistribuidoresPorUsuario,
  saveNuevoDistribuidor
} from './firebaseApi/distribuidores';

export {
  deleteDocument,
  deleteMovimientosPorMeses,
  corregirAnioMovimientos,
  reasignarMovimientosDeMarca
} from './firebaseApi/utilidadesColeccionGenerica';

export {
  saveMovimientosSellIn,
  getHistoricoSellIn,
  getHistoricoSellInGeneral,
  getSellInByMonth
} from './firebaseApi/sellIn';

export {
  saveMovimientosSellOut,
  getHistoricoSellOut,
  getHistoricoSellOutGeneral,
  getSellOutByMonth
} from './firebaseApi/sellOut';

export { resetUserHistory } from './firebaseApi/mantenimiento';

export {
  saveVentasReales,
  getVentasRealesGeneral,
  getVentasRealesByMonth,
  deleteVentasRealesPorDistribuidorYMes
} from './firebaseApi/ventasReales';

export {
  saveMapeoImportacion,
  getMapeoImportacion,
  deleteMapeoImportacion
} from './firebaseApi/mapeoImportacion';

export {
  saveStockInicialImportado,
  getStockInicialPorDistribuidor,
  deleteStockInicialPorDistribuidorYAnio,
  getStockInicialGeneral
} from './firebaseApi/stockInicial';

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

export {
  registrarAuditoria,
  getAuditoria,
  moverAPapelera,
  restaurarDePapelera,
  eliminarDefinitivamente,
  getPapelera
} from './firebaseApi/auditoria';

export {
  getPresupuesto,
  getPresupuestosPorAnio,
  guardarPresupuesto,
  deletePresupuesto
} from './firebaseApi/presupuestos';

export {
  getZonasPorUsuario,
  saveNuevaZona,
  getComercialesPorUsuario,
  saveNuevoComercial
} from './firebaseApi/estructuraComercial';

export {
  getCriteriosComercialPorUsuario,
  saveNuevoCriterioComercial,
  actualizarCriterioComercial,
  seedCriteriosComercialPorDefecto,
  getAsignacionesComercialPorUsuario,
  guardarAsignacionComercial,
  asignarComercialABloque
} from './firebaseApi/clasificacionComercial';

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

export {
  MEDIOS_POR_DEFECTO,
  OBJETIVOS_POR_DEFECTO,
  getCatalogosAgendaPorUsuario,
  saveNuevoCatalogoAgenda,
  actualizarCatalogoAgenda,
  seedCatalogosAgendaPorDefecto
} from './firebaseApi/catalogosAgenda';

export {
  ACTIVIDADES_POR_DEFECTO,
  getActividadesAgenda,
  saveNuevaActividadAgenda,
  actualizarActividadAgenda,
  seedActividadesAgendaPorDefecto
} from './firebaseApi/actividadesAgenda';

export {
  getConfiguracionesRapelPorAnio,
  getConfiguracionRapelGlobal,
  getConfiguracionRapelDistribuidor,
  guardarConfiguracionRapelGlobal,
  guardarConfiguracionRapelDistribuidor,
  borrarConfiguracionRapelDistribuidor
} from './firebaseApi/rapelDistribuidores';

export {
  getAcuerdosClientesPorUsuario,
  crearAcuerdoCliente,
  borrarAcuerdoCliente,
  editarAcuerdoCliente
} from './firebaseApi/acuerdosClientes';

export {
  getTarifaMarcas,
  guardarTarifaMarca
} from './firebaseApi/tarifaMarcas';
