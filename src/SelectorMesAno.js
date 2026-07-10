/*
 * SelectorMesAno.js
 * Sustituye al <input type="month"> nativo del navegador. Motivo: el icono
 * de calendario nativo se dibuja con una "cajita" que en modo oscuro no
 * respeta el tema (aunque se le aplique color-scheme:dark) y visualmente
 * parece salirse del marco redondeado del input. Con dos <select> normales
 * evitamos por completo ese control nativo y mantenemos el mismo aspecto
 * (y comportamiento) que el resto de desplegables de la app.
 *
 * Genera/recibe el mismo formato de valor que un input type="month":
 * una cadena "YYYY-MM" (o '' si no hay selección), así que toda la lógica
 * existente de guardado/filtrado que compara estas cadenas no cambia.
 *
 * OJO (bug corregido): Mes y Año son dos <select> independientes. Si el
 * valor mostrado se derivara SOLO de la prop "value" (sin estado propio),
 * elegir uno de los dos —mientras el otro sigue vacío— disparaba
 * inmediatamente onChange('') (porque el valor combinado todavía estaba
 * incompleto), y ese '' volvía a entrar como "value" y reseteaba visualmente
 * el que el usuario acababa de elegir. Por eso ahora el selector guarda su
 * propia selección "en curso" (mesSel/añoSel) y solo notifica hacia fuera
 * (onChange) cuando AMBOS están rellenos.
 */

import React, { useState, useEffect } from 'react';
import { inputClasses } from './uiClasses';

const NOMBRES_MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

function SelectorMesAno({ value, onChange, anioInicio, anioFin, disabled = false, className = '' }) {
  const anioActual = new Date().getFullYear();
  const inicio = anioInicio ?? (anioActual - 6);
  const fin = anioFin ?? (anioActual + 1);

  const [anioExterno, mesExterno] = (value || '').split('-');
  const [mesSel, setMesSel] = useState(mesExterno || '');
  const [anioSel, setAnioSel] = useState(anioExterno || '');

  // Sincroniza el estado interno cuando el valor cambia desde FUERA de este
  // selector (p.ej. botones "Limpiar filtros"/"Cancelar", o un acceso rápido
  // que fija el mes directamente). Este componente nunca emite un valor
  // incompleto hacia fuera, así que esto nunca pisa una selección a medias
  // que el usuario acabe de hacer aquí mismo.
  useEffect(() => {
    const [a, m] = (value || '').split('-');
    setAnioSel(a || '');
    setMesSel(m || '');
  }, [value]);

  const anios = [];
  for (let a = fin; a >= inicio; a--) anios.push(a);

  const handleMesChange = (nuevoMes) => {
    setMesSel(nuevoMes);
    if (nuevoMes && anioSel) onChange(`${anioSel}-${nuevoMes}`);
  };

  const handleAnioChange = (nuevoAnio) => {
    setAnioSel(nuevoAnio);
    if (mesSel && nuevoAnio) onChange(`${nuevoAnio}-${mesSel}`);
  };

  return (
    <div className={`flex gap-2 ${className}`}>
      <select
        value={mesSel}
        onChange={(e) => handleMesChange(e.target.value)}
        disabled={disabled}
        className={`${inputClasses} flex-1 min-w-[130px]`}
      >
        <option value="">Mes</option>
        {NOMBRES_MESES.map((nombre, i) => (
          <option key={i} value={String(i + 1).padStart(2, '0')}>{nombre}</option>
        ))}
      </select>
      <select
        value={anioSel}
        onChange={(e) => handleAnioChange(e.target.value)}
        disabled={disabled}
        className={`${inputClasses} w-24`}
      >
        <option value="">Año</option>
        {anios.map(a => (
          <option key={a} value={a}>{a}</option>
        ))}
      </select>
    </div>
  );
}

export default SelectorMesAno;
