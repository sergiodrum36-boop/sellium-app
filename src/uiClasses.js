/*
 * uiClasses.js
 * Clases Tailwind compartidas entre pantallas (Fase 3 del rediseño visual).
 * Centralizar aquí evita repetir las mismas cadenas de clases en cada
 * pantalla y facilita mantener un mismo estilo si se ajusta algo más adelante.
 *
 * CAMBIO (Fase 8 — "salto de calidad visual", especificación detallada de
 * Sergio: quiere que la app transmita "herramienta corporativa premium" al
 * estilo Dynamics 365/Power BI/HubSpot): al estar TODO centralizado aquí,
 * este único archivo actualiza el look de prácticamente toda la app (tarjetas,
 * KPIs, filtros, botones, inputs, títulos) sin tener que tocar pantalla por
 * pantalla. Cambios concretos: radios más generosos (tarjetas 16px, no 12px),
 * sombra más suave (`shadow-soft`, ver tailwind.config.js), tipografía de
 * títulos más grande (32px página / 18px subtítulo, antes 20px/14px).
 */

// El "dark:[color-scheme:dark]" es clave para los inputs type="month"/"date":
// sin él, el icono del calendario nativo del navegador se dibuja con un fondo
// claro fijo que no respeta el modo oscuro, y parece "salirse" del marco
// redondeado del input (una cajita clara encima de un input oscuro).
// "min-w-0" es necesario porque los <select>/<input> dentro de una fila flex
// (p.ej. "Marca:" + desplegable + botón "+ Añadir") tienen por defecto un
// ancho mínimo basado en su contenido que ignora "flex-1" y "flex-shrink":
// eso hace que el desplegable no se reduzca y "se salga" del recuadro/tarjeta
// que lo contiene cuando no hay espacio suficiente. min-w-0 se lo permite.
// Fondo oscuro del input: tono "Panel" (#172338, especificación Sergio) y no
// el mismo que la tarjeta que lo rodea (slate-800/#1e293b) — así el control
// se percibe como un hueco/"well" dentro de la tarjeta, en vez de fundirse
// con ella y depender solo del borde para distinguirse.
export const inputClasses = '!px-2.5 !py-1.5 !rounded-xl !border !border-slate-300 dark:!bg-[#172338] dark:!text-slate-100 dark:!border-slate-600 text-sm dark:[color-scheme:dark] min-w-0';

export const botonPrimario = '!bg-indigo-600 hover:!bg-indigo-700 !text-white !border-0 !font-semibold px-4 py-2 rounded-[10px] text-sm';
export const botonSecundario = '!bg-slate-200 dark:!bg-slate-700 hover:!bg-slate-300 dark:hover:!bg-slate-600 !text-slate-700 dark:!text-slate-100 !border-0 !font-semibold px-4 py-2 rounded-[10px] text-sm';
export const botonExito = '!bg-emerald-600 hover:!bg-emerald-700 !text-white !border-0 !font-semibold px-4 py-2 rounded-[10px] text-sm';
export const botonPeligro = '!bg-red-600 hover:!bg-red-700 !text-white !border-0 !font-semibold px-3 py-1.5 rounded-[10px] text-xs';
export const botonInfo = '!bg-sky-600 hover:!bg-sky-700 !text-white !border-0 !font-semibold px-3 py-1.5 rounded-[10px] text-sm';
export const botonPill = '!bg-indigo-50 dark:!bg-indigo-500/20 !text-indigo-700 dark:!text-indigo-300 !border !border-indigo-200 dark:!border-indigo-500/30 !font-semibold !rounded-full px-3 py-1.5 text-xs';

// tarjeta/filtroContenedor: radio 16px y sombra suave (especificación
// Sergio). El tono oscuro de tarjeta (slate-800, #1e293b) YA coincidía con
// su especificación exacta de "Cards" — no ha hecho falta cambiarlo.
// filtroContenedor usa en su lugar el tono "Panel" (#172338, un peldaño más
// oscuro que las tarjetas) para que un grupo de filtros se perciba como una
// capa propia, no como una tarjeta de contenido más — mismo criterio que
// Power BI/HubSpot, donde el área de filtros se distingue del área de datos.
export const tarjeta = 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-soft';
export const filtroContenedor = 'bg-white dark:bg-[#172338] border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex flex-wrap gap-3 items-center shadow-soft';
export const etiqueta = 'text-xs font-semibold text-slate-600 dark:text-slate-300';
// tituloPantalla/subtitulo: escala tipográfica de la especificación de
// Sergio (título de página 32px, subtítulo 18px — antes 20px/14px, se
// sentían "de formulario" en vez de "de aplicación de análisis").
export const tituloPantalla = 'text-[32px] font-semibold text-slate-900 dark:text-white mb-2 tracking-tight';
export const subtitulo = 'text-lg text-slate-500 dark:text-slate-400 mb-4';

export const thClasses = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap';
export const tdClasses = 'px-3 py-2 text-sm text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-700';
export const tdRightClasses = tdClasses + ' text-right tabular-nums';
export const trTotales = 'bg-slate-50 dark:bg-slate-900 font-semibold';

// Padding reducido (p-3, antes p-4) y radio a 16px (especificación Sergio:
// "reducir altura de KPIs, estilo Power BI" — más compactos, sin perder
// legibilidad del valor).
export const kpiCard = 'flex-1 min-w-[200px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3';
export const kpiTitulo = 'text-xs font-semibold text-slate-500 dark:text-slate-400 tracking-wide mb-0.5';
// Color base explícito (antes no lo tenía y, sin un colorPorSigno/override
// detrás, el valor heredaba un gris casi invisible en modo oscuro — bug
// detectado en Recuperación de Ventas, KPI "Importe a recuperar"). Los
// usos que añaden colorPorSigno(...) con prefijo "!" lo siguen pisando sin
// problema.
export const kpiValor = 'text-xl font-semibold text-slate-900 dark:text-white';

// Color según el signo del valor: rojo si es negativo, verde si es positivo,
// sin color especial si es exactamente 0. Centralizada aquí (rediseño
// visual, Fase 3) porque la usan ControlAP.js, ControlAPVisionComercial.js,
// KpiCard.js y los gráficos del Dashboard — antes estaba duplicada como
// función local en los dos primeros archivos.
// IMPORTANTE: se usa el prefijo "!" de Tailwind porque las celdas de tabla
// (tdRightClasses) y las tarjetas KPI ya traen su propio color de texto
// base. Sin el "!", la clase de color condicional no gana la especificidad
// CSS frente a esa clase base (bug documentado y ya resuelto en ControlAP.js
// y CorregirAnio.js) y el rojo/verde nunca llega a verse.
export const colorPorSigno = (valor) => {
  if (valor < 0) return '!text-red-600 dark:!text-red-400';
  if (valor > 0) return '!text-emerald-600 dark:!text-emerald-400';
  return 'text-slate-900 dark:text-white';
};
