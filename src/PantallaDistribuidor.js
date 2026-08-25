/*
 * PantallaDistribuidor.js (Versión 5.2 - COMPLETA Y CORREGIDA)
 * Contenedor principal con estado centralizado y todas las pestañas.
 *
 * CAMBIO (memoria de pestañas, a petición de Sergio): las 11 subpestañas ya
 * no se montan/desmontan con `{pestañaActiva === X && <Componente/>}` — se
 * quedan montadas (ocultas con display:none) en cuanto se visitan por
 * primera vez, para no perder sus filtros internos (fechas, distribuidor,
 * marca...) al volver a ellas. Ver usePestañasVisitadas.js para el porqué y
 * el patrón general; aquí se aplica igual, con `pestañaActiva` (la prop que
 * ya recibía este componente) como id activo.
 *
 * CAMBIO (roles/permisos Fase 2, a petición de Sergio): nueva prop
 * `bloqueadoPorTodos` — cuando un manager elige "Todos los usuarios" en el
 * selector de App.js, esta pantalla (de EDICIÓN, no de análisis) se
 * bloquea con un aviso en vez de intentar operar sobre varios usuarios a
 * la vez. Ver el `if (bloqueadoPorTodos)` cerca del renderizado.
 *
 * CAMBIO (papelera + auditoría, a petición de Sergio): dos nuevas pestañas
 * en "Herramientas" (junto a Mantenimiento) — "Papelera" (Papelera.js) para
 * restaurar o eliminar definitivamente registros borrados, y "Auditoría"
 * (Auditoria.js) para consultar quién hizo cada borrado/restauración/
 * reseteo y cuándo. Ambas son "de toda la cuenta", igual que Mantenimiento:
 * no dependen del distribuidor seleccionado arriba.
 *
 * CAMBIO (selector de distribuidor GLOBAL, a petición de Sergio: "lo sigo
 * viendo un poco lioso" — análisis de IA de julio 2026): `idDistribuidorSel`
 * y la lista de distribuidores ya NO son estado local de este componente —
 * antes esta pantalla, "Sell-Out Clientes" y "Sell-Out por Marca" mantenían
 * cada una su propio distribuidor seleccionado por separado. Ahora ambos
 * llegan como PROPS desde App.js (ver cabecera de ese archivo) y se
 * comparten con las otras 2 pantallas — el selector visible se ha movido a
 * la barra superior (Layout.js), así que aquí ya no se dibuja ningún
 * `<select>` propio, ni el modal de "Añadir Distribuidor" (también movido a
 * Layout.js, alcanzable desde cualquier pantalla). `cargarMaestros` ahora
 * solo carga marcasGlobales — los distribuidores los gestiona App.js.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  getMarcasGlobales,
  // ¡Nuevas importaciones para cargar datos aquí!
  getHistoricoSellIn,
  getHistoricoSellOut,
  getStockInicialPorDistribuidor,
  // Histórico de TODOS los distribuidores del usuario (para Control A&P,
  // que necesita poder comparar/sumar varios distribuidores a la vez)
  getHistoricoSellInGeneral,
  getHistoricoSellOutGeneral,
  // Stock Inicial declarado de TODOS los distribuidores (para Control A&P
  // Visión Compañía, que lo suma como si fueran compras de Sell-In)
  getStockInicialGeneral
} from './firebaseApi';
import { tarjeta, filtroContenedor } from './uiClasses';
import usePestañasVisitadas from './usePestañasVisitadas';

// Importamos las 7 pestañas
import VentasYAP from './VentasYAP';
import Compras from './Compras';
import StockDistribuidor from './StockDistribuidor';
import ControlAP from './ControlAP';
import ControlAPVisionComercial from './ControlAPVisionComercial';
import Historico from './Historico';
import HistoricoSellIn from './HistoricoSellIn';
import Mantenimiento from './Mantenimiento';
import ImportarExcel from './ImportarExcel';
import FusionarMarcas from './FusionarMarcas';
import CorregirAnio from './CorregirAnio';
import Papelera from './Papelera';
import Auditoria from './Auditoria';

// Constantes para las pestañas.
// EXPORTADAS (rediseño visual, Fase 3): antes eran locales a este archivo
// porque la navegación de "Gestión por Distribuidor" vivía aquí mismo (barra
// de pestañas horizontal interna). Ahora la navegación la dibuja el Sidebar
// de Layout.js, así que necesita conocer estos ids para poder seleccionarlos
// desde fuera. PantallaDistribuidor ya NO gestiona su propia pestaña activa:
// la recibe como prop (ver más abajo) y se limita a renderizar la subvista
// correspondiente, igual que ya hacían PantallaReportes/PantallaDashboard.
export const PESTAÑA_VENTAS_AP = 'VENTAS_AP';
export const PESTAÑA_COMPRAS = 'COMPRAS';
export const PESTAÑA_STOCK = 'STOCK';
export const PESTAÑA_CONTROL_AP = 'CONTROL_AP';
export const PESTAÑA_CONTROL_AP_VISION_COMERCIAL = 'CONTROL_AP_VISION_COMERCIAL';
export const PESTAÑA_HISTORICO_SELLOUT = 'HISTORICO_SELLOUT';
export const PESTAÑA_HISTORICO_SELLIN = 'HISTORICO_SELLIN';
export const PESTAÑA_IMPORTAR = 'IMPORTAR';
export const PESTAÑA_FUSIONAR_MARCAS = 'FUSIONAR_MARCAS';
export const PESTAÑA_CORREGIR_ANIO = 'CORREGIR_ANIO';
export const PESTAÑA_MANTENIMIENTO = 'MANTENIMIENTO';
export const PESTAÑA_PAPELERA = 'PAPELERA';
export const PESTAÑA_AUDITORIA = 'AUDITORIA';

// Lista de todos los ids de "Gestión por Distribuidor", en el orden en que
// se muestran en el Sidebar. La usan App.js (para saber si el id activo hay
// que renderizarlo aquí dentro o en una pantalla de nivel superior) y
// Layout.js (para construir el submenú del Sidebar) — así el orden y la
// lista de pestañas solo se mantienen en un sitio.
export const PESTAÑAS_GESTION = [
  PESTAÑA_VENTAS_AP,
  PESTAÑA_COMPRAS,
  PESTAÑA_STOCK,
  PESTAÑA_CONTROL_AP,
  PESTAÑA_CONTROL_AP_VISION_COMERCIAL,
  PESTAÑA_HISTORICO_SELLOUT,
  PESTAÑA_HISTORICO_SELLIN,
  PESTAÑA_IMPORTAR,
  PESTAÑA_FUSIONAR_MARCAS,
  PESTAÑA_CORREGIR_ANIO,
  PESTAÑA_MANTENIMIENTO,
  PESTAÑA_PAPELERA,
  PESTAÑA_AUDITORIA,
];

function PantallaDistribuidor({
  idUsuario, pestañaActiva, bloqueadoPorTodos = false,
  idDistribuidorSel, onCambiarDistribuidorSel, listaDistribuidoresGlobal,
  cargandoDistribuidoresGlobal, onRefrescarDistribuidoresGlobal,
}) {

  // --- ESTADOS ---
  // listaDistribuidores/idDistribuidorSel ya NO son estado local — ver
  // comentario de cabecera ("selector de distribuidor GLOBAL"). Se usa el
  // mismo nombre local `listaDistribuidores` para no tener que renombrar
  // todas las referencias de más abajo.
  const listaDistribuidores = listaDistribuidoresGlobal || [];
  const [marcasGlobales, setMarcasGlobales] = useState([]);
  // pestañaActiva ya NO es estado local: llega como prop desde App.js/Sidebar
  // (rediseño visual, Fase 3 — ver comentario de las constantes PESTAÑA_*).
  const [cargandoMaestros, setCargandoMaestros] = useState(true);

  // --- ¡NUEVOS ESTADOS DE DATOS! ---
  // Estos estados guardarán TODOS los datos brutos del distribuidor
  const [historicoSellIn, setHistoricoSellIn] = useState([]);
  const [historicoSellOut, setHistoricoSellOut] = useState([]);
  const [stockInicialImportado, setStockInicialImportado] = useState([]);
  const [cargandoDatos, setCargandoDatos] = useState(false);

  // --- Histórico de TODOS los distribuidores del usuario (para Control A&P) ---
  const [historicoSellInGeneral, setHistoricoSellInGeneral] = useState([]);
  const [historicoSellOutGeneral, setHistoricoSellOutGeneral] = useState([]);
  const [stockInicialGeneral, setStockInicialGeneral] = useState([]);
  const [cargandoDatosGenerales, setCargandoDatosGenerales] = useState(false);

  // --- ¡NUEVO TRIGGER DE REFRESCO! ---
  // Cambiar este número forzará una recarga de datos
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // --- CARGA DE DATOS MAESTROS (solo Marcas — los distribuidores ya llegan
  // como prop `listaDistribuidoresGlobal` desde App.js, ver comentario de
  // cabecera) ---
  const cargarMaestros = useCallback(async () => {
    setCargandoMaestros(true);
    try {
      const marcas = await getMarcasGlobales();
      const marcasOrdenadas = marcas.sort((a, b) => a.nombre_marca.localeCompare(b.nombre_marca));
      setMarcasGlobales(marcasOrdenadas);
    } catch (error) { console.error("Error cargando maestros:", error); }
    setCargandoMaestros(false);
  }, []);

  // Carga inicial de maestros
  useEffect(() => {
    if (!idUsuario) return;
    cargarMaestros();
  }, [idUsuario, cargarMaestros]);

  // --- ¡NUEVO! CARGA DE DATOS HISTÓRICOS ---
  // Se ejecuta cuando cambia el distribuidor O cuando se fuerza un refresco
  useEffect(() => {
    if (!idUsuario || !idDistribuidorSel) {
      setHistoricoSellIn([]);
      setHistoricoSellOut([]);
      setStockInicialImportado([]);
      return;
    };

    const cargarDatosHistoricos = async () => {
      setCargandoDatos(true);
      try {
        const [movSellIn, movSellOut, stockInicial] = await Promise.all([
          getHistoricoSellIn(idUsuario, idDistribuidorSel),
          getHistoricoSellOut(idUsuario, idDistribuidorSel),
          getStockInicialPorDistribuidor(idUsuario, idDistribuidorSel)
        ]);
        setHistoricoSellIn(movSellIn);
        setHistoricoSellOut(movSellOut);
        setStockInicialImportado(stockInicial);
      } catch (error) {
        console.error("Error cargando datos históricos:", error);
      }
      setCargandoDatos(false);
    };

    cargarDatosHistoricos();
  }, [idUsuario, idDistribuidorSel, refreshTrigger]);

  // --- CARGA DE HISTÓRICO GENERAL (todos los distribuidores del usuario) ---
  // Independiente del distribuidor seleccionado: solo depende del usuario y
  // del refresco. Lo usa Control A&P para poder filtrar por uno, varios o
  // todos los distribuidores a la vez.
  useEffect(() => {
    if (!idUsuario) {
      setHistoricoSellInGeneral([]);
      setHistoricoSellOutGeneral([]);
      setStockInicialGeneral([]);
      return;
    }

    const cargarDatosGenerales = async () => {
      setCargandoDatosGenerales(true);
      try {
        const [movSellInGeneral, movSellOutGeneral, stockInicialGen] = await Promise.all([
          getHistoricoSellInGeneral(idUsuario),
          getHistoricoSellOutGeneral(idUsuario),
          getStockInicialGeneral(idUsuario)
        ]);
        setHistoricoSellInGeneral(movSellInGeneral);
        setHistoricoSellOutGeneral(movSellOutGeneral);
        setStockInicialGeneral(stockInicialGen);
      } catch (error) {
        console.error("Error cargando histórico general:", error);
      }
      setCargandoDatosGenerales(false);
    };

    cargarDatosGenerales();
  }, [idUsuario, refreshTrigger]);

  // --- FUNCIONES DE "CALLBACK" ---
  
  // Se pasa a VentasYAP, Compras, Historico, HistoricoSellIn
  const handleDataChanged = () => {
    console.log("Refrescando datos históricos...");
    setRefreshTrigger(prev => prev + 1);
  };

  // Se pasa a ImportarExcel: refresca maestros (por si creó marcas) y el
  // histórico. Si el Excel importado creó también un distribuidor nuevo, se
  // refresca además la lista global (App.js) para que aparezca en el
  // selector de la barra superior.
  const handleImportComplete = () => {
    cargarMaestros();
    if (onRefrescarDistribuidoresGlobal) onRefrescarDistribuidoresGlobal();
    setRefreshTrigger(prev => prev + 1);
  };

  // Se pasa a Mantenimiento
  const handleResetApp = () => {
    setHistoricoSellIn([]);
    setHistoricoSellOut([]);
    if (onCambiarDistribuidorSel) onCambiarDistribuidorSel('');
    if (onRefrescarDistribuidoresGlobal) onRefrescarDistribuidoresGlobal();
    setRefreshTrigger(prev => prev + 1);
    cargarMaestros();
  };

  // Se pasa a VentasYAP y Compras
  const handleRefrescarMarcas = () => {
    cargarMaestros();
  };

  // Memoria de pestañas (ver cabecera del archivo). OJO: tiene que llamarse
  // SIEMPRE, en todos los renders y en el mismo orden (regla de los Hooks de
  // React) — por eso va aquí, antes del `return` anticipado de más abajo
  // (cargandoMaestros), y no después. Ponerlo después de un `return`
  // condicional provoca "Rendered more hooks than during the previous
  // render." en cuanto cargandoMaestros pasa de true a false.
  const visitadas = usePestañasVisitadas(pestañaActiva);
  const estiloPestaña = (id) => ({ display: pestañaActiva === id ? 'block' : 'none' });

  // --- RENDERIZADO ---

  // Roles/permisos, Fase 2 (ver cabecera de App.js): en modo "Todos los
  // usuarios" esta pantalla se bloquea con un aviso — es de EDICIÓN (crear/
  // borrar/importar), no de análisis, y no hay un "distribuidor" único al
  // que aplicar esas acciones cuando se mezclan varios usuarios. App.js ya
  // pasa idUsuario=null en este modo, así que ningún efecto de carga de
  // datos llega a dispararse (todos empiezan con `if (!idUsuario) return`);
  // este aviso va ANTES del chequeo de cargandoMaestros para no dejar
  // colgado el "Cargando datos maestros..." (que nunca terminaría, porque
  // sin idUsuario cargarMaestros tampoco se llama).
  if (bloqueadoPorTodos) {
    return (
      <div className={tarjeta}>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          "Gestión por Distribuidor" no está disponible en modo "Todos los usuarios" — es una pantalla para dar de alta, importar y editar los datos de UN distribuidor concreto. Elige "Mis datos" o un usuario del selector "Viendo como" (barra lateral) para gestionar aquí.
        </p>
      </div>
    );
  }

  if (cargandoMaestros || cargandoDistribuidoresGlobal) {
    return <div>Cargando datos maestros...</div>;
  }

  return (
    <div>
      {/* El selector "Gestionando al Distribuidor" y el modal de "+ Añadir
          Distribuidor" (antes dibujados aquí arriba) ahora viven en la barra
          superior (Layout.js) — ver comentario de cabecera ("selector de
          distribuidor GLOBAL"). Si todavía no hay ningún distribuidor dado
          de alta, se avisa aquí mismo dónde crearlo. */}
      {listaDistribuidores.length === 0 && (
        <div className={`${filtroContenedor} mb-5`}>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Todavía no hay ningún distribuidor. Usa el selector de la barra superior ("+ Nuevo distribuidor") para dar de alta el primero.
          </p>
        </div>
      )}

      {/* La navegación entre pestañas ahora vive en el Sidebar (Layout.js);
          este componente solo renderiza la subvista según "pestañaActiva". */}

      {/* 2. CONTENIDO DE PESTAÑA ACTIVA */}
      {idDistribuidorSel || pestañaActiva === PESTAÑA_MANTENIMIENTO || pestañaActiva === PESTAÑA_IMPORTAR || pestañaActiva === PESTAÑA_FUSIONAR_MARCAS || pestañaActiva === PESTAÑA_CORREGIR_ANIO || pestañaActiva === PESTAÑA_PAPELERA || pestañaActiva === PESTAÑA_AUDITORIA ? (
        <div className={tarjeta}>

          {visitadas.has(PESTAÑA_VENTAS_AP) && (
            <div style={estiloPestaña(PESTAÑA_VENTAS_AP)}>
              <VentasYAP
                idUsuario={idUsuario}
                idDistribuidor={idDistribuidorSel}
                marcas={marcasGlobales}
                onMarcaAdded={handleRefrescarMarcas}
                onDataSaved={handleDataChanged}
              />
            </div>
          )}
          {visitadas.has(PESTAÑA_COMPRAS) && (
            <div style={estiloPestaña(PESTAÑA_COMPRAS)}>
              <Compras
                idUsuario={idUsuario}
                idDistribuidor={idDistribuidorSel}
                marcas={marcasGlobales}
                onMarcaAdded={handleRefrescarMarcas}
                onDataSaved={handleDataChanged}
              />
            </div>
          )}

          {(cargandoDatos || ((pestañaActiva === PESTAÑA_CONTROL_AP || pestañaActiva === PESTAÑA_CONTROL_AP_VISION_COMERCIAL) && cargandoDatosGenerales)) ? <div>Cargando datos del distribuidor...</div> : (
            <>
              {visitadas.has(PESTAÑA_STOCK) && (
                <div style={estiloPestaña(PESTAÑA_STOCK)}>
                  <StockDistribuidor
                    marcas={marcasGlobales}
                    historicoSellIn={historicoSellIn}
                    historicoSellOut={historicoSellOut}
                    stockInicialImportado={stockInicialImportado}
                  />
                </div>
              )}
              {visitadas.has(PESTAÑA_CONTROL_AP) && (
                <div style={estiloPestaña(PESTAÑA_CONTROL_AP)}>
                  <ControlAP
                    idDistribuidor={idDistribuidorSel}
                    marcas={marcasGlobales}
                    listaDistribuidores={listaDistribuidores}
                    historicoSellInGeneral={historicoSellInGeneral}
                    historicoSellOutGeneral={historicoSellOutGeneral}
                  />
                </div>
              )}
              {visitadas.has(PESTAÑA_CONTROL_AP_VISION_COMERCIAL) && (
                <div style={estiloPestaña(PESTAÑA_CONTROL_AP_VISION_COMERCIAL)}>
                  <ControlAPVisionComercial
                    idDistribuidor={idDistribuidorSel}
                    marcas={marcasGlobales}
                    listaDistribuidores={listaDistribuidores}
                    historicoSellInGeneral={historicoSellInGeneral}
                    historicoSellOutGeneral={historicoSellOutGeneral}
                    stockInicialGeneral={stockInicialGeneral}
                  />
                </div>
              )}
              {visitadas.has(PESTAÑA_HISTORICO_SELLOUT) && (
                <div style={estiloPestaña(PESTAÑA_HISTORICO_SELLOUT)}>
                  <Historico
                    idDistribuidor={idDistribuidorSel}
                    marcas={marcasGlobales}
                    listaDistribuidores={listaDistribuidores}
                    historicoSellOut={historicoSellOut}
                    onDataDeleted={handleDataChanged}
                  />
                </div>
              )}
              {visitadas.has(PESTAÑA_HISTORICO_SELLIN) && (
                <div style={estiloPestaña(PESTAÑA_HISTORICO_SELLIN)}>
                  <HistoricoSellIn
                    idDistribuidor={idDistribuidorSel}
                    marcas={marcasGlobales}
                    listaDistribuidores={listaDistribuidores}
                    historicoSellIn={historicoSellIn}
                    onDataDeleted={handleDataChanged}
                  />
                </div>
              )}
            </>
          )}

          {visitadas.has(PESTAÑA_IMPORTAR) && (
            <div style={estiloPestaña(PESTAÑA_IMPORTAR)}>
              <ImportarExcel
                idUsuario={idUsuario}
                marcas={marcasGlobales}
                listaDistribuidores={listaDistribuidores}
                onImportComplete={handleImportComplete}
              />
            </div>
          )}

          {visitadas.has(PESTAÑA_FUSIONAR_MARCAS) && (
            <div style={estiloPestaña(PESTAÑA_FUSIONAR_MARCAS)}>
              <FusionarMarcas
                idUsuario={idUsuario}
                marcas={marcasGlobales}
                onMerged={handleRefrescarMarcas}
              />
            </div>
          )}

          {visitadas.has(PESTAÑA_CORREGIR_ANIO) && (
            <div style={estiloPestaña(PESTAÑA_CORREGIR_ANIO)}>
              <CorregirAnio
                idUsuario={idUsuario}
                listaDistribuidores={listaDistribuidores}
                onCorregido={handleDataChanged}
              />
            </div>
          )}

          {visitadas.has(PESTAÑA_MANTENIMIENTO) && (
            <div style={estiloPestaña(PESTAÑA_MANTENIMIENTO)}>
              <Mantenimiento idUsuario={idUsuario} onResetApp={handleResetApp} />
            </div>
          )}

          {visitadas.has(PESTAÑA_PAPELERA) && (
            <div style={estiloPestaña(PESTAÑA_PAPELERA)}>
              <Papelera idUsuario={idUsuario} marcas={marcasGlobales} listaDistribuidores={listaDistribuidores} />
            </div>
          )}

          {visitadas.has(PESTAÑA_AUDITORIA) && (
            <div style={estiloPestaña(PESTAÑA_AUDITORIA)}>
              <Auditoria idUsuario={idUsuario} />
            </div>
          )}
        </div>
      ) : (
        <div className={`${tarjeta} text-center text-slate-600 dark:text-slate-300`}>
          <h3 className="text-base font-medium text-slate-900 dark:text-white mb-1">No hay un distribuidor seleccionado.</h3>
          {listaDistribuidores.length === 0 && (
             <p className="text-sm text-slate-500 dark:text-slate-400">Por favor, añada un nuevo distribuidor usando el botón "+ Añadir Distribuidor" para comenzar.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default PantallaDistribuidor;