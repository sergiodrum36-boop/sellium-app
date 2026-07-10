/*
 * CorregirAnio.js (Versión 1.1 - Rediseño visual Fase 3)
 * Cambios sobre la versión anterior: solo la maquetación pasa a Tailwind CSS
 * (con soporte de modo oscuro). La lógica de corrección no cambia.
 *
 * Corrige el año de los movimientos (Sell-In y Sell-Out) de un distribuidor
 * cuando un Excel se importó con el año equivocado. Esto pasa típicamente al
 * reutilizar la plantilla del año anterior: las pestañas mensuales o el
 * título de "VENTAS STOCK" todavía dicen el año viejo, y el importador lo
 * detecta tal cual (p.ej. entiende 2025 cuando en realidad es 2026).
 *
 * Esta herramienta NO vuelve a leer el Excel: simplemente desplaza el campo
 * mes_ano de los movimientos ya guardados de "AñoErróneo-MM" a "AñoCorrecto-MM"
 * para el distribuidor elegido. Nada se aplica hasta que el usuario confirma.
 */

import React, { useState } from 'react';
import { corregirAnioMovimientos } from './firebaseApi';
import { inputClasses, etiqueta, tarjeta } from './uiClasses';

function CorregirAnio({ idUsuario, listaDistribuidores, onCorregido }) {

  const anioActual = new Date().getFullYear();

  const [idDistribuidor, setIdDistribuidor] = useState('');
  const [anioErroneo, setAnioErroneo] = useState(anioActual - 1);
  const [anioCorrecto, setAnioCorrecto] = useState(anioActual);
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [resultado, setResultado] = useState(null);

  const handleCorregir = async () => {
    if (!idDistribuidor) {
      alert('Selecciona el distribuidor cuyos datos hay que corregir.');
      return;
    }
    if (Number(anioErroneo) === Number(anioCorrecto)) {
      alert('El año erróneo y el año correcto no pueden ser el mismo.');
      return;
    }

    const nombreDistribuidor = listaDistribuidores.find(d => d.id === idDistribuidor)?.nombre_distribuidor || idDistribuidor;

    if (!window.confirm(
      `Vas a mover TODOS los movimientos de "${nombreDistribuidor}" que estén marcados como ${anioErroneo} ` +
      `para que pasen a ${anioCorrecto} (el mes no cambia, solo el año).\n` +
      `Esta acción no se puede deshacer. ¿Continuar?`
    )) return;

    setCorrigiendo(true);
    setResultado(null);
    try {
      const totalIn = await corregirAnioMovimientos('historicoSellIn', idUsuario, idDistribuidor, Number(anioErroneo), Number(anioCorrecto));
      const totalOut = await corregirAnioMovimientos('historicoSellOut', idUsuario, idDistribuidor, Number(anioErroneo), Number(anioCorrecto));

      if (totalIn === 0 && totalOut === 0) {
        alert(`No se ha encontrado ningún movimiento de "${nombreDistribuidor}" en el año ${anioErroneo}.`);
      } else {
        setResultado({ nombreDistribuidor, totalIn, totalOut, anioErroneo, anioCorrecto });
        if (onCorregido) onCorregido();
      }
    } catch (err) {
      console.error('Error corrigiendo el año:', err);
      alert('Error al corregir: ' + err.message);
    }
    setCorrigiendo(false);
  };

  return (
    <div>
      <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">Corregir Año de Movimientos</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
        Úsalo cuando un Excel se importó con el año equivocado (por ejemplo, la plantilla venía del año
        anterior y sus pestañas todavía decían "25" siendo en realidad datos de 2026). Esto mueve el mes/año
        de los movimientos ya guardados, sin tocar marcas, unidades ni importes.
      </p>

      <div className={tarjeta}>
        <div className="mb-3">
          <label className={`${etiqueta} block mb-1.5`}>Distribuidor:</label>
          <select value={idDistribuidor} onChange={(e) => setIdDistribuidor(e.target.value)} className={`${inputClasses} min-w-[240px]`}>
            <option value="">-- Selecciona --</option>
            {(listaDistribuidores || []).map(d => (
              <option key={d.id} value={d.id}>{d.nombre_distribuidor}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-5">
          <label className="text-sm text-slate-700 dark:text-slate-300">
            <span className="block mb-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">Año erróneo (el que tiene ahora)</span>
            <input
              type="number"
              value={anioErroneo}
              onChange={(e) => setAnioErroneo(e.target.value)}
              className={`${inputClasses} w-24`}
            />
          </label>

          <label className="text-sm text-slate-700 dark:text-slate-300">
            <span className="block mb-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">Año correcto (al que debe pasar)</span>
            <input
              type="number"
              value={anioCorrecto}
              onChange={(e) => setAnioCorrecto(e.target.value)}
              className={`${inputClasses} w-24`}
            />
          </label>
        </div>

        <div className="mt-4">
          <button
            onClick={handleCorregir}
            disabled={corrigiendo}
            className="!bg-red-600 hover:!bg-red-700 !text-white !border-0 !font-semibold px-4 py-2.5 rounded-md text-sm"
          >
            {corrigiendo ? 'Corrigiendo...' : `Mover movimientos de ${anioErroneo} a ${anioCorrecto}`}
          </button>
        </div>
      </div>

      {resultado && (
        <div className="border border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 rounded-xl p-4 mt-4 text-sm">
          ✅ Corregido: {resultado.totalIn} movimiento(s) de Compras (Sell-In) y {resultado.totalOut} movimiento(s) de
          Ventas/A&P (Sell-Out) de "{resultado.nombreDistribuidor}" pasaron de {resultado.anioErroneo} a {resultado.anioCorrecto}.
        </div>
      )}
    </div>
  );
}

export default CorregirAnio;
