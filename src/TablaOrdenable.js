/*
 * TablaOrdenable.js
 * Componente compartido de tabla con cabeceras ordenables (26/07/2026, a
 * petición de Sergio: "lo que has hecho de las flechitas en este informe
 * tienes que hacerlo en todos los informes de la app"). Nace de
 * PantallaAvisosConsumo.js (donde se probó primero, ver su `renderTabla`
 * original) — se extrae aquí para no duplicar la misma lógica de ordenar/
 * pintar cabecera en cada uno de los ~19 informes de solo lectura de la app.
 *
 * Contrato de cada columna (mismo que ya usaba PantallaAvisosConsumo.js):
 *   { titulo: string, render: (fila) => ReactNode, valor?: (fila) => string|number, derecha?: boolean }
 * - `render` pinta la celda (puede devolver JSX, ej. un badge de color).
 * - `valor` (OPCIONAL) es lo que se usa para ORDENAR esa columna al clicar
 *   su cabecera — si no está presente, esa columna no es ordenable (ej. una
 *   lista de varios valores, como "Marcas que compra"). No siempre coincide
 *   con `render`: `render` puede devolver JSX (un badge, un "sin asignar" en
 *   ámbar) que no es comparable directamente.
 * - `derecha`: alinea la celda a la derecha (columnas numéricas).
 * - `claseCelda` (opcional): className extra para la celda (ej. un borde
 *   divisorio entre grupos de columnas, `border-l-2 !border-l-slate-300...`).
 * - `claseCabecera` (opcional): className extra para el <th> (mismo borde
 *   divisorio, pero en la cabecera).
 *
 * El estado de orden es INTERNO a cada instancia de este componente — si una
 * pantalla pinta varias TablaOrdenable a la vez (ej. varias pestañas), cada
 * una ordena de forma independiente sin pisarse.
 *
 * `filaTotales` (opcional): un <tr> ya construido por quien llama (con sus
 * propias clases/colspan/etc.) que se pinta SIEMPRE al final del <tbody>,
 * fuera del array que se ordena — varios informes de la app (ej. Dashboard
 * Sell-Out Clientes) tienen una fila de "TOTALES" que debe quedarse fija
 * abajo pase lo que pase con el orden de las demás filas.
 *
 * `onFilaClick` (opcional): callback (fila) => void que se llama al hacer
 * clic en cualquier punto de una fila (ej. PantallaRecuperacionVentas.js,
 * donde clicar un distribuidor de la tabla superior abre su detalle por
 * marca debajo) — combínese con `claseFila` para resaltar la fila activa.
 *
 * CABECERA FIJA (26-27/07/2026, 2º intento): el <thead> es SIEMPRE sticky
 * — no hace falta ningún prop para activarlo. Sergio pidió primero una barra
 * de migas de pan fija (Layout.js) pensando que resolvía "que la barra
 * principal al hacer scroll siempre permanezca", pero tras verlo con datos
 * reales aclaró (con capturas) que lo que de verdad necesita fijo es la fila
 * de TÍTULOS DE COLUMNA de cada tabla (CLIENTE/DISTRIBUIDOR/...).
 *
 * 1er intento (fallido): sticky respecto al contenedor de scroll de
 * Layout.js, con un offset para no chocar con la barra de migas. NO
 * funcionaba: el div que envuelve la tabla necesita `overflow-x-auto` para
 * poder deslizarla en horizontal en pantallas estrechas, y el propio CSS
 * obliga a que, si un eje tiene overflow distinto de "visible", el otro eje
 * (aquí Y) se calcule también como "auto" — eso convierte ese div en su
 * PROPIO contenedor de scroll a efectos de `sticky`, aunque nunca se vea una
 * barra de scroll vertical en él. Resultado: el `sticky` del `<thead>` se
 * anclaba a ese div (que no se desplaza dentro de sí mismo), no a la
 * página — visualmente, como si no hiciera nada.
 *
 * Solución (confirmada con Sergio): cada tabla tiene su PROPIO scroll
 * vertical acotado (`max-h-[65vh] overflow-auto` por defecto), en vez de
 * fluir libremente con el resto de la página — el `<thead>` se pega
 * entonces a `top-0` de ESE contenedor, sin ningún offset ni dependencia de
 * la barra de migas de pan de Layout.js. `claseContenedor` sigue existiendo
 * para pantallas que ya necesitaban un tamaño distinto (ej.
 * ImportarSellOutClientes.js, listas de reconciliación con `max-h-96`).
 *
 * El estado vacío ("no hay filas") NO lo gestiona este componente — cada
 * pantalla decide su propio mensaje y solo renderiza <TablaOrdenable> cuando
 * `filas.length > 0` (mismo patrón que ya usaba PantallaAvisosConsumo.js).
 *
 * Pensado solo para tablas DE SOLO LECTURA. Las que tienen inputs dentro de
 * las celdas (Rapel Distribuidores, Presupuesto, Clasificación Comercial,
 * Fusionar Marcas) NO deben usar este componente todavía — reordenar filas
 * con inputs controlados requiere cuidado extra con la identidad de cada
 * fila (`keyExtractor` ayuda, pero no basta por sí solo); se abordarán en un
 * segundo pase si Sergio lo pide.
 *
 * MODO CONTROLADO (`orden`/`onOrdenChange`, ambos opcionales): necesario en
 * pantallas con PAGINACIÓN (ej. DashboardVentasReales.js, vía
 * usePaginacion.js) — si el componente ordenara por su cuenta, solo
 * reordenaría los elementos de la PÁGINA visible, no el conjunto completo
 * (resultado confuso: cambiar de página "deshace" el orden). En modo
 * controlado, quien llama guarda el estado de orden, ordena el array
 * COMPLETO antes de paginar, y pasa aquí ya la página ordenada — este
 * componente entonces solo pinta las flechas y avisa del clic
 * (`onOrdenChange`), sin reordenar nada él mismo. Si no se pasa
 * `onOrdenChange`, el componente ordena internamente (modo normal, sin
 * paginación).
 */

import React, { useState } from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { thClasses, tdClasses, tdRightClasses } from './uiClasses';

// Aplica un { col, dir } sobre un array de filas usando las mismas reglas de
// comparación que el modo no controlado — para que una pantalla con
// paginación pueda ordenar el array COMPLETO antes de paginar (ver "MODO
// CONTROLADO" más arriba) sin reimplementar el comparador.
export function ordenarPorConfig(filas, columnas, orden) {
  const columna = orden ? columnas[orden.col] : null;
  if (!columna || !columna.valor) return filas;
  return [...filas].sort((a, b) => {
    const va = columna.valor(a);
    const vb = columna.valor(b);
    const cmp = (typeof va === 'string' || typeof vb === 'string')
      ? String(va ?? '').localeCompare(String(vb ?? ''), 'es')
      : (Number(va) || 0) - (Number(vb) || 0);
    return orden.dir === 'asc' ? cmp : -cmp;
  });
}

function TablaOrdenable({ columnas, filas, keyExtractor, claseFila, filaTotales, orden: ordenControlado, onOrdenChange, onFilaClick, claseContenedor }) {
  const [ordenInterno, setOrdenInterno] = useState(null); // { col: índice, dir: 'asc' | 'desc' } | null
  const esControlado = !!onOrdenChange;
  const orden = esControlado ? ordenControlado : ordenInterno;

  const alternarOrden = (indiceColumna) => {
    const actual = orden;
    const dir = (actual && actual.col === indiceColumna && actual.dir === 'asc') ? 'desc' : 'asc';
    const nuevo = { col: indiceColumna, dir };
    if (esControlado) onOrdenChange(nuevo); else setOrdenInterno(nuevo);
  };

  // En modo controlado, `filas` ya viene ordenada (y, si aplica, paginada)
  // por quien llama — no se vuelve a ordenar aquí.
  const columnaOrden = orden ? columnas[orden.col] : null;
  const filasOrdenadas = (!esControlado && columnaOrden && columnaOrden.valor)
    ? [...filas].sort((a, b) => {
        const va = columnaOrden.valor(a);
        const vb = columnaOrden.valor(b);
        const cmp = (typeof va === 'string' || typeof vb === 'string')
          ? String(va ?? '').localeCompare(String(vb ?? ''), 'es')
          : (Number(va) || 0) - (Number(vb) || 0);
        return orden.dir === 'asc' ? cmp : -cmp;
      })
    : filas;

  return (
    <div className={claseContenedor || 'overflow-auto max-h-[65vh]'}>
      <table className="w-full">
        <thead className="sticky top-0 z-[5]">
          <tr>
            {columnas.map((c, i) => (
              <th
                key={i}
                className={`${thClasses}${c.valor ? ' cursor-pointer select-none hover:text-indigo-600 dark:hover:text-indigo-400' : ''}${c.claseCabecera ? ` ${c.claseCabecera}` : ''}`}
                onClick={c.valor ? () => alternarOrden(i) : undefined}
                title={c.valor ? 'Ordenar por esta columna' : undefined}
              >
                <span className="inline-flex items-center gap-1">
                  {c.titulo}
                  {c.valor && (
                    orden && orden.col === i
                      ? (orden.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)
                      : <ArrowUpDown size={12} className="opacity-30" />
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filasOrdenadas.map((f, i) => (
            <tr
              key={keyExtractor ? keyExtractor(f, i) : i}
              className={`${claseFila ? claseFila(f) : ''}${onFilaClick ? ' cursor-pointer' : ''}`}
              onClick={onFilaClick ? () => onFilaClick(f) : undefined}
            >
              {columnas.map((c, j) => <td key={j} className={`${c.derecha ? tdRightClasses : tdClasses}${c.claseCelda ? ` ${c.claseCelda}` : ''}`}>{c.render(f)}</td>)}
            </tr>
          ))}
          {filaTotales}
        </tbody>
      </table>
    </div>
  );
}

export default TablaOrdenable;
