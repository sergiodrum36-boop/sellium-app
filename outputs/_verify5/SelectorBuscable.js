import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X } from 'lucide-react';
import { inputClasses } from './uiClasses';

function SelectorBuscable({
  valor, onSeleccionar, opciones, getId = (o) => o.id, getLabel = (o) => o.label,
  placeholder = 'Buscar...', disabled = false, vacioTexto = 'Sin resultados',
}) {
  const [abierto, setAbierto] = useState(false);
  const [query, setQuery] = useState('');
  const contenedorRef = useRef(null);

  const seleccionado = useMemo(
    () => opciones.find((o) => getId(o) === valor) || null,
    [opciones, valor, getId]
  );

  useEffect(() => {
    function alClicFuera(e) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) {
        setAbierto(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', alClicFuera);
    return () => document.removeEventListener('mousedown', alClicFuera);
  }, []);

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return opciones;
    return opciones.filter((o) => getLabel(o).toLowerCase().includes(q));
  }, [opciones, query, getLabel]);

  return (
    <div className="relative" ref={contenedorRef}>
      <input
        type="text"
        disabled={disabled}
        value={abierto ? query : (seleccionado ? getLabel(seleccionado) : '')}
        onChange={(e) => { setQuery(e.target.value); setAbierto(true); }}
        onFocus={() => { setQuery(''); setAbierto(true); }}
        placeholder={placeholder}
        className={`${inputClasses} w-full ${seleccionado && !abierto ? 'pr-8' : ''}`}
      />
      {seleccionado && !abierto && !disabled && (
        <button
          type="button"
          onClick={() => onSeleccionar(null)}
          className="absolute right-2 top-1/2 -translate-y-1/2 !border-0 !bg-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          title="Quitar selección"
        >
          <X size={14} />
        </button>
      )}
      {abierto && !disabled && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg">
          {filtradas.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-400 dark:text-slate-500">{vacioTexto}</div>
          ) : (
            filtradas.map((o) => (
              <button
                type="button"
                key={getId(o)}
                onClick={() => { onSeleccionar(getId(o)); setAbierto(false); setQuery(''); }}
                className="block w-full text-left px-3 py-2 text-sm !border-0 !bg-transparent hover:bg-indigo-50 dark:hover:bg-indigo-500/10 text-slate-700 dark:text-slate-200"
              >
                {getLabel(o)}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default SelectorBuscable;
