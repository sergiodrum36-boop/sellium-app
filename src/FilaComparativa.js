/*
 * FilaComparativa.js
 * Compartido entre DashboardSellOutClientes.js y DashboardSellOutMarcas.js
 * (a petición de Sergio, 2026-07-19, para que las dos pestañas se vean y se
 * comporten igual — antes cada dashboard tenía su propia versión de la
 * tarjeta KPI, y precisamente por eso Marcas se había quedado "pendiente de
 * paridad" frente a Clientes).
 *
 * Contenido de una tarjeta KPI "comparativa": valor actual, valor de
 * comparación y % de variación, TODO en una sola línea centrada (v2, tras
 * feedback de Sergio: "sigue sin estar bien, datos más grandes y
 * centrados, la comparativa en horizontal seguida" — la v1 tenía el valor
 * de comparación en una segunda fila separada por un borde, se leía como
 * dos bloques apilados en vez de una comparativa continua). El valor actual
 * se pinta bastante más grande que el de comparación para que quede claro
 * cuál es "el bueno" sin necesidad de separación en dos filas.
 *
 * `valorAnterior` a `null` (no solo el número 0) significa "no hay segundo
 * año marcado en Qué años comparar" — en ese caso no se pinta nada de la
 * comparación, en vez de enseñar un falso "0" o un "—" confuso.
 */
import React from 'react';
import { colorPorSigno } from './uiClasses';

function FilaComparativa({ valorActual, periodoActualLabel, valorAnterior, periodoAnteriorLabel, variacion }) {
  return (
    <div className="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1 text-center">
      <span className="text-3xl font-bold text-slate-900 dark:text-white">{valorActual}</span>
      <span className="text-xs text-slate-400 dark:text-slate-500">{periodoActualLabel}</span>
      {valorAnterior !== null && (
        <>
          <span className="text-sm text-slate-400 dark:text-slate-500">vs</span>
          <span className="text-lg font-semibold text-slate-500 dark:text-slate-400">{valorAnterior}</span>
          <span className="text-xs text-slate-400 dark:text-slate-500">{periodoAnteriorLabel}</span>
          <span className={`text-sm font-bold ${variacion !== null ? colorPorSigno(variacion) : 'text-slate-400 dark:text-slate-500'}`}>
            {variacion === null ? '—' : `${variacion >= 0 ? '+' : ''}${variacion.toFixed(1)}%`}
          </span>
        </>
      )}
    </div>
  );
}

export default FilaComparativa;
