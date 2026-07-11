/*
 * AlertasBell.js
 * Icono de campana con contador, en el pie de la barra lateral
 * (Layout.js) — a petición de Sergio, último punto de la auditoría de la
 * app. Ver alertas.js para qué se calcula y con qué criterio; este
 * componente solo pinta la lista que recibe, no calcula nada.
 *
 * Mismo patrón visual que el resto de botones del pie de Layout.js
 * (Modo oscuro/Ayuda/Cerrar sesión): icono solo cuando la barra está
 * colapsada, con tooltip; icono + texto cuando está expandida.
 */

import React, { useState, useRef, useEffect } from 'react';
import { Bell, RefreshCw } from 'lucide-react';

const ETIQUETA_TIPO = {
  balance_negativo: 'Balance negativo',
  sin_actividad: 'Sin actividad',
  descuadre: 'Descuadre de datos',
};

function AlertasBell({ alertas = [], cargando = false, onRefrescar, colapsado }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickFuera = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setAbierto(false);
    };
    document.addEventListener('mousedown', handleClickFuera);
    return () => document.removeEventListener('mousedown', handleClickFuera);
  }, []);

  const total = alertas.length;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setAbierto(v => !v)}
        className={
          'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm !font-medium transition-colors !border-0 !bg-transparent !text-slate-600 hover:!bg-slate-100 hover:!text-slate-900 dark:!text-slate-300 dark:hover:!bg-slate-800 dark:hover:!text-white' +
          (colapsado ? ' justify-center px-0' : '')
        }
        title={colapsado ? `Alertas${total > 0 ? ` (${total})` : ''}` : undefined}
      >
        <span className="relative shrink-0">
          <Bell size={18} />
          {total > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center leading-none">
              {total > 9 ? '9+' : total}
            </span>
          )}
        </span>
        {!colapsado && <span>Alertas{total > 0 ? ` (${total})` : ''}</span>}
      </button>

      {abierto && (
        <div
          className={
            'absolute z-30 w-80 max-h-96 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-md shadow-lg p-2 ' +
            (colapsado ? 'left-full ml-2 bottom-0' : 'bottom-full mb-2 left-0')
          }
        >
          <div className="flex justify-between items-center px-2 py-1 border-b border-slate-100 dark:border-slate-700 mb-1">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Alertas ({total})
            </span>
            <button
              type="button"
              onClick={onRefrescar}
              disabled={cargando}
              className="!border-0 !bg-transparent !text-slate-400 hover:!text-slate-700 dark:hover:!text-slate-200 p-1 rounded"
              title="Actualizar alertas"
            >
              <RefreshCw size={13} className={cargando ? 'animate-spin' : ''} />
            </button>
          </div>

          {total === 0 ? (
            <p className="px-2 py-3 text-xs text-slate-400 dark:text-slate-500 text-center">
              {cargando ? 'Comprobando…' : 'Sin alertas activas.'}
            </p>
          ) : (
            <ul className="space-y-1">
              {alertas.map(a => (
                <li
                  key={a.id}
                  className={
                    'text-xs px-2 py-2 rounded-md border-l-2 ' +
                    (a.severidad === 'atencion'
                      ? 'border-red-500 bg-red-50 dark:bg-red-500/10 text-red-800 dark:text-red-300'
                      : 'border-amber-500 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300')
                  }
                >
                  <span className="block font-semibold text-[10px] uppercase tracking-wide opacity-70 mb-0.5">
                    {ETIQUETA_TIPO[a.tipo] || a.tipo}
                  </span>
                  {a.mensaje}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default AlertasBell;
