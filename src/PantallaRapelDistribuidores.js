/*
 * PantallaRapelDistribuidores.js
 * "Rapel Distribuidores" — primera pieza de "Acuerdos con clientes/
 * distribuidores" (26/07/2026, a petición de Sergio, justo después de
 * terminar Geolocalización). Ver src/rapelDistribuidores.js para el diseño
 * completo confirmado con Sergio; resumen:
 *
 *  - El cumplimiento se mide contra el MISMO Objetivo Anual que ya se fija
 *    en "Presupuesto y Forecast" (% de crecimiento por marca), no una cifra
 *    aparte — se reutiliza `getPresupuestosPorAnio` + `getVentasRealesGeneral`
 *    tal cual las usa PantallaPresupuesto.js.
 *  - El rapel por facturación es ESCALADO: una tabla de tramos (de X% a Y%
 *    de cumplimiento → Z% de rapel), configurable cada año sin tocar código.
 *  - Además hay "bonificaciones" (ej. "Datos detallados compartidos") — un
 *    catálogo global (nombre + %) que Sergio puede ampliar libremente, y que
 *    se activa distribuidor por distribuidor.
 *  - "Para todos igual pero a algunos se puede agregar/modificar/quitar
 *    según el grado de colaboración" (palabras de Sergio): por eso cada
 *    distribuidor puede tener una tabla de tramos PERSONALIZADA que
 *    sustituye a la global solo para él, sin tocar la de los demás.
 *
 * Es la PRIMERA versión de esta pantalla — Sergio: "probemos a ver qué tal
 * queda y te voy diciendo", así que faltan a propósito cosas que se pueden
 * añadir después si hace falta: histórico de rapeles ya liquidados, export a
 * PDF/Excel, edición de bonificaciones activas en bloque, etc.
 *
 * Igual que Presupuesto y Forecast: se bloquea en modo "Todos los usuarios"
 * (fijar/editar una configuración no tiene sentido mezclando varias cuentas).
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Trash2, Settings2, Users } from 'lucide-react';
import {
  getDistribuidoresPorUsuario,
  getVentasRealesGeneral,
  getPresupuestosPorAnio,
  getConfiguracionesRapelPorAnio,
  guardarConfiguracionRapelGlobal,
  guardarConfiguracionRapelDistribuidor,
  borrarConfiguracionRapelDistribuidor
} from './firebaseApi';
import { auth } from './firebaseConfig';
import {
  calcularObjetivoTotalFacturacion,
  calcularFacturacionRealTotal,
  calcularRapelDistribuidor
} from './rapelDistribuidores';
import {
  tarjeta, tituloPantalla, subtitulo, inputClasses, etiqueta,
  botonSecundario, botonPeligro, botonExito,
  thClasses, tdClasses, tdRightClasses, kpiCard, kpiTitulo, kpiValor
} from './uiClasses';

export const PANTALLA_RAPEL_DISTRIBUIDORES = 'RAPEL_DISTRIBUIDORES';

const formateadorMoneda = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const formateadorPct = (v) => `${(Number(v) || 0).toFixed(1)}%`;

// --- Editor genérico de tramos [{pct_min, pct_max, pct_rapel}] ------------
function EditorTramos({ tramos, onChange }) {
  const actualizarFila = (i, campo, valor) => {
    const copia = tramos.map((t, idx) => (idx === i ? { ...t, [campo]: valor } : t));
    onChange(copia);
  };
  const añadirFila = () => onChange([...tramos, { pct_min: 0, pct_max: null, pct_rapel: 0 }]);
  const quitarFila = (i) => onChange(tramos.filter((_, idx) => idx !== i));

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th className={thClasses}>% cumplimiento desde</th>
            <th className={thClasses}>% cumplimiento hasta</th>
            <th className={thClasses}>% rapel</th>
            <th className={thClasses}></th>
          </tr>
        </thead>
        <tbody>
          {tramos.map((t, i) => (
            <tr key={i}>
              <td className={tdClasses}>
                <input type="number" step="0.1" value={t.pct_min ?? ''} onChange={(e) => actualizarFila(i, 'pct_min', e.target.value === '' ? 0 : Number(e.target.value))} className={`${inputClasses} w-24`} />
              </td>
              <td className={tdClasses}>
                <input type="number" step="0.1" placeholder="sin tope" value={t.pct_max ?? ''} onChange={(e) => actualizarFila(i, 'pct_max', e.target.value === '' ? null : Number(e.target.value))} className={`${inputClasses} w-24`} />
              </td>
              <td className={tdClasses}>
                <input type="number" step="0.1" value={t.pct_rapel ?? ''} onChange={(e) => actualizarFila(i, 'pct_rapel', e.target.value === '' ? 0 : Number(e.target.value))} className={`${inputClasses} w-24`} />
              </td>
              <td className={tdClasses}>
                <button type="button" onClick={() => quitarFila(i)} className="text-red-500 hover:text-red-700"><Trash2 size={15} /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" onClick={añadirFila} className={`${botonSecundario} mt-2`}>
        <span className="inline-flex items-center gap-1.5"><Plus size={14} />Añadir tramo</span>
      </button>
    </div>
  );
}

// --- Editor genérico del catálogo de bonificaciones [{nombre, pct}] -------
function EditorBonificaciones({ bonificaciones, onChange }) {
  const actualizarFila = (i, campo, valor) => {
    const copia = bonificaciones.map((b, idx) => (idx === i ? { ...b, [campo]: valor } : b));
    onChange(copia);
  };
  const añadirFila = () => onChange([...bonificaciones, { nombre: '', pct: 0 }]);
  const quitarFila = (i) => onChange(bonificaciones.filter((_, idx) => idx !== i));

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th className={thClasses}>Nombre</th>
            <th className={thClasses}>% rapel</th>
            <th className={thClasses}></th>
          </tr>
        </thead>
        <tbody>
          {bonificaciones.map((b, i) => (
            <tr key={i}>
              <td className={tdClasses}>
                <input type="text" value={b.nombre} onChange={(e) => actualizarFila(i, 'nombre', e.target.value)} className={`${inputClasses} w-full`} placeholder="ej. Datos detallados compartidos" />
              </td>
              <td className={tdClasses}>
                <input type="number" step="0.1" value={b.pct ?? ''} onChange={(e) => actualizarFila(i, 'pct', e.target.value === '' ? 0 : Number(e.target.value))} className={`${inputClasses} w-24`} />
              </td>
              <td className={tdClasses}>
                <button type="button" onClick={() => quitarFila(i)} className="text-red-500 hover:text-red-700"><Trash2 size={15} /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" onClick={añadirFila} className={`${botonSecundario} mt-2`}>
        <span className="inline-flex items-center gap-1.5"><Plus size={14} />Añadir bonificación</span>
      </button>
    </div>
  );
}

function PantallaRapelDistribuidores({ idUsuario, bloqueadoPorTodos = false }) {
  const anoActual = new Date().getFullYear();
  const [anio, setAnio] = useState(anoActual);
  const [distribuidores, setDistribuidores] = useState([]);
  const [ventasReales, setVentasReales] = useState([]);
  const [presupuestos, setPresupuestos] = useState([]);
  const [configuraciones, setConfiguraciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardandoGlobal, setGuardandoGlobal] = useState(false);
  const [guardandoDist, setGuardandoDist] = useState(false);

  // Edición local de la plantilla global (se precarga desde lo guardado al cambiar de año).
  const [tramosGlobal, setTramosGlobal] = useState([]);
  const [bonificacionesGlobal, setBonificacionesGlobal] = useState([]);

  // Edición local de la excepción del distribuidor elegido.
  const [idDistribuidorSel, setIdDistribuidorSel] = useState('');
  const [personalizarTramos, setPersonalizarTramos] = useState(false);
  const [tramosDist, setTramosDist] = useState([]);
  const [bonificacionesActivasDist, setBonificacionesActivasDist] = useState(new Set());

  const cargarTodo = useCallback(async () => {
    if (!idUsuario) { setDistribuidores([]); setVentasReales([]); setPresupuestos([]); setConfiguraciones([]); setCargando(false); return; }
    setCargando(true);
    try {
      const [dist, ventas, presu, config] = await Promise.all([
        getDistribuidoresPorUsuario(idUsuario),
        getVentasRealesGeneral(idUsuario),
        getPresupuestosPorAnio(idUsuario, anio),
        getConfiguracionesRapelPorAnio(idUsuario, anio),
      ]);
      setDistribuidores(dist.sort((a, b) => (a.nombre_distribuidor || '').localeCompare(b.nombre_distribuidor || '', 'es')));
      setVentasReales(ventas);
      setPresupuestos(presu);
      setConfiguraciones(config);
    } catch (error) {
      console.error('Error cargando Rapel Distribuidores:', error);
      alert('Error al cargar los datos: ' + error.message);
    }
    setCargando(false);
  }, [idUsuario, anio]);

  useEffect(() => { cargarTodo(); }, [cargarTodo]);

  const configGlobal = useMemo(() => configuraciones.find(c => !c.id_distribuidor) || null, [configuraciones]);
  const configsPorDistribuidor = useMemo(() => {
    const mapa = new Map();
    configuraciones.filter(c => c.id_distribuidor).forEach(c => mapa.set(c.id_distribuidor, c));
    return mapa;
  }, [configuraciones]);

  // Precarga los editores de la plantilla global cuando cambian los datos cargados.
  useEffect(() => {
    setTramosGlobal(configGlobal?.tramos_facturacion?.length ? configGlobal.tramos_facturacion : [{ pct_min: 0, pct_max: 100, pct_rapel: 0 }]);
    setBonificacionesGlobal(configGlobal?.bonificaciones?.length ? configGlobal.bonificaciones : []);
  }, [configGlobal]);

  // Precarga el editor de excepción cuando se elige un distribuidor.
  useEffect(() => {
    if (!idDistribuidorSel) { setPersonalizarTramos(false); setTramosDist([]); setBonificacionesActivasDist(new Set()); return; }
    const configDist = configsPorDistribuidor.get(idDistribuidorSel);
    setPersonalizarTramos(!!configDist?.tramos_facturacion?.length);
    setTramosDist(configDist?.tramos_facturacion?.length ? configDist.tramos_facturacion : tramosGlobal);
    setBonificacionesActivasDist(new Set(configDist?.bonificaciones_activas || []));
  }, [idDistribuidorSel, configsPorDistribuidor, tramosGlobal]);

  const actor = () => ({ uid: auth.currentUser?.uid, email: auth.currentUser?.email });

  const handleGuardarGlobal = async () => {
    setGuardandoGlobal(true);
    try {
      await guardarConfiguracionRapelGlobal(idUsuario, anio, { tramos_facturacion: tramosGlobal, bonificaciones: bonificacionesGlobal }, actor());
      await cargarTodo();
    } catch (error) {
      console.error('Error guardando configuración global de rapel:', error);
      alert('Error al guardar: ' + error.message);
    }
    setGuardandoGlobal(false);
  };

  const handleGuardarDistribuidor = async () => {
    if (!idDistribuidorSel) return;
    setGuardandoDist(true);
    try {
      await guardarConfiguracionRapelDistribuidor(idUsuario, anio, idDistribuidorSel, {
        tramos_facturacion: personalizarTramos ? tramosDist : null,
        bonificaciones_activas: Array.from(bonificacionesActivasDist),
      }, actor());
      await cargarTodo();
    } catch (error) {
      console.error('Error guardando excepción de distribuidor:', error);
      alert('Error al guardar: ' + error.message);
    }
    setGuardandoDist(false);
  };

  const handleQuitarPersonalizacion = async () => {
    if (!idDistribuidorSel) return;
    if (!window.confirm('¿Quitar la personalización de este distribuidor? Volverá a usar la tabla global.')) return;
    setGuardandoDist(true);
    try {
      await borrarConfiguracionRapelDistribuidor(idUsuario, anio, idDistribuidorSel);
      await cargarTodo();
    } catch (error) {
      console.error('Error quitando la personalización:', error);
      alert('Error al quitar la personalización: ' + error.message);
    }
    setGuardandoDist(false);
  };

  const toggleBonificacionActiva = (nombre) => {
    setBonificacionesActivasDist(prev => {
      const copia = new Set(prev);
      if (copia.has(nombre)) copia.delete(nombre); else copia.add(nombre);
      return copia;
    });
  };

  // --- Cálculo del rapel de cada distribuidor, con la tabla/bonificaciones que le apliquen ---
  const filasCalculo = useMemo(() => {
    const catalogoBonificaciones = new Map((configGlobal?.bonificaciones || []).map(b => [b.nombre, b]));
    return distribuidores.map((d) => {
      const presupuestoDist = presupuestos.find(p => p.id_distribuidor === d.id) || null;
      const objetivoTotal = calcularObjetivoTotalFacturacion(presupuestoDist, ventasReales);
      const facturacionReal = calcularFacturacionRealTotal(ventasReales, anio, d.id);
      const configDist = configsPorDistribuidor.get(d.id) || null;
      const tramos = (configDist?.tramos_facturacion && configDist.tramos_facturacion.length)
        ? configDist.tramos_facturacion
        : (configGlobal?.tramos_facturacion || []);
      const bonificacionesActivas = (configDist?.bonificaciones_activas || [])
        .map(nombre => catalogoBonificaciones.get(nombre))
        .filter(Boolean);
      const resultado = calcularRapelDistribuidor({ objetivoTotal, facturacionReal, tramos, bonificacionesActivas });
      return {
        id: d.id,
        nombre: d.nombre_distribuidor,
        objetivoTotal,
        facturacionReal,
        tienePersonalizacion: !!(configDist?.tramos_facturacion && configDist.tramos_facturacion.length),
        bonificacionesActivasNombres: (configDist?.bonificaciones_activas || []),
        ...resultado,
      };
    }).sort((a, b) => b.importeRapel - a.importeRapel);
  }, [distribuidores, presupuestos, ventasReales, configsPorDistribuidor, configGlobal, anio]);

  const totalRapel = useMemo(() => filasCalculo.reduce((acc, f) => acc + f.importeRapel, 0), [filasCalculo]);
  const conObjetivoDefinido = filasCalculo.filter(f => f.pctCumplimiento !== null).length;

  if (bloqueadoPorTodos) {
    return (
      <div className={tarjeta}>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          "Rapel Distribuidores" no está disponible en modo "Todos los usuarios" — configurar/calcular el rapel requiere una cuenta concreta. Elige "Mis datos" o un usuario del selector "Viendo como" (barra lateral) para usar esta pantalla.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className={tituloPantalla}>Rapel Distribuidores</h1>
      <p className={subtitulo}>
        Objetivo anual (el mismo de Presupuesto y Forecast) con rapel escalado por % de cumplimiento, más bonificaciones (datos compartidos u otras que añadas) — configurable cada año, con excepciones por distribuidor si hace falta.
      </p>

      <div className="flex items-end gap-3 mb-4">
        <div>
          <label className={`${etiqueta} block mb-1`}>Año</label>
          <input type="number" value={anio} onChange={(e) => setAnio(Number(e.target.value) || anoActual)} className={`${inputClasses} w-28`} />
        </div>
      </div>

      {cargando ? (
        <div className="text-slate-500 dark:text-slate-400">Cargando datos...</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-3 mb-6">
            <div className={kpiCard}>
              <div className={kpiTitulo}>Rapel total estimado {anio}</div>
              <div className={kpiValor}>{formateadorMoneda.format(totalRapel)}</div>
            </div>
            <div className={kpiCard}>
              <div className={kpiTitulo}>Distribuidores con objetivo definido</div>
              <div className={kpiValor}>{conObjetivoDefinido} / {distribuidores.length}</div>
            </div>
          </div>

          <div className={`${tarjeta} mb-6`}>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-3 inline-flex items-center gap-1.5"><Settings2 size={16} />Configuración global {anio} (aplica a todos por defecto)</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Tramos de facturación: a qué % de rapel corresponde cada nivel de cumplimiento del objetivo anual. Deja "hasta" en blanco para "sin tope".</p>
            <EditorTramos tramos={tramosGlobal} onChange={setTramosGlobal} />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-4 mb-3">Catálogo de bonificaciones (ej. "Datos detallados compartidos") — se activan distribuidor por distribuidor más abajo.</p>
            <EditorBonificaciones bonificaciones={bonificacionesGlobal} onChange={setBonificacionesGlobal} />
            <button type="button" onClick={handleGuardarGlobal} disabled={guardandoGlobal} className={`${botonExito} mt-4`}>
              {guardandoGlobal ? 'Guardando...' : 'Guardar configuración global'}
            </button>
          </div>

          <div className={`${tarjeta} mb-6`}>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-3 inline-flex items-center gap-1.5"><Users size={16} />Excepciones por distribuidor</h3>
            <div className="mb-3">
              <label className={`${etiqueta} block mb-1`}>Distribuidor</label>
              <select value={idDistribuidorSel} onChange={(e) => setIdDistribuidorSel(e.target.value)} className={`${inputClasses} w-full max-w-sm`}>
                <option value="">Selecciona un distribuidor...</option>
                {distribuidores.map(d => <option key={d.id} value={d.id}>{d.nombre_distribuidor}</option>)}
              </select>
            </div>

            {idDistribuidorSel && (
              <>
                {bonificacionesGlobal.length > 0 && (
                  <div className="mb-4">
                    <p className={`${etiqueta} mb-2`}>Bonificaciones activas para este distribuidor:</p>
                    <div className="flex flex-wrap gap-3">
                      {bonificacionesGlobal.filter(b => b.nombre).map((b, i) => (
                        <label key={i} className="inline-flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
                          <input type="checkbox" checked={bonificacionesActivasDist.has(b.nombre)} onChange={() => toggleBonificacionActiva(b.nombre)} />
                          {b.nombre} ({formateadorPct(b.pct)})
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <label className="inline-flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300 mb-3">
                  <input type="checkbox" checked={personalizarTramos} onChange={(e) => setPersonalizarTramos(e.target.checked)} />
                  Personalizar tramos de facturación para este distribuidor (si no, usa la tabla global)
                </label>

                {personalizarTramos && (
                  <div className="mb-3">
                    <EditorTramos tramos={tramosDist} onChange={setTramosDist} />
                  </div>
                )}

                <div className="flex gap-2">
                  <button type="button" onClick={handleGuardarDistribuidor} disabled={guardandoDist} className={botonExito}>
                    {guardandoDist ? 'Guardando...' : 'Guardar excepción'}
                  </button>
                  {configsPorDistribuidor.has(idDistribuidorSel) && (
                    <button type="button" onClick={handleQuitarPersonalizacion} disabled={guardandoDist} className={botonPeligro}>
                      Quitar personalización
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          <div className={tarjeta}>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-3">Cálculo del rapel {anio}</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className={thClasses}>Distribuidor</th>
                    <th className={thClasses}>Objetivo anual</th>
                    <th className={thClasses}>Facturación real</th>
                    <th className={thClasses}>% Cumplimiento</th>
                    <th className={thClasses}>% Rapel tramo</th>
                    <th className={thClasses}>Bonificaciones</th>
                    <th className={thClasses}>% Rapel total</th>
                    <th className={thClasses}>Importe rapel</th>
                  </tr>
                </thead>
                <tbody>
                  {filasCalculo.map((f) => (
                    <tr key={f.id}>
                      <td className={tdClasses}>{f.nombre}{f.tienePersonalizacion && <span className="text-indigo-500 dark:text-indigo-400 text-xs"> (tramos personalizados)</span>}</td>
                      <td className={tdRightClasses}>{formateadorMoneda.format(f.objetivoTotal)}</td>
                      <td className={tdRightClasses}>{formateadorMoneda.format(f.facturacionReal)}</td>
                      <td className={tdRightClasses}>{f.pctCumplimiento === null ? <span className="text-amber-600 dark:text-amber-400">sin objetivo</span> : formateadorPct(f.pctCumplimiento)}</td>
                      <td className={tdRightClasses}>{formateadorPct(f.pctRapelTramo)}</td>
                      <td className={tdClasses}>{f.bonificacionesActivasNombres.length > 0 ? f.bonificacionesActivasNombres.join(', ') : '—'}</td>
                      <td className={tdRightClasses}>{formateadorPct(f.pctRapelTotal)}</td>
                      <td className={tdRightClasses}>{formateadorMoneda.format(f.importeRapel)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {distribuidores.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">No hay distribuidores dados de alta todavía.</p>}
          </div>
        </>
      )}
    </div>
  );
}

export default PantallaRapelDistribuidores;
