/*
 * uiClasses.js
 * Clases Tailwind compartidas entre pantallas (Fase 3 del rediseño visual).
 * Centralizar aquí evita repetir las mismas cadenas de clases en cada
 * pantalla y facilita mantener un mismo estilo si se ajusta algo más adelante.
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
export const inputClasses = '!px-2.5 !py-1.5 !rounded-md !border !border-slate-300 dark:!bg-slate-900 dark:!text-slate-100 dark:!border-slate-600 text-sm dark:[color-scheme:dark] min-w-0';

export const botonPrimario = '!bg-indigo-600 hover:!bg-indigo-700 !text-white !border-0 !font-semibold px-4 py-2 rounded-md text-sm';
export const botonSecundario = '!bg-slate-200 dark:!bg-slate-700 hover:!bg-slate-300 dark:hover:!bg-slate-600 !text-slate-700 dark:!text-slate-100 !border-0 !font-semibold px-4 py-2 rounded-md text-sm';
export const botonExito = '!bg-emerald-600 hover:!bg-emerald-700 !text-white !border-0 !font-semibold px-4 py-2 rounded-md text-sm';
export const botonPeligro = '!bg-red-600 hover:!bg-red-700 !text-white !border-0 !font-semibold px-3 py-1.5 rounded-md text-xs';
export const botonInfo = '!bg-sky-600 hover:!bg-sky-700 !text-white !border-0 !font-semibold px-3 py-1.5 rounded-md text-sm';
export const botonPill = '!bg-indigo-50 dark:!bg-indigo-500/20 !text-indigo-700 dark:!text-indigo-300 !border !border-indigo-200 dark:!border-indigo-500/30 !font-semibold !rounded-full px-3 py-1.5 text-xs';

export const tarjeta = 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm';
export const filtroContenedor = 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex flex-wrap gap-3 items-center shadow-sm';
export const etiqueta = 'text-xs font-semibold text-slate-600 dark:text-slate-300';
export const tituloPantalla = 'text-xl font-medium text-slate-900 dark:text-white mb-4';
export const subtitulo = 'text-sm text-slate-500 dark:text-slate-400 mb-4';

export const thClasses = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap';
export const tdClasses = 'px-3 py-2 text-sm text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-700';
export const tdRightClasses = tdClasses + ' text-right tabular-nums';
export const trTotales = 'bg-slate-50 dark:bg-slate-900 font-semibold';

export const kpiCard = 'flex-1 min-w-[200px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4';
export const kpiTitulo = 'text-xs font-semibold text-slate-500 dark:text-slate-400 tracking-wide mb-1';
export const kpiValor = 'text-xl font-semibold';

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
