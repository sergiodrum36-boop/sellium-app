/*
 * PeriodoComparador.js
 * Sustituye por completo a PeriodoSelector.js (Ventas Reales). Modelo de
 * selección en dos pasos, independientes entre sí:
 *  1. "Qué periodo quieres ver": mes / trimestre / semestre / año completo /
 *     varios meses sueltos (cualquier combinación, no necesariamente
 *     consecutivos — p.ej. 2, 4 o 7 meses cualquiera del año).
 *  2. "Qué años comparar": cualquier combinación de los años que existen de
 *     verdad en el histórico importado (prop `aniosDisponibles`, nunca
 *     hardcodeada) — cada año marcado usa el MISMO conjunto de meses
 *     elegido en el paso 1.
 *
 * Entrega el resultado vía `onChange(rangosPorAnio)`, donde rangosPorAnio es
 * `[{ anio, meses }, ...]` (uno por año marcado; `meses` es un array de
 * índices de mes 0-11, no necesariamente consecutivos). El padre
 * (DashboardVentasReales.js) es quien filtra los datos reales con esto —
 * este componente es solo UI de selección, no toca datos.
 *
 * CAMBIO 1: el antiguo "Rango personalizado" (Desde/Hasta) obligaba a un
 * tramo consecutivo de meses. Se sustituye por "Varios meses", una rejilla
 * de 12 botones (Ene..Dic) donde se puede marcar cualquier combinación
 * suelta — sigue cubriendo el caso de un rango consecutivo (marcando esos
 * meses seguidos) pero además permite, por ejemplo, Enero + Abril + Julio
 * sin los meses de en medio.
 *
 * CAMBIO 2: Trimestre y Semestre pasan de selección única a selección
 * múltiple — antes solo se podía marcar un trimestre (o un semestre) cada
 * vez; ahora se pueden marcar varios trimestres a la vez (p.ej. T1 + T3) o
 * los dos semestres a la vez, igual que "Varios meses" permite marcar
 * varios meses sueltos. Cada trimestre/semestre marcado se expande a sus
 * meses correspondientes y se juntan todos en un único array de meses
 * (sin duplicados) antes de entregarlo al padre.
 *
 * Nota de implementación: se mantiene `type="button"` explícito en todos
 * los botones, siguiendo la convención del resto del proyecto.
 *
 * CAMBIO 3 (reutilización en PantallaDashboard.js / Dashboard de Gestión):
 * se añaden dos props OPCIONALES, `tipoInicial` y `aniosIniciales`, para
 * poder arrancar en un estado por defecto distinto al de Ventas Reales sin
 * bifurcar el componente en una copia aparte. Si no se pasan, el
 * comportamiento es exactamente el mismo que antes (tipo "mes", últimos dos
 * años disponibles marcados) — así que en Ventas Reales, que no las pasa,
 * no cambia nada. En el Dashboard de Gestión se usan para arrancar en "Año
 * completo" + "Solo <año actual>", que es el valor por defecto que ya tenía
 * esa pantalla antes de este cambio.
 *
 * CAMBIO 4 (a petición de Sergio, 2026-08-25): dentro de "Varios meses", el
 * usuario tenía que marcar mes a mes cualquier rango consecutivo (p.ej. 7
 * clics para Enero-Julio). Se añade un atajo "Desde / Hasta" — dos
 * desplegables — que RELLENA de golpe los botones de mes de ese tramo
 * (reemplazando la selección de meses anterior). Sigue siendo exactamente el
 * mismo estado `mesesElegidos` de siempre: tras aplicar el rango, el usuario
 * puede seguir tocando botones individuales para añadir/quitar meses sueltos
 * (p.ej. rango Ene-Jul y además Diciembre). No es un modo nuevo, es solo una
 * forma más rápida de rellenar el que ya existía. Este componente es
 * COMPARTIDO por las 5 pantallas que dejan elegir Mes/Trimestre/Semestre/
 * Año — DashboardVentasReales.js, PantallaDashboard.js,
 * PantallaDashboardAPCompania.js, DashboardSellOutClientes.js y
 * DashboardSellOutMarcas.js — así que el atajo aparece en las 5 sin tocar
 * nada más (ver [[feedback_reuse_shared_components]]).
 */

import { useState, useEffect } from 'react';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const TIPOS = [
  { id: 'mes', label: 'Mes' },
  { id: 'trimestre', label: 'Trimestre' },
  { id: 'semestre', label: 'Semestre' },
  { id: 'anio', label: 'Año completo' },
  { id: 'seleccion', label: 'Varios meses' },
];
const TRIMESTRES = ['T1 (Ene-Mar)', 'T2 (Abr-Jun)', 'T3 (Jul-Sep)', 'T4 (Oct-Dic)'];
const SEMESTRES = ['S1 (Ene-Jun)', 'S2 (Jul-Dic)'];

// Expande una lista de índices (de trimestre o de semestre) a los meses que
// contiene cada uno, según su tamaño en meses (3 para trimestre, 6 para
// semestre), y devuelve el resultado ordenado y sin duplicados — un mismo
// mes nunca debería repetirse en el array final, aunque en la práctica los
// trimestres/semestres nunca se solapan entre sí.
function expandirAMeses(indices, tamanoBloque) {
  const set = new Set();
  indices.forEach(i => {
    for (let m = i * tamanoBloque; m < i * tamanoBloque + tamanoBloque; m++) set.add(m);
  });
  return [...set].sort((a, b) => a - b);
}

export default function PeriodoComparador({ aniosDisponibles, onChange, tipoInicial = 'mes', aniosIniciales }) {
  const [tipo, setTipo] = useState(tipoInicial);
  const [mes, setMes] = useState(0);
  const [trimestresElegidos, setTrimestresElegidos] = useState(() => new Set([0]));
  const [semestresElegidos, setSemestresElegidos] = useState(() => new Set([0]));
  const [mesesElegidos, setMesesElegidos] = useState(() => new Set([new Date().getMonth()]));
  const [anios, setAnios] = useState(() => new Set(aniosIniciales || aniosDisponibles.slice(-2)));
  // Atajo "Desde / Hasta" dentro de "Varios meses" (ver CAMBIO 4). Solo
  // controla el desplegable en sí — el resultado sigue viviendo en
  // `mesesElegidos`, igual que si el usuario hubiera tocado cada botón.
  const [desdeMes, setDesdeMes] = useState('');
  const [hastaMes, setHastaMes] = useState('');

  // `meses` es siempre un array de índices 0-11, sea cual sea el tipo — así
  // el padre solo necesita saber filtrar "¿este mes está en la lista?",
  // nunca comparar contra un mesInicio/mesFin.
  const mesesActivos = tipo === 'mes' ? [mes]
    : tipo === 'trimestre' ? expandirAMeses([...trimestresElegidos], 3)
    : tipo === 'semestre' ? expandirAMeses([...semestresElegidos], 6)
    : tipo === 'anio' ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    : [...mesesElegidos].sort((a, b) => a - b);

  useEffect(() => {
    const rangosPorAnio = [...anios].sort().map(anio => ({ anio, meses: mesesActivos }));
    onChange(rangosPorAnio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, mes, trimestresElegidos, semestresElegidos, mesesElegidos, anios]);

  function toggleAnio(a) {
    setAnios(prev => {
      const next = new Set(prev);
      next.has(a) ? next.delete(a) : next.add(a);
      return next;
    });
  }

  function toggleMes(m) {
    setMesesElegidos(prev => {
      const next = new Set(prev);
      next.has(m) ? next.delete(m) : next.add(m);
      return next;
    });
  }

  // Aplica el atajo "Desde / Hasta": si ambos desplegables tienen un mes
  // válido y Desde no es posterior a Hasta, sustituye `mesesElegidos` por
  // todo el tramo (inclusive). Se llama automáticamente al cambiar cualquiera
  // de los dos desplegables — sin botón "Aplicar" aparte, igual que el resto
  // de selects de este componente.
  function aplicarRango(nuevoDesde, nuevoHasta) {
    if (nuevoDesde === '' || nuevoHasta === '') return;
    const d = Number(nuevoDesde), h = Number(nuevoHasta);
    if (d > h) return;
    const rango = [];
    for (let m = d; m <= h; m++) rango.push(m);
    setMesesElegidos(new Set(rango));
  }

  function toggleTrimestre(i) {
    setTrimestresElegidos(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  function toggleSemestre(i) {
    setSemestresElegidos(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  return (
    <div className="mb-5">
      <div className="text-[11px] uppercase tracking-wide font-bold text-slate-400 dark:text-slate-500 mb-2">
        Qué periodo quieres ver
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {TIPOS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTipo(t.id)}
            className={`px-3.5 py-1.5 rounded-full text-[13px] font-semibold !border-0 transition-colors
              ${tipo === t.id ? 'bg-indigo-50 dark:bg-indigo-500/15 !text-indigo-700 dark:!text-indigo-300' : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tipo === 'mes' && (
        <select
          value={mes}
          onChange={e => setMes(+e.target.value)}
          className="bg-slate-100 dark:bg-white/5 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200 !border-0"
        >
          {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
      )}
      {tipo === 'trimestre' && (
        <div>
          <div className="flex flex-wrap gap-2">
            {TRIMESTRES.map((label, i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggleTrimestre(i)}
                className={`px-3 py-1.5 rounded-full text-[12.5px] font-semibold !border-0 transition-colors
                  ${trimestresElegidos.has(i) ? 'bg-indigo-50 dark:bg-indigo-500/15 !text-indigo-700 dark:!text-indigo-300' : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {trimestresElegidos.size === 0 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2">Marca al menos un trimestre.</p>
          )}
        </div>
      )}
      {tipo === 'semestre' && (
        <div>
          <div className="flex flex-wrap gap-2">
            {SEMESTRES.map((label, i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggleSemestre(i)}
                className={`px-3 py-1.5 rounded-full text-[12.5px] font-semibold !border-0 transition-colors
                  ${semestresElegidos.has(i) ? 'bg-indigo-50 dark:bg-indigo-500/15 !text-indigo-700 dark:!text-indigo-300' : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {semestresElegidos.size === 0 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2">Marca al menos un semestre.</p>
          )}
        </div>
      )}
      {tipo === 'seleccion' && (
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-[12.5px] text-slate-500 dark:text-slate-400">Rango rápido:</span>
            <select
              value={desdeMes}
              onChange={e => { setDesdeMes(e.target.value); aplicarRango(e.target.value, hastaMes); }}
              className="bg-slate-100 dark:bg-white/5 rounded-lg px-2.5 py-1.5 text-[12.5px] text-slate-700 dark:text-slate-200 !border-0"
            >
              <option value="">Desde</option>
              {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <span className="text-[12.5px] text-slate-400 dark:text-slate-500">→</span>
            <select
              value={hastaMes}
              onChange={e => { setHastaMes(e.target.value); aplicarRango(desdeMes, e.target.value); }}
              className="bg-slate-100 dark:bg-white/5 rounded-lg px-2.5 py-1.5 text-[12.5px] text-slate-700 dark:text-slate-200 !border-0"
            >
              <option value="">Hasta</option>
              {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            {desdeMes !== '' && hastaMes !== '' && Number(desdeMes) > Number(hastaMes) && (
              <span className="text-[11px] text-amber-600 dark:text-amber-400">"Desde" tiene que ser igual o anterior a "Hasta".</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {MESES.map((m, i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggleMes(i)}
                className={`px-3 py-1.5 rounded-full text-[12.5px] font-semibold !border-0 transition-colors
                  ${mesesElegidos.has(i) ? 'bg-indigo-50 dark:bg-indigo-500/15 !text-indigo-700 dark:!text-indigo-300' : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400'}`}
              >
                {m}
              </button>
            ))}
          </div>
          {mesesElegidos.size === 0 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2">Marca al menos un mes.</p>
          )}
        </div>
      )}

      <div className="text-[11px] uppercase tracking-wide font-bold text-slate-400 dark:text-slate-500 mt-4 mb-2">
        Qué años comparar
      </div>
      <div className="flex flex-wrap gap-2">
        {aniosDisponibles.map(a => (
          <button
            key={a}
            type="button"
            onClick={() => toggleAnio(a)}
            className={`px-3.5 py-1.5 rounded-md text-[13px] font-semibold !border-0 transition-colors
              ${anios.has(a) ? 'bg-indigo-50 dark:bg-indigo-500/15 !text-indigo-700 dark:!text-indigo-300' : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400'}`}
          >
            {a}
          </button>
        ))}
      </div>
    </div>
  );
}
