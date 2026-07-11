/*
 * PantallaVentasReales.js
 * Contenedor de la sección "Ventas Reales / Sell-In (QlikSense)": datos
 * reales de venta importados mensualmente desde un Excel de QlikSense
 * (Distribuidor / Familia / Subfamilia=Marca / Uds / Cajas / Importe). A
 * diferencia de "Gestión por Distribuidor", aquí el Excel trae TODOS los
 * distribuidores juntos, así que esta pantalla vive a nivel global (no por
 * distribuidor).
 *
 * Dos subvistas: Dashboard (KPIs/gráficos/tabla) e Importar Excel.
 *
 * CAMBIO (Fase 4 "Unificar Dashboards"): antes este componente tenía su
 * propia barra de pestañas interna (TabButton) y estado local
 * `pestañaActiva`. Ahora, igual que PantallaDistribuidor.js, es un
 * componente prop-driven: recibe `vistaActiva` desde App.js (el estado de
 * navegación global vive ahí) y ya no dibuja su propia barra de pestañas —
 * la vista "Dashboard" (PESTAÑA_VENTAS_REALES_DASHBOARD) ahora aparece
 * anidada dentro del grupo "Dashboard" del Sidebar (junto al dashboard de
 * Gestión), y la vista "Importar" (PESTAÑA_VENTAS_REALES_IMPORTAR) aparece
 * como acceso independiente en el menú ("Importar Sell-In (QlikSense)").
 * Se exportan los ids para que Layout.js/App.js los usen sin duplicarlos.
 *
 * CAMBIO (KPIs de concentración/mix + Tipología Vino-Licor): se añade una
 * tercera subvista, "Tipología" (PESTAÑA_VENTAS_REALES_TIPOLOGIA), pantalla
 * de mantenimiento para clasificar cada marca como Vino o Licor — dato que
 * usa el Dashboard para el KPI de peso % por tipología. Para eso, esta
 * pantalla ahora también carga la colección `tipologiasMarca` (además de
 * `marcasGlobales`, que ya cargaba pero antes no llegaba a pasarse al
 * Dashboard) y pasa ambas cosas tanto a TipologiaReferencias (para
 * editarlas) como a DashboardVentasReales (para cruzarlas con las ventas).
 *
 * CAMBIO (a petición de Sergio, bug de "Sin clasificar" con % que no
 * cuadraba): TipologiaReferencias solo listaba marcas de la colección
 * `marcas`, pero el Dashboard calcula la tipología de CADA fila de
 * `ventasReales` por su `id_marca` — si algún movimiento histórico apunta a
 * un id_marca que ya no existe en `marcas` (p.ej. quedó huérfano tras una
 * fusión o un borrado antiguo), esa venta nunca aparecía en la pantalla de
 * mantenimiento para poder clasificarla, pero SÍ contaba como "Sin
 * clasificar" en el Dashboard — de ahí el desajuste entre "aquí ya clasifiqué
 * todo" y el % de Sin clasificar del KPI. Se pasa `ventasReales` también a
 * TipologiaReferencias para que pueda detectar y mostrar esas referencias
 * huérfanas.
 *
 * CAMBIO (memoria de pestañas, a petición de Sergio): las 3 subvistas
 * (Dashboard, Importar, Tipología) ya no se montan/desmontan con
 * `{vistaActiva === X && <Componente/>}` — se quedan montadas (ocultas con
 * display:none) en cuanto se visitan por primera vez. Ver
 * usePestañasVisitadas.js para el porqué y el patrón general.
 *
 * CAMBIO (FIX DEFINITIVO del mismo bug de "Sin clasificar"): el desajuste
 * real no eran las huérfanas (esa comprobación dio 0), sino que el
 * Dashboard sugería la tipología automática usando el nombre denormalizado
 * de la venta en vez del nombre actual del catálogo — ver el CAMBIO
 * correspondiente en DashboardVentasReales.js para el detalle completo. La
 * pantalla de Tipología ya recibía `marcasGlobales`; ahora también se pasa
 * a DashboardVentasReales para que pueda hacer la misma sugerencia que
 * TipologiaReferencias.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { getDistribuidoresPorUsuario, getMarcasGlobales, getVentasRealesGeneral, getMapeoImportacion, getTipologiasMarca } from './firebaseApi';
import { tarjeta } from './uiClasses';
import DashboardVentasReales from './DashboardVentasReales';
import ImportarVentasReales from './ImportarVentasReales';
import TipologiaReferencias from './TipologiaReferencias';
import usePestañasVisitadas from './usePestañasVisitadas';

export const PESTAÑA_VENTAS_REALES_DASHBOARD = 'VENTAS_REALES_DASHBOARD';
export const PESTAÑA_VENTAS_REALES_IMPORTAR = 'VENTAS_REALES_IMPORTAR';
export const PESTAÑA_VENTAS_REALES_TIPOLOGIA = 'VENTAS_REALES_TIPOLOGIA';
export const PESTAÑAS_VENTAS_REALES = [PESTAÑA_VENTAS_REALES_DASHBOARD, PESTAÑA_VENTAS_REALES_IMPORTAR, PESTAÑA_VENTAS_REALES_TIPOLOGIA];

function PantallaVentasReales({ idUsuario, vistaActiva, onNavigate }) {

  const [listaDistribuidores, setListaDistribuidores] = useState([]);
  const [marcasGlobales, setMarcasGlobales] = useState([]);
  const [ventasReales, setVentasReales] = useState([]);
  const [mapeoImportacion, setMapeoImportacion] = useState([]);
  const [tipologiasMarca, setTipologiasMarca] = useState([]);
  const [cargando, setCargando] = useState(true);

  const cargarTodo = useCallback(async () => {
    setCargando(true);
    try {
      const [distribuidores, marcas, ventas, mapeo, tipologias] = await Promise.all([
        getDistribuidoresPorUsuario(idUsuario),
        getMarcasGlobales(),
        getVentasRealesGeneral(idUsuario),
        getMapeoImportacion(idUsuario),
        getTipologiasMarca()
      ]);
      setListaDistribuidores(distribuidores.sort((a, b) => (a.nombre_distribuidor || '').localeCompare(b.nombre_distribuidor || '')));
      setMarcasGlobales(marcas.sort((a, b) => (a.nombre_marca || '').localeCompare(b.nombre_marca || '')));
      setVentasReales(ventas);
      setMapeoImportacion(mapeo);
      setTipologiasMarca(tipologias);
    } catch (error) {
      console.error('Error cargando Ventas Reales:', error);
      alert('Error al cargar los datos: ' + error.message);
    }
    setCargando(false);
  }, [idUsuario]);

  useEffect(() => {
    if (!idUsuario) return;
    cargarTodo();
  }, [idUsuario, cargarTodo]);

  // Tras importar, refrescamos los datos y navegamos al Dashboard (misma UX
  // que antes, solo que ahora la navegación la resuelve el estado global de
  // App.js en vez de un setState local).
  const handleImportComplete = () => {
    cargarTodo();
    if (onNavigate) onNavigate(PESTAÑA_VENTAS_REALES_DASHBOARD);
  };

  // Memoria de pestañas (ver cabecera del archivo).
  const visitadas = usePestañasVisitadas(vistaActiva);
  const estiloVista = (id) => ({ display: vistaActiva === id ? 'block' : 'none' });

  return (
    <div>
      {cargando ? (
        <div className="text-slate-500 dark:text-slate-400">Cargando datos...</div>
      ) : (
        <>
          {/* El Dashboard ya NO va dentro de la tarjeta blanca/slate-800: a
              petición de Sergio, tiene que verse igual que el Dashboard de
              Gestión (PantallaDashboardAPCompania.js), que es un <div> suelto
              y por tanto deja ver el fondo azul marino oscuro de la propia
              página (bg-slate-950 de Layout.js) en vez del gris/slate-800 de
              la tarjeta. Importar y Tipología SÍ mantienen su tarjeta, igual
              que el resto de pantallas de mantenimiento de la app. */}
          {visitadas.has(PESTAÑA_VENTAS_REALES_DASHBOARD) && (
            <div style={estiloVista(PESTAÑA_VENTAS_REALES_DASHBOARD)}>
              <DashboardVentasReales ventasReales={ventasReales} tipologiasMarca={tipologiasMarca} marcasGlobales={marcasGlobales} />
            </div>
          )}
          {visitadas.has(PESTAÑA_VENTAS_REALES_IMPORTAR) && (
            <div className={tarjeta} style={estiloVista(PESTAÑA_VENTAS_REALES_IMPORTAR)}>
              <ImportarVentasReales
                idUsuario={idUsuario}
                listaDistribuidores={listaDistribuidores}
                marcasGlobales={marcasGlobales}
                mapeoImportacion={mapeoImportacion}
                onImportComplete={handleImportComplete}
              />
            </div>
          )}
          {visitadas.has(PESTAÑA_VENTAS_REALES_TIPOLOGIA) && (
            <div className={tarjeta} style={estiloVista(PESTAÑA_VENTAS_REALES_TIPOLOGIA)}>
              <TipologiaReferencias
                marcas={marcasGlobales}
                tipologiasMarca={tipologiasMarca}
                ventasReales={ventasReales}
                onTipologiaGuardada={cargarTodo}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default PantallaVentasReales;
