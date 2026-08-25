/*
 * Sidebar.js (Rediseño visual, Fase 3 + Fase 4 "Unificar Dashboards" + Fase 5
 * "Subcategorías dentro de Gestión")
 *
 * CAMBIO (Fase 8 — "sidebar compacto", a petición de Sergio: "si ya se
 * navega a través de la página principal del menú, para qué sirve tener lo
 * mismo en el menú lateral... se puede arreglar para que quede más
 * controlado, compactado y menos lioso"): hasta ahora este componente
 * dibujaba el ÁRBOL COMPLETO de cada grupo (subcategorías + items hoja,
 * expandibles con chevron) — exactamente la misma información que
 * PantallaGrupo.js ya enseña como tarjetas grandes al entrar en un grupo, y
 * que ahora también cubre el buscador Ctrl+K (Layout.js). Mantener las 3
 * versiones (Sidebar, PantallaGrupo, buscador) era la redundancia que
 * Sergio señaló.
 *
 * A partir de ahora el Sidebar es DELIBERADAMENTE plano: cada grupo de nivel
 * superior es una única fila (sin expandir, sin chevron) que al pulsarla
 * navega a PantallaGrupo — el mismo destino que su tarjeta en Inicio. Ya no
 * gestiona ningún estado de abierto/cerrado ni renderiza subcategorías o
 * items hoja. Para llegar a una pantalla concreta (p.ej. "Compras") ahora
 * hay 3 caminos, ninguno de ellos el Sidebar: la tarjeta dentro de
 * PantallaGrupo, las migas de pan una vez dentro, o el buscador Ctrl+K desde
 * cualquier sitio.
 *
 * Eso sí: si la pantalla activa es una pantalla "hoja" DENTRO de un grupo
 * (p.ej. estás en "Compras", que pertenece a "Ventas y Datos"), la fila de
 * ese grupo en el Sidebar se resalta igual que si estuvieras en su propia
 * pantalla de menú — así sigues viendo en qué área estás sin necesidad de
 * mostrar el árbol entero (`contieneActivo`, más abajo).
 *
 * Sigue siendo un componente "tonto": no conoce los ids de pestaña por sí
 * mismo (evita import circular), los recibe ya resueltos en groups/topItems
 * — mismo contrato que antes, Layout.js no necesita cambiar cómo lo invoca.
 *
 * CAMBIO (Fase 8 — "salto de calidad visual", especificación Sergio: estilo
 * Dynamics 365 — "reducir un 20% la altura de cada elemento, aumentar
 * ligeramente contraste de sección activa"): filas más compactas (py-1.5,
 * antes py-2) e icono un pelín más pequeño, y el resaltado activo pasa de
 * wine (color de marca "Sellium") al color corporativo indigo-600 —
 * especificación explícita de Sergio ("color principal... solo para estados
 * activos"), con más contraste que el wine-soft anterior (texto y fondo con
 * más peso, no solo un fondo suave).
 */

// ¿La pantalla activa es este grupo, o cualquiera de sus items (a cualquier
// profundidad, incluidas subcategorías anidadas)? Solo se usa para decidir
// el resaltado de la fila — el árbol en sí ya no se dibuja.
const contieneActivo = (entrada, activeId) => {
  if (entrada.id === activeId) return true;
  if (Array.isArray(entrada.items)) {
    return entrada.items.some((hija) => contieneActivo(hija, activeId));
  }
  return false;
};

export default function Sidebar({ groups, topItems, activeId, onSelect, colapsado }) {
  const filaClasses = (activo) =>
    'w-full flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors !border-0' +
    (colapsado ? ' justify-center px-0' : '') + ' ' +
    (activo
      ? '!bg-indigo-50 dark:!bg-indigo-500/15 !text-indigo-700 dark:!text-indigo-300 !font-semibold'
      : '!bg-transparent !font-medium !text-slate-600 hover:!bg-slate-100 hover:!text-slate-900 dark:!text-slate-300 dark:hover:!bg-slate-800 dark:hover:!text-white');

  const iconoClasses = (activo) => (activo ? 'shrink-0 text-indigo-600 dark:text-indigo-400' : 'shrink-0');

  return (
    <div className="flex flex-col gap-0.5">
      {groups.map((grupo) => {
        const Icon = grupo.icon;
        const activo = contieneActivo(grupo, activeId);
        return (
          <button
            key={grupo.id}
            type="button"
            onClick={() => onSelect(grupo.id)}
            className={filaClasses(activo)}
            title={colapsado ? grupo.label : undefined}
          >
            <Icon size={16} className={iconoClasses(activo)} />
            {!colapsado && <span className="flex-1 text-left">{grupo.label}</span>}
          </button>
        );
      })}

      {/* Separador visual entre los grupos y los accesos sueltos (p.ej.
          Presupuesto y Forecast) — especificación Sergio: "agrupar mejor
          visualmente los bloques". */}
      {topItems.length > 0 && (
        <div className="border-t border-slate-200 dark:border-white/10 my-1" />
      )}

      {topItems.map(({ id, label, icon: Icon }) => {
        const activo = activeId === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className={filaClasses(activo)}
            title={colapsado ? label : undefined}
          >
            <Icon size={16} className={iconoClasses(activo)} />
            {!colapsado && <span className="flex-1 text-left">{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
