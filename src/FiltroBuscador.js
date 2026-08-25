/*
 * FiltroBuscador.js
 * Compartido entre DashboardSellOutClientes.js y DashboardSellOutMarcas.js.
 *
 * A petición de Sergio (2026-07-19): el filtro "Cliente" tiene varios
 * cientos de opciones (todos los clientes del distribuidor, orden
 * alfabético) — un <select> nativo obliga a desplazarse por una lista
 * larguísima tanto para ELEGIR un cliente como para ver dónde está el que
 * ya tienes elegido. El botón "×" que se añadió antes (ver FiltroSelect.js)
 * resuelve quitar el filtro en un clic, pero no resuelve encontrarlo — por
 * eso "sigue igual" pese a ese cambio.
 *
 * Este componente sustituye el <select> nativo por un cuadro de texto con
 * autocompletado: se escribe y la lista de abajo se filtra en vivo: se
 * hace clic en un cliente para elegirlo, o en la "×" para quitar el
 * filtro. Zona y Preventista NO se cambian a esto (se quedan con
 * FiltroSelect.js) porque tienen muy pocas opciones — el problema de
 * "lista larga" solo existe de verdad en Cliente.
 *
 * El texto que se ve en el cuadro es un estado LOCAL (`texto`), separado
 * del valor real aplicado (`value`, el id del cliente elegido) — mientras
 * se escribe para buscar, el filtro aplicado NO cambia todavía (evita que
 * cada tecleo dispare un re-render que borre lo que se está escribiendo);
 * solo cambia al hacer clic en una opción o en la "×". Al perder el foco
 * sin elegir nada, el texto se resincroniza con el valor real aplicado
 * (para no dejar en pantalla una búsqueda a medias que no corresponde al
 * filtro que de verdad está activo).
 */
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import { inputClasses, etiqueta } from './uiClasses';

const LIMITE_RESULTADOS = 200;

function FiltroBuscador({ label, value, onChange, opciones, getValue = (o) => o.id, getLabel = (o) => o.nombre, placeholder = 'Escribe para buscar...', className = '' }) {
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);

  const sincronizarTexto = () => {
    if (!value) { setTexto(''); return; }
    const seleccionada = opciones.find((o) => getValue(o) === value);
    setTexto(seleccionada ? getLabel(seleccionada) : '');
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(sincronizarTexto, [value, opciones]);

  useEffect(() => {
    const handleClickFuera = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setAbierto(false);
        sincronizarTexto();
      }
    };
    document.addEventListener('mousedown', handleClickFuera);
    return () => document.removeEventListener('mousedown', handleClickFuera);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, opciones]);

  const filtradas = useMemo(() => {
    const t = texto.trim().toLowerCase();
    const base = !t ? opciones : opciones.filter((o) => getLabel(o).toLowerCase().includes(t));
    return base.slice(0, LIMITE_RESULTADOS);
  }, [texto, opciones, getLabel]);

  const elegir = (o) => {
    onChange(getValue(o));
    setTexto(getLabel(o));
    setAbierto(false);
  };

  const limpiar = () => {
    onChange('');
    setTexto('');
    setAbierto(false);
  };

  return (
    <div className={className} ref={ref}>
      <label className={etiqueta}>{label}</label><br />
      <div className="flex items-center gap-1">
        <div className="relative flex-1 min-w-0">
          <input
            type="text"
            value={texto}
            onChange={(e) => { setTexto(e.target.value); setAbierto(true); }}
            onFocus={() => setAbierto(true)}
            placeholder={placeholder}
            className={`${inputClasses} w-full`}
          />
          {abierto && (
            <div className="absolute z-30 mt-1 w-full max-h-64 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-md shadow-lg">
              {filtradas.length === 0 && (
                <div className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">Sin resultados.</div>
              )}
              {filtradas.map((o) => (
                <button
                  key={getValue(o)}
                  type="button"
                  onClick={() => elegir(o)}
                  className={
                    'w-full text-left px-3 py-1.5 text-sm !border-0 !font-normal transition-colors ' +
                    (getValue(o) === value
                      ? 'bg-indigo-50 dark:bg-indigo-500/15 !text-indigo-700 dark:!text-indigo-300'
                      : '!bg-transparent !text-slate-600 dark:!text-slate-300 hover:!bg-slate-100 dark:hover:!bg-slate-700')
                  }
                >
                  {getLabel(o)}
                </button>
              ))}
              {opciones.length > LIMITE_RESULTADOS && filtradas.length === LIMITE_RESULTADOS && (
                <div className="px-3 py-1.5 text-[11px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-700">
                  Hay más de {LIMITE_RESULTADOS} resultados — sigue escribiendo para acotar.
                </div>
              )}
            </div>
          )}
        </div>
        {value && (
          <button
            type="button"
            onClick={limpiar}
            className="!border-0 !bg-transparent !text-slate-400 hover:!text-slate-700 dark:hover:!text-slate-200 p-1.5 rounded shrink-0"
            title="Quitar este filtro"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

export default FiltroBuscador;
