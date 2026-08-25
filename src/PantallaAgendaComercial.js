/*
 * PantallaAgendaComercial.js
 * "Agenda Comercial" — 4ª pieza del bloque CRM y Comercial, a petición de
 * Sergio (26/07/2026): "una vez confirmado, se deberia exportar a la
 * agenda del proyecto (esto debe ser una nueva pieza del crm de la
 * aplicacion)". Confirmado por AskUserQuestion: la Agenda contiene SOLO
 * visitas ya confirmadas desde Planificación Comercial — no es un
 * calendario general de eventos sueltos.
 *
 * No es una colección aparte: son las mismas `visitasComerciales` con
 * `confirmada == true` (ver firebaseApi/planificacionComercial.js), sin
 * límite de año/trimestre — así una visita movida o cerrada después de
 * confirmada sigue siendo el mismo documento, sin duplicar datos entre dos
 * colecciones. Desde aquí se puede seguir moviendo/cerrando/borrando una
 * visita (mismo CalendarioVisitas.js que usa Planificación Comercial) o
 * "quitarla de la Agenda" (vuelve a quedar solo en Planificación Comercial,
 * sin confirmar) si se confirmó por error.
 *
 * Igual que las otras 3 pantallas de este bloque: datos de una cuenta
 * concreta, bloqueada en modo "Todos los usuarios" (ver App.js).
 *
 * CAMBIO (mismo día, 26/07/2026, a petición de Sergio): "lo que necesito es
 * planificar independientemente de la estructura de planificacion. debo
 * tener el calendario y poder seleccionar el distribuidor y ponerle los
 * dias que yo seleccione" + una tabla al lado con el "% de acierto"
 * respecto al objetivo teórico de cada distribuidor. Dos añadidos, ambos
 * confirmados por AskUserQuestion:
 *  - Alta manual: crea visitas YA confirmadas directamente en la Agenda, sin
 *    pasar por "Generar calendario" de Planificación Comercial — ver
 *    agregarVisitasManualesAgenda en firebaseApi/planificacionComercial.js.
 *    "Cada vez que ponga un día a un distribuidor en la agenda contará como
 *    realizada" (Sergio) — no hace falta ningún paso de confirmación
 *    aparte, nace ya confirmada. El calendario visual sigue mostrando TODO
 *    lo confirmado sin límite de trimestre, como siempre.
 *  - Tabla de "% de planificación": SOLO esta tabla (no el calendario) va
 *    por trimestre concreto (selector año/trimestre, confirmado con
 *    Sergio) — compara, por distribuidor, los días teóricos que le tocan
 *    según su criterio+importe (calcularDiasTeoricosPorDistribuidor, misma
 *    fórmula que usa el generador automático) contra cuántos días se han
 *    metido de verdad en la Agenda ese trimestre.
 *
 * CAMBIO 2 (mismo día, Sergio enseñó capturas de otro CRM — "Wolf CRM" —
 * donde clicas un día del calendario y se abre el formulario ahí mismo, con
 * "demasiada informacion innecesaria" de más pero con la idea de fondo
 * buena): el formulario fijo de "Añadir a la Agenda" se QUITA — ahora se
 * crea una visita haciendo clic en un día del calendario (ver CAMBIO 3 en
 * CalendarioVisitas.js, prop `onCrearVisita`). De paso se añaden "Medio" y
 * "Objetivo" (Sergio: "tambien tiene la opcion de poner el objetivo y el
 * medio de la visita") como catálogos EDITABLES ("opcion editable o de
 * agregar nuevas o borrar") — ver firebaseApi/catalogosAgenda.js.
 *
 * CAMBIO 3 (mismo día, Sergio: "esto se debe meter en Configuración", sobre
 * el gestor plegable de Medio/Objetivo que vivía aquí mismo): el
 * añadir/renombrar/borrar de Medio y Objetivo se MUEVE a la pantalla
 * "Configuración" (ver PantallaConfiguracion.js), junto con "Otras
 * actividades" — un único sitio para gestionar los 3 catálogos de la
 * Agenda. Esta pantalla sigue LEYENDO catalogosAgenda (necesita los nombres
 * para ofrecerlos en los desplegables de CalendarioVisitas), solo se quitó
 * la UI de edición.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { CalendarCheck, ListChecks } from 'lucide-react';
import {
  getDistribuidoresPorUsuario,
  getComercialesPorUsuario,
  getCriteriosComercialPorUsuario,
  getAsignacionesComercialPorUsuario,
  getVentasRealesGeneral,
  getVisitasConfirmadasPorUsuario,
  getCatalogosAgendaPorUsuario,
  getActividadesAgenda,
  cerrarVisita,
  moverVisita,
  moverBloqueVisitas,
  agregarVisitasManualesAgenda,
  confirmarVisita,
  deleteDocument
} from './firebaseApi';
import { sumarFacturacionPorDistribuidorYAnio, calcularCarteraComercial } from './clasificacionComercial';
import {
  obtenerRangoTrimestreNatural,
  diasHabilesEntre,
  calcularDiasTeoricosPorDistribuidor,
  generarDiasHabilesConsecutivosDesde,
} from './planificacionComercial';
import CalendarioVisitas from './CalendarioVisitas';
import {
  tarjeta, tituloPantalla, subtitulo, inputClasses, etiqueta,
} from './uiClasses';
import TablaOrdenable from './TablaOrdenable';

export const PANTALLA_AGENDA_COMERCIAL = 'AGENDA_COMERCIAL';

const TRIMESTRES = [
  { valor: 1, etiqueta: 'T1 (ene-mar)' },
  { valor: 2, etiqueta: 'T2 (abr-jun)' },
  { valor: 3, etiqueta: 'T3 (jul-sep)' },
  { valor: 4, etiqueta: 'T4 (oct-dic)' },
];

const trimestreDeHoy = () => Math.floor(new Date().getMonth() / 3) + 1;

// Color del % de planificación: rojo por debajo del 50%, ámbar entre 50 y
// 99%, verde a partir de 100% (objetivo cumplido o superado) — mismo
// espíritu que colorPorSigno (uiClasses.js) pero para un porcentaje de
// cumplimiento, no un signo financiero.
const colorPorPorcentaje = (pct) => {
  if (pct === null) return 'text-slate-400 dark:text-slate-500';
  if (pct >= 100) return 'text-emerald-600 dark:text-emerald-400';
  if (pct >= 50) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
};

function PantallaAgendaComercial({ idUsuario, bloqueadoPorTodos = false }) {
  const [distribuidores, setDistribuidores] = useState([]);
  const [comerciales, setComerciales] = useState([]);
  const [criterios, setCriterios] = useState([]);
  const [asignaciones, setAsignaciones] = useState([]);
  const [ventasReales, setVentasReales] = useState([]);
  const [catalogos, setCatalogos] = useState([]);
  const [actividadesCatalogo, setActividadesCatalogo] = useState([]);
  const [visitas, setVisitas] = useState([]);
  const [cargando, setCargando] = useState(true);

  // Solo para la tabla de "% de planificación" — el calendario sigue
  // mostrando todo lo confirmado sin límite de trimestre (ver cabecera).
  const [anioSeleccionado, setAnioSeleccionado] = useState(new Date().getFullYear());
  const [trimestreSeleccionado, setTrimestreSeleccionado] = useState(trimestreDeHoy());

  const cargarTodo = useCallback(async () => {
    if (!idUsuario) {
      setDistribuidores([]); setComerciales([]); setCriterios([]); setAsignaciones([]); setVentasReales([]); setCatalogos([]); setActividadesCatalogo([]); setVisitas([]);
      setCargando(false);
      return;
    }
    setCargando(true);
    try {
      const [dist, com, crit, asig, ventas, cat, actividades, vis] = await Promise.all([
        getDistribuidoresPorUsuario(idUsuario),
        getComercialesPorUsuario(idUsuario),
        getCriteriosComercialPorUsuario(idUsuario),
        getAsignacionesComercialPorUsuario(idUsuario),
        getVentasRealesGeneral(idUsuario),
        getCatalogosAgendaPorUsuario(idUsuario),
        getActividadesAgenda(),
        getVisitasConfirmadasPorUsuario(idUsuario),
      ]);
      setDistribuidores(dist);
      setComerciales(com.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es')));
      setCriterios(crit);
      setAsignaciones(asig);
      setVentasReales(ventas);
      setCatalogos(cat);
      setActividadesCatalogo(actividades.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)));
      setVisitas(vis.sort((a, b) => (a.fecha_prevista || '').localeCompare(b.fecha_prevista || '')));
    } catch (error) {
      console.error('Error cargando la Agenda Comercial:', error);
      alert('Error al cargar la Agenda: ' + error.message);
    }
    setCargando(false);
  }, [idUsuario]);

  useEffect(() => { cargarTodo(); }, [cargarTodo]);

  const mapaDistribuidores = useMemo(() => new Map(distribuidores.map((d) => [d.id, d.nombre_distribuidor])), [distribuidores]);
  const mapaComerciales = useMemo(() => new Map(comerciales.map((c) => [c.id, c.nombre])), [comerciales]);
  const mapaCriterios = useMemo(() => new Map(criterios.map((c) => [c.id, c])), [criterios]);

  // Facturación real (Ventas Reales) del año seleccionado, para repartir el
  // objetivo de cada criterio entre sus distribuidores por peso de
  // facturación — misma fuente y misma fórmula que Estructura Comercial y
  // Planificación Comercial (calcularCarteraComercial).
  const facturacionPorDistribuidor = useMemo(
    () => sumarFacturacionPorDistribuidorYAnio(ventasReales, anioSeleccionado),
    [ventasReales, anioSeleccionado]
  );
  const asignacionesConImporte = useMemo(
    () => calcularCarteraComercial(asignaciones, facturacionPorDistribuidor),
    [asignaciones, facturacionPorDistribuidor]
  );
  const diasHabilesTrimestre = useMemo(() => {
    const { inicio, fin } = obtenerRangoTrimestreNatural(anioSeleccionado, trimestreSeleccionado);
    return diasHabilesEntre(inicio, fin);
  }, [anioSeleccionado, trimestreSeleccionado]);

  // Solo para la tabla: visitas confirmadas cuyo año/trimestre coincide con
  // el selector de arriba (el calendario visual no usa este filtro).
  const visitasDelTrimestre = useMemo(
    () => visitas.filter((v) => Number(v.anio) === Number(anioSeleccionado) && Number(v.trimestre) === Number(trimestreSeleccionado)),
    [visitas, anioSeleccionado, trimestreSeleccionado]
  );

  // "Otra actividad" (Trabajo administrativo, Vacaciones...) no tiene
  // distribuidor — Sergio pidió que estos días RESTEN del reparto de días
  // compartido entre distribuidores ("restarían del porcentaje del reparto
  // de días con cada distribuidor"): un día de vacaciones ya no está
  // disponible para visitar a nadie, así que se descuenta del total de días
  // laborables ANTES de repartirlo entre criterios/distribuidores — el mismo
  // total ya se usaba, sin distinguir comercial, en calcularDiasTeoricosPorDistribuidor.
  const diasConsumidosPorActividades = useMemo(
    () => visitasDelTrimestre.filter((v) => !v.id_distribuidor && v.actividad).length,
    [visitasDelTrimestre]
  );
  const diasHabilesDisponibles = useMemo(
    () => Math.max(0, diasHabilesTrimestre.length - diasConsumidosPorActividades),
    [diasHabilesTrimestre, diasConsumidosPorActividades]
  );
  const mapaDiasTeoricos = useMemo(
    () => calcularDiasTeoricosPorDistribuidor(asignacionesConImporte, mapaCriterios, diasHabilesDisponibles),
    [asignacionesConImporte, mapaCriterios, diasHabilesDisponibles]
  );

  // Una fila por cada distribuidor que tenga objetivo teórico O al menos
  // una visita añadida este trimestre (para no ocultar en silencio a quien
  // ya tiene días metidos aunque no tenga criterio, mismo principio de
  // transparencia que el resto de la app). Ordenada por % ascendente
  // (quien va peor de cumplimiento, primero) y los "sin objetivo" al final.
  const filasPlanificacion = useMemo(() => {
    // Las visitas "de actividad" (sin id_distribuidor) ya restaron del
    // reparto compartido arriba (diasHabilesDisponibles) — aquí se excluyen
    // para no aparecer como una fila de "distribuidor" con id vacío.
    const visitasDeDistribuidor = visitasDelTrimestre.filter((v) => v.id_distribuidor);
    const idsConDatos = new Set([...mapaDiasTeoricos.keys(), ...visitasDeDistribuidor.map((v) => v.id_distribuidor)]);
    return [...idsConDatos].map((idDistribuidor) => {
      const teorico = mapaDiasTeoricos.get(idDistribuidor) || 0;
      const anadidas = visitasDeDistribuidor.filter((v) => v.id_distribuidor === idDistribuidor).length;
      const restantes = Math.max(0, teorico - anadidas);
      const pct = teorico > 0 ? Math.round((anadidas / teorico) * 100) : null;
      const asignacion = asignacionesConImporte.find((a) => a.id_distribuidor === idDistribuidor);
      const criterio = asignacion ? mapaCriterios.get(asignacion.id_criterio) : null;
      return {
        idDistribuidor,
        nombre: mapaDistribuidores.get(idDistribuidor) || idDistribuidor,
        criterioCodigo: criterio ? criterio.codigo : null,
        teorico,
        anadidas,
        restantes,
        pct,
      };
    }).sort((a, b) => {
      if (a.pct === null && b.pct === null) return a.nombre.localeCompare(b.nombre, 'es');
      if (a.pct === null) return 1;
      if (b.pct === null) return -1;
      return a.pct - b.pct;
    });
  }, [mapaDiasTeoricos, visitasDelTrimestre, asignacionesConImporte, mapaCriterios, mapaDistribuidores]);

  // Distribuidores que se pueden elegir al crear una visita: cualquiera con
  // un comercial asignado (hace falta id_comercial para crear la visita),
  // tenga o no ya un criterio de clasificación.
  const distribuidoresParaCrear = useMemo(
    () => asignaciones
      .filter((a) => a.id_comercial)
      .map((a) => ({
        id: a.id_distribuidor,
        nombre: mapaDistribuidores.get(a.id_distribuidor) || a.id_distribuidor,
        idComercial: a.id_comercial,
        idCriterio: a.id_criterio || '',
      }))
      .sort((x, y) => x.nombre.localeCompare(y.nombre, 'es')),
    [asignaciones, mapaDistribuidores]
  );

  const mediosCatalogo = useMemo(
    () => catalogos.filter((c) => c.tipo === 'medio').sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)),
    [catalogos]
  );
  const objetivosCatalogo = useMemo(
    () => catalogos.filter((c) => c.tipo === 'objetivo').sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)),
    [catalogos]
  );
  const mediosNombres = useMemo(() => mediosCatalogo.map((c) => c.nombre), [mediosCatalogo]);
  const objetivosNombres = useMemo(() => objetivosCatalogo.map((c) => c.nombre), [objetivosCatalogo]);
  // Catálogo GLOBAL de "otras actividades" (ver firebaseApi/actividadesAgenda.js)
  // — solo un manager puede añadir/renombrar/borrar opciones, desde la
  // pantalla de Configuración; aquí solo se leen los nombres para ofrecerlos
  // en el panel de "nueva visita".
  const actividadesNombres = useMemo(() => actividadesCatalogo.map((a) => a.nombre), [actividadesCatalogo]);

  // "Otra actividad" se edita en Configuración, una pantalla DISTINTA que
  // React mantiene montada en paralelo (ver CAMBIO 5 en CalendarioVisitas.js)
  // — sin esto, si Configuración ya se abrió/editó mientras Agenda Comercial
  // seguía montada, la lista quedaba obsoleta hasta recargar toda la
  // página. Se llama justo al abrir el panel de "nueva visita" (clic en un
  // día), no en cada render.
  const handleAbrirPanelCrear = useCallback(async () => {
    try {
      const actividades = await getActividadesAgenda();
      setActividadesCatalogo(actividades.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)));
    } catch (error) {
      console.error('Error refrescando el catálogo de actividades:', error);
    }
  }, []);

  // Se pasa a CalendarioVisitas como `onCrearVisita` — se llama al pulsar
  // "Crear visita" en el panel que se abre al hacer clic en un día del
  // calendario (ver CAMBIO 3 en CalendarioVisitas.js). Lanza un error si algo
  // no cuadra: el propio componente ya envuelve esta llamada en try/catch y
  // muestra el alert, así que aquí no hace falta duplicarlo.
  // Recibe { idsDistribuidor, actividades, fecha, diasSeguidos, medio,
  // objetivo } desde CalendarioVisitas.js (CAMBIO 4/5, ver ese archivo y
  // firebaseApi/planificacionComercial.js): 0-N distribuidores Y 0-N "otras
  // actividades" a la vez, compatibles entre sí ("todo es compatible, puede
  // ver a dos o tres distribuidores en un día", Sergio). Cada distribuidor
  // se traduce en una `entrada` con su comercial/criterio; cada actividad en
  // una `entrada` sin distribuidor/comercial, con `actividad` en su lugar.
  const handleCrearVisita = async (datos) => {
    const idsDistribuidor = datos.idsDistribuidor || [];
    const actividadesElegidas = datos.actividades || [];
    const entradas = [];

    for (const idDistribuidor of idsDistribuidor) {
      const opcion = distribuidoresParaCrear.find((o) => o.id === idDistribuidor);
      if (!opcion) {
        throw new Error('Uno de los distribuidores elegidos no tiene un comercial asignado — revísalo en Estructura Comercial.');
      }
      entradas.push({ id_comercial: opcion.idComercial, id_distribuidor: opcion.id, id_criterio: opcion.idCriterio });
    }
    actividadesElegidas.forEach((actividad) => entradas.push({ actividad }));

    const dias = generarDiasHabilesConsecutivosDesde(datos.fecha, datos.diasSeguidos || 1);

    // Aviso de colisión (mismo comercial, mismo día) solo tiene sentido para
    // las entradas con distribuidor — una "otra actividad" no tiene comercial
    // con quien colisionar en ese sentido.
    const comercialesImplicados = [...new Set(entradas.filter((e) => e.id_comercial).map((e) => e.id_comercial))];
    for (const idComercial of comercialesImplicados) {
      const colisiona = dias.some((fecha) => {
        const fechaTexto = fecha.toISOString().slice(0, 10);
        return visitas.some((v) => v.id_comercial === idComercial && v.fecha_prevista === fechaTexto);
      });
      if (colisiona) {
        const nombreComercial = mapaComerciales.get(idComercial) || 'Ese comercial';
        const seguir = window.confirm(`${nombreComercial} ya tiene alguna visita programada en esos días. ¿Añadir de todas formas?`);
        if (!seguir) return;
      }
    }

    await agregarVisitasManualesAgenda(idUsuario, entradas, dias, { medio: datos.medio, objetivo: datos.objetivo });
    await cargarTodo();
  };

  const handleGuardarCierre = async (visita, datosCierre) => {
    await cerrarVisita(idUsuario, visita, datosCierre);
    await cargarTodo();
  };

  const handleMoverVisita = async (visita, nuevaFecha) => {
    await moverVisita(idUsuario, visita, nuevaFecha);
    await cargarTodo();
  };

  const handleMoverBloque = async (visitasDelBloque, deltaDias) => {
    await moverBloqueVisitas(idUsuario, visitasDelBloque, deltaDias);
    await cargarTodo();
  };

  const handleBorrarVisita = async (visita) => {
    await deleteDocument('visitasComerciales', visita.id);
    await cargarTodo();
  };

  const handleQuitarConfirmacion = async (visita) => {
    await confirmarVisita(idUsuario, visita, false);
    await cargarTodo();
  };

  if (bloqueadoPorTodos) {
    return (
      <div className={tarjeta}>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          "Agenda Comercial" no está disponible en modo "Todos los usuarios" — es de una cuenta concreta. Elige "Mis datos" o un usuario del selector "Viendo como" (barra lateral) para usar esta pantalla.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className={tituloPantalla}>Agenda Comercial</h1>
      <p className={subtitulo}>
        Haz clic en un día del calendario para planificar ahí una visita, independientemente del calendario automático de Planificación Comercial — y compara cuánto llevas metido frente al objetivo teórico de cada distribuidor.
      </p>

      {cargando ? (
        <div className="text-slate-500 dark:text-slate-400">Cargando datos...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
            <div className="xl:col-span-2">
              <h4 className="text-sm font-medium text-slate-900 dark:text-white mb-3">
                <span className="inline-flex items-center gap-1.5"><CalendarCheck size={15} className="text-slate-400" />{visitas.length} visita{visitas.length === 1 ? '' : 's'} confirmada{visitas.length === 1 ? '' : 's'}</span>
              </h4>
              {visitas.length === 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                  Todavía no hay ninguna visita confirmada. Haz clic en un día laborable del calendario para añadir la primera.
                </p>
              )}
              <CalendarioVisitas
                visitas={visitas}
                mapaComerciales={mapaComerciales}
                mapaDistribuidores={mapaDistribuidores}
                mapaCriterios={mapaCriterios}
                onMover={handleMoverVisita}
                onMoverBloque={handleMoverBloque}
                onGuardarCierre={handleGuardarCierre}
                onBorrar={handleBorrarVisita}
                onQuitarConfirmacion={handleQuitarConfirmacion}
                onCrearVisita={handleCrearVisita}
                onAbrirPanelCrear={handleAbrirPanelCrear}
                distribuidoresDisponibles={distribuidoresParaCrear}
                mediosDisponibles={mediosNombres}
                objetivosDisponibles={objetivosNombres}
                actividadesDisponibles={actividadesNombres}
                mostrarQuitarConfirmacion
              />
            </div>

            <div className="xl:col-span-1">
              <div className={`${tarjeta} mb-3 flex flex-wrap items-end gap-3`}>
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
                    className={`${inputClasses} w-full`}
                  >
                    {TRIMESTRES.map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
                  </select>
                </div>
              </div>

              <div className={tarjeta}>
                <h4 className="text-sm font-medium text-slate-900 dark:text-white mb-1">
                  <span className="inline-flex items-center gap-1.5"><ListChecks size={15} className="text-slate-400" />% de planificación</span>
                </h4>
                {diasConsumidosPorActividades > 0 && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                    {diasConsumidosPorActividades} día{diasConsumidosPorActividades === 1 ? '' : 's'} de "otra actividad" (Vacaciones, Trabajo administrativo...) restado{diasConsumidosPorActividades === 1 ? '' : 's'} del reparto — quedan {diasHabilesDisponibles} de {diasHabilesTrimestre.length} días laborables para repartir entre distribuidores.
                  </p>
                )}
                {filasPlanificacion.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Ningún distribuidor con objetivo ni visitas en T{trimestreSeleccionado} {anioSeleccionado}.
                  </p>
                ) : (
                  <TablaOrdenable
                    filas={filasPlanificacion}
                    keyExtractor={fila => fila.idDistribuidor}
                    columnas={[
                      {
                        titulo: 'Distribuidor', valor: fila => fila.nombre, render: fila => (
                          <>
                            {fila.nombre}
                            {fila.criterioCodigo && <span className="ml-1 text-xs text-slate-400">({fila.criterioCodigo})</span>}
                          </>
                        ),
                      },
                      { titulo: 'Teóricos', derecha: true, valor: fila => fila.teorico || 0, render: fila => fila.teorico || (fila.pct === null ? '—' : 0) },
                      { titulo: 'Añadidos', derecha: true, valor: fila => fila.anadidas, render: fila => fila.anadidas },
                      { titulo: 'Restantes', derecha: true, valor: fila => fila.pct === null ? 0 : fila.restantes, render: fila => fila.pct === null ? '—' : fila.restantes },
                      {
                        titulo: '%', derecha: true, valor: fila => fila.pct ?? 0, render: fila => (
                          <span className={`font-semibold ${colorPorPorcentaje(fila.pct)}`}>{fila.pct === null ? '—' : `${fila.pct}%`}</span>
                        ),
                      },
                    ]}
                  />
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default PantallaAgendaComercial;
