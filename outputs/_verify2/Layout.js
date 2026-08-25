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
 *
 * Cambios (Fase 6 — "Pantalla de inicio", a petición de Sergio: "el sidebar
 * se ve todo cargado, cuesta trabajo saber qué es cada cosa, no es visual
 * ni profesional"): con 3 grupos + 5 accesos sueltos de nivel superior (8
 * filas) más los 12 items de Gestión repartidos en 4 subcategorías, el menú
 * había crecido "orgánicamente" fase a fase hasta ser difícil de escanear
 * de un vistazo. Se reorganiza TODO de nuevo en base a PARA QUÉ sirve cada
 * cosa (no a de dónde viene el dato):
 *  - Nuevo id de nivel superior PANTALLA_INICIO (ver PantallaInicio.js,
 *    definido aquí igual que PANTALLA_REPORTES/PANTALLA_DASHBOARD porque no
 *    es un componente con lógica propia) — pantalla por defecto al entrar,
 *    con 4 tarjetas grandes (una por cada grupo de abajo) y una frase de
 *    qué hay en cada una. Resuelve directamente "no se sabe para qué sirve
 *    cada apartado".
 *  - Los 3 grupos antiguos ("Gestión por Distribuidor", "Dashboard",
 *    "Sell-Out Clientes") más los accesos sueltos de importación se
 *    consolidan en UN solo grupo "Ventas y Datos" (todo lo que es
 *    cargar/consultar datos de venta), con "Sell-Out Clientes" e
 *    "Importaciones" como subcategorías nuevas junto a las 2 que se
 *    mantienen de antes (Entrada de Datos, Control A&P, Históricos).
 *  - Los 4 dashboards/informes de solo lectura (antes reprtidos entre el
 *    grupo "Dashboard" y accesos sueltos) pasan a un grupo nuevo
 *    "Análisis".
 *  - Las 6 tareas de mantenimiento de uso poco frecuente (antes mezcladas
 *    al mismo nivel que "Ventas y A&P": Tipología, Fusionar Marcas,
 *    Corregir Año, Mantenimiento, Papelera, Auditoría) pasan a un grupo
 *    nuevo "Administración", fuera del camino de lo que se usa a diario.
 *  - "Presupuesto y Forecast" se mantiene como único acceso suelto de nivel
 *    superior (igual que antes: se usa una o dos veces al año, no encaja
 *    bien metido dentro de ningún grupo de los de arriba).
 * Resultado: de 8 filas de nivel superior a 3 (Inicio, un grupo, Presupuesto
 * — con "Ventas y Datos" y "Análisis" colapsados por defecto salvo que la
 * vista activa esté dentro). El árbol de Sidebar.js no cambia, solo los
 * datos que recibe vía GROUPS/TOP_ITEMS.
 *
 * Cambios (mejora de navegación, análisis de IA, a petición de Sergio: "lo
 * sigo viendo un poco lioso"): los dos dashboards de "Sell-Out Clientes"
 * (Clientes, Por Marca) vivían en "Ventas y Datos" junto a pantallas de
 * ENTRADA de datos, aunque por función son análisis de solo lectura igual
 * que el resto de lo que hay en "Análisis" — inconsistencia real, no solo
 * de percepción. Se mueven a ANALISIS_ITEMS. "Importar Detalle" (que sí es
 * una acción de carga, no de consulta) se queda en "Ventas y Datos", ahora
 * dentro de la subcategoría "Importaciones" junto a los otros 2 importadores
 * — la subcategoría "Sell-Out Clientes" desaparece al quedar solo con un
 * item.
 */

import React, { useEffect, useState } from 'react';
import {
  Home, BarChart3, HelpCircle, LogOut, Sun, Moon,
  ChevronsLeft, ChevronsRight, ChevronRight, ChevronDown, FileSpreadsheet, FileText, ShoppingCart,
  Package, ShieldCheck, History, Upload, GitMerge, CalendarClock,
  Wrench, ClipboardList, Tags, Trash2, ScrollText, Target, Menu, X, TrendingDown,
  UserCheck, Database, Settings, LayoutDashboard, Building2, Plus, Check, Search, CornerDownLeft,
  Network, Layers, Calendar, CalendarCheck, MapPin, Percent, AlertTriangle, Handshake
} from 'lucide-react';
import logo from './assets/logo.png';
// Logo de la app (Sellium), a petición de Sergio: se probó primero junto al
// logo de la empresa (UNESDI) en la cabecera, pero ahí quedaba demasiado
// pequeño/apretado (competía por espacio con el botón de contraer/expandir,
// que llegó a quedar fuera del ancho visible). Se usa en el PIE del sidebar
// en su lugar, como un "Powered by" — ver más abajo, cerca de "Cerrar
// sesión". Solo en modo expandido, igual que el resto de textos del pie.
import logoSellium from './assets/logo-sellium.png';
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
import { PANTALLA_RECUPERACION_VENTAS } from './PantallaRecuperacionVentas';
import { PESTAÑA_SELLOUT_CLIENTES_DASHBOARD, PESTAÑA_SELLOUT_CLIENTES_MARCAS, PESTAÑA_SELLOUT_CLIENTES_IMPORTAR, PESTAÑA_SELLOUT_CLIENTES_DIRECCIONES } from './PantallaSellOutClientes';
import { PANTALLA_ESTRUCTURA_COMERCIAL } from './PantallaEstructuraComercial';
import { PANTALLA_CLASIFICACION_COMERCIAL } from './PantallaClasificacionComercial';
import { PANTALLA_PLANIFICACION_COMERCIAL } from './PantallaPlanificacionComercial';
import { PANTALLA_RAPEL_DISTRIBUIDORES } from './PantallaRapelDistribuidores';
import { PANTALLA_AVISOS_CONSUMO } from './PantallaAvisosConsumo';
import { PANTALLA_ACUERDOS_CLIENTES } from './PantallaAcuerdosClientes';
import { PANTALLA_AGENDA_COMERCIAL } from './PantallaAgendaComercial';
import { PANTALLA_GEOLOCALIZACION } from './PantallaGeolocalizacion';
import { PANTALLA_CONFIGURACION } from './PantallaConfiguracion';
import { TODOS_LOS_USUARIOS } from './firebaseApi';
import AlertasBell from './AlertasBell';

export const PANTALLA_REPORTES = 'REPORTES';
export const PANTALLA_DASHBOARD = 'DASHBOARD';
// Pantalla de inicio (Fase 6, ver cabecera del archivo) — igual que las dos
// de arriba, un id "genérico" sin componente propio con lógica de negocio
// (ver PantallaInicio.js), así que se define y se exporta desde aquí.
export const PANTALLA_INICIO = 'INICIO';

// Subcategorías del grupo único "Ventas y Datos" (Fase 6): consolida lo que
// antes eran 3 grupos separados (Gestión por Distribuidor, Dashboard,
// Sell-Out Clientes) más 2 accesos sueltos de importación, todo bajo un
// mismo paraguas de "cargar/consultar datos de venta". Las 3 primeras
// subcategorías (Entrada de Datos, Control A&P, Históricos) son las mismas
// de la Fase 5 (sin cambios); "Sell-Out Clientes" e "Importaciones" son
// nuevas. "Herramientas" (Fusionar Marcas, Corregir Año, Mantenimiento,
// Papelera, Auditoría) se saca de aquí — ver grupo ADMINISTRACION_ITEMS más
// abajo, porque son tareas raras de mantenimiento, no de venta.
const VENTAS_DATOS_ITEMS = [
  {
    id: 'ventas-datos-entrada',
    label: 'Entrada de Datos',
    icon: ClipboardList,
    items: [
      { id: PESTAÑA_VENTAS_AP, label: 'Ventas y A&P', icon: FileText },
      { id: PESTAÑA_COMPRAS, label: 'Compras', icon: ShoppingCart },
    ],
  },
  {
    id: 'ventas-datos-control-ap',
    label: 'Control A&P',
    icon: ShieldCheck,
    items: [
      { id: PESTAÑA_CONTROL_AP_VISION_COMERCIAL, label: 'Control A&P', icon: ShieldCheck },
      { id: PESTAÑA_STOCK, label: 'Stock', icon: Package },
    ],
  },
  {
    id: 'ventas-datos-historicos',
    label: 'Históricos',
    icon: History,
    items: [
      { id: PESTAÑA_HISTORICO_SELLOUT, label: 'Histórico Sell-Out', icon: History },
      { id: PESTAÑA_HISTORICO_SELLIN, label: 'Histórico Sell-In', icon: History },
    ],
  },
  {
    id: 'ventas-datos-importaciones',
    label: 'Importaciones',
    icon: Upload,
    items: [
      { id: PESTAÑA_IMPORTAR, label: 'Importar Excel', icon: Upload },
      { id: PESTAÑA_VENTAS_REALES_IMPORTAR, label: 'Importar Sell-In (QlikSense)', icon: FileSpreadsheet },
      { id: PESTAÑA_SELLOUT_CLIENTES_IMPORTAR, label: 'Importar Detalle Sell-Out', icon: Upload },
      // Direcciones de clientes finales (26/07/2026, primer paso de
      // "Geolocalización" — ver ImportarDireccionesClientes.js).
      { id: PESTAÑA_SELLOUT_CLIENTES_DIRECCIONES, label: 'Direcciones de Clientes', icon: MapPin },
    ],
  },
];

// Grupo nuevo "Análisis" (Fase 6): los 4 dashboards/informes de solo
// lectura, antes repartidos entre el grupo "Dashboard" y 2 accesos sueltos
// de nivel superior (Reportes Generales, Recuperación de Ventas). Al ser
// solo 4 items no hace falta subcategorías, van planos.
const ANALISIS_ITEMS = [
  { id: PANTALLA_DASHBOARD_AP_COMPANIA, label: 'Dashboard de Gestión', icon: LayoutDashboard },
  { id: PESTAÑA_SELLOUT_CLIENTES_DASHBOARD, label: 'Sell-Out Clientes', icon: UserCheck },
  { id: PESTAÑA_SELLOUT_CLIENTES_MARCAS, label: 'Sell-Out por Marca', icon: Tags },
  { id: PESTAÑA_VENTAS_REALES_DASHBOARD, label: 'Ventas Sell-In (QlikSense)', icon: FileSpreadsheet },
  { id: PANTALLA_REPORTES, label: 'Reportes Generales', icon: BarChart3 },
  { id: PANTALLA_RECUPERACION_VENTAS, label: 'Recuperación de Ventas', icon: TrendingDown },
];

// Grupo nuevo "Administración" (Fase 6): tareas de mantenimiento de uso
// poco frecuente, antes mezcladas al mismo nivel que lo de uso diario
// ("Herramientas" dentro de Gestión + "Tipología" suelta a nivel superior).
// Sacarlas a su propio grupo, colapsado por defecto, quita ruido visual del
// día a día sin perder el acceso.
const ADMINISTRACION_ITEMS = [
  { id: PESTAÑA_VENTAS_REALES_TIPOLOGIA, label: 'Tipología (bebidas)', icon: Tags },
  { id: PESTAÑA_FUSIONAR_MARCAS, label: 'Fusionar Marcas', icon: GitMerge },
  { id: PESTAÑA_CORREGIR_ANIO, label: 'Corregir Año', icon: CalendarClock },
  { id: PESTAÑA_MANTENIMIENTO, label: 'Mantenimiento', icon: Wrench },
  { id: PESTAÑA_PAPELERA, label: 'Papelera', icon: Trash2 },
  { id: PESTAÑA_AUDITORIA, label: 'Auditoría', icon: ScrollText },
];

// Fase 7 ("pantalla de menú por área", a petición de Sergio: "al pulsar
// cualquier tarjeta debería enviar a otra pantalla donde se apreciará cada
// menú, ahora hay que irse al sidebar"): cada grupo pasa a tener también su
// propia pantalla (ver PantallaGrupo.js) — por eso GROUPS se exporta ahora
// (antes solo lo usaba Sidebar.js dentro de este archivo) y cada grupo gana
// `color` y `descripcion`: son la MISMA fuente de datos que antes vivía
// duplicada en PantallaInicio.js (TARJETAS), así el título/icono/color no
// pueden desincronizarse entre el menú y las pantallas de Inicio/Grupo.
// Grupo nuevo "CRM y Comercial" (a petición de Sergio, 26/07/2026): primer
// bloque de la nueva parte de la app más allá del análisis de ventas — CRM,
// planificación comercial, estructura comercial, acuerdos con clientes,
// geolocalización y avisos de consumo. Los siguientes módulos de este
// bloque se irán añadiendo aquí, como hermanos de estos dos, según se vayan
// construyendo.
//
// "Estructura Comercial" es el nombre que usa Sergio para clasificación de
// distribuidores + peso de cartera (ver PantallaClasificacionComercial.js).
// "Equipo Comercial" es la ficha de personas/zonas/jerarquía construida en
// la primera pasada (ver aviso de renombrado en PantallaEstructuraComercial.js)
// — nombre distinto a propósito, para no repetir la confusión inicial.
// "Planificación Comercial" (añadida 26/07/2026, a petición de Sergio justo
// después de terminar Estructura Comercial): calendario de visitas
// trimestral generado a partir de la clasificación A-E de cada distribuidor
// — ver PantallaPlanificacionComercial.js.
// "Agenda Comercial" (mismo día, a petición de Sergio: "una vez confirmado,
// se deberia exportar a la agenda del proyecto... esto debe ser una nueva
// pieza del crm"): las visitas ya confirmadas desde Planificación
// Comercial, sin límite de trimestre — ver PantallaAgendaComercial.js.
// "Geolocalización" (añadida 26/07/2026, a petición de Sergio: "la idea de
// este proyecto es tener visualización de mancha de aceite con clientes por
// zonas") — mapa de clientes finales (no distribuidores) geolocalizados vía
// Nominatim/OpenStreetMap, ver PantallaGeolocalizacion.js. Las direcciones se
// importan aparte, en Sell-Out Clientes > Direcciones de Clientes.
// "Rapel Distribuidores" (añadida 26/07/2026, primera pieza de "Acuerdos con
// clientes/distribuidores" — objetivo anual escalado + bonificaciones sobre
// el mismo Objetivo Anual de Presupuesto y Forecast), ver
// PantallaRapelDistribuidores.js.
// "Avisos de Consumo" (añadida 26/07/2026, a petición de Sergio: "analizar
// aquellos clientes que están comprando menos o han dejado de comprar... y
// poder hacer la gestión de hablar con el comercial") — clientes finales
// perdidos/en caída/inactivos, con su Preventista, ver
// PantallaAvisosConsumo.js.
// "Acuerdos con Clientes" (27/07/2026, SEGUNDA pieza de "Acuerdos con
// clientes/distribuidores", después de Rapel Distribuidores — a petición de
// Sergio: "integrar en Sellium todo los formatos de acuerdos... que
// controlen los consumos de los clientes según se vayan subiendo los
// datos"): registro de acuerdos por cliente final (descuento, promoción de
// cajas, rapel por volumen, aportación fija €/botella, valor añadido) con
// seguimiento automático del consumo real, ver PantallaAcuerdosClientes.js.
const CRM_ITEMS = [
  { id: PANTALLA_CLASIFICACION_COMERCIAL, label: 'Estructura Comercial', icon: Layers },
  { id: PANTALLA_ESTRUCTURA_COMERCIAL, label: 'Equipo Comercial', icon: Network },
  { id: PANTALLA_PLANIFICACION_COMERCIAL, label: 'Planificación Comercial', icon: Calendar },
  { id: PANTALLA_AGENDA_COMERCIAL, label: 'Agenda Comercial', icon: CalendarCheck },
  { id: PANTALLA_GEOLOCALIZACION, label: 'Geolocalización', icon: MapPin },
  { id: PANTALLA_RAPEL_DISTRIBUIDORES, label: 'Rapel Distribuidores', icon: Percent },
  { id: PANTALLA_AVISOS_CONSUMO, label: 'Avisos de Consumo', icon: AlertTriangle },
  { id: PANTALLA_ACUERDOS_CLIENTES, label: 'Acuerdos con Clientes', icon: Handshake },
];

const GROUPS = [
  {
    id: 'ventas-datos',
    label: 'Ventas y Datos',
    icon: Database,
    color: 'indigo',
    descripcion: 'Cargar y consultar ventas, A&P, compras, stock e importaciones por distribuidor.',
    items: VENTAS_DATOS_ITEMS,
  },
  {
    id: 'analisis',
    label: 'Análisis',
    icon: BarChart3,
    color: 'sky',
    descripcion: 'Dashboards, Sell-Out por cliente y marca, reportes generales y recuperación de ventas para ver cómo va el negocio.',
    items: ANALISIS_ITEMS,
  },
  {
    id: 'crm',
    label: 'CRM y Comercial',
    icon: Network,
    color: 'violet',
    descripcion: 'Estructura comercial, acuerdos con clientes, planificación de visitas, geolocalización y avisos de consumo.',
    items: CRM_ITEMS,
  },
  {
    id: 'administracion',
    label: 'Administración',
    icon: Settings,
    color: 'slate',
    descripcion: 'Tipología, fusionar marcas, corregir año, mantenimiento, papelera y auditoría: tareas de uso poco frecuente.',
    items: ADMINISTRACION_ITEMS,
  },
];
export { GROUPS };

const TOP_ITEMS = [
  // Presupuesto y Forecast (Fase 2 profesionalización): hueco aparte a
  // nivel superior, a petición explícita de Sergio — ver cabecera del
  // archivo y PantallaPresupuesto.js. Sigue siendo el único acceso suelto
  // tras la Fase 6: se usa una o dos veces al año, no encaja bien metido
  // dentro de "Ventas y Datos" ni de "Análisis".
  { id: PANTALLA_PRESUPUESTO, label: 'Presupuesto y Forecast', icon: Target },
  // Configuración (26/07/2026, a petición de Sergio: catálogo de "otras
  // actividades" de la Agenda Comercial, editable SOLO por un manager — ver
  // PantallaConfiguracion.js): mismo criterio que Presupuesto, uso poco
  // frecuente y no encaja en ningún grupo existente. Visible para
  // cualquiera (la lectura es pública, ver firestore.rules), pero la propia
  // pantalla oculta los controles de edición si `esManager` es false.
  { id: PANTALLA_CONFIGURACION, label: 'Configuración', icon: Settings },
];

// Breadcrumb (mejora de navegación, a petición de Sergio: "lo sigo viendo un
// poco lioso"): antes el único camino de vuelta era el botón "← Inicio" de
// PantallaGrupo.js, así que moverse entre pantallas cercanas (p.ej. de
// "Compras" a "Stock", ambas en "Ventas y Datos" pero en subcategorías
// distintas) obligaba a volver a Inicio y rehacer todo el recorrido. Esta
// función busca la pantalla activa dentro de GROUPS/TOP_ITEMS (la MISMA
// fuente de datos que ya usan Sidebar.js y PantallaGrupo.js, así que nunca
// puede desincronizarse) y arma el rastro completo: Inicio > Grupo >
// [Subcategoría >] Pantalla. Cada nivel salvo el último es un botón que
// navega directamente ahí. Si la pantalla activa es Inicio, o no tiene
// entrada propia en el menú (caso raro: alguna pestaña interna de Gestión
// retirada del menú, ver notas de Fase 6 más arriba), no se muestra nada.
function construirMigasDePan(pantallaActiva) {
  if (pantallaActiva === PANTALLA_INICIO) return null;

  const grupo = GROUPS.find((g) => g.id === pantallaActiva);
  if (grupo) {
    return [
      { id: PANTALLA_INICIO, label: 'Inicio' },
      { id: grupo.id, label: grupo.label },
    ];
  }

  for (const g of GROUPS) {
    for (const item of g.items) {
      if (item.id === pantallaActiva) {
        return [
          { id: PANTALLA_INICIO, label: 'Inicio' },
          { id: g.id, label: g.label },
          { id: item.id, label: item.label },
        ];
      }
      if (item.items) {
        const hoja = item.items.find((sub) => sub.id === pantallaActiva);
        if (hoja) {
          return [
            { id: PANTALLA_INICIO, label: 'Inicio' },
            { id: g.id, label: g.label },
            { id: item.id, label: item.label },
            { id: hoja.id, label: hoja.label },
          ];
        }
      }
    }
  }

  const topItem = TOP_ITEMS.find((t) => t.id === pantallaActiva);
  if (topItem) {
    return [
      { id: PANTALLA_INICIO, label: 'Inicio' },
      { id: topItem.id, label: topItem.label },
    ];
  }

  return null;
}

// Buscador rápido / paleta de comandos (Ctrl+K, mejora de navegación a
// petición de Sergio — análisis de IA de julio 2026): índice plano de TODAS
// las pantallas navegables, construido UNA vez a partir de GROUPS/TOP_ITEMS
// (la misma fuente que Sidebar.js y el breadcrumb, nunca puede desincronizarse).
// Cada entrada lleva su "ruta" (Grupo › [Subcategoría ›]) para dar contexto
// en los resultados, igual que hacen los buscadores de este tipo en otros
// CRMs/ERPs (Notion, Linear...).
function construirIndiceBusqueda() {
  const indice = [{ id: PANTALLA_INICIO, label: 'Inicio', ruta: '', icon: Home, esGrupo: false }];

  GROUPS.forEach((g) => {
    indice.push({ id: g.id, label: g.label, ruta: 'Menú de área', icon: g.icon, esGrupo: true });
    g.items.forEach((item) => {
      indice.push({ id: item.id, label: item.label, ruta: g.label, icon: item.icon, esGrupo: false });
      if (item.items) {
        item.items.forEach((hoja) => {
          indice.push({ id: hoja.id, label: hoja.label, ruta: `${g.label} › ${item.label}`, icon: hoja.icon, esGrupo: false });
        });
      }
    });
  });

  TOP_ITEMS.forEach((t) => {
    indice.push({ id: t.id, label: t.label, ruta: '', icon: t.icon, esGrupo: false });
  });

  return indice;
}
// Exportado (Fase 8 — "Últimos módulos utilizados" en Inicio, especificación
// Sergio): PantallaInicio.js lo usa para resolver id → {label, icon} de las
// últimas pantallas visitadas (guardadas en App.js), sin duplicar aquí el
// mapeo de nombres/iconos — misma fuente que el buscador Ctrl+K.
export const INDICE_BUSQUEDA = construirIndiceBusqueda();

// Selector de distribuidor GLOBAL (mejora de navegación, a petición de
// Sergio — análisis de IA de julio 2026): pantallas donde tiene sentido
// mostrar en la barra superior "qué distribuidor estoy viendo/editando
// ahora mismo" — las que antes tenían CADA UNA su propio selector suelto
// (ver App.js). Se deja fuera a propósito: Importar/Fusionar Marcas/
// Corregir Año/Mantenimiento/Papelera/Auditoría/Importar Detalle Sell-Out
// (operan sobre TODA la cuenta o sobre un Excel con varios distribuidores
// mezclados, no sobre "un" distribuidor concreto).
const IDS_CON_SELECTOR_DISTRIBUIDOR = new Set([
  PESTAÑA_VENTAS_AP, PESTAÑA_COMPRAS, PESTAÑA_STOCK,
  PESTAÑA_CONTROL_AP_VISION_COMERCIAL,
  PESTAÑA_HISTORICO_SELLOUT, PESTAÑA_HISTORICO_SELLIN,
  PESTAÑA_SELLOUT_CLIENTES_DASHBOARD, PESTAÑA_SELLOUT_CLIENTES_MARCAS,
]);

// Fase 8 (especificación Sergio, estilo Dynamics 365): filas más compactas
// (py-1.5, antes py-2) y resaltado activo en el color corporativo indigo
// (antes wine) — mismo criterio que Sidebar.js, para que "Inicio"/"Buscar"
// (fuera del árbol genérico de Sidebar) no desentonen con el resto de filas.
function navButtonClasses(activo, colapsado) {
  const base = 'w-full flex items-center gap-3 px-3 py-1.5 rounded-md text-sm transition-colors !border-0' + (colapsado ? ' justify-center px-0' : '');
  const activoClasses = '!bg-indigo-50 dark:!bg-indigo-500/15 !text-indigo-700 dark:!text-indigo-300 !font-semibold';
  const inactivoClasses = '!bg-transparent !font-medium !text-slate-600 hover:!bg-slate-100 hover:!text-slate-900 dark:!text-slate-300 dark:hover:!bg-slate-800 dark:hover:!text-white';
  return base + ' ' + (activo ? activoClasses : inactivoClasses);
}

function Layout({
  pantallaActiva, onNavigate, userEmail, onHelp, onLogout, children,
  esManager, listaUsuarios, idUsuarioPropio, idUsuarioViendo, onCambiarUsuarioViendo,
  alertas, cargandoAlertas, onRefrescarAlertas,
  idDistribuidorSel, onCambiarDistribuidorSel, listaDistribuidoresGlobal,
  cargandoDistribuidoresGlobal, onCrearDistribuidorGlobal,
}) {
  const [modoOscuro, setModoOscuro] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('tema') === 'oscuro';
  });

  // Selector de distribuidor GLOBAL: desplegable propio (no un <select>
  // nativo) para poder mostrar el nombre del distribuidor actual como un
  // botón/pill en vez de una caja de formulario suelta, y para poder meter
  // el "+ Nuevo distribuidor" dentro de la misma lista desplegable.
  const [selectorDistribuidorAbierto, setSelectorDistribuidorAbierto] = useState(false);
  const [modalNuevoDistribuidorVisible, setModalNuevoDistribuidorVisible] = useState(false);
  const [nombreNuevoDistribuidor, setNombreNuevoDistribuidor] = useState('');
  const [guardandoDistribuidor, setGuardandoDistribuidor] = useState(false);

  const mostrarSelectorDistribuidor = IDS_CON_SELECTOR_DISTRIBUIDOR.has(pantallaActiva);
  const distribuidorActual = (listaDistribuidoresGlobal || []).find((d) => d.id === idDistribuidorSel);

  const handleCrearDistribuidor = async () => {
    if (!nombreNuevoDistribuidor.trim()) { alert('El nombre no puede estar vacío.'); return; }
    setGuardandoDistribuidor(true);
    try {
      await onCrearDistribuidorGlobal(nombreNuevoDistribuidor);
      setModalNuevoDistribuidorVisible(false);
      setNombreNuevoDistribuidor('');
      setSelectorDistribuidorAbierto(false);
    } catch (error) {
      console.error('Error al crear distribuidor:', error);
      alert('Error al crear distribuidor: ' + error.message);
    }
    setGuardandoDistribuidor(false);
  };

  // Buscador rápido / paleta de comandos (Ctrl+K, ver INDICE_BUSQUEDA más
  // arriba): abrir/cerrar con el atajo de teclado en cualquier pantalla, sin
  // tener que ir al Sidebar. Se reinicia la búsqueda y el resultado
  // resaltado cada vez que se abre.
  const [paletaAbierta, setPaletaAbierta] = useState(false);
  const [busquedaPaleta, setBusquedaPaleta] = useState('');
  const [indiceActivoPaleta, setIndiceActivoPaleta] = useState(0);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletaAbierta((v) => !v);
      } else if (e.key === 'Escape') {
        setPaletaAbierta(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (paletaAbierta) {
      setBusquedaPaleta('');
      setIndiceActivoPaleta(0);
    }
  }, [paletaAbierta]);

  const resultadosPaleta = (() => {
    const q = busquedaPaleta.trim().toLowerCase();
    if (!q) return INDICE_BUSQUEDA.slice(0, 8);
    return INDICE_BUSQUEDA
      .filter((it) => it.label.toLowerCase().includes(q) || it.ruta.toLowerCase().includes(q))
      .slice(0, 8);
  })();

  const handleSeleccionarResultadoPaleta = (id) => {
    handleNavigate(id);
    setPaletaAbierta(false);
  };

  const handleKeyDownPaleta = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndiceActivoPaleta((i) => Math.min(i + 1, resultadosPaleta.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndiceActivoPaleta((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const elegido = resultadosPaleta[indiceActivoPaleta];
      if (elegido) handleSeleccionarResultadoPaleta(elegido.id);
    }
  };

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
          `shrink-0 flex flex-col bg-white dark:bg-[#111827] border-r border-slate-200 dark:border-white/10 md:transition-all md:duration-200`
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
          {/* Inicio (Fase 6, ver cabecera del archivo): fuera del árbol
              genérico de Sidebar.js, a propósito — es un enlace fijo
              "volver al punto de partida", no un item más de la lista, así
              que se pinta siempre primero y con un separador debajo. */}
          <button
            type="button"
            onClick={() => handleNavigate(PANTALLA_INICIO)}
            className={navButtonClasses(pantallaActiva === PANTALLA_INICIO, colapsadoVisual) + ' mb-2'}
            title={colapsadoVisual ? 'Inicio' : undefined}
          >
            <Home size={18} />
            {!colapsadoVisual && 'Inicio'}
          </button>

          {/* Buscador rápido / paleta de comandos (Ctrl+K, ver
              INDICE_BUSQUEDA más arriba): mismo sitio fijo que "Inicio",
              alcanzable desde cualquier pantalla sin abrir ningún submenú. */}
          <button
            type="button"
            onClick={() => setPaletaAbierta(true)}
            className={navButtonClasses(false, colapsadoVisual) + ' mb-2'}
            title={colapsadoVisual ? 'Buscar (Ctrl+K)' : undefined}
          >
            <Search size={18} />
            {!colapsadoVisual && (
              <span className="flex-1 flex items-center justify-between">
                Buscar
                <span className="text-[10px] border border-slate-300 dark:border-slate-600 rounded px-1 py-0.5 text-slate-400 dark:text-slate-500">Ctrl K</span>
              </span>
            )}
          </button>
          <div className="border-t border-slate-200 dark:border-white/10 mb-2" />

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
              'w-full flex items-center gap-3 px-3 py-1.5 rounded-md text-sm !font-medium !border-0 !bg-transparent !text-red-600 hover:!bg-red-50 dark:!text-red-400 dark:hover:!bg-red-500/10' +
              (colapsadoVisual ? ' justify-center px-0' : '')
            }
            title={colapsadoVisual ? 'Cerrar sesión' : undefined}
          >
            <LogOut size={18} />
            {!colapsadoVisual && 'Cerrar sesión'}
          </button>

          {/* Logo de la app (Sellium), a petición de Sergio: se probó junto
              al logo de la empresa en la cabecera, pero ahí quedaba
              demasiado pequeño/apretado (tenía que competir por espacio con
              el botón de contraer). Se mueve aquí, al pie, como un discreto
              "Powered by" — y solo en modo expandido, igual que el resto de
              textos de este pie (email, "Viendo como"...).
              CAMBIO (Fase 8, especificación Sergio: "reducir protagonismo
              visual del logo Sellium", estilo Dynamics 365 — el pie de un
              sidebar corporativo no debe competir visualmente con la
              navegación): el logo pasa de ocupar todo el ancho de la barra a
              un tamaño pequeño y centrado, con opacidad reducida. */}
          {!colapsadoVisual && (
            <div className="pt-2 mt-1 flex flex-col items-center">
              <span className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1 opacity-70">Powered by</span>
              <img src={logoSellium} alt="Sellium" className="w-16 h-auto rounded opacity-60" />
            </div>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Barra superior móvil (ver cabecera del archivo): solo visible
            <768px (md:hidden) — en desktop el <aside> ya está siempre a la
            vista, así que esta barra no hace falta ahí. */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-[#111827] sticky top-0 z-20">
          <button
            type="button"
            onClick={() => setMenuMovilAbierto(true)}
            className="!border-0 !bg-transparent !text-slate-600 dark:!text-slate-300 hover:!bg-slate-100 dark:hover:!bg-slate-800 rounded-md p-1.5 shrink-0"
            title="Abrir menú"
          >
            <Menu size={22} />
          </button>
          <img src={logo} alt="Logo de la empresa" className="h-7 w-auto shrink-0" />
        </div>

        <main className="flex-1 p-3 sm:p-5">
          {/* Migas de pan (ver construirMigasDePan más arriba) + selector de
              distribuidor GLOBAL (ver IDS_CON_SELECTOR_DISTRIBUIDOR más
              arriba): misma fila, migas a la izquierda y selector a la
              derecha cuando la pantalla activa trabaja sobre un distribuidor
              concreto.
              FIJA AL HACER SCROLL (26/07/2026, a petición de Sergio: "la
              barra principal al hacer scroll siempre permanezca" — se
              perdía de vista al bajar por tablas largas, ej. Avisos de
              Consumo con cientos de filas): `sticky top-0` respecto al
              contenedor que de verdad scrollea (el <div overflow-y-auto> que
              envuelve <main>, más arriba) + fondo opaco propio (si no,
              se vería el contenido de la tabla pasando por detrás) + margen
              negativo que cancela el padding de <main> y lo vuelve a poner
              como padding propio, para que la banda de fondo cubra todo el
              ancho y no sea un rectángulo flotando con huecos a los lados.
              `top-[53px] md:top-0`: en móvil ya hay OTRA barra sticky top-0
              encima (el logo+botón de menú, arriba, md:hidden) — sin este
              desplazamiento, las dos se pisarían en el mismo sitio en vez de
              apilarse; 53px ≈ la altura real de esa barra móvil (icono +
              padding + borde). En desktop esa barra no existe, así que aquí
              no hace falta desplazamiento. */}
          {(() => {
            const migas = construirMigasDePan(pantallaActiva);
            if (!migas && !mostrarSelectorDistribuidor) return null;
            return (
              <div className="sticky top-[53px] md:top-0 z-10 -mx-3 sm:-mx-5 px-3 sm:px-5 py-2 mb-3 bg-slate-50 dark:bg-slate-950 flex items-center justify-between gap-3 flex-wrap">
                {migas ? (
                  <nav aria-label="Migas de pan" className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                    {migas.map((miga, i) => {
                      const esUltima = i === migas.length - 1;
                      return (
                        <React.Fragment key={miga.id}>
                          {i > 0 && <ChevronRight size={12} className="shrink-0" />}
                          {esUltima ? (
                            <span className="font-semibold text-slate-700 dark:text-slate-200">{miga.label}</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleNavigate(miga.id)}
                              className="!border-0 !bg-transparent !p-0 !font-normal !text-slate-500 dark:!text-slate-400 hover:!text-slate-900 dark:hover:!text-white hover:underline"
                            >
                              {miga.label}
                            </button>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </nav>
                ) : <span />}

                {mostrarSelectorDistribuidor && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setSelectorDistribuidorAbierto((v) => !v)}
                      disabled={cargandoDistribuidoresGlobal}
                      className="!border !border-slate-200 dark:!border-slate-700 !bg-white dark:!bg-slate-900 !text-slate-700 dark:!text-slate-200 !font-medium text-xs px-3 py-1.5 rounded-md flex items-center gap-2 hover:!bg-slate-50 dark:hover:!bg-slate-800"
                    >
                      <Building2 size={14} className="shrink-0 text-slate-400" />
                      {cargandoDistribuidoresGlobal
                        ? 'Cargando…'
                        : (distribuidorActual ? distribuidorActual.nombre_distribuidor : '-- Elegir distribuidor --')}
                      <ChevronDown size={13} className="shrink-0 text-slate-400" />
                    </button>

                    {selectorDistribuidorAbierto && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setSelectorDistribuidorAbierto(false)} />
                        <div className="absolute right-0 top-full mt-1 z-20 w-64 max-h-72 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg py-1">
                          {(listaDistribuidoresGlobal || []).map((d) => (
                            <button
                              key={d.id}
                              type="button"
                              onClick={() => { onCambiarDistribuidorSel(d.id); setSelectorDistribuidorAbierto(false); }}
                              className="!border-0 !bg-transparent !p-0 w-full text-left px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 hover:!bg-slate-100 dark:hover:!bg-slate-700 flex items-center gap-2"
                            >
                              <Check size={13} className={`shrink-0 ${d.id === idDistribuidorSel ? 'opacity-100 text-indigo-600 dark:text-indigo-400' : 'opacity-0'}`} />
                              {d.nombre_distribuidor}
                            </button>
                          ))}
                          {(listaDistribuidoresGlobal || []).length === 0 && (
                            <div className="px-3 py-1.5 text-xs text-slate-400">Sin distribuidores todavía</div>
                          )}
                          <div className="border-t border-slate-200 dark:border-slate-700 mt-1 pt-1">
                            <button
                              type="button"
                              onClick={() => { setModalNuevoDistribuidorVisible(true); setSelectorDistribuidorAbierto(false); }}
                              className="!border-0 !bg-transparent !p-0 w-full text-left px-3 py-1.5 text-xs !font-medium text-indigo-600 dark:text-indigo-400 hover:!bg-slate-100 dark:hover:!bg-slate-700 flex items-center gap-2"
                            >
                              <Plus size={13} className="shrink-0" />
                              Nuevo distribuidor
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Modal "Nuevo distribuidor" (mismo selector global de arriba) */}
          {modalNuevoDistribuidorVisible && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-lg">
                <h4 className="text-base font-medium text-slate-900 dark:text-white mb-4">Nuevo distribuidor</h4>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Nombre del distribuidor</label>
                <input
                  type="text"
                  value={nombreNuevoDistribuidor}
                  onChange={(e) => setNombreNuevoDistribuidor(e.target.value)}
                  placeholder="Nombre del nuevo distribuidor"
                  className="w-full mb-4 !bg-white dark:!bg-slate-900 !text-slate-900 dark:!text-slate-100 !border !border-slate-300 dark:!border-slate-600 rounded-md px-2.5 py-2 text-sm"
                />
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setModalNuevoDistribuidorVisible(false)}
                    disabled={guardandoDistribuidor}
                    className="!border !border-slate-300 dark:!border-slate-600 !bg-white dark:!bg-slate-800 !text-slate-700 dark:!text-slate-200 text-sm px-3 py-1.5 rounded-md"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleCrearDistribuidor}
                    disabled={guardandoDistribuidor}
                    className="!border-0 !bg-indigo-600 hover:!bg-indigo-700 !text-white text-sm px-3 py-1.5 rounded-md"
                  >
                    {guardandoDistribuidor ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </div>
            </div>
          )}

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

      {/* Buscador rápido / paleta de comandos (Ctrl+K) — ver INDICE_BUSQUEDA
          y el atajo de teclado más arriba. Se dibuja al nivel raíz (no
          dentro de <main>) para quedar por encima de todo, incluida la
          barra lateral. */}
      {paletaAbierta && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]"
          onClick={() => setPaletaAbierta(false)}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
              <Search size={16} className="text-slate-400 shrink-0" />
              <input
                autoFocus
                type="text"
                value={busquedaPaleta}
                onChange={(e) => { setBusquedaPaleta(e.target.value); setIndiceActivoPaleta(0); }}
                onKeyDown={handleKeyDownPaleta}
                placeholder="Buscar una pantalla…"
                className="flex-1 !border-0 !bg-transparent !p-0 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:!outline-none focus:!ring-0"
              />
              <span className="text-[10px] border border-slate-300 dark:border-slate-600 rounded px-1 py-0.5 text-slate-400 dark:text-slate-500 shrink-0">Esc</span>
            </div>

            <div className="max-h-80 overflow-y-auto py-1">
              {resultadosPaleta.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-slate-400">Sin resultados.</div>
              )}
              {resultadosPaleta.map((item, i) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSeleccionarResultadoPaleta(item.id)}
                  onMouseEnter={() => setIndiceActivoPaleta(i)}
                  className={
                    'w-full flex items-center justify-between gap-3 px-4 py-2 text-left !border-0 !rounded-none ' +
                    (i === indiceActivoPaleta
                      ? '!bg-indigo-50 dark:!bg-indigo-500/15 !text-indigo-700 dark:!text-indigo-300'
                      : '!bg-transparent !text-slate-700 dark:!text-slate-200')
                  }
                >
                  <span className="flex flex-col min-w-0">
                    <span className="text-sm font-medium truncate">{item.label}</span>
                    {item.ruta && <span className="text-xs text-slate-400 truncate">{item.ruta}</span>}
                  </span>
                  {i === indiceActivoPaleta && <CornerDownLeft size={14} className="shrink-0 text-slate-400" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Layout;
