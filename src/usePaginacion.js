/*
 * usePaginacion.js
 * Hook compartido para paginar tablas largas, a petición de Sergio (repaso/
 * auditoría de la app): las tablas de detalle (Histórico Sell-Out, Histórico
 * Sell-In, Detalle de Ventas Reales) pintaban TODAS las filas filtradas de
 * golpe, sin límite — con mucho histórico acumulado eso puede llegar a miles
 * de filas y hacer que la pantalla vaya lenta solo por el DOM que genera.
 *
 * Cómo se pagina, en corto: recibe el array YA FILTRADO (no toca el
 * filtrado, eso lo sigue haciendo cada pantalla igual que antes) y devuelve
 * solo la "página" de filas que toca mostrar, más los controles para
 * moverse entre páginas. Los TOTALES y la EXPORTACIÓN A EXCEL de cada
 * pantalla siguen usando el array completo sin paginar — la paginación es
 * solo para lo que se pinta en el <tbody>, nunca para los cálculos.
 *
 * Si cambian los filtros y la página en la que estabas ya no existe (p.ej.
 * estabas en la página 5 y el nuevo filtro solo da 2 páginas), se "recorta"
 * automáticamente a la última página válida en vez de dejar la tabla vacía
 * por error — no hace falta ningún useEffect para esto, se resuelve solo
 * con Math.min() en cada render (ver `pagina` más abajo).
 *
 * Uso:
 *   const { pagina, totalPaginas, itemsPagina, irPaginaAnterior, irPaginaSiguiente } =
 *     usePaginacion(movimientosFiltrados, 50);
 *   // ...
 *   {itemsPagina.map(mov => <tr key={mov.id}>...)}
 *   <Paginacion pagina={pagina} totalPaginas={totalPaginas} totalRegistros={movimientosFiltrados.length}
 *     tamañoPagina={50} onAnterior={irPaginaAnterior} onSiguiente={irPaginaSiguiente} />
 */

import { useState, useMemo } from 'react';

export const TAMAÑO_PAGINA_DEFECTO = 50;

export default function usePaginacion(items, tamañoPagina = TAMAÑO_PAGINA_DEFECTO) {
  const [paginaSolicitada, setPaginaSolicitada] = useState(1);

  const totalPaginas = Math.max(1, Math.ceil((items || []).length / tamañoPagina));
  // "pagina" es la página REAL que se muestra: nunca puede ser mayor que
  // totalPaginas, aunque paginaSolicitada se haya quedado desactualizada
  // tras un cambio de filtros.
  const pagina = Math.min(paginaSolicitada, totalPaginas);

  const itemsPagina = useMemo(() => {
    const inicio = (pagina - 1) * tamañoPagina;
    return (items || []).slice(inicio, inicio + tamañoPagina);
  }, [items, pagina, tamañoPagina]);

  return {
    pagina,
    totalPaginas,
    itemsPagina,
    irPrimeraPagina: () => setPaginaSolicitada(1),
    irPaginaAnterior: () => setPaginaSolicitada(Math.max(1, pagina - 1)),
    irPaginaSiguiente: () => setPaginaSolicitada(Math.min(totalPaginas, pagina + 1)),
  };
}
