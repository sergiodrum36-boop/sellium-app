/*
 * Layout.js (Rediseño visual, Fase 3 + Fase 4 "Unificar Dashboards")
 * Barra lateral de navegación + modo oscuro/claro persistente.
 * Sustituye el antiguo header superior de App.js (Fase 1 del rediseño visual).
 *
 * Cambios sobre la Fase 1:
 *  - La lista plana de NAV_ITEMS se sustituye por <Sidebar>, que añade el
 *    grupo colapsable "Gestión por Distribuidor" con sus 11 subvistas
 *    (antes eran pestañas horizontales dentro de PantallaDistribuidor.js).
 *    El resto del "cascarón" (logo, modo oscuro, ayuda, logout, colapsar)
 *    NO cambia — ver nota de diseño en Sidebar.js.
 *  - El estado de "pestaña activa" para TODA la app (incluida Gestión) ahora
 *    vive en App.js y llega aquí como pantallaActiva/onNavigate, igual que
 *    antes; lo único que cambia es el rango de valores posibles (antes solo
 *    los 4 ids de nivel superior, ahora también los ids de Gestión).
 *  - Colores de estado activo: pasan de azul a los tokens "wine" del
 *    rediseño (tailwind.config.js), vía Sidebar.js.
 *
 * Cambios Fase 4 (a petición de Sergio: "meter dentro de la categoría
 * dashboard los dos que por ahora tenemos"):
 *  - El antiguo item plano "Dashboard" (PANTALLA_DASHBOARD, gestión) y el
 *    antiguo item plano "Ventas Reales" (que internamente tenía su propia
 *    pestaña "Dashboard") se fusionan en un segundo grupo colapsable
 *    "Dashboard", con dos subvistas: "Gestión" y "Ventas Sell-In
 *    (QlikSense)". Sidebar.js ahora soporta varios grupos vía la prop
 *    `groups` (ver ese archivo).
 *  - La antigua pestaña "Importar Excel (QlikSense)" (que vivía dentro de
 *    Ventas Reales) queda como acceso independiente en el nivel superior,
 *    renombrada "Importar Sell-In (QlikSense)" para que quede claro qué
 *    datos importa sin confundirse con "Histórico Sell-In" (que es otra
 *    fuente de datos, manual/por distribuidor, dentro de Gestión).
 *  - PANTALLA_VENTAS_REALES ya no existe: sus dos vistas ahora tienen ids
 *    propios exportados desde PantallaVentasReales.js.
 *
 * Cambios Fase 5 ("Subcategorías dentro de Gestión", a petición de Sergio):
 * los 11 items de "Gestión por Distribuidor" (antes todos al mismo nivel,
 * obligando a scrollear) se reagrupan en 4 subcategorías colapsables:
 *  - "Entrada de Datos": Ventas y A&P, Compras (carga manual).
 *  - "Control A&P": Control A&P, Control A&P (Visión Compañía), Stock.
 *  - "Históricos": Histórico Sell-Out, Histórico Sell-In.
 *  - "Herramientas": Fusionar Marcas, Corregir Año, Mantenimiento.
 * "Importar Excel" no encajaba con claridad en ninguna (no es entrada
 * manual, ni consulta, ni una herramienta de mantenimiento) y, a elección
 * de Sergio, queda suelto al mismo nivel que las 4 subcategorías, dentro
 * del grupo "Gestión por Distribuidor". Sidebar.js soporta esto de forma
 * genérica: cualquier entrada de un grupo con `items` propios se trata como
 * subcategoría anidada (ver comentario de modelo de datos en Sidebar.js).
 *
 * FIX (bug reportado por Sergio): con la barra colapsada (solo iconos, sin
 * texto), el botón "Cerrar sesión" quedaba justo encima del botón
 * "Contraer/Expandir menú" — dos iconos parecidos, sin etiqueta, muy fácil
 * de confundir. Al pulsar por error "Cerrar sesión" la sesión se cerraba de
 * verdad (no era un fallo de código: el clic hacía justo lo que su handler
 * dice que hace) y de paso los desplegables de categorías parecían "no
 * hacer nada", porque con la barra colapsada el contenido anidado nunca se
 * muestra aunque el estado interno sí cambie. Solución: el botón de
 * contraer/expandir se saca del pie (lejos de Cerrar sesión) y se coloca en
 * la cabecera junto al logo, y "Cerrar sesión" pide confirmación antes de
 * ejecutar onLogout.
 *
 * Cambios (Tipología de Referencias, a petición de Sergio): se añade
 * "Tipología (Vino/Licor)" como acceso independiente en el nivel superior,
 * junto a "Importar Sell-In (QlikSense)" — es una pantalla de mantenimiento
 * ligada al mismo dataset de Ventas Sell-In, pero no es ni un dashboard ni
 * un importador, así que no encajaba dentro del grupo "Dashboard".
 *
 * Cambios (nuevo Dashboard A&P Visión Compañía, a petición de Sergio): se
 * añade una tercera subvista al grupo "Dashboard", junto a "Gestión" y
 * "Ventas Sell-In (QlikSense)" — ver PantallaDashboardAPCompania.js para el
 * detalle de qué cambia respecto al Dashboard de Gestión (la fórmula del
 * A&P Generado).
 *
 * Cambios (limpieza de menú, a petición de Sergio: "las versiones sin Stock
 * Inicial no me sirven, solo cuenta Compras + Stock Inicial"): se quitan del
 * menú las dos vistas que NO suman Stock Inicial al A&P Generado —
 * "Control A&P" (real, PESTAÑA_CONTROL_AP) y "Dashboard" de Gestión
 * (PANTALLA_DASHBOARD) — dejando solo sus versiones "Visión Compañía", que
 * ahora recuperan los nombres simples ("Control A&P" y "Gestión") al no
 * hacer ya falta distinguirlas de ninguna otra. Los componentes viejos
 * (ControlAP.js, PantallaDashboard.js) NO se borran ni se tocan — solo
 * dejan de tener entrada en el Sidebar; siguen intactos por si hicieran
 * falta más adelante.
 */

import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard, Users, BarChart3, HelpCircle, LogOut, Sun, Moon,
  ChevronsLeft, ChevronsRight, FileSpreadsheet, FileText, ShoppingCart,
  Package, ShieldCheck, History, Upload, GitMerge, CalendarClock,
  Wrench, ClipboardList, Tags
} from 'lucide-react';
import logo from './assets/logo.png';
import Sidebar from './Sidebar';
import {
  PESTAÑA_VENTAS_AP, PESTAÑA_COMPRAS, PESTAÑA_STOCK,
  PESTAÑA_CONTROL_AP_VISION_COMERCIAL, PESTAÑA_HISTORICO_SELLOUT,
  PESTAÑA_HISTORICO_SELLIN, PESTAÑA_IMPORTAR, PESTAÑA_FUSIONAR_MARCAS,
  PESTAÑA_CORREGIR_ANIO, PESTAÑA_MANTENIMIENTO
} from './PantallaDistribuidor';
import {
  PESTAÑA_VENTAS_REALES_DASHBOARD, PESTAÑA_VENTAS_REALES_IMPORTAR,
  PESTAÑA_VENTAS_REALES_TIPOLOGIA
} from './PantallaVentasReales';
import { PANTALLA_DASHBOARD_AP_COMPANIA } from './PantallaDashboardAPCompania';

export const PANTALLA_REPORTES = 'REPORTES';
export const PANTALLA_DASHBOARD = 'DASHBOARD';

// Subvistas del grupo "Gestión por Distribuidor" — mismos ids que ya usa
// PantallaDistribuidor.js (importados de allí, no duplicados). Reagrupadas
// en 4 subcategorías colapsables (Fase 5) + "Importar Excel" suelto.
const GESTION_ITEMS = [
  {
    id: 'gestion-entrada',
    label: 'Entrada de Datos',
    icon: ClipboardList,
    items: [
      { id: PESTAÑA_VENTAS_AP, label: 'Ventas y A&P', icon: FileText },
      { id: PESTAÑA_COMPRAS, label: 'Compras', icon: ShoppingCart },
    ],
  },
  {
    id: 'gestion-control-ap',
    label: 'Control A&P',
    icon: ShieldCheck,
    items: [
      { id: PESTAÑA_CONTROL_AP_VISION_COMERCIAL, label: 'Control A&P', icon: ShieldCheck },
      { id: PESTAÑA_STOCK, label: 'Stock', icon: Package },
    ],
  },
  {
    id: 'gestion-historicos',
    label: 'Históricos',
    icon: History,
    items: [
      { id: PESTAÑA_HISTORICO_SELLOUT, label: 'Histórico Sell-Out', icon: History },
      { id: PESTAÑA_HISTORICO_SELLIN, label: 'Histórico Sell-In', icon: History },
    ],
  },
  {
    id: 'gestion-herramientas',
    label: 'Herramientas',
    icon: Wrench,
    items: [
      { id: PESTAÑA_FUSIONAR_MARCAS, label: 'Fusionar Marcas', icon: GitMerge },
      { id: PESTAÑA_CORREGIR_ANIO, label: 'Corregir Año', icon: CalendarClock },
      { id: PESTAÑA_MANTENIMIENTO, label: 'Mantenimiento', icon: Wrench },
    ],
  },
  // Suelto (no encaja con claridad en ninguna subcategoría de arriba) —
  // decisión explícita de Sergio.
  { id: PESTAÑA_IMPORTAR, label: 'Importar Excel', icon: Upload },
];

// Subvistas del nuevo grupo "Dashboard" (Fase 4): los dos dashboards que
// antes vivían en sitios distintos del menú, ahora juntos para elegir cuál
// trabajar desde un mismo punto.
const DASHBOARD_ITEMS = [
  { id: PANTALLA_DASHBOARD_AP_COMPANIA, label: 'Gestión', icon: LayoutDashboard },
  { id: PESTAÑA_VENTAS_REALES_DASHBOARD, label: 'Ventas Sell-In (QlikSense)', icon: FileSpreadsheet },
];

const GROUPS = [
  { id: 'gestion', label: 'Gestión por Distribuidor', icon: Users, items: GESTION_ITEMS },
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3, items: DASHBOARD_ITEMS },
];

const TOP_ITEMS = [
  { id: PESTAÑA_VENTAS_REALES_IMPORTAR, label: 'Importar Sell-In (QlikSense)', icon: Upload },
  { id: PESTAÑA_VENTAS_REALES_TIPOLOGIA, label: 'Tipología (bebidas)', icon: Tags },
  { id: PANTALLA_REPORTES, label: 'Reportes Generales', icon: BarChart3 },
];

function navButtonClasses(activo, colapsado) {
  const base = 'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm !font-medium transition-colors !border-0' + (colapsado ? ' justify-center px-0' : '');
  const activoClasses = '!bg-wine-soft !text-slate-900 dark:!text-white';
  const inactivoClasses = '!bg-transparent !text-slate-600 hover:!bg-slate-100 hover:!text-slate-900 dark:!text-slate-300 dark:hover:!bg-slate-800 dark:hover:!text-white';
  return base + ' ' + (activo ? activoClasses : inactivoClasses);
}

function Layout({ pantallaActiva, onNavigate, userEmail, onHelp, onLogout, children }) {
  const [modoOscuro, setModoOscuro] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('tema') === 'oscuro';
  });

  // Sidebar colapsable: pensada para pantallas con tablas anchas (Control A&P,
  // Histórico...) donde el usuario necesita más espacio horizontal.
  const [colapsado, setColapsado] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('sidebarColapsado') === '1';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', modoOscuro);
    window.localStorage.setItem('tema', modoOscuro ? 'oscuro' : 'claro');
  }, [modoOscuro]);

  useEffect(() => {
    window.localStorage.setItem('sidebarColapsado', colapsado ? '1' : '0');
  }, [colapsado]);

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950">
      <aside className={`${colapsado ? 'w-16' : 'w-64'} shrink-0 flex flex-col bg-white dark:bg-[#0E1015] border-r border-slate-200 dark:border-white/10 transition-all duration-200`}>
        <div className={`flex items-center gap-2 px-5 py-4 border-b border-slate-200 dark:border-white/10 ${colapsado ? 'flex-col px-2' : 'justify-between'}`}>
          {!colapsado && <img src={logo} alt="Logo de la empresa" className="h-8 w-auto" />}
          {colapsado && <img src={logo} alt="Logo de la empresa" className="h-7 w-auto" />}

          {/* Contraer/Expandir menú: deliberadamente en la cabecera, lejos de
              "Cerrar sesión" (pie) — ver nota de FIX arriba. */}
          <button
            type="button"
            onClick={() => setColapsado((v) => !v)}
            className={`!border-0 !bg-transparent !text-slate-500 hover:!bg-slate-100 hover:!text-slate-900 dark:!text-slate-400 dark:hover:!bg-slate-800 dark:hover:!text-white rounded-md p-1.5 shrink-0 ${colapsado ? 'mt-2' : ''}`}
            title={colapsado ? 'Expandir menú' : 'Contraer menú'}
          >
            {colapsado ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          <Sidebar
            groups={GROUPS}
            topItems={TOP_ITEMS}
            activeId={pantallaActiva}
            onSelect={onNavigate}
            colapsado={colapsado}
          />
        </nav>

        <div className="px-3 py-4 border-t border-slate-200 dark:border-white/10 space-y-1">
          {!colapsado && (
            <div className="px-3 pb-2 text-xs text-slate-500 dark:text-slate-400 truncate" title={userEmail}>
              {userEmail}
            </div>
          )}

          <button
            type="button"
            onClick={() => setModoOscuro((v) => !v)}
            className={navButtonClasses(false, colapsado)}
            title={colapsado ? (modoOscuro ? 'Modo claro' : 'Modo oscuro') : undefined}
          >
            {modoOscuro ? <Sun size={18} /> : <Moon size={18} />}
            {!colapsado && (modoOscuro ? 'Modo claro' : 'Modo oscuro')}
          </button>

          <button type="button" onClick={onHelp} className={navButtonClasses(false, colapsado)} title={colapsado ? 'Ayuda' : undefined}>
            <HelpCircle size={18} />
            {!colapsado && 'Ayuda'}
          </button>

          <button
            type="button"
            onClick={() => {
              // Confirmación de seguridad: cerrar sesión obliga a volver a
              // escribir email/contraseña, así que un clic accidental sale
              // caro. Ver nota de FIX arriba del archivo.
              if (window.confirm('¿Seguro que quieres cerrar sesión?')) onLogout();
            }}
            className={
              'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm !font-medium !border-0 !bg-transparent !text-red-600 hover:!bg-red-50 dark:!text-red-400 dark:hover:!bg-red-500/10' +
              (colapsado ? ' justify-center px-0' : '')
            }
            title={colapsado ? 'Cerrar sesión' : undefined}
          >
            <LogOut size={18} />
            {!colapsado && 'Cerrar sesión'}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-5">
        {children}
      </main>
    </div>
  );
}

export default Layout;
