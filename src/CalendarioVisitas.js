/*
 * CalendarioVisitas.js
 * Vista de calendario compartida entre "Planificación Comercial" (visitas
 * propuestas de un trimestre) y "Agenda Comercial" (visitas ya confirmadas,
 * sin límite de trimestre) — a petición de Sergio (26/07/2026): "se supone
 * que tendria que generarse un calendario visual con la estructura en cada
 * dia repartido... despues tendria que haber una opcion para mover, borrar,
 * o editar esos [eventos], y una vez confirmado, se deberia exportar a la
 * agenda del proyecto". Usa FullCalendar (paquetes @fullcalendar/*, versión
 * 6.1.21 fijada en package.json para que todos los subpaquetes compartan la
 * misma versión mayor).
 *
 * Confirmado con Sergio (AskUserQuestion, mismo día):
 *  - El calendario visual SUSTITUYE a la tabla plana anterior (no conviven).
 *  - "Agenda Comercial" contiene solo visitas confirmadas (no un calendario
 *    general de eventos sueltos) — ver PantallaAgendaComercial.js.
 *  - Al arrastrar una visita a otro día: si ese comercial ya tiene otra
 *    visita ese mismo día, se AVISA pero se deja continuar si se confirma.
 *
 * CAMBIO (mismo día, "necesito que cada distribuidor se agrege por semana en
 * dias seguidos y que pueda seleccionarlo todo por si lo tengo que mover de
 * una semana a la otra"): el generador ahora agrupa los días de un mismo
 * distribuidor en BLOQUES de días laborables consecutivos (`id_bloque`, ver
 * planificacionComercial.js). Confirmado con Sergio vía AskUserQuestion:
 * hacer clic en cualquier día del bloque lo resalta ENTERO, y arrastrar
 * cualquiera de sus días mueve TODOS los días del bloque juntos (mismo
 * desplazamiento, siempre en semanas completas — múltiplos de 7 días — para
 * que el bloque no se salga de días laborables al moverse). Un bloque de 1
 * solo día se comporta exactamente como antes (mover un único día suelto).
 *
 * CAMBIO 2 (mismo día, "tiene que dar la opcion de mover por bloques o
 * individualmente, lo ideal seria seleccionar con el raton las casillas que
 * se decidan"): un selector de 3 "modos de mover" encima del calendario
 * (`modoMover`), confirmado con Sergio vía AskUserQuestion:
 *  - "Bloque completo" (por defecto): el comportamiento de arriba, sin
 *    cambios.
 *  - "Día individual": arrastrar un día lo mueve SOLO a él, aunque
 *    pertenezca a un bloque más grande (para sacar un día suelto sin tocar
 *    el resto).
 *  - "Selección por rango": arrastrar sobre las casillas del calendario
 *    (`selectable`/`select` de FullCalendar) AÑADE a la selección todas las
 *    visitas cuya fecha caiga en ese rango (de cualquier distribuidor/
 *    comercial — si un día tiene varias visitas apiladas entran todas,
 *    aceptado con Sergio como límite conocido de esta forma de seleccionar);
 *    varios arrastres sueltos se ACUMULAN entre sí (no hace falta que sea un
 *    único rango continuo — arrastrar dos semanas distintas dos veces las
 *    deja a ambas seleccionadas). Un clic sobre una visita ya marcada la
 *    QUITA de la selección sin tener que rehacer el arrastre (el "escape"
 *    para cuando entró alguna que no tocaba). Un par de botones "semana
 *    anterior/siguiente" mueve TODA la selección de golpe; "Cancelar
 *    selección" la vacía del todo. El clic sobre una visita ya no abre su
 *    detalle en este modo (se reserva para marcar/desmarcar). Arrastrar
 *    empieza sobre el FONDO de un día vacío para seleccionar un rango, o
 *    sobre una visita ya marcada para mover TODA la selección de golpe (pidió
 *    Sergio poder arrastrar la selección con el ratón, no solo los botones)
 *    — arrastrar una visita que no está marcada la mueve solo a ella.
 * En los 3 modos, mover una visita o un grupo reutiliza `onMoverBloque`
 * (firebaseApi/planificacionComercial.js → moverBloqueVisitas), que ya era
 * genérico (mueve cualquier lista de visitas el mismo nº de días) — no hizo
 * falta ninguna función nueva de Firestore para la selección por rango.
 *
 * CAMBIO 3 (mismo día, Sergio enseñó capturas de otro CRM — "Wolf CRM" —
 * donde al hacer clic en un día del calendario se abre un formulario para
 * crear una visita ahí mismo): `dateClick` de FullCalendar abre un panel de
 * "nueva visita" (distribuidor + días seguidos + medio + objetivo) con la
 * fecha ya puesta, en vez de tener un formulario fijo separado del
 * calendario. Solo activo si la pantalla pasa `onCrearVisita` (Agenda
 * Comercial la usa, Planificación Comercial no — ahí las visitas nacen del
 * botón "Generar calendario"). Se desactiva en modo "rango" para no chocar
 * con la selección por arrastre. De paso, "Medio" y "Objetivo" (catálogos
 * editables, ver firebaseApi/catalogosAgenda.js) se pueden fijar/cambiar
 * también desde el panel de cerrar/editar de cualquier visita, generada
 * automáticamente o no — confirmado con Sergio.
 *
 * CAMBIO 4 (mismo día, Sergio: "hay que añadir un apartado al lado de la
 * casilla Distribuidor para poder añadir otras selecciones que no tienen
 * nada que ver con el trabajo con los distribuidores: trabajo
 * administrativo, vacaciones, asuntos propios, reunión comercial,
 * prospección"): el panel de "nueva visita" pasa de un ÚNICO select de
 * distribuidor a DOS listas de checkboxes independientes y compatibles entre
 * sí — confirmado con Sergio vía AskUserQuestion ("todo es compatible, no
 * solo estas opciones, puede ser que en un día vea a dos o tres
 * distribuidores"): una de distribuidores (0-N, para poder marcar varios el
 * mismo día) y otra de "otra actividad" (catálogo `actividadesDisponibles`,
 * ver firebaseApi/actividadesAgenda.js — a diferencia de Medio/Objetivo, es
 * un catálogo GLOBAL que solo un manager puede editar, desde la pantalla de
 * Configuración). Al confirmar se crea UNA visita por cada distribuidor
 * marcado y UNA por cada actividad marcada (todas comparten fecha/días
 * seguidos/medio/objetivo) — una visita "de actividad" no lleva
 * `id_distribuidor` ni `id_comercial`, lleva `actividad` (texto plano, igual
 * que medio/objetivo) en su lugar, y se pinta de un color distinto (gris) en
 * el calendario para diferenciarla a simple vista de una visita real.
 *
 * CAMBIO 5 (mismo día, dos fixes reportados por Sergio sobre CAMBIO 4): (a)
 * "el desplegable de los distrib se debe recoger tal y como estaba antes" —
 * las dos listas de checkboxes se sustituyen por `SelectorMultiple`, un
 * desplegable propio que arranca CERRADO (mostrando "N seleccionados" o el
 * nombre si hay solo uno) y se abre/cierra al clicar, en vez de una caja
 * siempre expandida; (b) "no sale la lista de las otras opciones aunque en
 * Configuración sí están dadas de alta" — como Medio/Objetivo se editan
 * dentro de esta misma pantalla (su gestor llama a cargarTodo() nada más
 * guardar) pero "Otra actividad" se edita en una pantalla DISTINTA
 * (Configuración) que React mantiene montada en paralelo, el catálogo
 * quedaba obsoleto si Agenda Comercial ya estaba abierta cuando se añadía
 * una actividad nueva. Fix: `onAbrirPanelCrear` (opcional) se llama justo al
 * abrir el panel de "nueva visita" (clic en un día), para que la pantalla
 * pueda refrescar ese catálogo bajo demanda sin depender de un remount.
 *
 * Este componente NO habla con Firestore directamente — recibe `visitas` ya
 * cargadas y delega cada acción (mover/moverBloque/cerrar/borrar/confirmar/
 * crear) en callbacks que le pasa la pantalla que lo usa, que es quien
 * conoce idUsuario y quien vuelve a cargar los datos después. Así el mismo
 * componente sirve para las dos pantallas sin duplicar lógica de Firestore.
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import esLocale from '@fullcalendar/core/locales/es';
import { Save, Trash2, X, CheckCircle2, Circle, Star, ChevronDown } from 'lucide-react';
import './CalendarioVisitas.css';
import { tarjeta, botonPrimario, botonSecundario, botonPeligro, inputClasses, etiqueta } from './uiClasses';

// Desplegable multi-selección propio (ver CAMBIO 5 en la cabecera): arranca
// cerrado, mostrando un resumen ("Selecciona...", el nombre si hay solo uno
// elegido, o "N seleccionados"), y se abre/cierra al clicar o al hacer clic
// fuera — a diferencia de una caja de checkboxes siempre expandida, que
// Sergio pidió explícitamente "recoger" (volver a un desplegable, como el
// select de antes).
function SelectorMultiple({ etiquetaVacia, opciones, seleccionados, onToggle, textoSinOpciones }) {
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef(null);

  useEffect(() => {
    if (!abierto) return undefined;
    const handleClickFuera = (e) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) setAbierto(false);
    };
    document.addEventListener('mousedown', handleClickFuera);
    return () => document.removeEventListener('mousedown', handleClickFuera);
  }, [abierto]);

  const resumen = seleccionados.length === 0
    ? etiquetaVacia
    : seleccionados.length === 1
      ? (opciones.find((o) => o.id === seleccionados[0])?.nombre || seleccionados[0])
      : `${seleccionados.length} seleccionados`;

  return (
    <div className="relative" ref={contenedorRef}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className={`${inputClasses} w-full flex items-center justify-between gap-2 text-left`}
      >
        <span className={`truncate ${seleccionados.length === 0 ? 'text-slate-400' : ''}`}>{resumen}</span>
        <ChevronDown size={14} className={`text-slate-400 shrink-0 transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>
      {abierto && (
        <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-soft p-2 space-y-0.5">
          {opciones.length === 0 && <p className="text-xs text-slate-400 px-1 py-1">{textoSinOpciones}</p>}
          {opciones.map((o) => (
            <label key={o.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 px-1 py-1 rounded hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer">
              <input type="checkbox" checked={seleccionados.includes(o.id)} onChange={() => onToggle(o.id)} />
              {o.nombre}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// Colores por estado (mismo criterio de "no desaparecer en silencio": una
// visita confirmada se distingue con un aro exterior, no solo con el color
// de fondo, para que se note incluso si alguien no diferencia bien colores).
const colorPorEstado = (visita) => {
  if (visita.estado === 'hecha') return '#059669'; // emerald-600
  if (!visita.id_distribuidor) return '#64748b'; // slate-500 — "otra actividad", sin distribuidor
  return '#4F46E5'; // indigo-600 (pendiente) — color corporativo de la app
};

// Diferencia en días naturales entre dos fechas "YYYY-MM-DD" (b - a).
const diferenciaEnDias = (fechaTextoA, fechaTextoB) => {
  const a = new Date(`${fechaTextoA}T00:00:00Z`);
  const b = new Date(`${fechaTextoB}T00:00:00Z`);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
};

const sumarDiasAFecha = (fechaTexto, dias) => {
  const fecha = new Date(`${fechaTexto}T00:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
};

function CalendarioVisitas({
  visitas,
  mapaComerciales,
  mapaDistribuidores,
  mapaCriterios,
  onMover,
  onMoverBloque,
  onGuardarCierre,
  onBorrar,
  onConfirmar,
  onQuitarConfirmacion,
  onCrearVisita,
  onAbrirPanelCrear,
  distribuidoresDisponibles = [],
  mediosDisponibles = [],
  objetivosDisponibles = [],
  actividadesDisponibles = [],
  mostrarConfirmar = false,
  mostrarQuitarConfirmacion = false,
}) {
  const [visitaSeleccionadaId, setVisitaSeleccionadaId] = useState(null);
  const [bloqueResaltado, setBloqueResaltado] = useState(null);
  const [modoMover, setModoMover] = useState('bloque'); // 'bloque' | 'individual' | 'rango'
  const [seleccionManual, setSeleccionManual] = useState(() => new Set());
  const [moviendoSeleccion, setMoviendoSeleccion] = useState(false);
  const [edicion, setEdicion] = useState({ estado: 'pendiente', fecha_real: '', nota: '', medio: '', objetivo: '' });
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  // Panel de "nueva visita" al hacer clic en un día vacío (ver CAMBIO 3/4).
  // `idsDistribuidor` y `actividades` son ambos arrays: se puede marcar 0-N
  // distribuidores Y 0-N "otras actividades" a la vez (compatibles entre
  // sí, confirmado con Sergio) — cada uno se convierte en su propia visita.
  const [fechaCreacion, setFechaCreacion] = useState(null);
  const [nuevaVisita, setNuevaVisita] = useState({ idsDistribuidor: [], actividades: [], diasSeguidos: 1, medio: '', objetivo: '' });
  const [creando, setCreando] = useState(false);

  const cambiarModoMover = (modo) => {
    setModoMover(modo);
    setBloqueResaltado(null);
    setSeleccionManual(new Set());
  };

  const visitaSeleccionada = useMemo(
    () => visitas.find((v) => v.id === visitaSeleccionadaId) || null,
    [visitas, visitaSeleccionadaId]
  );

  const eventos = useMemo(() => visitas.map((v) => {
    const color = colorPorEstado(v);
    const enBloque = v.longitud_bloque > 1;
    const sufijoBloque = enBloque ? ` [${v.dia_bloque}/${v.longitud_bloque}]` : '';
    // Una visita "de actividad" (Trabajo administrativo, Vacaciones...) no
    // tiene distribuidor ni comercial — se titula con el nombre de la
    // actividad en vez de "criterio · distribuidor (comercial)".
    const titulo = v.id_distribuidor
      ? `${(mapaCriterios.get(v.id_criterio) || {}).codigo || '?'} · ${mapaDistribuidores.get(v.id_distribuidor) || v.id_distribuidor} (${mapaComerciales.get(v.id_comercial) || v.id_comercial})${sufijoBloque}`
      : `${v.actividad || 'Otra actividad'}${sufijoBloque}`;
    return {
      id: v.id,
      title: titulo,
      start: v.fecha_prevista,
      allDay: true,
      backgroundColor: color,
      borderColor: v.confirmada ? '#0f172a' : color,
      textColor: '#fff',
      extendedProps: { id_bloque: v.id_bloque || '' },
    };
  }), [visitas, mapaCriterios, mapaDistribuidores, mapaComerciales]);

  // Resalta (borde/sombra, ver CalendarioVisitas.css) los eventos "activos"
  // según el modo: en modo bloque, todo el bloque que se acaba de tocar; en
  // modo rango, todas las visitas marcadas por el último arrastre sobre el
  // calendario. Puramente visual — la lógica de "mover todo junto" vive en
  // handleEventDrop/handleMoverSeleccion, no depende de este estado.
  const eventClassNames = (arg) => {
    if (modoMover === 'bloque') {
      const idBloque = arg.event.extendedProps.id_bloque;
      return idBloque && bloqueResaltado && idBloque === bloqueResaltado ? ['bloque-resaltado'] : [];
    }
    if (modoMover === 'rango') {
      return seleccionManual.has(arg.event.id) ? ['seleccion-manual'] : [];
    }
    return [];
  };

  const abrirVisita = (visita) => {
    setFechaCreacion(null);
    setVisitaSeleccionadaId(visita.id);
    if (modoMover === 'bloque') setBloqueResaltado(visita.id_bloque || null);
    setEdicion({
      estado: visita.estado || 'pendiente',
      fecha_real: visita.fecha_real || '',
      nota: visita.nota || '',
      medio: visita.medio || '',
      objetivo: visita.objetivo || '',
    });
  };

  const handleEventClick = (info) => {
    const visita = visitas.find((v) => v.id === info.event.id);
    if (!visita) return;
    // Modo "Selección por rango": el clic ya no abre el detalle, se usa para
    // marcar/desmarcar UNA visita suelta de la selección — el "escape" para
    // cuando un día tiene varias visitas apiladas y solo quieres alguna de
    // ellas (arrastrar mete todas las de esos días, clic quita las que no
    // quieras una a una, sin tener que rehacer el arrastre entero).
    if (modoMover === 'rango') {
      setSeleccionManual((prev) => {
        const siguiente = new Set(prev);
        if (siguiente.has(visita.id)) siguiente.delete(visita.id);
        else siguiente.add(visita.id);
        return siguiente;
      });
      return;
    }
    abrirVisita(visita);
  };

  // Modo "Selección por rango": arrastrar sobre las casillas del calendario
  // AÑADE a la selección todas las visitas cuya fecha caiga dentro de ese
  // rango (info.endStr es exclusivo, mismo convenio que FullCalendar) — se
  // ACUMULA con lo que ya hubiera seleccionado, no lo sustituye. Así se
  // pueden hacer varios arrastres sueltos (p.ej. una semana de julio + otra
  // de agosto) y que las dos queden marcadas a la vez para moverlas juntas.
  // Reemplazar la selección entera es "Cancelar selección" (botón aparte).
  const handleSeleccionRango = (info) => {
    const desde = info.startStr;
    const hasta = info.endStr;
    const idsEnRango = visitas
      .filter((v) => v.fecha_prevista >= desde && v.fecha_prevista < hasta)
      .map((v) => v.id);
    setSeleccionManual((prev) => new Set([...prev, ...idsEnRango]));
    setVisitaSeleccionadaId(null);
  };

  const handleMoverSeleccion = async (deltaDias) => {
    const visitasSeleccionadas = visitas.filter((v) => seleccionManual.has(v.id));
    if (visitasSeleccionadas.length === 0 || !onMoverBloque) return;
    const idsSeleccion = new Set(visitasSeleccionadas.map((v) => v.id));
    const colisiones = visitasSeleccionadas.filter((v) => {
      const destino = sumarDiasAFecha(v.fecha_prevista, deltaDias);
      return visitas.some((otra) => !idsSeleccion.has(otra.id) && otra.id_comercial === v.id_comercial && otra.fecha_prevista === destino);
    });
    if (colisiones.length > 0) {
      const seguir = window.confirm(`Hay otra visita programada en ${colisiones.length} de esos días para el mismo comercial. ¿Mover la selección de todas formas?`);
      if (!seguir) return;
    }
    setMoviendoSeleccion(true);
    try {
      await onMoverBloque(visitasSeleccionadas, deltaDias);
      setSeleccionManual(new Set());
    } catch (error) {
      console.error('Error moviendo la selección:', error);
      alert('Error al mover la selección: ' + error.message);
    }
    setMoviendoSeleccion(false);
  };

  // Clic en un día vacío del calendario (fondo, no un evento existente) abre
  // el panel de "nueva visita" con esa fecha ya puesta — ver CAMBIO 3. Solo
  // si la pantalla ofrece `onCrearVisita` (Agenda Comercial) y no estamos en
  // modo "rango" (donde ese mismo clic/arrastre ya sirve para seleccionar).
  const handleDateClick = (info) => {
    if (!onCrearVisita || modoMover === 'rango') return;
    const diaSemana = new Date(`${info.dateStr}T00:00:00Z`).getUTCDay();
    if (diaSemana === 0 || diaSemana === 6) {
      alert('Elige un día laborable (lunes a viernes) para crear una visita.');
      return;
    }
    setVisitaSeleccionadaId(null);
    setFechaCreacion(info.dateStr);
    setNuevaVisita({ idsDistribuidor: [], actividades: [], diasSeguidos: 1, medio: '', objetivo: '' });
    // Refresca catálogos que puedan haber cambiado en OTRA pantalla montada
    // en paralelo (ver CAMBIO 5) — p.ej. "Otra actividad" se edita en
    // Configuración, no aquí.
    if (onAbrirPanelCrear) onAbrirPanelCrear();
  };

  const toggleDistribuidorNuevaVisita = (id) => {
    setNuevaVisita((prev) => ({
      ...prev,
      idsDistribuidor: prev.idsDistribuidor.includes(id)
        ? prev.idsDistribuidor.filter((x) => x !== id)
        : [...prev.idsDistribuidor, id],
    }));
  };

  const toggleActividadNuevaVisita = (nombre) => {
    setNuevaVisita((prev) => ({
      ...prev,
      actividades: prev.actividades.includes(nombre)
        ? prev.actividades.filter((x) => x !== nombre)
        : [...prev.actividades, nombre],
    }));
  };

  const handleCrearVisita = async () => {
    if (nuevaVisita.idsDistribuidor.length === 0 && nuevaVisita.actividades.length === 0) {
      alert('Elige al menos un distribuidor o una actividad.');
      return;
    }
    setCreando(true);
    try {
      await onCrearVisita({
        idsDistribuidor: nuevaVisita.idsDistribuidor,
        actividades: nuevaVisita.actividades,
        fecha: fechaCreacion,
        diasSeguidos: Number(nuevaVisita.diasSeguidos) || 1,
        medio: nuevaVisita.medio,
        objetivo: nuevaVisita.objetivo,
      });
      setFechaCreacion(null);
    } catch (error) {
      console.error('Error creando la visita:', error);
      alert('Error al crear la visita: ' + error.message);
    }
    setCreando(false);
  };

  const handleEventDrop = async (info) => {
    const visita = visitas.find((v) => v.id === info.event.id);
    if (!visita) { info.revert(); return; }
    const nuevaFecha = info.event.startStr; // "YYYY-MM-DD", evento allDay
    const diaSemana = new Date(`${nuevaFecha}T00:00:00Z`).getUTCDay();
    if (diaSemana === 0 || diaSemana === 6) {
      alert('Solo se pueden programar visitas en días laborables (lunes a viernes).');
      info.revert();
      return;
    }
    // Una visita "de actividad" (sin distribuidor/comercial) no tiene con
    // quién colisionar en el sentido de "este comercial ya tiene otra visita
    // ese día" — se salta el aviso de colisión para ella (ver CAMBIO 4).
    const nombreComercial = visita.id_distribuidor ? (mapaComerciales.get(visita.id_comercial) || 'Este comercial') : null;

    // Qué grupo de visitas se mueve junto depende del modo:
    //  - "bloque": todas las del mismo id_bloque (días consecutivos).
    //  - "individual": solo esta, aunque pertenezca a un bloque mayor.
    //  - "rango": si esta visita está dentro de la selección manual actual
    //    (y hay más de una marcada), se mueve TODA la selección — así se
    //    puede arrastrar cualquiera de las marcadas para mover el grupo
    //    entero, sin tener que usar los botones "semana anterior/siguiente".
    //    Si se arrastra una visita que no está en la selección, se mueve
    //    ella sola.
    let grupoAMover;
    if (modoMover === 'bloque' && visita.id_bloque) {
      grupoAMover = visitas.filter((v) => v.id_bloque === visita.id_bloque);
    } else if (modoMover === 'rango' && seleccionManual.has(visita.id) && seleccionManual.size > 1) {
      grupoAMover = visitas.filter((v) => seleccionManual.has(v.id));
    } else {
      grupoAMover = [visita];
    }

    // Grupo de varios días: se mueve ENTERO, siempre en semanas completas
    // (múltiplos de 7 días) para que cada día conserve su mismo día de la
    // semana en el destino sin tener que volver a comprobar fines de semana.
    if (grupoAMover.length > 1 && onMoverBloque) {
      const deltaCrudo = diferenciaEnDias(visita.fecha_prevista, nuevaFecha);
      const deltaSemanas = Math.round(deltaCrudo / 7);
      if (deltaSemanas === 0) {
        alert(`Este grupo de ${grupoAMover.length} visitas se mueve completo a otra semana — suéltalo en una semana distinta a la actual.`);
        info.revert();
        return;
      }
      const deltaDias = deltaSemanas * 7;
      const idsGrupo = new Set(grupoAMover.map((v) => v.id));
      if (nombreComercial) {
        const colisiones = grupoAMover.filter((v) => {
          const destino = sumarDiasAFecha(v.fecha_prevista, deltaDias);
          return visitas.some((otra) => !idsGrupo.has(otra.id) && otra.id_comercial === visita.id_comercial && otra.fecha_prevista === destino);
        });
        if (colisiones.length > 0) {
          const seguir = window.confirm(`${nombreComercial} ya tiene otra visita programada en ${colisiones.length} de esos días. ¿Mover el grupo completo de todas formas?`);
          if (!seguir) { info.revert(); return; }
        }
      }
      try {
        await onMoverBloque(grupoAMover, deltaDias);
        if (modoMover === 'rango') setSeleccionManual(new Set());
      } catch (error) {
        console.error('Error moviendo el grupo de visitas:', error);
        alert('Error al mover el grupo: ' + error.message);
        info.revert();
      }
      return;
    }

    if (nombreComercial) {
      const colisiona = visitas.some((v) => v.id !== visita.id && v.id_comercial === visita.id_comercial && v.fecha_prevista === nuevaFecha);
      if (colisiona) {
        const seguir = window.confirm(`${nombreComercial} ya tiene otra visita programada ese día. ¿Mover de todas formas?`);
        if (!seguir) { info.revert(); return; }
      }
    }
    try {
      await onMover(visita, nuevaFecha);
    } catch (error) {
      console.error('Error moviendo la visita:', error);
      alert('Error al mover la visita: ' + error.message);
      info.revert();
    }
  };

  const handleGuardar = async () => {
    if (!visitaSeleccionada) return;
    setGuardando(true);
    try {
      await onGuardarCierre(visitaSeleccionada, edicion);
      setVisitaSeleccionadaId(null);
    } catch (error) {
      console.error('Error guardando la visita:', error);
      alert('Error al guardar: ' + error.message);
    }
    setGuardando(false);
  };

  const handleBorrar = async () => {
    if (!visitaSeleccionada) return;
    if (!window.confirm('¿Borrar esta visita del calendario?')) return;
    setBorrando(true);
    try {
      await onBorrar(visitaSeleccionada);
      setVisitaSeleccionadaId(null);
    } catch (error) {
      console.error('Error borrando la visita:', error);
      alert('Error al borrar: ' + error.message);
    }
    setBorrando(false);
  };

  const handleConfirmar = async () => {
    if (!visitaSeleccionada) return;
    setConfirmando(true);
    try {
      await onConfirmar(visitaSeleccionada);
    } catch (error) {
      console.error('Error confirmando la visita:', error);
      alert('Error al confirmar: ' + error.message);
    }
    setConfirmando(false);
  };

  const handleQuitarConfirmacion = async () => {
    if (!visitaSeleccionada) return;
    if (!window.confirm('¿Quitar esta visita de la Agenda? Seguirá en Planificación Comercial, solo deja de estar confirmada.')) return;
    setConfirmando(true);
    try {
      await onQuitarConfirmacion(visitaSeleccionada);
      setVisitaSeleccionadaId(null);
    } catch (error) {
      console.error('Error quitando la confirmación:', error);
      alert('Error: ' + error.message);
    }
    setConfirmando(false);
  };

  const OPCIONES_MODO_MOVER = [
    { valor: 'bloque', etiqueta: 'Bloque completo' },
    { valor: 'individual', etiqueta: 'Día individual' },
    { valor: 'rango', etiqueta: 'Selección por rango' },
  ];

  const AYUDA_MODO_MOVER = {
    bloque: 'Arrastra cualquier día de un bloque (días seguidos de un mismo distribuidor) para mover todos esos días juntos a otra semana.',
    individual: 'Arrastra un solo día para moverlo suelto, aunque forme parte de un bloque de varios días.',
    rango: 'Arrastra sobre las casillas vacías para marcar días (puedes hacerlo varias veces, se van sumando); clic sobre una visita ya marcada la quita de la selección. Para moverlo todo: arrastra cualquiera de las visitas marcadas, o usa los botones de abajo.',
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Mover:</span>
        {OPCIONES_MODO_MOVER.map((opcion) => (
          <button
            key={opcion.valor}
            type="button"
            onClick={() => cambiarModoMover(opcion.valor)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
              modoMover === opcion.valor
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
            }`}
          >
            {opcion.etiqueta}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{AYUDA_MODO_MOVER[modoMover]}</p>

      {modoMover === 'rango' && seleccionManual.size > 0 && (
        <div className={`${tarjeta} mb-3 flex flex-wrap items-center gap-3`}>
          <span className="text-sm font-medium text-slate-900 dark:text-white">
            {seleccionManual.size} visita{seleccionManual.size === 1 ? '' : 's'} seleccionada{seleccionManual.size === 1 ? '' : 's'}
          </span>
          <button type="button" className={botonSecundario} disabled={moviendoSeleccion} onClick={() => handleMoverSeleccion(-7)}>
            {moviendoSeleccion ? 'Moviendo...' : '‹ Semana anterior'}
          </button>
          <button type="button" className={botonSecundario} disabled={moviendoSeleccion} onClick={() => handleMoverSeleccion(7)}>
            {moviendoSeleccion ? 'Moviendo...' : 'Semana siguiente ›'}
          </button>
          <button
            type="button"
            className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            disabled={moviendoSeleccion}
            onClick={() => setSeleccionManual(new Set())}
          >
            Cancelar selección
          </button>
        </div>
      )}

      <div className={`${tarjeta} calendario-visitas`}>
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          locale={esLocale}
          firstDay={1}
          height="auto"
          headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,listMonth' }}
          events={eventos}
          editable={true}
          selectable={modoMover === 'rango'}
          select={handleSeleccionRango}
          eventDurationEditable={false}
          dayMaxEvents={true}
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          eventClassNames={eventClassNames}
          dateClick={handleDateClick}
        />
      </div>

      {fechaCreacion && (
        <div className={`${tarjeta} mt-4`}>
          <div className="flex items-start justify-between mb-3">
            <h4 className="text-sm font-medium text-slate-900 dark:text-white">Nueva visita — {fechaCreacion}</h4>
            <button type="button" onClick={() => setFechaCreacion(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
              <X size={18} />
            </button>
          </div>
          <div className="flex flex-wrap gap-3 mb-3">
            <div className="min-w-[220px] flex-1">
              <label className={`${etiqueta} block mb-1`}>Distribuidor(es)</label>
              <SelectorMultiple
                etiquetaVacia="Selecciona distribuidor(es)..."
                opciones={distribuidoresDisponibles}
                seleccionados={nuevaVisita.idsDistribuidor}
                onToggle={toggleDistribuidorNuevaVisita}
                textoSinOpciones="Sin distribuidores disponibles."
              />
            </div>
            <div className="min-w-[220px] flex-1">
              <label className={`${etiqueta} block mb-1`}>Otra actividad (sin distribuidor)</label>
              <SelectorMultiple
                etiquetaVacia="Selecciona actividad(es)..."
                opciones={actividadesDisponibles.map((a) => ({ id: a, nombre: a }))}
                seleccionados={nuevaVisita.actividades}
                onToggle={toggleActividadNuevaVisita}
                textoSinOpciones="Sin actividades configuradas — un manager puede añadirlas en Configuración."
              />
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3 mb-3">
            <div>
              <label className={`${etiqueta} block mb-1`}>Días seguidos</label>
              <input
                type="number"
                min="1"
                max="5"
                value={nuevaVisita.diasSeguidos}
                onChange={(e) => setNuevaVisita((prev) => ({ ...prev, diasSeguidos: e.target.value }))}
                className={`${inputClasses} w-20`}
              />
            </div>
            <div>
              <label className={`${etiqueta} block mb-1`}>Medio</label>
              <select
                value={nuevaVisita.medio}
                onChange={(e) => setNuevaVisita((prev) => ({ ...prev, medio: e.target.value }))}
                className={`${inputClasses} w-44`}
              >
                <option value="">Sin especificar</option>
                {mediosDisponibles.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className={`${etiqueta} block mb-1`}>Objetivo</label>
              <select
                value={nuevaVisita.objetivo}
                onChange={(e) => setNuevaVisita((prev) => ({ ...prev, objetivo: e.target.value }))}
                className={`${inputClasses} w-44`}
              >
                <option value="">Sin especificar</option>
                {objetivosDisponibles.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <button type="button" className={botonPrimario} disabled={creando} onClick={handleCrearVisita}>
            {creando ? 'Creando...' : 'Crear visita'}
          </button>
        </div>
      )}

      {visitaSeleccionada && (() => {
        const esActividad = !visitaSeleccionada.id_distribuidor;
        const distribuidor = esActividad ? null : (mapaDistribuidores.get(visitaSeleccionada.id_distribuidor) || visitaSeleccionada.id_distribuidor);
        const comercial = esActividad ? null : (mapaComerciales.get(visitaSeleccionada.id_comercial) || visitaSeleccionada.id_comercial);
        const criterio = esActividad ? null : mapaCriterios.get(visitaSeleccionada.id_criterio);
        return (
          <div className={`${tarjeta} mt-4`}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className="text-sm font-medium text-slate-900 dark:text-white">
                  {esActividad
                    ? (visitaSeleccionada.actividad || 'Otra actividad')
                    : (<>{distribuidor} <span className="text-slate-400 font-normal">— {comercial}</span></>)}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Prevista: {visitaSeleccionada.fecha_prevista}
                  {!esActividad && <> · Criterio {criterio ? criterio.codigo : '—'} · Visita nº{visitaSeleccionada.numero_visita}</>}
                  {visitaSeleccionada.confirmada && <span className="ml-2 inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-semibold"><Star size={11} />En la Agenda</span>}
                </p>
                {visitaSeleccionada.longitud_bloque > 1 && modoMover === 'bloque' && (
                  <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">
                    Día {visitaSeleccionada.dia_bloque} de {visitaSeleccionada.longitud_bloque} seguidos — está resaltado el bloque entero en el calendario; arrastra cualquiera de sus días para mover los {visitaSeleccionada.longitud_bloque} juntos a otra semana.
                  </p>
                )}
                {visitaSeleccionada.longitud_bloque > 1 && modoMover === 'individual' && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Este día forma parte de un bloque de {visitaSeleccionada.longitud_bloque} días seguidos, pero en modo "Día individual" se mueve él solo si lo arrastras.
                  </p>
                )}
              </div>
              <button type="button" onClick={() => setVisitaSeleccionadaId(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-wrap gap-3 items-end mb-3">
              <div>
                <label className={`${etiqueta} block mb-1`}>Estado</label>
                <select
                  value={edicion.estado}
                  onChange={(e) => setEdicion((prev) => ({ ...prev, estado: e.target.value }))}
                  className={`${inputClasses} w-36`}
                >
                  <option value="pendiente">Pendiente</option>
                  <option value="hecha">Hecha</option>
                </select>
              </div>
              <div>
                <label className={`${etiqueta} block mb-1`}>Fecha real</label>
                <input
                  type="date"
                  value={edicion.fecha_real}
                  onChange={(e) => setEdicion((prev) => ({ ...prev, fecha_real: e.target.value }))}
                  className={`${inputClasses} w-40`}
                />
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className={`${etiqueta} block mb-1`}>Nota</label>
                <input
                  type="text"
                  value={edicion.nota}
                  onChange={(e) => setEdicion((prev) => ({ ...prev, nota: e.target.value }))}
                  placeholder="Resultado de la visita"
                  className={`${inputClasses} w-full`}
                />
              </div>
              <div>
                <label className={`${etiqueta} block mb-1`}>Medio</label>
                <select
                  value={edicion.medio}
                  onChange={(e) => setEdicion((prev) => ({ ...prev, medio: e.target.value }))}
                  className={`${inputClasses} w-44`}
                >
                  <option value="">Sin especificar</option>
                  {/* Si la visita ya tenía un medio que ya no está en el catálogo (se borró o renombró), se muestra igual para no perder el dato. */}
                  {edicion.medio && !mediosDisponibles.includes(edicion.medio) && <option value={edicion.medio}>{edicion.medio}</option>}
                  {mediosDisponibles.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className={`${etiqueta} block mb-1`}>Objetivo</label>
                <select
                  value={edicion.objetivo}
                  onChange={(e) => setEdicion((prev) => ({ ...prev, objetivo: e.target.value }))}
                  className={`${inputClasses} w-44`}
                >
                  <option value="">Sin especificar</option>
                  {edicion.objetivo && !objetivosDisponibles.includes(edicion.objetivo) && <option value={edicion.objetivo}>{edicion.objetivo}</option>}
                  {objetivosDisponibles.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" className={botonPrimario} disabled={guardando} onClick={handleGuardar}>
                <span className="inline-flex items-center gap-1.5">
                  {edicion.estado === 'hecha' ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                  <Save size={14} />{guardando ? 'Guardando...' : 'Guardar'}
                </span>
              </button>
              {mostrarConfirmar && !visitaSeleccionada.confirmada && (
                <button type="button" className={botonSecundario} disabled={confirmando} onClick={handleConfirmar}>
                  <span className="inline-flex items-center gap-1.5"><Star size={14} />{confirmando ? 'Confirmando...' : 'Confirmar en la Agenda'}</span>
                </button>
              )}
              {mostrarQuitarConfirmacion && (
                <button type="button" className={botonSecundario} disabled={confirmando} onClick={handleQuitarConfirmacion}>
                  <span className="inline-flex items-center gap-1.5"><X size={14} />{confirmando ? 'Quitando...' : 'Quitar de la Agenda'}</span>
                </button>
              )}
              <button type="button" className={botonPeligro} disabled={borrando} onClick={handleBorrar}>
                <span className="inline-flex items-center gap-1.5"><Trash2 size={14} />{borrando ? 'Borrando...' : 'Borrar visita'}</span>
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default CalendarioVisitas;
