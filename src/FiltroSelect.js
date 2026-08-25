/*
 * FiltroSelect.js
 * Compartido entre DashboardSellOutClientes.js y DashboardSellOutMarcas.js
 * (a petición de Sergio, 2026-07-19: "los desplegables de los filtros
 * tienen que dar la opción de selección o deselección" — con listas largas
 * como el desplegable de Cliente, quitar un filtro obligaba a desplazarse
 * hasta arriba del todo para volver a encontrar "-- Todos los clientes --").
 *
 * Es un <select> normal (se mantiene el desplegable nativo del navegador —
 * no se sustituye por un combobox a medida) con un botón "×" al lado, que
 * solo aparece cuando hay un valor elegido y lo resetea a '' en un clic. El
 * botón va FUERA del <select> (no superpuesto encima) para no pelearse con
 * la flechita nativa que ya dibuja el propio navegador dentro del control.
 */
import React from 'react';
import { X } from 'lucide-react';
import { inputClasses, etiqueta } from './uiClasses';

function FiltroSelect({ label, value, onChange, opciones, placeholder, getValue = (o) => o, getLabel = (o) => o, className = '' }) {
  return (
    <div className={className}>
      <label className={etiqueta}>{label}</label><br />
      <div className="flex items-center gap-1">
        <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClasses} min-w-0`}>
          <option value="">{placeholder}</option>
          {opciones.map((o) => (
            <option key={getValue(o)} value={getValue(o)}>{getLabel(o)}</option>
          ))}
        </select>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
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

export default FiltroSelect;
