/*
 * estilosArea.js
 * Clases Tailwind por color de área, compartidas entre PantallaInicio.js y
 * PantallaGrupo.js (Fase 6/7 del rediseño visual) — antes vivían duplicadas
 * dentro de PantallaInicio.js; se centralizan aquí para que las dos
 * pantallas usen exactamente el mismo tono por área (Ventas y Datos =
 * indigo, Análisis = sky, Presupuesto = amber, Administración = slate; ver
 * GROUPS en Layout.js, que ya guarda el campo `color` de cada grupo).
 *
 * Escritas explícitas (no con template strings tipo `bg-${color}-50`)
 * porque Tailwind detecta las clases a compilar buscándolas como texto
 * literal en el código — con clases construidas dinámicamente el purge de
 * producción las eliminaría por no "verlas".
 *
 * CAMBIO (nuevo grupo "CRM y Comercial", a petición de Sergio, 26/07/2026):
 * se añade el color `violet`, distinto de los 4 ya usados (indigo/sky/amber/
 * slate) para que el nuevo bloque se distinga de un vistazo en Inicio/menú.
 */
export const ESTILOS_COLOR = {
  indigo: {
    fondo: 'bg-indigo-50/70 dark:bg-indigo-500/10',
    borde: 'border-indigo-100 dark:border-indigo-500/20',
    icono: 'bg-indigo-600 text-white dark:bg-indigo-500',
    iconoSuave: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
    boton: '!text-indigo-700 !border-indigo-300 hover:!bg-indigo-100 dark:!text-indigo-300 dark:!border-indigo-500/40 dark:hover:!bg-indigo-500/20',
    hoverTarjeta: 'hover:!bg-indigo-100 dark:hover:!bg-indigo-500/20',
  },
  sky: {
    fondo: 'bg-sky-50/70 dark:bg-sky-500/10',
    borde: 'border-sky-100 dark:border-sky-500/20',
    icono: 'bg-sky-600 text-white dark:bg-sky-500',
    iconoSuave: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
    boton: '!text-sky-700 !border-sky-300 hover:!bg-sky-100 dark:!text-sky-300 dark:!border-sky-500/40 dark:hover:!bg-sky-500/20',
    hoverTarjeta: 'hover:!bg-sky-100 dark:hover:!bg-sky-500/20',
  },
  amber: {
    fondo: 'bg-amber-50/70 dark:bg-amber-500/10',
    borde: 'border-amber-100 dark:border-amber-500/20',
    icono: 'bg-amber-500 text-white dark:bg-amber-500',
    iconoSuave: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
    boton: '!text-amber-700 !border-amber-300 hover:!bg-amber-100 dark:!text-amber-300 dark:!border-amber-500/40 dark:hover:!bg-amber-500/20',
    hoverTarjeta: 'hover:!bg-amber-100 dark:hover:!bg-amber-500/20',
  },
  slate: {
    fondo: 'bg-slate-100/70 dark:bg-slate-500/10',
    borde: 'border-slate-200 dark:border-slate-500/20',
    icono: 'bg-slate-600 text-white dark:bg-slate-500',
    iconoSuave: 'bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300',
    boton: '!text-slate-700 !border-slate-300 hover:!bg-slate-200 dark:!text-slate-300 dark:!border-slate-500/40 dark:hover:!bg-slate-500/20',
    hoverTarjeta: 'hover:!bg-slate-200 dark:hover:!bg-slate-500/20',
  },
  violet: {
    fondo: 'bg-violet-50/70 dark:bg-violet-500/10',
    borde: 'border-violet-100 dark:border-violet-500/20',
    icono: 'bg-violet-600 text-white dark:bg-violet-500',
    iconoSuave: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
    boton: '!text-violet-700 !border-violet-300 hover:!bg-violet-100 dark:!text-violet-300 dark:!border-violet-500/40 dark:hover:!bg-violet-500/20',
    hoverTarjeta: 'hover:!bg-violet-100 dark:hover:!bg-violet-500/20',
  },
};
