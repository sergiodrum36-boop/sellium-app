/*
 * KpiCard.js (Rediseño visual, Fase 3)
 *
 * Tarjeta KPI compartida, usada en PantallaDashboard.js y en
 * PantallaVentasReales.js (se repite igual en ambas pantallas).
 *
 * NOTA — esto rompe a propósito la convención establecida del proyecto de
 * "componente autocontenido por archivo, sin extraer a un componente
 * compartido" (la que sigue, por ejemplo, MultiSelectDropdown, duplicado
 * en ControlAP.js y ControlAPVisionComercial.js). Se hace compartido aquí
 * porque esta tarjeta es visualmente idéntica en varias pantallas y
 * mantenerla sincronizada a mano en cada copia sería más frágil que
 * importarla. Si en algún momento se prefiere volver a la convención
 * estricta, este JSX se puede pegar tal cual dentro de cada pantalla.
 *
 * El color de los deltas "positive"/"negative" NO es una clase nueva: usa
 * colorPorSigno de uiClasses.js (la misma función que ya usan ControlAP.js
 * y ControlAPVisionComercial.js), para que el rojo/verde sea exactamente el
 * mismo en toda la app.
 */

import { TrendingUp, TrendingDown } from 'lucide-react';
import { colorPorSigno } from './uiClasses';

export default function KpiCard({ label, value, deltaLabel, deltaType = 'neutral', spark }) {
  const deltaClasses = {
    positive: `${colorPorSigno(1)} bg-emerald-50 dark:bg-emerald-400/10`,
    negative: `${colorPorSigno(-1)} bg-red-50 dark:bg-red-400/10`,
    neutral: 'text-gold bg-gold-soft',
  };
  return (
    <div className="rounded-xl bg-white dark:bg-[#151822] shadow-card-light dark:shadow-card p-5">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">{label}</div>
      <div className="font-extrabold text-[32px] leading-none tracking-tight tabular-nums text-slate-900 dark:text-white">{value}</div>
      {(deltaLabel || spark) && (
        <div className="flex items-center justify-between mt-4">
          {deltaLabel && (
            <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${deltaClasses[deltaType]}`}>
              {deltaType === 'positive' && <TrendingUp size={12} />}
              {deltaType === 'negative' && <TrendingDown size={12} />}
              {deltaLabel}
            </span>
          )}
          {spark}
        </div>
      )}
    </div>
  );
}
