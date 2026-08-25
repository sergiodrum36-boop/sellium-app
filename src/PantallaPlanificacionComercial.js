/*
 * PantallaPlanificacionComercial.js
 * "Planificación Comercial" — el módulo que Sergio pidió justo después de
 * terminar la Estructura Comercial (26/07/2026): "una vez asignado comercial
 * y criterio de cada distribuidor, debería tener una opción de crear
 * calendario de visitas según criterio". Ver planificacionComercial.js para
 * el algoritmo (lógica pura, con tests) y firebaseApi/planificacionComercial.js
 * para el guardado (colección "visitasComerciales").
 *
 * Decisiones confirmadas con Sergio (AskUserQuestion, mismo día):
 *  - Trimestre SIEMPRE natural (Q1 ene-mar... Q4 oct-dic), no un trimestre
 *    "móvil" desde hoy.
 *  - Los días de cada distribuidor se agrupan en BLOQUES de días laborables
 *    consecutivos (máximo 5, una semana laboral completa) en vez de días
 *    sueltos — ver el cambio de modelo en planificacionComercial.js. El
 *    calendario (CalendarioVisitas.js) permite resaltar y mover un bloque
 *    entero de una semana a otra arrastrando cualquiera de sus días.
 *  - Al cerrar una visita se registran 3 cosas: fecha real de la visita,
 *    hecha/pendiente y una nota breve de resultado.
 *  - Solo se planifican los distribuidores que YA tienen un criterio (A-E)
 *    asignado en Estructura Comercial — el resto se muestra como aviso, no
 *    se descarta en silencio.
 *
 * "Generar calendario" sustituye las visitas todavía PENDIENTES de ese
 * año/trimestre por una propuesta nueva; las que ya están marcadas como
 * "hecha" nunca se tocan (ver guardarVisitasGeneradas). Regenerar es
 * intencionadamente repetible: no es una reserva definitiva hasta que se
 * cierra cada visita.
 *
 * Igual que "Estructura Comercial": pantalla de datos de una cuenta
 * concreta, bloqueada en modo "Todos los usuarios" (ver App.js).
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Calendar, RefreshCw, Star } from 'lucide-react';
import {
  getDistribuidoresPorUsuario,
  getComercialesPorUsuario,
  getCriteriosComercialPorUsuario,
  getAsignacionesComercialPorUsuario,
  getVentasRealesGeneral,
  getVisitasComercialPorTrimestre,
  guardarVisitasGeneradas,
  cerrarVisita,
  moverVisita,
  moverBloqueVisitas,
  confirmarVisita,
  confirmarVisitasEnBloque,
  deleteDocument,
  getCatalogosAgendaPorUsuario
} from './firebaseApi';
import { sumarFacturacionPorDistribuidorYAnio, calcularCarteraComercial } from './clasificacionComercial';
import { generarCalendarioVisitas } from './planificacionComercial';
import CalendarioVisitas from './CalendarioVisitas';
import {
  tarjeta, tituloPantalla, subtitulo, botonPrimario, botonSecundario,
  inputClasses, etiqueta
} from './uiClasses';

export const PANTALLA_PLANIFICACION_COMERCIAL = 'PLANIFICACION_COMERCIAL';

const TRIMESTRES = [
  { valor: 1, etiqueta: 'T1 (ene-mar)' },
  { valor: 2, etiqueta: 'T2 (abr-jun)' },
  { valor: 3, etiqueta: 'T3 (jul-sep)' },
  { valor: 4, etiqueta: 'T4 (oct-dic)' },
];

const trimestreDeHoy = () => Math.floor(new Date().getMonth() / 3) + 1;

function PantallaPlanificacionComercial({ idUsuario, bloqueadoPorTodos = false }) {
  const [distribuidores, setDistribuidores] = useState([]);
  const [comerciales, setComerciales] = useState([]);
  const [criterios, setCriterios] = useState([]);
  const [asignaciones, setAsignaciones] = useState([]);
  const [ventasReales, setVentasReales] = useState([]);
  const [visitas, setVisitas] = useState([]);
  const [catalogos, setCatalogos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [cargandoVisitas, setCargandoVisitas] = useState(true);

  const [anioSeleccionado, setAnioSeleccionado] = useState(new Date().getFullYear());
  const [trimestreSeleccionado, setTrimestreSeleccionado] = useState(trimestreDeHoy());
  const [generando, setGenerando] = useState(false);
  const [confirmandoTodas, setConfirmandoTodas] = useState(false);

  const cargarMaestros = useCallback(async () => {
    if (!idUsuario) {
      setDistribuidores([]); setComerciales([]); setCriterios([]); setAsignaciones([]); setVentasReales([]); setCatalogos([]);
      setCargando(false);
      return;
    }
    setCargando(true);
    try {
      const [dist, com, crit, asig, ventas, catAgenda] = await Promise.all([
        getDistribuidoresPorUsuario(idUsuario),
        getComercialesPorUsuario(idUsuario),
        getCriteriosComercialPorUsuario(idUsuario),
        getAsignacionesComercialPorUsuario(idUsuario),
        getVentasRealesGeneral(idUsuario),
        getCatalogosAgendaPorUsuario(idUsuario),
      ]);
      setDistribuidores(dist);
      setComerciales(com.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es')));
      setCriterios(crit);
      setAsignaciones(asig);
      setVentasReales(ventas);
      setCatalogos(catAgenda);
    } catch (error) {
      console.error('Error cargando datos de Planificación Comercial:', error);
      alert('Error al cargar los datos: ' + error.message);
    }
    setCargando(false);
  }, [idUsuario]);

  useEffect(() => { cargarMaestros(); }, [cargarMaestros]);

  const cargarVisitas = useCallback(async () => {
    if (!idUsuario) { setVisitas([]); setCargandoVisitas(false); return; }
    setCargandoVisitas(true);
    try {
      const v = await getVisitasComercialPorTrimestre(idUsuario, anioSeleccionado, trimestreSeleccionado);
      setVisitas(v.sort((a, b) => (a.fecha_prevista || '').localeCompare(b.fecha_prevista || '')));
    } catch (error) {
      console.error('Error cargando el calendario de visitas:', error);
      alert('Error al cargar el calendario: ' + error.message);
    }
    setCargandoVisitas(false);
  }, [idUsuario, anioSeleccionado, trimestreSeleccionado]);

  useEffect(() => { cargarVisitas(); }, [cargarVisitas]);

  const mapaDistribuidores = useMemo(() => new Map(distribuidores.map((d) => [d.id, d.nombre_distribuidor])), [distribuidores]);
  const mapaComerciales = useMemo(() => new Map(comerciales.map((c) => [c.id, c.nombre])), [comerciales]);
  const mapaCriterios = useMemo(() => new Map(criterios.map((c) => [c.id, c])), [criterios]);

  // Catálogos de Medio/Objetivo (ver catalogosAgenda.js) — se cargan aquí
  // solo para poder EDITARLOS al cerrar una visita generada automáticamente
  // (Sergio, 26/07/2026: "en todas las visitas, editables también al
  // cerrarlas"). Esta pantalla no crea visitas al clicar un día (eso es solo
  // en Agenda Comercial), así que no hace falta onCrearVisita ni
  // distribuidoresDisponibles.
  const mediosNombres = useMemo(
    () => catalogos.filter((c) => c.tipo === 'medio').sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)).map((c) => c.nombre),
    [catalogos]
  );
  const objetivosNombres = useMemo(
    () => catalogos.filter((c) => c.tipo === 'objetivo').sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)).map((c) => c.nombre),
    [catalogos]
  );

  // Facturación real (Ventas Reales / QlikSense, ver clasificacionComercial.js
  // — misma fuente que Estructura Comercial) del año seleccionado, para
  // repartir el presupuesto de días de cada criterio entre sus distribuidores
  // según peso de facturación (confirmado con Sergio, 26/07/2026: "según su
  // peso de facturación"). Sin esto, generarCalendarioVisitas siempre caería
  // al reparto a partes iguales (fallback cuando `importe` es 0).
  const facturacionPorDistribuidor = useMemo(
    () => sumarFacturacionPorDistribuidorYAnio(ventasReales, anioSeleccionado),
    [ventasReales, anioSeleccionado]
  );
  const asignacionesConImporte = useMemo(
    () => calcularCarteraComercial(asignaciones, facturacionPorDistribuidor),
    [asignaciones, facturacionPorDistribuidor]
  );

  // Distribuidores con cartera asignada pero SIN criterio (A-E) todavía —
  // no se pueden planificar porque no tienen frecuencia de visita. Se
  // muestran como aviso, no se descartan en silencio (mismo criterio de
  // transparencia que "Distribuidores sin asignar" en Estructura Comercial).
  const sinCriterio = useMemo(
    () => asignaciones.filter((a) => !a.id_criterio),
    [asignaciones]
  );

  // Criterios que SÍ existen y están en uso pero todavía no tienen
  // porcentaje_trimestre rellena (p.ej. criterios creados/sembrados antes de
  // que este campo existiera en la pantalla de Estructura Comercial, o
  // creados sin rellenar esa columna) — el generador los salta porque no
  // sabe qué % del trimestre les corresponde, y SIN este aviso el resultado
  // era "0 visitas" sin ninguna explicación (bug detectado por Sergio,
  // 26/07/2026). Se avisa aquí de forma explícita, igual que con los
  // distribuidores sin criterio. Los criterios marcados "sin_visita" (ver
  // más abajo) quedan fuera de este aviso a propósito: para ellos
  // porcentaje_trimestre es irrelevante, no un dato que falte por rellenar.
  const criteriosSinFrecuencia = useMemo(
    () => criterios.filter((c) => !c.sin_visita && !c.porcentaje_trimestre),
    [criterios]
  );

  // Distribuidores cuyo criterio está marcado "sin visita física" (p.ej.
  // criterio "F" de Sergio: gestión solo por teléfono/promoción directa,
  // 26/07/2026) — NUNCA entran en el calendario, da igual qué tengan en
  // porcentaje_trimestre. A diferencia de los avisos de arriba, esto no es un
  // problema a corregir: es una categoría normal, así que se muestra en un
  // tono neutro, no de aviso (amber).
  const sinVisitaFisica = useMemo(
    () => asignaciones.filter((a) => a.id_criterio && mapaCriterios.get(a.id_criterio)?.sin_visita),
    [asignaciones, mapaCriterios]
  );

  const handleGenerarCalendario = async () => {
    const conCriterio = asignacionesConImporte.filter((a) => a.id_criterio);
    if (conCriterio.length === 0) {
      alert('Todavía no hay ningún distribuidor con criterio (A-E) asignado — ve primero a Estructura Comercial.');
      return;
    }
    if (criteriosSinFrecuencia.length > 0) {
      alert(
        `${criteriosSinFrecuencia.length} criterio(s) no tienen "% del trimestre" configurado (${criteriosSinFrecuencia.map((c) => c.codigo).join(', ')}) — sin eso no se puede calcular cuántos días del trimestre les corresponden. Ve a Estructura Comercial, rellena ese campo en cada uno y pulsa "Guardar", y vuelve aquí a generar el calendario.`
      );
      return;
    }
    if (!window.confirm(
      `¿Generar el calendario de T${trimestreSeleccionado} ${anioSeleccionado}? Se sustituirán las visitas pendientes que ya existan para este trimestre (las que ya estén marcadas como "hecha" no se tocan).`
    )) return;
    setGenerando(true);
    try {
      const propuestas = generarCalendarioVisitas(conCriterio, mapaCriterios, anioSeleccionado, trimestreSeleccionado);
      if (propuestas.length === 0) {
        alert('No se ha generado ninguna visita. Revisa que los distribuidores con criterio asignado tengan un "% del trimestre" válido en Estructura Comercial.');
      }
      await guardarVisitasGeneradas(idUsuario, anioSeleccionado, trimestreSeleccionado, propuestas);
      await cargarVisitas();
    } catch (error) {
      console.error('Error generando el calendario:', error);
      alert('Error al generar el calendario: ' + error.message);
    }
    setGenerando(false);
  };

  // Los 4 callbacks que espera CalendarioVisitas.js (ver ese archivo): cada
  // uno hace la llamada a Firestore y recarga; el componente de calendario
  // no conoce idUsuario ni sabe recargar por sí mismo, así se puede
  // reutilizar tal cual en Agenda Comercial.
  const handleGuardarCierre = async (visita, datosCierre) => {
    await cerrarVisita(idUsuario, visita, datosCierre);
    await cargarVisitas();
  };

  const handleMoverVisita = async (visita, nuevaFecha) => {
    await moverVisita(idUsuario, visita, nuevaFecha);
    await cargarVisitas();
  };

  const handleMoverBloque = async (visitasDelBloque, deltaDias) => {
    await moverBloqueVisitas(idUsuario, visitasDelBloque, deltaDias);
    await cargarVisitas();
  };

  const handleBorrarVisita = async (visita) => {
    await deleteDocument('visitasComerciales', visita.id);
    await cargarVisitas();
  };

  const handleConfirmarVisita = async (visita) => {
    await confirmarVisita(idUsuario, visita, true);
    await cargarVisitas();
  };

  const handleConfirmarTodas = async () => {
    const sinConfirmar = visitas.filter((v) => !v.confirmada);
    if (sinConfirmar.length === 0) return;
    if (!window.confirm(`¿Confirmar las ${sinConfirmar.length} visitas de este trimestre que todavía no están en la Agenda?`)) return;
    setConfirmandoTodas(true);
    try {
      await confirmarVisitasEnBloque(idUsuario, sinConfirmar);
      await cargarVisitas();
    } catch (error) {
      console.error('Error confirmando las visitas:', error);
      alert('Error al confirmar: ' + error.message);
    }
    setConfirmandoTodas(false);
  };

  if (bloqueadoPorTodos) {
    return (
      <div className={tarjeta}>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          "Planificación Comercial" no está disponible en modo "Todos los usuarios" — el calendario de visitas es de una cuenta concreta. Elige "Mis datos" o un usuario del selector "Viendo como" (barra lateral) para usar esta pantalla.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className={tituloPantalla}>Planificación Comercial</h1>
      <p className={subtitulo}>
        Genera el calendario de visitas del trimestre a partir de la clasificación (A-E) de cada distribuidor en Estructura Comercial, y cierra cada visita con su resultado.
      </p>

      {cargando ? (
        <div className="text-slate-500 dark:text-slate-400">Cargando datos...</div>
      ) : (
        <>
          <div className={`${tarjeta} mb-5 flex flex-wrap items-end gap-3`}>
            <div>
              <label className={`${etiqueta} block mb-1`}>Año</label>
              <input
                type="number"
                value={anioSeleccionado}
                onChange={(e) => setAnioSeleccionado(Number(e.target.value) || anioSeleccionado)}
                className={`${inputClasses} w-24`}
              />
            </div>
            <div>
              <label className={`${etiqueta} block mb-1`}>Trimestre</label>
              <select
                value={trimestreSeleccionado}
                onChange={(e) => setTrimestreSeleccionado(Number(e.target.value))}
                className={`${inputClasses} w-40`}
              >
                {TRIMESTRES.map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
              </select>
            </div>
            <button type="button" onClick={handleGenerarCalendario} disabled={generando} className={botonPrimario}>
              <span className="inline-flex items-center gap-1.5"><RefreshCw size={14} />{generando ? 'Generando...' : 'Generar calendario'}</span>
            </button>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Solo días laborables (lunes a viernes). Puedes regenerar cuantas veces quieras: las visitas ya marcadas como "hecha" no se tocan.
            </span>
          </div>

          {criteriosSinFrecuencia.length > 0 && (
            <div className={`${tarjeta} mb-5 border-amber-200 dark:border-amber-500/30`}>
              <h4 className="text-sm font-medium text-slate-900 dark:text-white mb-1">
                {criteriosSinFrecuencia.length} criterio{criteriosSinFrecuencia.length === 1 ? '' : 's'} sin "% del trimestre" configurado
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                Sin ese dato no se puede calcular cuántos días del trimestre le corresponden a este criterio — ve a Estructura Comercial, rellena "% del trimestre" en cada uno y pulsa "Guardar".
              </p>
              <ul className="text-sm text-slate-700 dark:text-slate-300 list-disc pl-5">
                {criteriosSinFrecuencia.map((c) => (
                  <li key={c.id}>{c.codigo} — {c.nombre}</li>
                ))}
              </ul>
            </div>
          )}

          {sinCriterio.length > 0 && (
            <div className={`${tarjeta} mb-5 border-amber-200 dark:border-amber-500/30`}>
              <h4 className="text-sm font-medium text-slate-900 dark:text-white mb-1">
                {sinCriterio.length} distribuidor{sinCriterio.length === 1 ? '' : 'es'} sin criterio asignado (no se planifica{sinCriterio.length === 1 ? '' : 'n'})
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                Asígnales una clasificación A-E en Estructura Comercial para que entren en el calendario.
              </p>
              <ul className="text-sm text-slate-700 dark:text-slate-300 list-disc pl-5">
                {sinCriterio.map((a) => (
                  <li key={a.id}>{mapaDistribuidores.get(a.id_distribuidor) || a.id_distribuidor} ({mapaComerciales.get(a.id_comercial) || 'sin comercial'})</li>
                ))}
              </ul>
            </div>
          )}

          {sinVisitaFisica.length > 0 && (
            <div className={`${tarjeta} mb-5`}>
              <h4 className="text-sm font-medium text-slate-900 dark:text-white mb-1">
                {sinVisitaFisica.length} distribuidor{sinVisitaFisica.length === 1 ? '' : 'es'} gestionado{sinVisitaFisica.length === 1 ? '' : 's'} solo por teléfono/promoción (sin visita física)
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                Su criterio está marcado como "sin visita física" en Estructura Comercial — no entran en este calendario a propósito, no es un problema a corregir.
              </p>
              <ul className="text-sm text-slate-700 dark:text-slate-300 list-disc pl-5">
                {sinVisitaFisica.map((a) => (
                  <li key={a.id}>{mapaDistribuidores.get(a.id_distribuidor) || a.id_distribuidor} ({mapaComerciales.get(a.id_comercial) || 'sin comercial'})</li>
                ))}
              </ul>
            </div>
          )}

          <h4 className="text-sm font-medium text-slate-900 dark:text-white mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5"><Calendar size={15} className="text-slate-400" />Calendario de T{trimestreSeleccionado} {anioSeleccionado} ({visitas.length} visita{visitas.length === 1 ? '' : 's'})</span>
            {visitas.some((v) => !v.confirmada) && (
              <button type="button" onClick={handleConfirmarTodas} disabled={confirmandoTodas} className={botonSecundario}>
                <span className="inline-flex items-center gap-1.5"><Star size={14} />{confirmandoTodas ? 'Confirmando...' : 'Confirmar todas en la Agenda'}</span>
              </button>
            )}
          </h4>

          {cargandoVisitas ? (
            <div className={`${tarjeta} text-slate-500 dark:text-slate-400 text-sm`}>Cargando calendario...</div>
          ) : visitas.length === 0 ? (
            <div className={tarjeta}>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Todavía no hay ningún calendario generado para este trimestre. Pulsa "Generar calendario" arriba.
              </p>
            </div>
          ) : (
            <CalendarioVisitas
              visitas={visitas}
              mapaComerciales={mapaComerciales}
              mapaDistribuidores={mapaDistribuidores}
              mapaCriterios={mapaCriterios}
              onMover={handleMoverVisita}
              onMoverBloque={handleMoverBloque}
              onGuardarCierre={handleGuardarCierre}
              onBorrar={handleBorrarVisita}
              onConfirmar={handleConfirmarVisita}
              mediosDisponibles={mediosNombres}
              objetivosDisponibles={objetivosNombres}
              mostrarConfirmar
            />
          )}
        </>
      )}
    </div>
  );
}

export default PantallaPlanificacionComercial;
