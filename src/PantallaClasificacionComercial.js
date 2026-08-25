/*
 * PantallaClasificacionComercial.js
 * "Estructura Comercial" — el nombre lo define Sergio (26/07/2026): clasificar
 * cada distribuidor según su peso de facturación dentro de la cartera de su
 * comercial, para decidir dónde hace falta más apoyo comercial y cuántas
 * visitas trimestrales necesita cada uno. NO confundir con
 * PantallaEstructuraComercial.js, que pese al nombre del archivo es "Equipo
 * Comercial" (personas/zonas/jerarquía) — ver el aviso de renombrado en su
 * cabecera.
 *
 * Reproduce el Excel real que Sergio compartió ("SD Estructura Comercial
 * 2025.xlsx"): una pestaña "Criterios" (A-E, con su frecuencia mínima de
 * visita) y una tabla por comercial con Distribuidor / Importe / Participación
 * (importe ÷ total de ESA MISMA cartera) / Clasificación / Observaciones /
 * Plan de acción. Dos diferencias deliberadas frente al Excel, decididas con
 * Sergio:
 *  - El Importe ya NO se pega a mano: se calcula solo a partir de
 *    **Ventas Reales** (`importe_euros`, import mensual automático desde
 *    QlikSense) del año elegido arriba. Pasó por DOS fuentes antes de
 *    llegar aquí: primero Histórico Sell-Out (mal, es venta del
 *    distribuidor a SUS clientes) y luego Histórico Sell-In manual (mejor,
 *    pero incompleto — varios distribuidores no tenían ahí sus compras de
 *    2026 aunque sí constaban en Ventas Reales, según demostró Sergio con
 *    capturas del dashboard "Ventas Sell-In (QlikSense)"). Ver
 *    clasificacionComercial.js para el detalle de ambas correcciones.
 *  - Los criterios A-E son editables desde esta pantalla (antes eran fijos
 *    en el Excel) — ver seedCriteriosComercialPorDefecto en
 *    firebaseApi/clasificacionComercial.js para cargar los 5 de partida.
 *
 * El número de visitas trimestrales y el calendario semanal (columna H y el
 * bloque Lunes-Viernes de la pestaña "SD" del Excel) quedan FUERA de esta
 * pantalla a propósito — es el siguiente módulo, "Planificación Comercial".
 *
 * Igual que "Presupuesto y Forecast"/"Equipo Comercial": pantalla de EDICIÓN
 * de datos maestros de una cuenta concreta, bloqueada en modo "Todos los
 * usuarios" (ver App.js).
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Layers, Plus, Trash2, Save, X, Users } from 'lucide-react';
import {
  getDistribuidoresPorUsuario,
  getComercialesPorUsuario,
  saveNuevoComercial,
  getVentasRealesGeneral,
  getCriteriosComercialPorUsuario,
  saveNuevoCriterioComercial,
  seedCriteriosComercialPorDefecto,
  getAsignacionesComercialPorUsuario,
  guardarAsignacionComercial,
  asignarComercialABloque,
  actualizarCriterioComercial,
  deleteDocument
} from './firebaseApi';
import { sumarFacturacionPorDistribuidorYAnio, calcularCarteraComercial, aniosDisponibles, sugerirClasificacionABC } from './clasificacionComercial';
import {
  tarjeta, tituloPantalla, subtitulo, botonPrimario, botonSecundario, botonPeligro,
  inputClasses, etiqueta, thClasses, tdClasses
} from './uiClasses';

export const PANTALLA_CLASIFICACION_COMERCIAL = 'CLASIFICACION_COMERCIAL';

const formateadorMoneda = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const formatearPorcentaje = (v) => `${((v || 0) * 100).toFixed(1)}%`;

const FORM_CRITERIO_VACIO = { codigo: '', nombre: '', descripcion: '', porcentaje_trimestre: '', sin_visita: false };

function PantallaClasificacionComercial({ idUsuario, bloqueadoPorTodos = false }) {
  const [distribuidores, setDistribuidores] = useState([]);
  const [comerciales, setComerciales] = useState([]);
  const [ventasReales, setVentasReales] = useState([]);
  const [criterios, setCriterios] = useState([]);
  const [asignaciones, setAsignaciones] = useState([]);
  const [cargando, setCargando] = useState(true);

  const [anioSeleccionado, setAnioSeleccionado] = useState('');
  const [formCriterio, setFormCriterio] = useState({ ...FORM_CRITERIO_VACIO });
  const [guardandoCriterio, setGuardandoCriterio] = useState(false);
  const [sembrandoCriterios, setSembrandoCriterios] = useState(false);
  const [borrandoId, setBorrandoId] = useState(null);

  // Ediciones locales de cada criterio ya existente: { [id]: { codigo, nombre, descripcion, porcentaje_trimestre, sin_visita } }.
  // Edición IN-PLACE (updateDoc real, ver actualizarCriterioComercial) — a
  // diferencia de la cartera de abajo, aquí SÍ se puede porque las reglas
  // de Firestore lo permiten para este único caso (ver firestore.rules).
  const [edicionesCriterios, setEdicionesCriterios] = useState({});
  const [guardandoCriterioId, setGuardandoCriterioId] = useState(null);

  // Ediciones locales de la cartera: { [id_distribuidor]: { id_comercial, id_criterio, observaciones, plan_de_accion } }.
  // Cada fila se guarda de forma explícita (botón "Guardar"), no en cada
  // pulsación de tecla — mismo criterio que el resto de formularios de la app.
  const [ediciones, setEdiciones] = useState({});
  const [guardandoFila, setGuardandoFila] = useState(null);

  // "Asignar" un distribuidor sin cartera: comercial elegido por fila antes de confirmar.
  const [comercialParaAsignar, setComercialParaAsignar] = useState({});
  const [asignandoId, setAsignandoId] = useState(null);

  // Alta rápida de comercial directamente desde esta pantalla (a petición de
  // Sergio: sin ningún comercial dado de alta todavía, el desplegable
  // "Elegir comercial" de abajo no tiene ninguna opción — antes de esto solo
  // se podía crear un comercial yendo a "Equipo Comercial").
  const [nombreComercialRapido, setNombreComercialRapido] = useState('');
  const [creandoComercialRapido, setCreandoComercialRapido] = useState(false);

  // Asignación en bloque de TODOS los distribuidores sin asignar a un mismo
  // comercial (a petición de Sergio: "los distribuidores que están
  // actualmente todos me pertenecen a mí" — asignarlos uno a uno era muy
  // repetitivo con 15 distribuidores sueltos).
  const [comercialParaBloque, setComercialParaBloque] = useState('');
  const [asignandoBloque, setAsignandoBloque] = useState(false);

  const cargarTodo = useCallback(async () => {
    if (!idUsuario) {
      setDistribuidores([]); setComerciales([]); setVentasReales([]);
      setCriterios([]); setAsignaciones([]);
      setCargando(false);
      return;
    }
    setCargando(true);
    try {
      const [dist, com, ventas, crit, asig] = await Promise.all([
        getDistribuidoresPorUsuario(idUsuario),
        getComercialesPorUsuario(idUsuario),
        getVentasRealesGeneral(idUsuario),
        getCriteriosComercialPorUsuario(idUsuario),
        getAsignacionesComercialPorUsuario(idUsuario),
      ]);
      setDistribuidores(dist.sort((a, b) => (a.nombre_distribuidor || '').localeCompare(b.nombre_distribuidor || '', 'es')));
      setComerciales(com.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es')));
      setVentasReales(ventas);
      setCriterios(crit.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || (a.codigo || '').localeCompare(b.codigo || '')));
      setAsignaciones(asig);
    } catch (error) {
      console.error('Error cargando Estructura Comercial:', error);
      alert('Error al cargar Estructura Comercial: ' + error.message);
    }
    setCargando(false);
  }, [idUsuario]);

  useEffect(() => { cargarTodo(); }, [cargarTodo]);

  // Año de referencia por defecto: el más reciente con datos; si no hay
  // ninguno todavía, el año en curso (para que el selector no quede vacío).
  const anios = useMemo(() => {
    const disponibles = aniosDisponibles(ventasReales);
    return disponibles.length > 0 ? disponibles : [String(new Date().getFullYear())];
  }, [ventasReales]);

  useEffect(() => {
    setAnioSeleccionado((actual) => (actual && anios.includes(actual)) ? actual : anios[0]);
  }, [anios]);

  // Reinicia las ediciones locales de cada fila cuando llegan (o se
  // recargan) las asignaciones guardadas — así el formulario de cada fila
  // siempre arranca sincronizado con lo último guardado.
  useEffect(() => {
    const nuevo = {};
    asignaciones.forEach((a) => {
      nuevo[a.id_distribuidor] = {
        id_comercial: a.id_comercial || '',
        id_criterio: a.id_criterio || '',
        observaciones: a.observaciones || '',
        plan_de_accion: a.plan_de_accion || '',
      };
    });
    setEdiciones(nuevo);
  }, [asignaciones]);

  // Mismo mecanismo que arriba, para los criterios (nombre/descripción/
  // frecuencia editables in-place).
  useEffect(() => {
    const nuevo = {};
    criterios.forEach((c) => {
      nuevo[c.id] = {
        codigo: c.codigo || '',
        nombre: c.nombre || '',
        descripcion: c.descripcion || '',
        porcentaje_trimestre: c.porcentaje_trimestre ?? '',
        sin_visita: !!c.sin_visita,
      };
    });
    setEdicionesCriterios(nuevo);
  }, [criterios]);

  const facturacionPorDistribuidor = useMemo(
    () => sumarFacturacionPorDistribuidorYAnio(ventasReales, anioSeleccionado),
    [ventasReales, anioSeleccionado]
  );

  const carteraCalculada = useMemo(
    () => calcularCarteraComercial(asignaciones, facturacionPorDistribuidor),
    [asignaciones, facturacionPorDistribuidor]
  );

  const mapaDistribuidores = useMemo(() => new Map(distribuidores.map(d => [d.id, d.nombre_distribuidor])), [distribuidores]);
  // Por código (A/B/C...) en vez de por id: es como se busca el criterio que
  // corresponde a una letra sugerida (ver sugerenciasABC más abajo).
  const mapaCriteriosPorCodigo = useMemo(
    () => new Map(criterios.map(c => [String(c.codigo || '').toUpperCase(), c])),
    [criterios]
  );

  // Suma de "% del trimestre" de los criterios que SÍ generan visita — solo
  // orientativo (no bloquea nada): si supera el 100% es una señal de que
  // puede haber más demanda que días disponibles en algún comercial.
  const sumaPorcentajes = useMemo(
    () => criterios.reduce((total, c) => total + (c.sin_visita ? 0 : (Number(c.porcentaje_trimestre) || 0)), 0),
    [criterios]
  );

  // Sugerencia automática A/B/C (método ABC/Pareto, confirmado con Sergio
  // 26/07/2026, ver clasificacionComercial.js) — solo es una sugerencia, no
  // sobrescribe ninguna clasificación ya guardada; D/E nunca se sugieren
  // (dependen de criterio de negocio, no solo de facturación).
  const sugerenciasABC = useMemo(() => sugerirClasificacionABC(carteraCalculada), [carteraCalculada]);

  const porComercial = useMemo(() => {
    const grupos = new Map(); // id_comercial -> filas[]
    carteraCalculada.forEach((fila) => {
      const lista = grupos.get(fila.id_comercial) || [];
      lista.push(fila);
      grupos.set(fila.id_comercial, lista);
    });
    return comerciales
      .map((c) => ({ comercial: c, filas: (grupos.get(c.id) || []).sort((a, b) => b.participacion - a.participacion) }))
      .filter((g) => g.filas.length > 0);
  }, [carteraCalculada, comerciales]);

  const distribuidoresSinAsignar = useMemo(() => {
    const asignadosIds = new Set(asignaciones.map((a) => a.id_distribuidor));
    return distribuidores.filter((d) => !asignadosIds.has(d.id));
  }, [distribuidores, asignaciones]);

  // --- Criterios A-E ---
  const handleCrearCriterio = async (e) => {
    e.preventDefault();
    if (!formCriterio.codigo.trim() || !formCriterio.nombre.trim()) {
      alert('El código y el nombre del criterio no pueden estar vacíos.');
      return;
    }
    setGuardandoCriterio(true);
    try {
      await saveNuevoCriterioComercial({
        id_usuario: idUsuario,
        codigo: formCriterio.codigo.trim().toUpperCase(),
        nombre: formCriterio.nombre.trim(),
        descripcion: formCriterio.descripcion.trim(),
        porcentaje_trimestre: formCriterio.porcentaje_trimestre === '' ? 0 : Number(formCriterio.porcentaje_trimestre),
        sin_visita: !!formCriterio.sin_visita,
        orden: criterios.length,
      });
      setFormCriterio({ ...FORM_CRITERIO_VACIO });
      await cargarTodo();
    } catch (error) {
      console.error('Error creando criterio:', error);
      alert('Error al crear el criterio: ' + error.message);
    }
    setGuardandoCriterio(false);
  };

  const handleSembrarCriterios = async () => {
    setSembrandoCriterios(true);
    try {
      await seedCriteriosComercialPorDefecto(idUsuario);
      await cargarTodo();
    } catch (error) {
      console.error('Error cargando criterios por defecto:', error);
      alert('Error al cargar los criterios por defecto: ' + error.message);
    }
    setSembrandoCriterios(false);
  };

  const handleBorrarCriterio = async (criterio) => {
    const enUso = asignaciones.some((a) => a.id_criterio === criterio.id);
    if (!window.confirm(
      `¿Borrar el criterio "${criterio.codigo} - ${criterio.nombre}"?` +
      (enUso ? ' Hay distribuidores clasificados con este criterio; se quedarán sin clasificación.' : '')
    )) return;
    setBorrandoId(criterio.id);
    try {
      await deleteDocument('criteriosComercial', criterio.id);
      await cargarTodo();
    } catch (error) {
      console.error('Error borrando criterio:', error);
      alert('Error al borrar el criterio: ' + error.message);
    }
    setBorrandoId(null);
  };

  // Edición in-place de un criterio ya existente (codigo/nombre/descripcion/
  // porcentaje_trimestre/sin_visita/orden — ver esSoloCamposEditablesCriterio
  // en firestore.rules). Cambia solo el estado local hasta pulsar "Guardar".
  const handleCambiarEdicionCriterio = (idCriterio, campo, valor) => {
    setEdicionesCriterios((prev) => ({ ...prev, [idCriterio]: { ...prev[idCriterio], [campo]: valor } }));
  };

  const handleGuardarCriterio = async (criterio) => {
    const edicion = edicionesCriterios[criterio.id];
    if (!edicion || !edicion.codigo.trim() || !edicion.nombre.trim()) {
      alert('El código y el nombre del criterio no pueden estar vacíos.');
      return;
    }
    setGuardandoCriterioId(criterio.id);
    try {
      await actualizarCriterioComercial(criterio.id, {
        codigo: edicion.codigo.trim().toUpperCase(),
        nombre: edicion.nombre.trim(),
        descripcion: edicion.descripcion.trim(),
        porcentaje_trimestre: edicion.porcentaje_trimestre === '' ? 0 : Number(edicion.porcentaje_trimestre),
        sin_visita: !!edicion.sin_visita,
      });
      await cargarTodo();
    } catch (error) {
      console.error('Error guardando criterio:', error);
      alert('Error al guardar el criterio: ' + error.message);
    }
    setGuardandoCriterioId(null);
  };

  // --- Cartera (asignaciones) ---
  const handleCambiarEdicion = (idDistribuidor, campo, valor) => {
    setEdiciones((prev) => ({ ...prev, [idDistribuidor]: { ...prev[idDistribuidor], [campo]: valor } }));
  };

  // Aplica la sugerencia A/B/C al selector de esa fila (todavía no guarda —
  // sigue haciendo falta pulsar "Guardar", igual que cualquier otro cambio
  // manual de esa misma fila).
  const handleUsarSugerencia = (idDistribuidor, letra) => {
    const criterio = mapaCriteriosPorCodigo.get(letra);
    if (!criterio) {
      alert(`No tienes ningún criterio con código "${letra}" creado todavía — créalo arriba, en Criterios de clasificación.`);
      return;
    }
    handleCambiarEdicion(idDistribuidor, 'id_criterio', criterio.id);
  };

  const handleGuardarFila = async (idDistribuidor) => {
    setGuardandoFila(idDistribuidor);
    try {
      await guardarAsignacionComercial(idUsuario, idDistribuidor, ediciones[idDistribuidor] || {});
      await cargarTodo();
    } catch (error) {
      console.error('Error guardando la cartera:', error);
      alert('Error al guardar: ' + error.message);
    }
    setGuardandoFila(null);
  };

  const handleQuitarDeCartera = async (fila) => {
    if (!window.confirm(`¿Quitar a "${mapaDistribuidores.get(fila.id_distribuidor) || fila.id_distribuidor}" de esta cartera? Volverá a la lista de "sin asignar".`)) return;
    setBorrandoId(fila.id);
    try {
      await deleteDocument('asignacionesComercial', fila.id);
      await cargarTodo();
    } catch (error) {
      console.error('Error quitando de la cartera:', error);
      alert('Error al quitar de la cartera: ' + error.message);
    }
    setBorrandoId(null);
  };

  const handleAsignarNuevo = async (idDistribuidor) => {
    const idComercial = comercialParaAsignar[idDistribuidor];
    if (!idComercial) { alert('Elige antes un comercial.'); return; }
    setAsignandoId(idDistribuidor);
    try {
      await guardarAsignacionComercial(idUsuario, idDistribuidor, { id_comercial: idComercial, id_criterio: '', observaciones: '', plan_de_accion: '' });
      await cargarTodo();
    } catch (error) {
      console.error('Error asignando distribuidor:', error);
      alert('Error al asignar: ' + error.message);
    }
    setAsignandoId(null);
  };

  // --- Alta rápida de comercial (sin salir de esta pantalla) ---
  const handleCrearComercialRapido = async (e) => {
    e.preventDefault();
    if (!nombreComercialRapido.trim()) { alert('El nombre del comercial no puede estar vacío.'); return; }
    setCreandoComercialRapido(true);
    try {
      const nuevoId = await saveNuevoComercial({
        id_usuario: idUsuario,
        nombre: nombreComercialRapido.trim(),
        email: '',
        telefono: '',
        rol: 'preventista',
        id_zona: '',
        id_supervisor: '',
        activo: true,
      });
      setNombreComercialRapido('');
      // Lo dejamos ya elegido en el selector de asignación en bloque, para
      // no obligar a Sergio a volver a buscarlo en la lista recién creada.
      setComercialParaBloque(nuevoId);
      await cargarTodo();
    } catch (error) {
      console.error('Error creando comercial:', error);
      alert('Error al crear el comercial: ' + error.message);
    }
    setCreandoComercialRapido(false);
  };

  // --- Asignación en bloque ---
  const handleAsignarBloque = async () => {
    if (!comercialParaBloque) { alert('Elige antes un comercial.'); return; }
    if (distribuidoresSinAsignar.length === 0) return;
    if (!window.confirm(`¿Asignar los ${distribuidoresSinAsignar.length} distribuidores sin asignar a este comercial?`)) return;
    setAsignandoBloque(true);
    try {
      await asignarComercialABloque(idUsuario, distribuidoresSinAsignar.map((d) => d.id), comercialParaBloque);
      setComercialParaBloque('');
      await cargarTodo();
    } catch (error) {
      console.error('Error asignando en bloque:', error);
      alert('Error al asignar en bloque: ' + error.message);
    }
    setAsignandoBloque(false);
  };

  if (bloqueadoPorTodos) {
    return (
      <div className={tarjeta}>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          "Estructura Comercial" no está disponible en modo "Todos los usuarios" — la cartera y clasificación son datos maestros de una cuenta concreta. Elige "Mis datos" o un usuario del selector "Viendo como" (barra lateral) para usar esta pantalla.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className={tituloPantalla}>Estructura Comercial</h1>
      <p className={subtitulo}>
        Clasifica cada distribuidor dentro de la cartera de su comercial según su peso de facturación, para decidir dónde hace falta más apoyo. El número de visitas y el calendario trimestral se gestionan en el siguiente módulo, Planificación Comercial.
      </p>

      {cargando ? (
        <div className="text-slate-500 dark:text-slate-400">Cargando datos...</div>
      ) : (
        <>
          <div className={`${tarjeta} mb-5 flex flex-wrap items-center gap-3`}>
            <label className={etiqueta}>Año de facturación de referencia</label>
            <select
              value={anioSeleccionado}
              onChange={(e) => setAnioSeleccionado(e.target.value)}
              className={`${inputClasses} w-32`}
            >
              {anios.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              El importe de cada distribuidor se calcula solo a partir de Ventas Reales (import automático de QlikSense) de este año.
            </span>
          </div>

          <div className={`${tarjeta} mb-5`}>
            <h4 className="text-sm font-medium text-slate-900 dark:text-white mb-1">
              <span className="inline-flex items-center gap-1.5"><Layers size={15} className="text-slate-400" />Criterios de clasificación</span>
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
              Código corto (p.ej. A, B, C...) + nombre + frecuencia mínima de visita orientativa. Son tuyos: edítalos según cambie el criterio comercial.
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              El "% del trimestre" es la parte de los días laborables del trimestre que le corresponde a ese criterio — se reparte entre TODOS los distribuidores que lo tengan, según su peso de facturación (más distribuidores en un mismo criterio no significa más días, solo un reparto más fino).
              {sumaPorcentajes > 0 && (
                <span className={sumaPorcentajes > 100 ? ' text-amber-600 dark:text-amber-400 font-medium' : ''}> Suma actual: {sumaPorcentajes}% del tiempo disponible.</span>
              )}
            </p>

            {criterios.length === 0 && (
              <button type="button" onClick={handleSembrarCriterios} disabled={sembrandoCriterios} className={`${botonSecundario} mb-3`}>
                {sembrandoCriterios ? 'Cargando...' : 'Cargar los 5 criterios de partida (A-E)'}
              </button>
            )}

            {criterios.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 mb-3">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className={thClasses}>Código</th>
                      <th className={thClasses}>Nombre</th>
                      <th className={thClasses}>Frecuencia mínima de visita</th>
                      <th className={thClasses}>% del trimestre</th>
                      <th className={thClasses}>Sin visita física</th>
                      <th className={thClasses}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {criterios.map((c) => {
                      const edicion = edicionesCriterios[c.id] || { codigo: c.codigo || '', nombre: c.nombre || '', descripcion: c.descripcion || '', porcentaje_trimestre: c.porcentaje_trimestre ?? '', sin_visita: !!c.sin_visita };
                      return (
                        <tr key={c.id}>
                          <td className={tdClasses}>
                            <input type="text" value={edicion.codigo} onChange={(e) => handleCambiarEdicionCriterio(c.id, 'codigo', e.target.value)} className={`${inputClasses} w-16 font-semibold`} />
                          </td>
                          <td className={tdClasses}>
                            <input type="text" value={edicion.nombre} onChange={(e) => handleCambiarEdicionCriterio(c.id, 'nombre', e.target.value)} className={`${inputClasses} w-48`} />
                          </td>
                          <td className={tdClasses}>
                            <input type="text" value={edicion.descripcion} onChange={(e) => handleCambiarEdicionCriterio(c.id, 'descripcion', e.target.value)} className={`${inputClasses} w-64`} />
                          </td>
                          <td className={tdClasses}>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={edicion.porcentaje_trimestre}
                              onChange={(e) => handleCambiarEdicionCriterio(c.id, 'porcentaje_trimestre', e.target.value)}
                              placeholder="%"
                              disabled={edicion.sin_visita}
                              className={`${inputClasses} w-20 ${edicion.sin_visita ? 'opacity-50' : ''}`}
                            />
                          </td>
                          <td className={`${tdClasses} text-center`}>
                            <input
                              type="checkbox"
                              checked={edicion.sin_visita}
                              onChange={(e) => handleCambiarEdicionCriterio(c.id, 'sin_visita', e.target.checked)}
                              title="Distribuidores con este criterio nunca entran en el calendario de Planificación Comercial (p.ej. solo atención telefónica/promoción)"
                              className="w-4 h-4 accent-indigo-600"
                            />
                          </td>
                          <td className={tdClasses}>
                            <div className="flex gap-1.5">
                              <button className={botonSecundario} disabled={guardandoCriterioId === c.id} onClick={() => handleGuardarCriterio(c)}>
                                <span className="inline-flex items-center gap-1"><Save size={12} />{guardandoCriterioId === c.id ? 'Guardando...' : 'Guardar'}</span>
                              </button>
                              <button className={botonPeligro} disabled={borrandoId === c.id} onClick={() => handleBorrarCriterio(c)}>
                                <span className="inline-flex items-center gap-1"><Trash2 size={12} />Borrar</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <form onSubmit={handleCrearCriterio} className="flex flex-wrap gap-3 items-end">
              <div>
                <label className={`${etiqueta} block mb-1`}>Código</label>
                <input type="text" value={formCriterio.codigo} onChange={(e) => setFormCriterio(f => ({ ...f, codigo: e.target.value }))} placeholder="p.ej. F" className={`${inputClasses} w-20`} />
              </div>
              <div>
                <label className={`${etiqueta} block mb-1`}>Nombre</label>
                <input type="text" value={formCriterio.nombre} onChange={(e) => setFormCriterio(f => ({ ...f, nombre: e.target.value }))} placeholder="Nombre del criterio" className={`${inputClasses} w-56`} />
              </div>
              <div>
                <label className={`${etiqueta} block mb-1`}>Frecuencia mínima de visita</label>
                <input type="text" value={formCriterio.descripcion} onChange={(e) => setFormCriterio(f => ({ ...f, descripcion: e.target.value }))} placeholder="p.ej. Visita cada 30 días" className={`${inputClasses} w-72`} />
              </div>
              <div>
                <label className={`${etiqueta} block mb-1`}>% del trimestre</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={formCriterio.porcentaje_trimestre}
                  onChange={(e) => setFormCriterio(f => ({ ...f, porcentaje_trimestre: e.target.value }))}
                  placeholder="p.ej. 15"
                  disabled={formCriterio.sin_visita}
                  className={`${inputClasses} w-24 ${formCriterio.sin_visita ? 'opacity-50' : ''}`}
                />
              </div>
              <div className="flex items-center gap-1.5 pb-2">
                <input
                  type="checkbox"
                  id="nuevo-criterio-sin-visita"
                  checked={formCriterio.sin_visita}
                  onChange={(e) => setFormCriterio(f => ({ ...f, sin_visita: e.target.checked }))}
                  className="w-4 h-4 accent-indigo-600"
                />
                <label htmlFor="nuevo-criterio-sin-visita" className={etiqueta}>Sin visita física (solo teléfono/promoción)</label>
              </div>
              <button type="submit" disabled={guardandoCriterio} className={botonPrimario}>
                <span className="inline-flex items-center gap-1.5"><Plus size={14} />{guardandoCriterio ? 'Guardando...' : 'Añadir criterio'}</span>
              </button>
            </form>
          </div>

          {distribuidoresSinAsignar.length > 0 && (
            <div className={`${tarjeta} mb-5 border-amber-200 dark:border-amber-500/30`}>
              <h4 className="text-sm font-medium text-slate-900 dark:text-white mb-1">Distribuidores sin asignar ({distribuidoresSinAsignar.length})</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                Todavía no tienen comercial asignado — no aparecen en ninguna cartera de abajo hasta que los asignes.
              </p>

              <form onSubmit={handleCrearComercialRapido} className="flex flex-wrap items-end gap-2 mb-3 pb-3 border-b border-slate-200 dark:border-slate-700">
                <div>
                  <label className={`${etiqueta} block mb-1`}>
                    <span className="inline-flex items-center gap-1"><Users size={12} />¿No tienes ningún comercial dado de alta? Créalo aquí</span>
                  </label>
                  <input
                    type="text"
                    value={nombreComercialRapido}
                    onChange={(e) => setNombreComercialRapido(e.target.value)}
                    placeholder="p.ej. tu propio nombre, si de momento la cartera es tuya"
                    className={`${inputClasses} w-72`}
                  />
                </div>
                <button type="submit" disabled={creandoComercialRapido} className={botonSecundario}>
                  <span className="inline-flex items-center gap-1.5"><Plus size={14} />{creandoComercialRapido ? 'Creando...' : 'Crear comercial'}</span>
                </button>
              </form>

              {comerciales.length > 0 && (
                <div className="flex flex-wrap items-end gap-2 mb-3 pb-3 border-b border-slate-200 dark:border-slate-700">
                  <div>
                    <label className={`${etiqueta} block mb-1`}>Asignar TODOS ({distribuidoresSinAsignar.length}) al mismo comercial</label>
                    <select
                      value={comercialParaBloque}
                      onChange={(e) => setComercialParaBloque(e.target.value)}
                      className={`${inputClasses} w-52`}
                    >
                      <option value="">-- Elegir comercial --</option>
                      {comerciales.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </div>
                  <button type="button" disabled={asignandoBloque} onClick={handleAsignarBloque} className={botonPrimario}>
                    {asignandoBloque ? 'Asignando...' : `Asignar todos (${distribuidoresSinAsignar.length})`}
                  </button>
                </div>
              )}

              <div className="space-y-2">
                {distribuidoresSinAsignar.map((d) => (
                  <div key={d.id} className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-100 min-w-[200px]">{d.nombre_distribuidor}</span>
                    <select
                      value={comercialParaAsignar[d.id] || ''}
                      onChange={(e) => setComercialParaAsignar((prev) => ({ ...prev, [d.id]: e.target.value }))}
                      className={`${inputClasses} w-52`}
                    >
                      <option value="">-- Elegir comercial --</option>
                      {comerciales.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                    <button
                      type="button"
                      disabled={asignandoId === d.id}
                      onClick={() => handleAsignarNuevo(d.id)}
                      className={botonPrimario}
                    >
                      {asignandoId === d.id ? 'Asignando...' : 'Asignar'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {comerciales.length === 0 ? (
            <div className={tarjeta}>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Todavía no hay comerciales dados de alta — créalos primero en "Equipo Comercial" para poder repartirles cartera aquí.
              </p>
            </div>
          ) : porComercial.length === 0 ? (
            <div className={tarjeta}>
              <p className="text-sm text-slate-500 dark:text-slate-400">Ningún distribuidor tiene todavía cartera asignada.</p>
            </div>
          ) : (
            porComercial.map(({ comercial, filas }) => (
              <div key={comercial.id} className={`${tarjeta} mb-5`}>
                <h4 className="text-sm font-medium text-slate-900 dark:text-white mb-3">
                  Cartera de {comercial.nombre} ({filas.length})
                </h4>
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr>
                        <th className={thClasses}>Distribuidor</th>
                        <th className={thClasses}>Importe ({anioSeleccionado})</th>
                        <th className={thClasses}>Participación</th>
                        <th className={thClasses}>Clasificación</th>
                        <th className={thClasses}>Observaciones</th>
                        <th className={thClasses}>Plan de acción</th>
                        <th className={thClasses}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filas.map((fila) => {
                        const edicion = ediciones[fila.id_distribuidor] || { id_comercial: fila.id_comercial, id_criterio: '', observaciones: '', plan_de_accion: '' };
                        const guardando = guardandoFila === fila.id_distribuidor;
                        return (
                          <tr key={fila.id_distribuidor}>
                            <td className={`${tdClasses} font-semibold whitespace-nowrap`}>{mapaDistribuidores.get(fila.id_distribuidor) || 'Distribuidor desconocido'}</td>
                            <td className={`${tdClasses} text-right tabular-nums whitespace-nowrap`}>{formateadorMoneda.format(fila.importe || 0)}</td>
                            <td className={`${tdClasses} text-right tabular-nums whitespace-nowrap`}>{formatearPorcentaje(fila.participacion)}</td>
                            <td className={tdClasses}>
                              <select
                                value={edicion.id_criterio}
                                onChange={(e) => handleCambiarEdicion(fila.id_distribuidor, 'id_criterio', e.target.value)}
                                className={`${inputClasses} w-32`}
                              >
                                <option value="">Sin clasificar</option>
                                {criterios.map((c) => <option key={c.id} value={c.id}>{c.codigo}</option>)}
                              </select>
                              {(() => {
                                const sugerida = sugerenciasABC.get(fila.id_distribuidor);
                                if (!sugerida) return null;
                                const criterioActual = criterios.find((c) => c.id === edicion.id_criterio);
                                const yaEsLaSugerida = criterioActual && String(criterioActual.codigo || '').toUpperCase() === sugerida;
                                if (yaEsLaSugerida) return null;
                                return (
                                  <button
                                    type="button"
                                    onClick={() => handleUsarSugerencia(fila.id_distribuidor, sugerida)}
                                    title="Sugerencia automática según su peso en la cartera (ABC/Pareto) — puedes cambiarla según tu propio criterio"
                                    className="block mt-1 !bg-transparent !border-0 !p-0 !font-medium text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline"
                                  >
                                    Sugerido: {sugerida}
                                  </button>
                                );
                              })()}
                            </td>
                            <td className={tdClasses}>
                              <input
                                type="text"
                                value={edicion.observaciones}
                                onChange={(e) => handleCambiarEdicion(fila.id_distribuidor, 'observaciones', e.target.value)}
                                className={`${inputClasses} w-40`}
                              />
                            </td>
                            <td className={tdClasses}>
                              <input
                                type="text"
                                value={edicion.plan_de_accion}
                                onChange={(e) => handleCambiarEdicion(fila.id_distribuidor, 'plan_de_accion', e.target.value)}
                                className={`${inputClasses} w-48`}
                              />
                            </td>
                            <td className={`${tdClasses} whitespace-nowrap`}>
                              <div className="flex gap-2">
                                <button
                                  className={botonPrimario}
                                  disabled={guardando}
                                  onClick={() => handleGuardarFila(fila.id_distribuidor)}
                                  title="Guardar cambios de esta fila"
                                >
                                  <span className="inline-flex items-center gap-1"><Save size={12} />{guardando ? '...' : 'Guardar'}</span>
                                </button>
                                <button
                                  className={botonPeligro}
                                  disabled={borrandoId === fila.id}
                                  onClick={() => handleQuitarDeCartera(fila)}
                                  title="Quitar de esta cartera"
                                >
                                  <span className="inline-flex items-center gap-1"><X size={12} />Quitar</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}

export default PantallaClasificacionComercial;
