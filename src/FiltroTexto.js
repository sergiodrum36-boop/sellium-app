/*
 * FiltroTexto.js
 * Compartido entre DashboardSellOutClientes.js y DashboardSellOutMarcas.js
 * — mismo motivo y misma fecha que FiltroSelect.js (ver ese archivo):
 * botón "×" para quitar el filtro de búsqueda en un clic.
 */
import React from 'react';
import { X } from 'lucide-react';
import { inputClasses, etiqueta } from './uiClasses';

function FiltroTexto({ label, value, onChange, placeholder, className = 'flex-1 min-w-[180px]' }) {
  return (
    <div className={className}>
      <label className={etiqueta}>{label}</label><br />
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`${inputClasses} w-full`}
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="!border-0 !bg-transparent !text-slate-400 hover:!text-slate-700 dark:hover:!text-slate-200 p-1.5 rounded shrink-0"
            title="Borrar búsqueda"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

export default FiltroTexto;
