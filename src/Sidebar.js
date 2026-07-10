/*
 * Sidebar.js (Rediseño visual, Fase 3 + Fase 4 "Unificar Dashboards" + Fase 5
 * "Subcategorías dentro de Gestión")
 *
 * Contenido de navegación del Sidebar: grupos colapsables (p.ej. "Gestión
 * por Distribuidor", "Dashboard") más los accesos de nivel superior (items
 * planos como "Reportes Generales").
 *
 * DECISIÓN DE DISEÑO (Fase 3, se mantiene): Layout.js YA tenía un sidebar
 * funcionando de una fase de rediseño anterior (Fase 1) con logo, modo
 * oscuro persistente, colapsar y cerrar sesión. Sidebar.js es SOLO el
 * contenido de navegación: Layout.js sigue siendo el "cascarón" y renderiza
 * <Sidebar> en el hueco central donde antes iba su lista plana de
 * NAV_ITEMS.
 *
 * Por eso Sidebar es un componente "tonto": no conoce los ids de pestaña por
 * sí mismo (evita import circular), los recibe ya resueltos en groups/
 * topItems.
 *
 * MODELO DE DATOS (Fase 5): cada grupo de nivel superior es
 * { id, label, icon, items }, donde `items` es un array de entradas que
 * pueden ser:
 *   - un item hoja: { id, label, icon } → navega a esa pestaña.
 *   - una subcategoría anidada: { id, label, icon, items: [...] } → misma
 *     forma que un grupo, así que se renderiza de forma recursiva. Esto
 *     permite un nivel extra de anidación (p.ej. "Gestión por Distribuidor"
 *     > "Control A&P" > "Stock") sin necesidad de un tipo de dato distinto:
 *     "¿tiene `items`?" ya distingue contenedor de item hoja.
 * Los items sueltos (p.ej. "Importar Excel", que no pertenece a ninguna
 * subcategoría) conviven al mismo nivel que las subcategorías dentro de
 * `items` del grupo padre.
 *
 * Cada contenedor (grupo o subcategoría) mantiene su propio estado abierto/
 * cerrado de forma independiente (objeto `abiertos`, indexado por su id), y
 * se auto-abre en cascada si la vista activa está dentro de él o de
 * cualquiera de sus descendientes.
 *
 * Nota (Fase 3): se añadió "Mantenimiento" a la lista de Gestión (no estaba
 * en el boceto pegado en su momento) para no perder esa pestaña, que sí
 * existe en la app.
 */

import { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

// --- Helpers recursivos sobre el árbol de grupos/subcategorías/items ---

// ¿Esta entrada es un contenedor (grupo o subcategoría) en vez de un item hoja?
const esContenedor = (entrada) => Array.isArray(entrada.items);

// Recorre `entradas` recopilando los ids de TODOS los contenedores
// (incluidos los anidados), para poder inicializar su estado abierto/cerrado.
const recopilarIdsContenedores = (entradas, acc) => {
  entradas.forEach((entrada) => {
    if (esContenedor(entrada)) {
      acc.push(entrada.id);
      recopilarIdsContenedores(entrada.items, acc);
    }
  });
  return acc;
};

// Marca en `estado` (mutándolo) qué contenedores hay que abrir para que se
// vea la vista activa (abre el contenedor y todos sus ancestros). Devuelve
// true si `activeId` está dentro de `entradas` (a cualquier profundidad).
const marcarRutaAbierta = (entradas, activeId, estado) => {
  return entradas.some((entrada) => {
    if (esContenedor(entrada)) {
      const encontrado = marcarRutaAbierta(entrada.items, activeId, estado);
      if (encontrado) estado[entrada.id] = true;
      return encontrado;
    }
    return entrada.id === activeId;
  });
};

export default function Sidebar({ groups, topItems, activeId, onSelect, colapsado }) {
  const [abiertos, setAbiertos] = useState(() => {
    const ids = recopilarIdsContenedores(groups, []);
    const inicial = {};
    ids.forEach((id) => { inicial[id] = false; });
    marcarRutaAbierta(groups, activeId, inicial);
    return inicial;
  });

  // Si se navega desde fuera a una vista anidada, se abren en cascada todos
  // los contenedores por los que hay que pasar para verla (sin cerrar los
  // que ya estaban abiertos).
  useEffect(() => {
    setAbiertos((prev) => {
      const siguiente = { ...prev };
      let cambiado = false;
      const marcar = (entradas) =>
        entradas.some((entrada) => {
          if (esContenedor(entrada)) {
            const encontrado = marcar(entrada.items);
            if (encontrado && !siguiente[entrada.id]) {
              siguiente[entrada.id] = true;
              cambiado = true;
            }
            return encontrado;
          }
          return entrada.id === activeId;
        });
      marcar(groups);
      return cambiado ? siguiente : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, groups]);

  const toggleContenedor = (id) => setAbiertos((prev) => ({ ...prev, [id]: !prev[id] }));

  const contenedorClasses = (depth) => {
    const base =
      'w-full flex items-center gap-3 rounded-md !font-medium transition-colors !border-0 !bg-transparent ' +
      '!text-slate-600 hover:!bg-slate-100 hover:!text-slate-900 dark:!text-slate-300 dark:hover:!bg-slate-800 dark:hover:!text-white' +
      (colapsado ? ' justify-center px-0' : '');
    return depth === 0 ? base + ' px-3 py-2 text-sm' : base + ' px-3 py-1.5 text-[13px] gap-2.5';
  };

  const itemClasses = (activo) =>
    'w-full flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] text-left !border-0 transition-colors ' +
    (activo
      ? '!bg-wine-soft !text-slate-900 dark:!text-white !font-semibold'
      : '!bg-transparent !text-slate-500 hover:!bg-slate-100 dark:!text-slate-400 dark:hover:!bg-slate-800');

  const topItemClasses = (activo) =>
    'w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm !font-medium transition-colors !border-0' +
    (colapsado ? ' justify-center px-0' : '') + ' ' +
    (activo
      ? '!bg-wine-soft !text-slate-900 dark:!text-white'
      : '!bg-transparent !text-slate-600 hover:!bg-slate-100 hover:!text-slate-900 dark:!text-slate-300 dark:hover:!bg-slate-800 dark:hover:!text-white');

  // Render recursivo: `entradas` es el array `items` de un grupo o de una
  // subcategoría; `depth` es 0 para los grupos de nivel superior, 1 para sus
  // subcategorías/items directos, 2 para los items dentro de una
  // subcategoría, etc. Devuelve un array de elementos (no un único nodo), se
  // usa tal cual como hijos de un contenedor flex-col.
  const renderEntradas = (entradas, depth) =>
    entradas.map((entrada) => {
      if (esContenedor(entrada)) {
        const Icon = entrada.icon;
        const abierto = !!abiertos[entrada.id];
        const tamIcono = depth === 0 ? 18 : 14;
        const tamChevron = depth === 0 ? 16 : 13;
        return (
          <div key={entrada.id}>
            <button
              type="button"
              onClick={() => toggleContenedor(entrada.id)}
              className={contenedorClasses(depth)}
              title={colapsado ? entrada.label : undefined}
            >
              <Icon size={tamIcono} className="shrink-0" />
              {!colapsado && <span className="flex-1 text-left">{entrada.label}</span>}
              {!colapsado && (abierto ? <ChevronDown size={tamChevron} /> : <ChevronRight size={tamChevron} />)}
            </button>

            {!colapsado && abierto && (
              <div className="ml-3 pl-3 border-l border-slate-200 dark:border-slate-700 flex flex-col gap-0.5 mb-1">
                {renderEntradas(entrada.items, depth + 1)}
              </div>
            )}
          </div>
        );
      }

      const Icon = entrada.icon;
      return (
        <button
          key={entrada.id}
          type="button"
          onClick={() => onSelect(entrada.id)}
          className={itemClasses(activeId === entrada.id)}
        >
          <Icon size={15} className="shrink-0" />
          {entrada.label}
        </button>
      );
    });

  return (
    <div className="flex flex-col gap-1">
      {renderEntradas(groups, 0)}

      {topItems.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onSelect(id)}
          className={topItemClasses(activeId === id)}
          title={colapsado ? label : undefined}
        >
          <Icon size={18} className="shrink-0" />
          {!colapsado && label}
        </button>
      ))}
    </div>
  );
}
