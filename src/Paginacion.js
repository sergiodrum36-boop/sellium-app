/*
 * Paginacion.js
 * Controles de paginación (Anterior/Siguiente + "Mostrando X–Y de Z"),
 * pensados para ir debajo de una tabla que usa usePaginacion.js. Ver ese
 * fichero para el porqué. Componente puramente visual, sin estado propio —
 * todo el estado (página actual, límites) vive en el hook.
 *
 * Si todo cabe en una sola página no se muestra nada (no tiene sentido
 * mostrar controles de "página 1 de 1").
 */

import React from 'react';
import { botonSecundario } from './uiClasses';

function Paginacion({ pagina, totalPaginas, totalRegistros, tamañoPagina, onAnterior, onSiguiente }) {
  if (totalPaginas <= 1) return null;

  const inicio = (pagina - 1) * tamañoPagina + 1;
  const fin = Math.min(pagina * tamañoPagina, totalRegistros);
  const esPrimera = pagina <= 1;
  const esUltima = pagina >= totalPaginas;

  return (
    <div className="flex items-center justify-between gap-3 mt-3 px-1 text-xs text-slate-500 dark:text-slate-400">
      <span>Mostrando {inicio}–{fin} de {totalRegistros}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onAnterior}
          disabled={esPrimera}
          className={`${botonSecundario} ${esPrimera ? '!opacity-40 !cursor-not-allowed' : ''}`}
        >
          ‹ Anterior
        </button>
        <span className="font-semibold text-slate-600 dark:text-slate-300">Página {pagina} de {totalPaginas}</span>
        <button
          type="button"
          onClick={onSiguiente}
          disabled={esUltima}
          className={`${botonSecundario} ${esUltima ? '!opacity-40 !cursor-not-allowed' : ''}`}
        >
          Siguiente ›
        </button>
      </div>
    </div>
  );
}

export default Paginacion;
