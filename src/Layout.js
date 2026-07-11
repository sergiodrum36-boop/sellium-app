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
 *
 * Cambios (roles/permisos, a petición de Sergio): si el usuario logueado es
 * "manager" (ver App.js/firebaseApi.js), aparece encima del email, en el
 * pie de la barra lateral, un selector "Viendo como" con "Mis datos" + un
 * item por cada usuario dado de alta. Cambiar la selección no navega a
 * ningún sitio nuevo — solo cambia de QUIÉN son los datos que se están
 * viendo en la pantalla ya abierta (App.js pasa `idUsuarioEfectivo`, no el
 * id propio, a las 5 secciones). No aparece nada de esto para un usuario
 * normal (esManager=false): sigue viendo solo lo suyo, exactamente como
 * antes de este cambio.
 *
 * Cambios (roles/permisos Fase 2 — "Todos los usuarios", a petición de
 * Sergio): el selector "Viendo como" gana una tercera opción, "Todos los
 * usuarios" (valor TODOS_LOS_USUARIOS, ver firebaseApi.js), entre "Mis
 * datos" y la lista de usuarios concretos. Al elegirla, las 4 pantallas de
 * análisis (Dashboard, Dashboard A&P Compañía, Reportes, Dashboard de
 * Ventas Reales) agregan el histórico de TODOS los usuarios a la vez; la
 * pantalla de "Gestión por Distribuidor" (que es de edición, no de
 * análisis) se bloquea con un aviso en ese modo — ver App.js y
 * PantallaDistribuidor.js.
 *
 * Cambios (alertas proactivas, a petición de Sergio, último punto de la
 * auditoría de la app): se añade una campana con contador (AlertasBell.js)
 * en el pie de la barra lateral, con el detalle de los avisos calculados en
 * App.js (ver alertas.js) — balance negativo, distribuidores sin actividad
 * reciente y descuadre de datos. Visible para cualquier usuario (no solo
 * managers), justo encima del selector "Viendo como".
 *
 * Cambios (papelera + auditoría, a petición de Sergio): dos nuevas entradas
 * en la subcategoría "Herramientas" de "Gestión por Distribuidor" —
 * "Papelera" y "Auditoría" (ver PantallaDistribuidor.js/Papelera.js/
 * Auditoria.js), junto a "Mantenimiento".
 *
 * Cambios (Presupuesto y Forecast, Fase 2 profesionalización, a petición
 * de Sergio: "dar un hueco aparte ya que solo se utilizaría una o dos veces
 * al año la creación del budget"): nuevo acceso de NIVEL SUPERIOR (junto a
 * "Reportes Generales", fuera de los grupos "Gestión por Distribuidor" y
 * "Dashboard") — ver PantallaPresupuesto.js.
 *
 * Cambios (responsive/móvil, a petición de Sergio, último punto pendiente
 * del roadmap de profesionalización): hasta ahora el <aside> era SIEMPRE
 * visible con ancho fijo (w-64/w-16 según "colapsado"), lo que en una
 * pantalla de móvil (viewport <768px, breakpoint "md" de Tailwind) dejaba
 * casi sin espacio al contenido principal — no había ninguna forma de
 * ocultarlo. Se añade:
 *  - Un estado nuevo `menuMovilAbierto` (solo relevante <768px).
 *  - En móvil el <aside> pasa a ser "off-canvas": position fixed, fuera de
 *    la pantalla (-translate-x-full) por defecto, y se desliza a la vista
 *    (translate-x-0) cuando se abre. A partir de "md:" recupera el
 *    comportamiento de siempre (estático, dentro del flujo, sin transform).
 *  - Un overlay semitransparente detrás del menú abierto en móvil, que lo
 *    cierra al tocarlo fuera.
 *  - Una barra superior nueva, visible SOLO en móvil ("md:hidden"), con el
 *    botón de hamburguesa (abre el menú) y el logo — en desktop esa barra
 *    no se muestra porque el <aside> ya está siempre visible.
 *  - El botón de contraer/expandir (ChevronsLeft/Right) queda oculto en
 *    móvil (no tiene sentido "contraer" un menú que ya está oculto por
 *    defecto) y se sustituye ahí por un botón de cerrar (X).
 *  - Elegir cualquier opción del menú (Sidebar) cierra automáticamente el
 *    menú móvil, para no tener que cerrarlo a mano tras cada navegación.
 * En pantallas "md:" o mayores, el comportamiento visual es IDÉNTICO al de
 * antes de este cambio.
 */

import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard, Users, BarChart3, HelpCircle, LogOut, Sun, Moon,
  ChevronsLeft, ChevronsRight, FileSpreadsheet, FileText, ShoppingCart,
  Package, ShieldCheck, History, Upload, GitMerge, CalendarClock,
  Wrench, ClipboardList, Tags, Trash2, ScrollText, Target, Menu, X
} from 'lucide-react';
import logo from './assets/logo.png';
import Sidebar from './Sidebar';
import {
  PESTAÑA_VENTAS_AP, PESTAÑA_COMPRAS, PESTAÑA_STOCK,
  PESTAÑA_CONTROL_AP_VISION_COMERCIAL, PESTAÑA_HISTORICO_SELLOUT,
  PESTAÑA_HISTORICO_SELLIN, PESTAÑA_IMPORTAR, PESTAÑA_FUSIONAR_MARCAS,
  PESTAÑA_CORREGIR_ANIO, PESTAÑA_MANTENIMIENTO, PESTAÑA_PAPELERA,
  PESTAÑA_AUDITORIA
} from './PantallaDistribuidor';
import {
  PESTAÑA_VENTAS_REALES_DASHBOARD, PESTAÑA_VENTAS_REALES_IMPORTAR,
  PESTAÑA_VENTAS_REALES_TIPOLOGIA
} from './PantallaVentasReales';
import { PANTALLA_DASHBOARD_AP_COMPANIA } from './PantallaDashboardAPCompania';
import { PANTALLA_PRESUPUESTO } from './PantallaPresupuesto';
import { TODOS_LOS_USUARIOS } from './firebaseApi';
import AlertasBell from './AlertasBell';

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
      { id: PESTAÑA_PAPELERA, label: 'Papelera', icon: Trash2 },
      { id: PESTAÑA_AUDITORIA, label: 'Auditoría', icon: ScrollText },
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
  // Presupuesto y Forecast (Fase 2 profesionalización): hueco aparte a
  // nivel superior, a petición explícita de Sergio — ver cabecera del
  // archivo y PantallaPresupuesto.js.
  { id: PANTALLA_PRESUPUESTO, label: 'Presupuesto y Forecast', icon: Target },
];

function navButtonClasses(activo, colapsado) {
  const base = 'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm !font-medium transition-colors !border-0' + (colapsado ? ' justify-center px-0' : '');
  const activoClasses = '!bg-wine-soft !text-slate-900 dark:!text-white';
  const inactivoClasses = '!bg-transparent !text-slate-600 hover:!bg-slate-100 hover:!text-slate-900 dark:!text-slate-300 dark:hover:!bg-slate-800 dark:hover:!text-white';
  return base + ' ' + (activo ? activoClasses : inactivoClasses);
}

function Layout({
  pantallaActiva, onNavigate, userEmail, onHelp, onLogout, children,
  esManager, listaUsuarios, idUsuarioPropio, idUsuarioViendo, onCambiarUsuarioViendo,
  alertas, cargandoAlertas, onRefrescarAlertas
}) {
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

  // Responsive/móvil (ver cabecera del archivo): menú off-canvas, cerrado
  // por defecto. Solo tiene efecto visual por debajo del breakpoint "md" de
  // Tailwind (768px) — en desktop el <aside> ignora este estado.
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);

  // Navegar desde el Sidebar cierra el menú móvil automáticamente (en
  // desktop no tiene efecto visible, ya que el <aside> nunca está "cerrado"
  // ahí).
  const handleNavigate = (id) => {
    onNavigate(id);
    setMenuMovilAbierto(false);
  };

  // "colapsado" (iconos sin texto, sin selector/email/etiquetas de botón) es
  // una preferencia de DESKTOP. En móvil el <aside> siempre se abre a w-64
  // completo (ver clases del <aside> más abajo) — si se usara el valor
  // "colapsado" tal cual también en el pie/Sidebar, un usuario que hubiera
  // dejado el menú contraído en su última sesión de escritorio vería en el
  // móvil un cajón ancho pero sin ninguna etiqueta ni el email ni el
  // selector "Viendo como", sin ninguna forma de expandirlo (el botón de
  // contraer/expandir está oculto en móvil a propósito). `colapsadoVisual`
  // es lo que de verdad se usa para decidir qué se pinta: la preferencia
  // real SOLO cuando no estamos en el menú móvil abierto.
  const colapsadoVisual = colapsado && !menuMovilAbierto;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', modoOscuro);
    window.localStorage.setItem('tema', modoOscuro ? 'oscuro' : 'claro');
  }, [modoOscuro]);

  useEffect(() => {
    window.localStorage.setItem('sidebarColapsado', colapsado ? '1' : '0');
  }, [colapsado]);

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950">
      {/* Responsive/móvil: overlay que oscurece el contenido detrás del menú
          abierto y lo cierra al tocarlo. Solo existe <768px (md:hidden) y
          solo se renderiza con el menú abierto. */}
      {menuMovilAbierto && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setMenuMovilAbierto(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={
          `fixed inset-y-0 left-0 z-40 w-64 transform transition-transform duration-200 ` +
          (menuMovilAbierto ? 'translate-x-0' : '-translate-x-full') +
          ` md:static md:z-auto md:translate-x-0 md:transition-none ${colapsado ? 'md:w-16' : 'md:w-64'} ` +
          `shrink-0 flex flex-col bg-white dark:bg-[#0E1015] border-r border-slate-200 dark:border-white/10 md:transition-all md:duration-200`
        }
      >
        <div className={`flex items-center gap-2 px-5 py-4 border-b border-slate-200 dark:border-white/10 ${colapsadoVisual ? 'md:flex-col md:px-2' : 'justify-between'}`}>
          {!colapsadoVisual && <img src={logo} alt="Logo de la empresa" className="h-8 w-auto md:h-8" />}
          {colapsadoVisual && <img src={logo} alt="Logo de la empresa" className="h-8 w-auto md:h-7" />}

          {/* Contraer/Expandir menú: solo tiene sentido en desktop, donde el
              <aside> siempre está visible — ver nota de FIX arriba. Oculto
              en móvil (md:inline-flex), donde en su lugar hay un botón de
              cerrar (X) justo debajo. */}
          <button
            type="button"
            onClick={() => setColapsado((v) => !v)}
            className={`hidden md:inline-flex !border-0 !bg-transparent !text-slate-500 hover:!bg-slate-100 hover:!text-slate-900 dark:!text-slate-400 dark:hover:!bg-slate-800 dark:hover:!text-white rounded-md p-1.5 shrink-0 ${colapsado ? 'md:mt-2' : ''}`}
            title={colapsado ? 'Expandir menú' : 'Contraer menú'}
          >
            {colapsado ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          </button>

          {/* Cerrar menú: solo en móvil (md:hidden) — ver cabecera del archivo. */}
          <button
            type="button"
            onClick={() => setMenuMovilAbierto(false)}
            className="md:hidden !border-0 !bg-transparent !text-slate-500 hover:!bg-slate-100 hover:!text-slate-900 dark:!text-slate-400 dark:hover:!bg-slate-800 dark:hover:!text-white rounded-md p-1.5 shrink-0"
            title="Cerrar menú"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          {/* "colapsado" (iconos sin texto) es una preferencia de DESKTOP —
              en móvil el <aside> siempre ocupa w-64 (ver clases de arriba),
              así que aquí se ignora mientras el menú móvil esté abierto
              (menuMovilAbierto solo puede ser true por el botón de
              hamburguesa, que a su vez solo existe en móvil: en desktop
              esta condición nunca cambia el valor de "colapsado"). */}
          <Sidebar
            groups={GROUPS}
            topItems={TOP_ITEMS}
            activeId={pantallaActiva}
            onSelect={handleNavigate}
            colapsado={colapsadoVisual}
          />
        </nav>

        <div className="px-3 py-4 border-t border-slate-200 dark:border-white/10 space-y-1">
          {/* Alertas proactivas: visible para cualquier usuario (no solo
              managers), ver cabecera del archivo y alertas.js. */}
          <AlertasBell
            alertas={alertas}
            cargando={cargandoAlertas}
            onRefrescar={onRefrescarAlertas}
            colapsado={colapsadoVisual}
          />

          {/* Roles/permisos: selector "Viendo como", solo para managers (ver
              cabecera del archivo). Con la barra colapsada no cabe un select
              con texto, así que se oculta igual que el email de debajo. */}
          {!colapsadoVisual && esManager && (
            <div className="px-3 pb-2">
              <label className="block text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1">
                Viendo como
              </label>
              <select
                value={idUsuarioViendo || ''}
                onChange={(e) => onCambiarUsuarioViendo(e.target.value || null)}
                className="w-full text-xs px-2 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
              >
                <option value="">Mis datos</option>
                <option value={TODOS_LOS_USUARIOS}>Todos los usuarios</option>
                {[...listaUsuarios]
                  .filter(u => u.id !== idUsuarioPropio)
                  .sort((a, b) => (a.email || '').localeCompare(b.email || ''))
                  .map(u => (
                    <option key={u.id} value={u.id}>{u.email}</option>
                  ))}
              </select>
            </div>
          )}

          {!colapsadoVisual && (
            <div className="px-3 pb-2 text-xs text-slate-500 dark:text-slate-400 truncate" title={userEmail}>
              {userEmail}
            </div>
          )}

          <button
            type="button"
            onClick={() => setModoOscuro((v) => !v)}
            className={navButtonClasses(false, colapsadoVisual)}
            title={colapsadoVisual ? (modoOscuro ? 'Modo claro' : 'Modo oscuro') : undefined}
          >
            {modoOscuro ? <Sun size={18} /> : <Moon size={18} />}
            {!colapsadoVisual && (modoOscuro ? 'Modo claro' : 'Modo oscuro')}
          </button>

          <button type="button" onClick={onHelp} className={navButtonClasses(false, colapsadoVisual)} title={colapsadoVisual ? 'Ayuda' : undefined}>
            <HelpCircle size={18} />
            {!colapsadoVisual && 'Ayuda'}
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
              (colapsadoVisual ? ' justify-center px-0' : '')
            }
            title={colapsadoVisual ? 'Cerrar sesión' : undefined}
          >
            <LogOut size={18} />
            {!colapsadoVisual && 'Cerrar sesión'}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Barra superior móvil (ver cabecera del archivo): solo visible
            <768px (md:hidden) — en desktop el <aside> ya está siempre a la
            vista, así que esta barra no hace falta ahí. */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-[#0E1015] sticky top-0 z-20">
          <button
            type="button"
            onClick={() => setMenuMovilAbierto(true)}
            className="!border-0 !bg-transparent !text-slate-600 dark:!text-slate-300 hover:!bg-slate-100 dark:hover:!bg-slate-800 rounded-md p-1.5 shrink-0"
            title="Abrir menú"
          >
            <Menu size={22} />
          </button>
          <img src={logo} alt="Logo de la empresa" className="h-7 w-auto" />
        </div>

        <main className="flex-1 p-3 sm:p-5">
          {/* Roles/permisos: aviso de qué se está viendo cuando un manager NO
              está en "Mis datos" — la mayoría de las pantallas cambian de
              contenido por completo al cambiar la selección, así que conviene
              que quede claro sin tener que mirar el Sidebar. */}
          {esManager && idUsuarioViendo && (
            <div className="mb-4 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-xs text-amber-800 dark:text-amber-300">
              Viendo como manager: {
                idUsuarioViendo === TODOS_LOS_USUARIOS
                  ? 'todos los usuarios (datos agregados)'
                  : (listaUsuarios.find(u => u.id === idUsuarioViendo)?.email || idUsuarioViendo)
              }
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}

export default Layout;
