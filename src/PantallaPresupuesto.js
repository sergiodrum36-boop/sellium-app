/*
 * PantallaPresupuesto.js (Versión 2.0 — rediseño "por marca")
 * Nueva pantalla, a petición de Sergio (mejora de "profesionalización" de
 * la app, Fase 2): área PROPIA y separada de las pantallas de uso diario —
 * "Presupuesto y Forecast" es un acceso de nivel superior en el Sidebar
 * (junto a "Reportes Generales", ver Layout.js), no una subpestaña de
 * "Gestión por Distribuidor" ni del grupo "Dashboard". La razón (palabras
 * de Sergio): la creación del objetivo anual solo se usa una o dos veces al
 * año, así que no debe mezclarse con las pantallas de entrada de datos del
 * día a día.
 *
 * CAMBIO (v2.0, a petición explícita de Sergio): el objetivo ya NO se fija
 * repartiendo un total en 12 meses. Ahora es POR MARCA: para cada marca que
 * el distribuidor tuvo el año anterior, se ve su cifra real de año anterior
 * (Facturación en cajas+importe, A&P Gastado en importe) y se rellena solo
 * un % de crecimiento — la app calcula el objetivo (año anterior × (1 + %)).
 * Al lado de cada tabla sale el TOTAL de todas las marcas.
 *  - Facturación: la cifra de "año anterior" sale de `ventasReales`
 *    (Ventas Reales/Sell-In QlikSense) — cajas e importe por marca, que es
 *    la fuente que ya se considera "de verdad" en el resto de la app.
 *  - A&P Gastado: la cifra de "año anterior" sale de `historicoSellOut`
 *    (gastoTotal por marca) — no tiene "cajas", solo importe.
 * Ya no hay desglose mensual: el Forecast compara el objetivo anual (y por
 * marca) contra el real acumulado del año en curso.
 *
 * Dos pestañas internas:
 *  - "Objetivo Anual": por Distribuidor y Año, una tabla de Facturación por
 *    marca y otra de A&P Gastado por marca (año anterior + % crecimiento +
 *    objetivo calculado + fila de TOTAL).
 *  - "Forecast": para el Año (y Distribuidor, o "Todos") elegido, agrega el
 *    objetivo por marca (sumando entre distribuidores si aplica), lo
 *    compara contra el real acumulado del año (de `ventasReales` y
 *    `historicoSellOut`), calcula el % cumplido del objetivo ACUMULADO
 *    hasta el último mes con datos (prorrateando el objetivo anual por
 *    meses transcurridos, ya que no hay desglose mensual guardado) y
 *    proyecta el cierre de año extrapolando el ritmo real observado.
 *
 * Ambas pestañas comparten el mismo idUsuario/listaDistribuidores, y ahora
 * también el mismo histórico general (`ventasReales`/`historicoSellOut`),
 * cargado una sola vez aquí arriba para no repetir la lectura al cambiar de
 * pestaña. Igual que "Gestión por Distribuidor" (que también es de
 * EDICIÓN), la pestaña "Objetivo Anual" se bloquea en modo "Todos los
 * usuarios" de un manager — fijar objetivos no tiene sentido mezclando
 * varias cuentas a la vez. La pestaña "Forecast" es de análisis y sí
 * funciona igual que Reportes/Dashboard con idUsuarioEfectivo (incluido el
 * modo "Todos").
 *
 * NOTA (limitación conocida): si una marca no tuvo NINGUNA venta el año
 * anterior para ese distribuidor, no aparece fila para ella (un % de
 * crecimiento sobre 0 sigue siendo 0) — de momento no hay forma de fijar un
 * objetivo "desde cero" para una marca nueva en esta pantalla. Si hace
 * falta, avisar a Sergio para añadir esa opción.
 *
 * NOTA (limitación conocida): los objetivos guardados con la v1.0 (formato
 * mensual, `objetivos_mensuales`) ya no se muestran con este nuevo formato
 * — si Sergio tenía alguno guardado, tendrá que volver a introducirlo por
 * marca.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getDistribuidoresPorUsuario,
  getPresupuesto,
  getPresupuestosPorAnio,
  guardarPresupuesto,
  deletePresupuesto,
  getVentasRealesGeneral,
  getHistoricoSellOutGeneral
} from './firebaseApi';
import { auth } from './firebaseConfig';
import { gastoTotal } from './calculosAP';
import {
  inputClasses, botonSecundario, botonExito, botonPeligro,
  etiqueta, filtroContenedor, tarjeta, thClasses, tdClasses, tdRightClasses,
  trTotales, colorPorSigno, tituloPantalla, subtitulo, kpiCard, kpiTitulo, kpiValor
} from './uiClasses';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid
} from 'recharts';

export const PANTALLA_PRESUPUESTO = 'PRESUPUESTO';

const NOMBRES_MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const formateadorMoneda = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const formateadorMonedaCorta = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const formateadorNumero = new Intl.NumberFormat('es-ES');

// Nº máximo de marcas que se pintan en los gráficos de barras del Forecast
// (si hay más, se recortan a las de mayor objetivo para no saturar el
// gráfico — la tabla de detalle debajo sí las lista todas).
const MAX_MARCAS_GRAFICO = 12;

function PantallaPresupuesto({ idUsuario, bloqueadoPorTodos = false }) {

  const [pestañaInterna, setPestañaInterna] = useState('OBJETIVO'); // 'OBJETIVO' | 'FORECAST'
  const [listaDistribuidores, setListaDistribuidores] = useState([]);
  const [ventasReales, setVentasReales] = useState([]);
  const [historicoSellOut, setHistoricoSellOut] = useState([]);
  const [cargandoMaestros, setCargandoMaestros] = useState(true);

  const anoActual = new Date().getFullYear();

  useEffect(() => {
    if (!idUsuario) {
      setListaDistribuidores([]);
      setVentasReales([]);
      setHistoricoSellOut([]);
      setCargandoMaestros(false);
      return;
    }
    (async () => {
      setCargandoMaestros(true);
      try {
        const [distribuidores, ventas, sellOut] = await Promise.all([
          getDistribuidoresPorUsuario(idUsuario),
          getVentasRealesGeneral(idUsuario),
          getHistoricoSellOutGeneral(idUsuario)
        ]);
        setListaDistribuidores(distribuidores.sort((a, b) => a.nombre_distribuidor.localeCompare(b.nombre_distribuidor)));
        setVentasReales(ventas);
        setHistoricoSellOut(sellOut);
      } catch (error) {
        console.error('Error cargando datos para Presupuesto:', error);
      }
      setCargandoMaestros(false);
    })();
  }, [idUsuario]);

  return (
    <div>
      <h2 className={tituloPantalla}>Presupuesto y Forecast</h2>
      <p className={subtitulo}>
        Objetivo anual por marca de Facturación (Ventas Reales) y de A&amp;P Gastado, a partir del año anterior + % de crecimiento, y comparación contra el histórico real. Área independiente de las pantallas de uso diario — se usa solo una o dos veces al año para fijar el objetivo, y cuando se quiera consultar el Forecast.
      </p>

      <div className="flex gap-2 mb-5 border-b border-slate-200 dark:border-slate-700">
        <button
          type="button"
          onClick={() => setPestañaInterna('OBJETIVO')}
          className={`px-4 py-2 text-sm font-semibold !border-0 !bg-transparent rounded-none border-b-2 ${pestañaInterna === 'OBJETIVO' ? 'border-wine text-slate-900 dark:text-white' : 'border-transparent text-slate-500 dark:text-slate-400'}`}
        >
          Objetivo Anual
        </button>
        <button
          type="button"
          onClick={() => setPestañaInterna('FORECAST')}
          className={`px-4 py-2 text-sm font-semibold !border-0 !bg-transparent rounded-none border-b-2 ${pestañaInterna === 'FORECAST' ? 'border-wine text-slate-900 dark:text-white' : 'border-transparent text-slate-500 dark:text-slate-400'}`}
        >
          Forecast
        </button>
      </div>

      {bloqueadoPorTodos ? (
        // "Presupuesto y Forecast" completo (las dos pestañas) es de
        // EDICIÓN/análisis por CUENTA — objetivos y su forecast no tienen
        // sentido mezclando varios usuarios a la vez. Mismo criterio y
        // mismo mensaje que "Gestión por Distribuidor" (ver App.js/
        // PantallaDistribuidor.js).
        <div className={tarjeta}>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            "Presupuesto y Forecast" no está disponible en modo "Todos los usuarios" — un objetivo se fija sobre una cuenta y un distribuidor concretos. Elige "Mis datos" o un usuario del selector "Viendo como" (barra lateral) para usar esta pantalla.
          </p>
        </div>
      ) : cargandoMaestros ? (
        <div className="text-slate-500 dark:text-slate-400">Cargando datos maestros...</div>
      ) : pestañaInterna === 'OBJETIVO' ? (
        <PestañaObjetivo
          idUsuario={idUsuario}
          listaDistribuidores={listaDistribuidores}
          anoActual={anoActual}
          ventasReales={ventasReales}
          historicoSellOut={historicoSellOut}
        />
      ) : (
        <PestañaForecast
          idUsuario={idUsuario}
          listaDistribuidores={listaDistribuidores}
          anoActual={anoActual}
          ventasReales={ventasReales}
          historicoSellOut={historicoSellOut}
        />
      )}
    </div>
  );
}

// ==========================================================================
// Helpers compartidos: agregación año anterior / real por marca
// ==========================================================================

// Agrega ventasReales de un distribuidor (o de todos, si idDistribuidor es
// '') en un año concreto, sumando cajas + importe por marca.
function agregarFacturacionPorMarca(ventasReales, anio, idDistribuidor) {
  const prefijo = `${anio}-`;
  const mapa = new Map();
  ventasReales.forEach(v => {
    if (idDistribuidor && v.id_distribuidor !== idDistribuidor) return;
    if (!(v.mes_ano || '').startsWith(prefijo)) return;
    const fila = mapa.get(v.id_marca) || { id_marca: v.id_marca, nombre_marca: v.nombre_marca || 'N/A', cajas: 0, importe: 0 };
    fila.cajas += Number(v.cajas) || 0;
    fila.importe += Number(v.importe_euros) || 0;
    mapa.set(v.id_marca, fila);
  });
  return mapa;
}

// Igual que la anterior, pero para A&P Gastado (historicoSellOut, solo
// importe vía gastoTotal()).
function agregarApPorMarca(historicoSellOut, anio, idDistribuidor) {
  const prefijo = `${anio}-`;
  const mapa = new Map();
  historicoSellOut.forEach(v => {
    if (idDistribuidor && v.id_distribuidor !== idDistribuidor) return;
    if (!(v.mes_ano || '').startsWith(prefijo)) return;
    const fila = mapa.get(v.id_marca) || { id_marca: v.id_marca, nombre_marca: v.nombre_marca || 'N/A', importe: 0 };
    fila.importe += gastoTotal(v);
    mapa.set(v.id_marca, fila);
  });
  return mapa;
}

// Último mes (1-12) de un año concreto que tiene algún dato real (en
// ventasReales o historicoSellOut), filtrado por distribuidor si aplica.
function calcularMesesTranscurridos(ventasReales, historicoSellOut, anio, idDistribuidor, anoActual) {
  const prefijo = `${anio}-`;
  let ultimo = 0;
  const revisar = (mesAno, idDist) => {
    if (idDistribuidor && idDist !== idDistribuidor) return;
    if (!(mesAno || '').startsWith(prefijo)) return;
    const mes = parseInt(mesAno.split('-')[1], 10);
    if (mes >= 1 && mes <= 12 && mes > ultimo) ultimo = mes;
  };
  ventasReales.forEach(v => revisar(v.mes_ano, v.id_distribuidor));
  historicoSellOut.forEach(v => revisar(v.mes_ano, v.id_distribuidor));
  if (anio === anoActual) {
    const mesActualNum = new Date().getMonth() + 1;
    return Math.max(ultimo, Math.min(mesActualNum, 12));
  }
  return ultimo;
}

// ==========================================================================
// PESTAÑA "OBJETIVO ANUAL"
// ==========================================================================
function PestañaObjetivo({ idUsuario, listaDistribuidores, anoActual, ventasReales, historicoSellOut }) {
  // CAMBIO (a petición de Sergio, bug detectado en producción): el objetivo
  // que se fija en esta pantalla es casi siempre para EL AÑO QUE VIENE, no
  // para el año en curso — el año en curso ya está pasando, así que su
  // "año anterior" de referencia (año actual - 1) ya no tiene sentido como
  // base para decidir un crecimiento. Por eso el año por defecto al abrir
  // la pantalla es anoActual + 1 (objetivo), con año anterior = anoActual
  // (el año en curso, con datos reales hasta la fecha) como base. Sigue
  // siendo un campo editable por si Sergio quiere corregir el objetivo de
  // otro año concreto.
  const [anio, setAnio] = useState(anoActual + 1);
  const [idDistribuidor, setIdDistribuidor] = useState('');
  const [filasFacturacion, setFilasFacturacion] = useState([]);
  const [filasAp, setFilasAp] = useState([]);
  const [existeGuardado, setExisteGuardado] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [pctMasivoFact, setPctMasivoFact] = useState('');
  const [pctMasivoAp, setPctMasivoAp] = useState('');

  useEffect(() => {
    if (!idDistribuidor || !listaDistribuidores.some(d => d.id === idDistribuidor)) {
      if (listaDistribuidores.length > 0) setIdDistribuidor(listaDistribuidores[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listaDistribuidores]);

  // Año anterior por marca (Facturación desde Ventas Reales, A&P desde
  // Sell-Out), para el distribuidor y año elegidos. Se recalculan siempre
  // en caliente a partir del histórico — nunca se guardan en el documento.
  const baseFacturacion = useMemo(
    () => agregarFacturacionPorMarca(ventasReales, anio - 1, idDistribuidor),
    [ventasReales, anio, idDistribuidor]
  );
  const baseAp = useMemo(
    () => agregarApPorMarca(historicoSellOut, anio - 1, idDistribuidor),
    [historicoSellOut, anio, idDistribuidor]
  );

  // Combina el año anterior (base) con el % de crecimiento ya guardado (si
  // lo hay) para esa marca. Si había un % guardado para una marca que ya no
  // tiene datos de año anterior, se conserva la fila igualmente (con el año
  // anterior a 0) para no perder la decisión ya tomada.
  const combinarConGuardado = (baseMapa, guardadoArr) => {
    const mapa = new Map();
    baseMapa.forEach((valor, clave) => mapa.set(clave, { ...valor, pct_crecimiento: 0 }));
    (guardadoArr || []).forEach(g => {
      const existente = mapa.get(g.id_marca);
      if (existente) {
        existente.pct_crecimiento = Number(g.pct_crecimiento) || 0;
      } else {
        mapa.set(g.id_marca, {
          id_marca: g.id_marca,
          nombre_marca: g.nombre_marca || 'N/A',
          cajas: 0,
          importe: 0,
          pct_crecimiento: Number(g.pct_crecimiento) || 0
        });
      }
    });
    return Array.from(mapa.values()).sort((a, b) => b.importe - a.importe);
  };

  const cargarObjetivo = useCallback(async () => {
    if (!idUsuario || !idDistribuidor) {
      setFilasFacturacion([]);
      setFilasAp([]);
      setExisteGuardado(false);
      return;
    }
    setCargando(true);
    try {
      const existente = await getPresupuesto(idUsuario, anio, idDistribuidor);
      setFilasFacturacion(combinarConGuardado(baseFacturacion, existente?.objetivos_facturacion_marca));
      setFilasAp(combinarConGuardado(baseAp, existente?.objetivos_ap_marca));
      setExisteGuardado(!!existente);
    } catch (error) {
      console.error('Error cargando el objetivo:', error);
      alert('Error al cargar el objetivo: ' + error.message);
    }
    setCargando(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idUsuario, anio, idDistribuidor, baseFacturacion, baseAp]);

  useEffect(() => { cargarObjetivo(); }, [cargarObjetivo]);

  const handleCambiarPctFacturacion = (idMarca, valor) => {
    setFilasFacturacion(prev => prev.map(f => f.id_marca === idMarca ? { ...f, pct_crecimiento: Number(valor) || 0 } : f));
  };
  const handleCambiarPctAp = (idMarca, valor) => {
    setFilasAp(prev => prev.map(f => f.id_marca === idMarca ? { ...f, pct_crecimiento: Number(valor) || 0 } : f));
  };

  const handleAplicarMasivoFacturacion = () => {
    const pct = Number(pctMasivoFact) || 0;
    setFilasFacturacion(prev => prev.map(f => ({ ...f, pct_crecimiento: pct })));
  };
  const handleAplicarMasivoAp = () => {
    const pct = Number(pctMasivoAp) || 0;
    setFilasAp(prev => prev.map(f => ({ ...f, pct_crecimiento: pct })));
  };

  const handleGuardar = async () => {
    if (!idDistribuidor) { alert('Elige un distribuidor.'); return; }
    setGuardando(true);
    try {
      await guardarPresupuesto(idUsuario, anio, idDistribuidor, {
        facturacion: filasFacturacion.map(f => ({ id_marca: f.id_marca, nombre_marca: f.nombre_marca, pct_crecimiento: Number(f.pct_crecimiento) || 0 })),
        ap: filasAp.map(f => ({ id_marca: f.id_marca, nombre_marca: f.nombre_marca, pct_crecimiento: Number(f.pct_crecimiento) || 0 }))
      }, {
        uid: auth.currentUser?.uid,
        email: auth.currentUser?.email
      });
      setExisteGuardado(true);
      alert('Objetivo guardado correctamente.');
    } catch (error) {
      console.error('Error al guardar el objetivo:', error);
      alert('Error al guardar el objetivo: ' + error.message);
    }
    setGuardando(false);
  };

  const handleBorrar = async () => {
    if (!window.confirm('¿Borrar por completo el objetivo de este distribuidor para este año?')) return;
    setGuardando(true);
    try {
      await deletePresupuesto(idUsuario, anio, idDistribuidor);
      setFilasFacturacion(combinarConGuardado(baseFacturacion, []));
      setFilasAp(combinarConGuardado(baseAp, []));
      setExisteGuardado(false);
      alert('Objetivo borrado.');
    } catch (error) {
      console.error('Error al borrar el objetivo:', error);
      alert('Error al borrar el objetivo: ' + error.message);
    }
    setGuardando(false);
  };

  const totalesFacturacion = filasFacturacion.reduce((acc, f) => {
    const factor = 1 + (Number(f.pct_crecimiento) || 0) / 100;
    acc.cajasAnterior += f.cajas || 0;
    acc.importeAnterior += f.importe || 0;
    acc.cajasObjetivo += Math.round((f.cajas || 0) * factor);
    acc.importeObjetivo += (f.importe || 0) * factor;
    return acc;
  }, { cajasAnterior: 0, importeAnterior: 0, cajasObjetivo: 0, importeObjetivo: 0 });

  const totalesAp = filasAp.reduce((acc, f) => {
    const factor = 1 + (Number(f.pct_crecimiento) || 0) / 100;
    acc.importeAnterior += f.importe || 0;
    acc.importeObjetivo += (f.importe || 0) * factor;
    return acc;
  }, { importeAnterior: 0, importeObjetivo: 0 });

  return (
    <div>
      <div className={filtroContenedor}>
        <label className={etiqueta}>Año:</label>
        <input
          type="number"
          value={anio}
          onChange={(e) => setAnio(Number(e.target.value) || anoActual)}
          className={`${inputClasses} w-24`}
        />
        <label className={etiqueta}>Distribuidor:</label>
        <select
          value={idDistribuidor}
          onChange={(e) => setIdDistribuidor(e.target.value)}
          className={`${inputClasses} min-w-[200px]`}
        >
          {listaDistribuidores.length === 0 ? (
            <option value="">-- No hay distribuidores --</option>
          ) : (
            listaDistribuidores.map(d => (
              <option key={d.id} value={d.id}>{d.nombre_distribuidor}</option>
            ))
          )}
        </select>
        {existeGuardado && (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
            Objetivo ya guardado para este año
          </span>
        )}
      </div>

      {cargando ? (
        <div className="mt-5 text-slate-500 dark:text-slate-400">Cargando objetivo...</div>
      ) : (
        <>
          {/* ---------- FACTURACIÓN POR MARCA ---------- */}
          <div className={`${tarjeta} mt-5`}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Facturación por marca (año anterior: {anio - 1})
              </h4>
              <div className="flex items-center gap-2">
                <label className={etiqueta}>Aplicar % a todas:</label>
                <input
                  type="number"
                  value={pctMasivoFact}
                  onChange={(e) => setPctMasivoFact(e.target.value)}
                  className={`${inputClasses} w-24`}
                  placeholder="%"
                />
                <button type="button" onClick={handleAplicarMasivoFacturacion} className={botonSecundario}>
                  Aplicar
                </button>
              </div>
            </div>

            {filasFacturacion.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No hay datos de Ventas Reales de {anio - 1} para este distribuidor — no hay marcas sobre las que fijar un objetivo por crecimiento.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className={thClasses}>Marca</th>
                      <th className={thClasses}>Cajas {anio - 1}</th>
                      <th className={thClasses}>Importe {anio - 1}</th>
                      <th className={thClasses}>% Crecimiento</th>
                      <th className={thClasses}>Cajas objetivo {anio}</th>
                      <th className={thClasses}>Importe objetivo {anio}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasFacturacion.map(f => {
                      const factor = 1 + (Number(f.pct_crecimiento) || 0) / 100;
                      return (
                        <tr key={f.id_marca}>
                          <td className={`${tdClasses} font-semibold`}>{f.nombre_marca}</td>
                          <td className={tdRightClasses}>{formateadorNumero.format(Math.round(f.cajas))}</td>
                          <td className={tdRightClasses}>{formateadorMoneda.format(f.importe)}</td>
                          <td className={tdClasses}>
                            <input
                              type="number"
                              value={f.pct_crecimiento}
                              onChange={(e) => handleCambiarPctFacturacion(f.id_marca, e.target.value)}
                              className={`${inputClasses} w-24`}
                            />
                          </td>
                          <td className={tdRightClasses}>{formateadorNumero.format(Math.round(f.cajas * factor))}</td>
                          <td className={tdRightClasses}>{formateadorMoneda.format(f.importe * factor)}</td>
                        </tr>
                      );
                    })}
                    <tr className={trTotales}>
                      <td className={tdClasses}>TOTAL</td>
                      <td className={tdRightClasses}>{formateadorNumero.format(Math.round(totalesFacturacion.cajasAnterior))}</td>
                      <td className={tdRightClasses}>{formateadorMoneda.format(totalesFacturacion.importeAnterior)}</td>
                      <td className={tdClasses}></td>
                      <td className={tdRightClasses}>{formateadorNumero.format(totalesFacturacion.cajasObjetivo)}</td>
                      <td className={tdRightClasses}>{formateadorMoneda.format(totalesFacturacion.importeObjetivo)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ---------- A&P GASTADO POR MARCA ---------- */}
          <div className={`${tarjeta} mt-5`}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                A&amp;P Gastado por marca (año anterior: {anio - 1})
              </h4>
              <div className="flex items-center gap-2">
                <label className={etiqueta}>Aplicar % a todas:</label>
                <input
                  type="number"
                  value={pctMasivoAp}
                  onChange={(e) => setPctMasivoAp(e.target.value)}
                  className={`${inputClasses} w-24`}
                  placeholder="%"
                />
                <button type="button" onClick={handleAplicarMasivoAp} className={botonSecundario}>
                  Aplicar
                </button>
              </div>
            </div>

            {filasAp.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No hay datos de A&amp;P Gastado (Sell-Out) de {anio - 1} para este distribuidor — no hay marcas sobre las que fijar un objetivo por crecimiento.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className={thClasses}>Marca</th>
                      <th className={thClasses}>A&amp;P Gastado {anio - 1}</th>
                      <th className={thClasses}>% Crecimiento</th>
                      <th className={thClasses}>A&amp;P Gastado objetivo {anio}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasAp.map(f => {
                      const factor = 1 + (Number(f.pct_crecimiento) || 0) / 100;
                      return (
                        <tr key={f.id_marca}>
                          <td className={`${tdClasses} font-semibold`}>{f.nombre_marca}</td>
                          <td className={tdRightClasses}>{formateadorMoneda.format(f.importe)}</td>
                          <td className={tdClasses}>
                            <input
                              type="number"
                              value={f.pct_crecimiento}
                              onChange={(e) => handleCambiarPctAp(f.id_marca, e.target.value)}
                              className={`${inputClasses} w-24`}
                            />
                          </td>
                          <td className={tdRightClasses}>{formateadorMoneda.format(f.importe * factor)}</td>
                        </tr>
                      );
                    })}
                    <tr className={trTotales}>
                      <td className={tdClasses}>TOTAL</td>
                      <td className={tdRightClasses}>{formateadorMoneda.format(totalesAp.importeAnterior)}</td>
                      <td className={tdClasses}></td>
                      <td className={tdRightClasses}>{formateadorMoneda.format(totalesAp.importeObjetivo)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex gap-2 justify-end mt-4">
            {existeGuardado && (
              <button type="button" onClick={handleBorrar} disabled={guardando} className={botonPeligro}>
                Borrar objetivo
              </button>
            )}
            <button type="button" onClick={handleGuardar} disabled={guardando || !idDistribuidor} className={botonExito}>
              {guardando ? 'Guardando...' : 'Guardar objetivo'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ==========================================================================
// PESTAÑA "FORECAST"
// ==========================================================================
function PestañaForecast({ idUsuario, listaDistribuidores, anoActual, ventasReales, historicoSellOut }) {
  const [anio, setAnio] = useState(anoActual);
  const [idDistribuidor, setIdDistribuidor] = useState(''); // '' = Todos sus distribuidores
  const [cargando, setCargando] = useState(true);
  const [presupuestos, setPresupuestos] = useState([]);

  const cargar = useCallback(async () => {
    if (!idUsuario) { setPresupuestos([]); setCargando(false); return; }
    setCargando(true);
    try {
      const presu = await getPresupuestosPorAnio(idUsuario, anio);
      setPresupuestos(presu);
    } catch (error) {
      console.error('Error cargando el forecast:', error);
      alert('Error al cargar el forecast: ' + error.message);
    }
    setCargando(false);
  }, [idUsuario, anio]);

  useEffect(() => { cargar(); }, [cargar]);

  // Objetivo por marca (año anterior de CADA distribuidor implicado × su
  // % de crecimiento guardado), agregado según el filtro de distribuidor
  // ('' = suma de todos los distribuidores con objetivo guardado).
  const objetivoPorMarca = useMemo(() => {
    const fact = new Map(); // id_marca -> {nombre_marca, cajas, importe}
    const ap = new Map();

    presupuestos
      .filter(p => !idDistribuidor || p.id_distribuidor === idDistribuidor)
      .forEach(p => {
        const baseFact = agregarFacturacionPorMarca(ventasReales, anio - 1, p.id_distribuidor);
        const baseAp = agregarApPorMarca(historicoSellOut, anio - 1, p.id_distribuidor);

        (p.objetivos_facturacion_marca || []).forEach(g => {
          const base = baseFact.get(g.id_marca) || { cajas: 0, importe: 0 };
          const factor = 1 + (Number(g.pct_crecimiento) || 0) / 100;
          const acc = fact.get(g.id_marca) || { id_marca: g.id_marca, nombre_marca: g.nombre_marca || 'N/A', cajas: 0, importe: 0 };
          acc.cajas += base.cajas * factor;
          acc.importe += base.importe * factor;
          fact.set(g.id_marca, acc);
        });

        (p.objetivos_ap_marca || []).forEach(g => {
          const base = baseAp.get(g.id_marca) || { importe: 0 };
          const factor = 1 + (Number(g.pct_crecimiento) || 0) / 100;
          const acc = ap.get(g.id_marca) || { id_marca: g.id_marca, nombre_marca: g.nombre_marca || 'N/A', importe: 0 };
          acc.importe += base.importe * factor;
          ap.set(g.id_marca, acc);
        });
      });

    return { fact, ap };
  }, [presupuestos, ventasReales, historicoSellOut, anio, idDistribuidor]);

  // Real del año elegido, por marca (filtrado por distribuidor si aplica).
  const realPorMarca = useMemo(() => ({
    fact: agregarFacturacionPorMarca(ventasReales, anio, idDistribuidor),
    ap: agregarApPorMarca(historicoSellOut, anio, idDistribuidor)
  }), [ventasReales, historicoSellOut, anio, idDistribuidor]);

  const mesesTranscurridos = useMemo(
    () => calcularMesesTranscurridos(ventasReales, historicoSellOut, anio, idDistribuidor, anoActual),
    [ventasReales, historicoSellOut, anio, idDistribuidor, anoActual]
  );

  // Filas combinadas (unión objetivo ∪ real) para tabla y gráfico, una por
  // marca, para Facturación y para A&P.
  const filasFacturacion = useMemo(() => {
    const claves = new Set([...objetivoPorMarca.fact.keys(), ...realPorMarca.fact.keys()]);
    return Array.from(claves).map(idMarca => {
      const obj = objetivoPorMarca.fact.get(idMarca) || { nombre_marca: realPorMarca.fact.get(idMarca)?.nombre_marca || 'N/A', cajas: 0, importe: 0 };
      const real = realPorMarca.fact.get(idMarca) || { cajas: 0, importe: 0 };
      return {
        id_marca: idMarca,
        nombre_marca: obj.nombre_marca || real.nombre_marca || 'N/A',
        objetivoCajas: obj.cajas || 0,
        objetivoImporte: obj.importe || 0,
        realCajas: real.cajas || 0,
        realImporte: real.importe || 0
      };
    }).sort((a, b) => b.objetivoImporte - a.objetivoImporte);
  }, [objetivoPorMarca, realPorMarca]);

  const filasAp = useMemo(() => {
    const claves = new Set([...objetivoPorMarca.ap.keys(), ...realPorMarca.ap.keys()]);
    return Array.from(claves).map(idMarca => {
      const obj = objetivoPorMarca.ap.get(idMarca) || { nombre_marca: realPorMarca.ap.get(idMarca)?.nombre_marca || 'N/A', importe: 0 };
      const real = realPorMarca.ap.get(idMarca) || { importe: 0 };
      return {
        id_marca: idMarca,
        nombre_marca: obj.nombre_marca || real.nombre_marca || 'N/A',
        objetivoImporte: obj.importe || 0,
        realImporte: real.importe || 0
      };
    }).sort((a, b) => b.objetivoImporte - a.objetivoImporte);
  }, [objetivoPorMarca, realPorMarca]);

  // KPIs: objetivo anual total (suma de todas las marcas), objetivo
  // acumulado hasta mesesTranscurridos (prorrateando el objetivo anual por
  // meses/12, ya que ahora no hay desglose mensual guardado), real
  // acumulado, % cumplido y proyección de cierre de año.
  const kpis = useMemo(() => {
    const objetivoAnualFact = filasFacturacion.reduce((s, f) => s + f.objetivoImporte, 0);
    const objetivoAnualAp = filasAp.reduce((s, f) => s + f.objetivoImporte, 0);
    const realAcumFact = filasFacturacion.reduce((s, f) => s + f.realImporte, 0);
    const realAcumAp = filasAp.reduce((s, f) => s + f.realImporte, 0);

    const objetivoAcumFact = objetivoAnualFact * (mesesTranscurridos / 12);
    const objetivoAcumAp = objetivoAnualAp * (mesesTranscurridos / 12);

    const pctCumplidoFact = objetivoAcumFact > 0 ? (realAcumFact / objetivoAcumFact) * 100 : null;
    const pctCumplidoAp = objetivoAcumAp > 0 ? (realAcumAp / objetivoAcumAp) * 100 : null;

    const proyeccionFact = mesesTranscurridos > 0 ? (realAcumFact / mesesTranscurridos) * 12 : 0;
    const proyeccionAp = mesesTranscurridos > 0 ? (realAcumAp / mesesTranscurridos) * 12 : 0;

    return {
      objetivoAnualFact, objetivoAnualAp,
      realAcumFact, realAcumAp,
      pctCumplidoFact, pctCumplidoAp,
      proyeccionFact, proyeccionAp,
      diferenciaProyeccionFact: proyeccionFact - objetivoAnualFact,
      diferenciaProyeccionAp: proyeccionAp - objetivoAnualAp
    };
  }, [filasFacturacion, filasAp, mesesTranscurridos]);

  const formatearPct = (v) => v === null ? '—' : `${v.toFixed(1)}%`;

  const datosGraficoFacturacion = useMemo(
    () => filasFacturacion.slice(0, MAX_MARCAS_GRAFICO).map(f => ({
      marca: f.nombre_marca,
      objetivo: f.objetivoImporte,
      real: f.realImporte
    })),
    [filasFacturacion]
  );
  const datosGraficoAp = useMemo(
    () => filasAp.slice(0, MAX_MARCAS_GRAFICO).map(f => ({
      marca: f.nombre_marca,
      objetivo: f.objetivoImporte,
      real: f.realImporte
    })),
    [filasAp]
  );

  if (cargando) {
    return <div className="text-slate-500 dark:text-slate-400">Cargando forecast...</div>;
  }

  return (
    <div>
      <div className={filtroContenedor}>
        <label className={etiqueta}>Año:</label>
        <input
          type="number"
          value={anio}
          onChange={(e) => setAnio(Number(e.target.value) || anoActual)}
          className={`${inputClasses} w-24`}
        />
        <label className={etiqueta}>Distribuidor:</label>
        <select value={idDistribuidor} onChange={(e) => setIdDistribuidor(e.target.value)} className={`${inputClasses} min-w-[200px]`}>
          <option value="">-- Todos sus Distribuidores --</option>
          {listaDistribuidores.map(d => (
            <option key={d.id} value={d.id}>{d.nombre_distribuidor}</option>
          ))}
        </select>
      </div>

      {presupuestos.length === 0 ? (
        <div className={`${tarjeta} mt-4`}>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Todavía no hay ningún objetivo guardado para {anio}. Ve a la pestaña "Objetivo Anual" para crear uno.
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
            Comparando contra el real hasta el mes {mesesTranscurridos > 0 ? NOMBRES_MES[mesesTranscurridos - 1] : '—'} (último mes con datos {anio === anoActual ? 'o mes actual' : 'del año'}). El objetivo "acumulado" prorratea el objetivo anual por esos {mesesTranscurridos} mes(es) de 12, y la proyección de cierre extrapola el ritmo medio real observado a los 12 meses completos.
          </p>

          <div className="flex flex-wrap gap-4 mt-4">
            <div className={kpiCard}>
              <p className={kpiTitulo}>% CUMPLIDO FACTURACIÓN (ACUMULADO)</p>
              <p className={`${kpiValor} ${colorPorSigno((kpis.pctCumplidoFact ?? 0) - 100)}`}>{formatearPct(kpis.pctCumplidoFact)}</p>
            </div>
            <div className={kpiCard}>
              <p className={kpiTitulo}>% CUMPLIDO A&amp;P GASTADO (ACUMULADO)</p>
              <p className={`${kpiValor} ${colorPorSigno((kpis.pctCumplidoAp ?? 0) - 100)}`}>{formatearPct(kpis.pctCumplidoAp)}</p>
            </div>
            <div className={kpiCard}>
              <p className={kpiTitulo}>PROYECCIÓN FACTURACIÓN FIN DE AÑO</p>
              <p className={kpiValor}>{formateadorMoneda.format(kpis.proyeccionFact)}</p>
              <p className={`text-xs mt-1 font-semibold ${colorPorSigno(kpis.diferenciaProyeccionFact)}`}>
                {kpis.diferenciaProyeccionFact >= 0 ? '+' : ''}{formateadorMoneda.format(kpis.diferenciaProyeccionFact)} vs objetivo anual
              </p>
            </div>
            <div className={kpiCard}>
              <p className={kpiTitulo}>PROYECCIÓN A&amp;P GASTADO FIN DE AÑO</p>
              <p className={kpiValor}>{formateadorMoneda.format(kpis.proyeccionAp)}</p>
              <p className={`text-xs mt-1 font-semibold ${colorPorSigno(kpis.diferenciaProyeccionAp)}`}>
                {kpis.diferenciaProyeccionAp >= 0 ? '+' : ''}{formateadorMoneda.format(kpis.diferenciaProyeccionAp)} vs objetivo anual
              </p>
            </div>
          </div>

          <div className="grid gap-5 grid-cols-[repeat(auto-fit,minmax(min(440px,100%),1fr))] mt-6">
            <div className={tarjeta}>
              <h4 className="text-center text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                Facturación por marca: Objetivo vs Real {datosGraficoFacturacion.length < filasFacturacion.length ? `(top ${MAX_MARCAS_GRAFICO})` : ''}
              </h4>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={datosGraficoFacturacion} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="marca" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={70} />
                  <YAxis tickFormatter={(v) => formateadorMonedaCorta.format(v)} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => formateadorMoneda.format(value)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="objetivo" fill="#C9A227" name="Objetivo" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="real" fill="#A13D52" name="Real" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className={tarjeta}>
              <h4 className="text-center text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                A&amp;P Gastado por marca: Objetivo vs Real {datosGraficoAp.length < filasAp.length ? `(top ${MAX_MARCAS_GRAFICO})` : ''}
              </h4>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={datosGraficoAp} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="marca" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={70} />
                  <YAxis tickFormatter={(v) => formateadorMonedaCorta.format(v)} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => formateadorMoneda.format(value)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="objetivo" fill="#6366F1" name="Objetivo" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="real" fill="#EF4444" name="Real" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={`${tarjeta} mt-5`}>
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Facturación por marca — detalle</h4>
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className={thClasses}>Marca</th>
                    <th className={thClasses}>Objetivo Cajas</th>
                    <th className={thClasses}>Real Cajas</th>
                    <th className={thClasses}>Objetivo Importe</th>
                    <th className={thClasses}>Real Importe</th>
                    <th className={thClasses}>Diferencia Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {filasFacturacion.map(f => (
                    <tr key={f.id_marca}>
                      <td className={`${tdClasses} font-semibold`}>{f.nombre_marca}</td>
                      <td className={tdRightClasses}>{formateadorNumero.format(Math.round(f.objetivoCajas))}</td>
                      <td className={tdRightClasses}>{formateadorNumero.format(Math.round(f.realCajas))}</td>
                      <td className={tdRightClasses}>{formateadorMoneda.format(f.objetivoImporte)}</td>
                      <td className={tdRightClasses}>{formateadorMoneda.format(f.realImporte)}</td>
                      <td className={`${tdRightClasses} ${colorPorSigno(f.realImporte - f.objetivoImporte)}`}>
                        {formateadorMoneda.format(f.realImporte - f.objetivoImporte)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className={`${tarjeta} mt-5`}>
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">A&amp;P Gastado por marca — detalle</h4>
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className={thClasses}>Marca</th>
                    <th className={thClasses}>Objetivo A&amp;P</th>
                    <th className={thClasses}>Real A&amp;P</th>
                    <th className={thClasses}>Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {filasAp.map(f => (
                    <tr key={f.id_marca}>
                      <td className={`${tdClasses} font-semibold`}>{f.nombre_marca}</td>
                      <td className={tdRightClasses}>{formateadorMoneda.format(f.objetivoImporte)}</td>
                      <td className={tdRightClasses}>{formateadorMoneda.format(f.realImporte)}</td>
                      <td className={`${tdRightClasses} ${colorPorSigno(f.objetivoImporte - f.realImporte)}`}>
                        {formateadorMoneda.format(f.objetivoImporte - f.realImporte)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default PantallaPresupuesto;
