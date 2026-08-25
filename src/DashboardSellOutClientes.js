/*
 * DashboardSellOutClientes.js
 * Análisis de Sell-Out por Cliente Final (a petición de Sergio): se elige un
 * distribuidor y se ve el detalle de SUS clientes — cuánto compran, cuántas
 * referencias trabajan, y cómo evolucionan frente al MISMO periodo del año
 * anterior (nuevos, recuperados, activos, perdidos).
 *
 * CAMBIO (2026-07-18, a petición de Sergio): el selector libre "Desde/Hasta"
 * permitía construir rangos sin sentido (p.ej. 13 meses seguidos) y la
 * comparación resultante contra "el mismo rango un año antes" quedaba
 * confusa — además tenía un bug real: la etiqueta del periodo anterior salía
 * invertida (mostraba "Marzo 2025 – Marzo 2024" en vez de "Marzo 2024 –
 * Marzo 2025") porque se montaba a partir de un array ya ordenado de más
 * reciente a más antiguo sin invertirlo antes de mostrarlo.
 *
 * Un primer rediseño (Mes/Trimestre/Año a mano) tampoco cuadraba con el
 * resto de la app: Sergio pidió reusar exactamente el MISMO selector que ya
 * usan Dashboard de Ventas Reales y Dashboard de Gestión —
 * `PeriodoComparador.js` (Mes/Trimestre/Semestre/Año completo/Varios meses,
 * más "qué años comparar" con cualquier combinación de años reales) — en vez
 * de mantener una tercera variante de selector de periodo en la app. El año
 * más reciente MARCADO es el periodo "actual" (`entryBase`) y el segundo más
 * reciente marcado es el "anterior" (`entryComparacion`, puede no existir si
 * solo se marca un año) — mismo patrón anioBase/anioComparacion que
 * DashboardVentasReales.js.
 *
 * Decisiones confirmadas por Sergio (ver conversación):
 *  - El KPI de volumen es UNIDADES (uds_totales = Ventas+Promo+Regalos —
 *    los regalos SÍ cuentan).
 *  - Facturación (€, columna "Neto" del Excel) añadida el 2026-07-19 como
 *    columnas adicionales junto a las de unidades (no como toggle ni solo en
 *    KPI) — separadas visualmente con un borde vertical. OJO: solo los
 *    movimientos importados DESPUÉS de este cambio traen este dato; lo
 *    importado antes queda a 0€ hasta reimportar ese distribuidor.
 *  - Estados de cliente por periodo:
 *      Activo: compró en el periodo actual Y en el mismo periodo año pasado.
 *      Nuevo: compra ahora y nunca había comprado antes (ni ese periodo del
 *        año pasado ni en ningún mes anterior con datos en la app).
 *      Recuperado: compra ahora, no compró en el mismo periodo año pasado,
 *        pero SÍ tiene alguna compra en algún mes anterior al periodo actual
 *        (es decir, no es la primera vez, solo llevaba un tiempo sin comprar).
 *      Perdido: compró en el mismo periodo año pasado y NO compra ahora.
 *  - Solo se listan clientes con actividad en el periodo actual y/o en el
 *    mismo periodo del año pasado (un cliente sin ninguna de las dos no
 *    aporta nada a esta comparativa concreta).
 *
 * Detector de clientes duplicados (2026-07-18, a petición de Sergio: no
 * estaba seguro de que la importación no hubiera creado clientes repetidos):
 * se carga también el maestro `clientesSellOut` del distribuidor elegido y
 * se avisa (sin fusionar nada automáticamente, igual que matching.js en el
 * resto de la app) de dos tipos de posible duplicado:
 *   - Mismo código de cliente en más de un documento maestro — no debería
 *     pasar nunca (la reconciliación por código es exacta), así que si
 *     aparece es una señal clara de un problema real.
 *   - Mismo nombre normalizado en más de un documento, con código de
 *     cliente distinto o vacío — más ambiguo (dos clientes con nombres
 *     parecidos podrían ser legítimamente distintos), se marca solo como
 *     aviso para que Sergio lo revise a mano.
 *
 * SELECTOR DE DISTRIBUIDOR MÚLTIPLE (2026-08-25, a petición de Sergio:
 * "tiene que estar la opción de poder escoger a uno, varios o todos los
 * distribuidores, esto tiene que ser para sell out por cliente y marca").
 * Hasta ahora `idDistribuidor` era un valor único y GLOBAL, compartido con
 * "Gestión por Distribuidor" (llegaba como prop desde App.js vía
 * PantallaSellOutClientes.js — ver más abajo el comentario, ya obsoleto,
 * que lo explicaba). Ahora esta pantalla (y su hermana
 * DashboardSellOutMarcas.js) tienen su PROPIO estado local
 * `idsDistribuidores` (array, reutilizando <FiltroMultiSelect/> con
 * `vacioSignificaTodos={false}` — ver cabecera de ese archivo) e ignoran el
 * selector global: elegir un distribuidor en "Gestión por Distribuidor" ya
 * NO se refleja aquí, y viceversa (decisión de Sergio: "independizar solo
 * estas 2 pantallas"). Con varios distribuidores elegidos, sus movimientos y
 * clientes se cargan y se ven TODOS JUNTOS en la misma tabla, con una
 * columna "Distribuidor" añadida (solo cuando hay más de uno elegido) para
 * poder distinguir de dónde viene cada fila — nunca hay colisión de
 * `id_cliente` entre distribuidores distintos porque `clientesSellOut` ya
 * guarda un documento por (distribuidor, cliente), así que la agregación de
 * agregacionSellOutPorPeriodo.js no necesita ningún cambio. La "zona de
 * peligro" (borrar datos) y el detector de duplicados quedan con sentido
 * solo cuando hay EXACTAMENTE un distribuidor elegido — ver donde se usan.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getMovimientosSellOutClientesPorDistribuidor, getClientesSellOutPorDistribuidor, resetSellOutClientesPorDistribuidor } from './firebaseApi';
import { auth } from './firebaseConfig';
import {
  inputClasses, filtroContenedor, etiqueta, tarjeta,
  tdClasses, tdRightClasses, colorPorSigno, trTotales,
  kpiCard, kpiTitulo, tituloPantalla, subtitulo,
  botonPeligro
} from './uiClasses';
import TablaOrdenable from './TablaOrdenable';
import PeriodoComparador from './PeriodoComparador';
// formatearPeriodo/FilaComparativa/FiltroTexto (2026-07-19, a petición de
// Sergio: "todo estos últimos cambios tiene que hacerse en las dos
// pestañas de Cliente y Marca") se sacaron a archivos propios, compartidos
// con DashboardSellOutMarcas.js — ver cabecera de cada uno.
import { formatearPeriodo, entradaAMesesAno } from './formatearPeriodo';
import FilaComparativa from './FilaComparativa';
import FiltroTexto from './FiltroTexto';
// Zona/Preventista/Cliente son de selección MÚLTIPLE (a petición de
// Sergio, 2026-07-19: "tiene que ser un filtro donde pueda seleccionar los
// clientes que quiera o deseleccionar los que no quiera... igual quiero
// seleccionar dos zonas o a 4 comerciales") — ver cabecera de
// FiltroMultiSelect.js. Sustituye a FiltroSelect.js/FiltroBuscador.js
// (selección única), que ya no se usan aquí.
import FiltroMultiSelect from './FiltroMultiSelect';
// La agregación por periodo (uds/€/estado/variaciones) es idéntica a la de
// DashboardSellOutMarcas.js salvo por el campo de agrupación, así que vive
// en un módulo propio y compartido — ver cabecera de ese archivo.
import { agregarSellOutPorPeriodo } from './agregacionSellOutPorPeriodo';

const formateadorNumero = new Intl.NumberFormat('es-ES');
const formateadorEuros = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const norm = (s) => String(s || '').trim().toUpperCase();

// Mapeo de código de comercial (C.CIAL, tal cual llega en los ficheros de
// Sell-Out) a nombre de zona — confirmado por Sergio (2026-07-18).
const ZONA_POR_CODIGO = { '1': 'Cádiz', '2': 'Sevilla', '4': 'Málaga', '20': 'Online' };
const etiquetaZona = (codigo) => {
  const c = String(codigo || '').trim();
  if (!c) return '';
  return ZONA_POR_CODIGO[c] || `Zona ${c}`;
};

const BADGE_ESTADO = {
  activo: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30',
  nuevo: 'bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-500/30',
  recuperado: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30',
  perdido: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/30'
};
const ETIQUETA_ESTADO = { activo: 'Activo', nuevo: 'Nuevo', recuperado: 'Recuperado', perdido: 'Perdido' };

// idsDistribuidores: estado LOCAL de esta pantalla (array de ids), ya NO
// compartido con "Gestión por Distribuidor" — ver comentario de cabecera
// "SELECTOR DE DISTRIBUIDOR MÚLTIPLE" (2026-08-25).
function DashboardSellOutClientes({ idUsuario, listaDistribuidores }) {
  const [idsDistribuidores, setIdsDistribuidores] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [clientesMaestro, setClientesMaestro] = useState([]);
  const [cargando, setCargando] = useState(false);

  // id -> nombre_distribuidor, para pintar la columna "Distribuidor" y los
  // mensajes de la zona de peligro sin recorrer `listaDistribuidores` cada vez.
  const mapaNombreDistribuidor = useMemo(() => {
    const m = new Map();
    (listaDistribuidores || []).forEach(d => m.set(d.id, d.nombre_distribuidor));
    return m;
  }, [listaDistribuidores]);
  // true cuando hay más de un distribuidor elegido a la vez — activa la
  // columna "Distribuidor" en la tabla y desactiva la zona de peligro (que
  // solo tiene sentido para UN distribuidor concreto).
  const variosDistribuidores = idsDistribuidores.length > 1;

  // [{ anio, meses }, ...] — uno por año marcado en PeriodoComparador, todos
  // con el mismo conjunto de meses (índices 0-11), como en DashboardVentasReales.js.
  const [rangosPorAnio, setRangosPorAnio] = useState([]);

  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [busqueda, setBusqueda] = useState('');
  // Zona/Preventista/Cliente son arrays (selección múltiple, a petición de
  // Sergio, 2026-07-19) — array vacío = "sin filtro" (se ve todo), igual
  // que antes lo era la cadena vacía ''.
  const [filtroZona, setFiltroZona] = useState([]);
  const [filtroPreventista, setFiltroPreventista] = useState([]);
  const [filtroClienteId, setFiltroClienteId] = useState([]);
  const [mostrarDuplicados, setMostrarDuplicados] = useState(false);
  const [confirmacionBorrado, setConfirmacionBorrado] = useState('');
  const [borrando, setBorrando] = useState(false);

  // Extraído del useEffect de abajo para poder volver a llamarlo tras
  // borrar los datos de este distribuidor (ver handleBorrarDistribuidor).
  // Carga en paralelo los movimientos y el maestro de clientes de CADA
  // distribuidor elegido (getMovimientosSellOutClientesPorDistribuidor /
  // getClientesSellOutPorDistribuidor siguen siendo por-un-distribuidor —
  // ya están cacheadas en memoria por (usuario, distribuidor), ver
  // cacheLecturas.js, así que reelegir un distribuidor ya visto no vuelve a
  // pegarle a Firestore) y los junta en un único array — la agregación por
  // periodo de más abajo ya sabe distinguir de qué distribuidor es cada fila
  // porque cada movimiento/cliente trae su propio `id_distribuidor`.
  const cargarDatosDistribuidor = useCallback(async () => {
    if (!idsDistribuidores.length || !idUsuario) { setMovimientos([]); setClientesMaestro([]); return; }
    setCargando(true);
    try {
      const resultadosPorDistribuidor = await Promise.all(idsDistribuidores.map(id => Promise.all([
        getMovimientosSellOutClientesPorDistribuidor(idUsuario, id),
        getClientesSellOutPorDistribuidor(idUsuario, id)
      ])));
      setMovimientos(resultadosPorDistribuidor.flatMap(([movs]) => movs));
      setClientesMaestro(resultadosPorDistribuidor.flatMap(([, clientes]) => clientes));
    } catch (error) {
      console.error('Error cargando Sell-Out por Cliente:', error);
      alert('No se pudieron cargar los datos de los distribuidores elegidos: ' + error.message);
    }
    setCargando(false);
  }, [idUsuario, idsDistribuidores]);

  useEffect(() => {
    // Al cambiar la selección de distribuidor(es), los filtros de
    // zona/preventista/cliente de la selección anterior ya no tienen
    // sentido (los códigos y nombres pueden no existir en la nueva).
    setFiltroZona([]);
    setFiltroPreventista([]);
    setFiltroClienteId([]);
    setConfirmacionBorrado('');
    cargarDatosDistribuidor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idUsuario, idsDistribuidores, cargarDatosDistribuidor]);

  // Solo tiene sentido con EXACTAMENTE un distribuidor elegido (ver
  // `variosDistribuidores` — la zona de peligro se oculta si hay más de
  // uno, o ninguno).
  const handleBorrarDistribuidor = async () => {
    if (confirmacionBorrado.toUpperCase() !== 'BORRAR') {
      alert('Escribe BORRAR en el campo de confirmación para continuar.');
      return;
    }
    const idDistribuidorUnico = idsDistribuidores[0];
    const nombreDistribuidor = mapaNombreDistribuidor.get(idDistribuidorUnico) || idDistribuidorUnico;
    if (!window.confirm(
      `Vas a mover a la papelera TODOS los clientes y movimientos de Sell-Out por Cliente Final de "${nombreDistribuidor}". ` +
      `No se borran de forma permanente (podrás recuperarlos desde Papelera si fue un error), pero desaparecerán de esta pantalla. ¿Continuar?`
    )) return;

    setBorrando(true);
    try {
      const actor = { uid: auth.currentUser?.uid, email: auth.currentUser?.email };
      const resultado = await resetSellOutClientesPorDistribuidor(idUsuario, idDistribuidorUnico, actor);
      setConfirmacionBorrado('');
      await cargarDatosDistribuidor();
      alert(`Movidos a la papelera: ${resultado.movimientos} movimiento(s) y ${resultado.clientes} cliente(s) de "${nombreDistribuidor}".`);
    } catch (error) {
      console.error('Error borrando Sell-Out por Cliente del distribuidor:', error);
      alert('Error al borrar: ' + error.message);
    }
    setBorrando(false);
  };

  // Meses con algún dato importado, más reciente primero.
  const mesesDisponibles = useMemo(() => {
    const set = new Set();
    movimientos.forEach(m => { if (m.mes_ano) set.add(m.mes_ano); });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [movimientos]);

  // Años que existen de verdad en el histórico importado de este
  // distribuidor — se pasan tal cual a PeriodoComparador (nunca hardcodeados),
  // igual que en DashboardVentasReales.js.
  const aniosDisponibles = useMemo(() => {
    if (mesesDisponibles.length === 0) return [];
    const anios = mesesDisponibles.map(m => parseInt(m.split('-')[0], 10));
    const minY = Math.min(...anios);
    const maxY = Math.max(...anios);
    const arr = [];
    for (let y = minY; y <= maxY; y++) arr.push(y);
    return arr;
  }, [mesesDisponibles]);

  // rangosPorAnio ya viene ordenado ascendente (PeriodoComparador hace
  // `[...anios].sort()`) — el año más reciente MARCADO es el periodo
  // "actual" y el segundo más reciente marcado es el "anterior" (puede no
  // existir si solo se marca un año), mismo patrón anioBase/anioComparacion
  // que DashboardVentasReales.js.
  const entryBase = rangosPorAnio.length > 0 ? rangosPorAnio[rangosPorAnio.length - 1] : null;
  const entryComparacion = rangosPorAnio.length > 1 ? rangosPorAnio[rangosPorAnio.length - 2] : null;

  const mesesPeriodoActual = useMemo(() => entradaAMesesAno(entryBase), [entryBase]);
  const mesesPeriodoAnterior = useMemo(() => entradaAMesesAno(entryComparacion), [entryComparacion]);

  const setMesesActual = useMemo(() => new Set(mesesPeriodoActual), [mesesPeriodoActual]);
  const setMesesAnterior = useMemo(() => new Set(mesesPeriodoAnterior), [mesesPeriodoAnterior]);
  // Primer mes del periodo actual (el más antiguo de la lista) — para decidir
  // si una compra fuera de los dos periodos es "de antes" (Recuperado) o no.
  const inicioPeriodoActual = useMemo(
    () => (mesesPeriodoActual.length > 0 ? mesesPeriodoActual.slice().sort()[0] : ''),
    [mesesPeriodoActual]
  );

  const periodoActualLabel = formatearPeriodo(entryBase);
  const periodoAnteriorLabel = formatearPeriodo(entryComparacion);

  // --------------------------------------------------------------
  // Agregación por cliente
  // --------------------------------------------------------------
  const filasClientes = useMemo(() => {
    if (mesesPeriodoActual.length === 0) return [];

    // El bucle de agregación en sí vive en agregacionSellOutPorPeriodo.js —
    // es exactamente el mismo que usa DashboardSellOutMarcas.js (allí
    // agrupando por marca), y tenerlo duplicado ya provocó una vez que un
    // arreglo se aplicara solo en una de las dos pantallas. OJO: aquí se le
    // pasan los movimientos SIN filtrar por Zona/Preventista/Cliente a
    // propósito — el filtro se aplica DESPUÉS, sobre las filas ya agregadas
    // (ver filasBase), porque en esta pantalla la Zona es un atributo del
    // CLIENTE (arrastrado de su movimiento más reciente), no de cada línea.
    const filas = agregarSellOutPorPeriodo({
      movimientos,
      campoId: 'id_cliente',
      campoNombre: 'nombre_cliente',
      campoDistinto: 'id_marca',
      prefijoDistintos: 'refs',
      setMesesActual,
      setMesesAnterior,
      inicioPeriodoActual,
      // 'id_distribuidor' se arrastra igual que tipologia/comercial/
      // preventista (2026-08-25, selector de distribuidor múltiple) — no
      // hace falta condicionarlo a `variosDistribuidores`: con uno solo
      // elegido todos los movimientos comparten el mismo id_distribuidor,
      // así que no cambia nada arrastrarlo siempre.
      camposArrastre: ['tipologia', 'comercial', 'preventista', 'id_distribuidor']
    });

    // `zona` es solo la etiqueta legible del código de comercial — se añade
    // aquí y no en el módulo compartido porque el mapeo código->zona es
    // propio de esta pantalla (Marcas no lista zona por fila). `nombreDistribuidor`
    // igual, para la columna "Distribuidor" (solo se pinta con varios
    // distribuidores elegidos, ver `variosDistribuidores`). El orden que
    // trae `filas` (udsActual descendente) se conserva: map no reordena.
    return filas.map(f => ({
      ...f,
      zona: etiquetaZona(f.comercial),
      nombreDistribuidor: mapaNombreDistribuidor.get(f.id_distribuidor) || f.id_distribuidor
    }));
  }, [movimientos, mesesPeriodoActual, setMesesActual, setMesesAnterior, inicioPeriodoActual, mapaNombreDistribuidor]);

  // Opciones de los desplegables — solo códigos/nombres que de verdad
  // aparecen en los clientes del distribuidor elegido (nunca hardcodeadas).
  const opcionesZona = useMemo(() => {
    const codigos = new Set();
    filasClientes.forEach(f => { if (f.comercial) codigos.add(f.comercial); });
    return Array.from(codigos).sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0));
  }, [filasClientes]);

  const opcionesPreventista = useMemo(() => {
    const set = new Set();
    filasClientes.forEach(f => { if (f.preventista) set.add(f.preventista); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [filasClientes]);

  const opcionesCliente = useMemo(() => {
    return filasClientes
      .map(f => ({ id: f.id_cliente, nombre: f.nombre_cliente }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [filasClientes]);

  // filasBase: todo MENOS el filtro de estado — se usa para los contadores
  // de las píldoras "Filtro por estado" y para los 4 KPI de "Movimiento de
  // clientes" (Activos/Nuevos/Recuperados/Perdidos). A propósito NO se les
  // aplica también filtroEstado: si se hiciera, al marcar p.ej. "Nuevos" los
  // otros 3 KPI caerían a 0 (dejarían de servir como referencia) — ver
  // comentario más abajo, junto a esos KPI.
  const filasBase = useMemo(() => filasClientes.filter(f => {
    if (busqueda && !f.nombre_cliente.toLowerCase().includes(busqueda.toLowerCase())) return false;
    if (filtroZona.length > 0 && !filtroZona.includes(f.comercial)) return false;
    if (filtroPreventista.length > 0 && !filtroPreventista.includes(f.preventista)) return false;
    if (filtroClienteId.length > 0 && !filtroClienteId.includes(f.id_cliente)) return false;
    return true;
  }), [filasClientes, busqueda, filtroZona, filtroPreventista, filtroClienteId]);

  // filasFiltradas: filasBase + el filtro de estado — es lo que ve la
  // tabla, y también la base de totalesFiltrados (fila TOTALES y los 3 KPI
  // de "Volumen del periodo" de arriba, a petición de Sergio, 2026-07-19:
  // "los KPI deberían cambiar cuando se hace algún filtro").
  const filasFiltradas = useMemo(
    () => filasBase.filter(f => filtroEstado === 'todos' || f.estado === filtroEstado),
    [filasBase, filtroEstado]
  );

  // Totales de la fila "TOTALES" al pie de la tabla — sobre `filasFiltradas`
  // (no sobre todos los clientes) a propósito, para que reflejen SIEMPRE lo
  // que hay filtrado en pantalla (zona/preventista/cliente/estado/búsqueda),
  // a petición de Sergio (2026-07-19).
  //
  // OJO con "Referencias": NO es la suma de la columna "Referencias" de cada
  // cliente (eso cuenta la misma marca una vez POR CADA cliente que la
  // compra — con 803 clientes, una marca muy vendida podría sumar 803 solo
  // ella, un número sin sentido). Tiene que ser el número de MARCAS
  // DISTINTAS entre todos los clientes filtrados, así que se recalcula desde
  // los movimientos igual que el KPI "Referencias trabajadas" de arriba,
  // pero solo con los movimientos de los clientes que pasan el filtro.
  const totalesFiltrados = useMemo(() => {
    const totalActual = filasFiltradas.reduce((a, f) => a + f.udsActual, 0);
    const totalAnterior = filasFiltradas.reduce((a, f) => a + f.udsAnterior, 0);
    const diferencia = totalActual - totalAnterior;
    const variacion = totalAnterior > 0 ? (diferencia / totalAnterior) * 100 : (totalActual > 0 ? null : 0);

    const facturacionActual = filasFiltradas.reduce((a, f) => a + f.facturacionActual, 0);
    const facturacionAnterior = filasFiltradas.reduce((a, f) => a + f.facturacionAnterior, 0);
    const diferenciaEuros = facturacionActual - facturacionAnterior;
    const variacionEuros = facturacionAnterior > 0 ? (diferenciaEuros / facturacionAnterior) * 100 : (facturacionActual > 0 ? null : 0);

    const idsClientesFiltrados = new Set(filasFiltradas.map(f => f.id_cliente));
    const refsActualSet = new Set();
    const refsAnteriorSet = new Set();
    movimientos.forEach(mv => {
      if (!mv.id_cliente || !idsClientesFiltrados.has(mv.id_cliente)) return;
      if (!mv.id_marca || (mv.uds_totales || 0) === 0) return;
      if (setMesesActual.has(mv.mes_ano)) refsActualSet.add(mv.id_marca);
      else if (setMesesAnterior.has(mv.mes_ano)) refsAnteriorSet.add(mv.id_marca);
    });
    const varReferencias = refsAnteriorSet.size > 0
      ? ((refsActualSet.size - refsAnteriorSet.size) / refsAnteriorSet.size) * 100
      : (refsActualSet.size > 0 ? null : 0);

    return {
      totalActual, totalAnterior, diferencia, variacion,
      facturacionActual, facturacionAnterior, diferenciaEuros, variacionEuros,
      refsActual: refsActualSet.size,
      refsAnterior: refsAnteriorSet.size,
      varReferencias
    };
  }, [filasFiltradas, movimientos, setMesesActual, setMesesAnterior]);

  // --------------------------------------------------------------
  // KPIs de "Movimiento de clientes" — sobre filasBase (respeta
  // zona/preventista/cliente/búsqueda, no el filtro de estado — ver
  // comentario junto a filasBase más arriba).
  // --------------------------------------------------------------
  const statusCounts = useMemo(() => ({
    activos: filasBase.filter(f => f.estado === 'activo').length,
    nuevos: filasBase.filter(f => f.estado === 'nuevo').length,
    recuperados: filasBase.filter(f => f.estado === 'recuperado').length,
    perdidos: filasBase.filter(f => f.estado === 'perdido').length,
  }), [filasBase]);

  // --------------------------------------------------------------
  // Detector de clientes duplicados en el maestro (solo aviso, no fusiona nada)
  // --------------------------------------------------------------
  // Claves de agrupación con el id_distribuidor por delante (2026-08-25,
  // selector múltiple): antes se agrupaba solo por código/nombre porque
  // SIEMPRE eran clientes del mismo (único) distribuidor cargado — ahora
  // que puede haber varios a la vez, el mismo código de cliente en DOS
  // distribuidores distintos es perfectamente normal (cada uno lleva su
  // propia numeración) y no debe avisarse como duplicado. Con un solo
  // distribuidor elegido el comportamiento es idéntico al de antes.
  const duplicados = useMemo(() => {
    const porCodigo = new Map(); // "idDistribuidor::cod_cliente_origen" -> [clientes]
    const porNombre = new Map(); // "idDistribuidor::nombreNormalizado" -> [clientes]
    clientesMaestro.forEach(c => {
      if (c.cod_cliente_origen) {
        const clave = `${c.id_distribuidor}::${c.cod_cliente_origen}`;
        const lista = porCodigo.get(clave) || [];
        lista.push(c);
        porCodigo.set(clave, lista);
      }
      const claveNombre = `${c.id_distribuidor}::${norm(c.nombre_cliente)}`;
      const listaNombre = porNombre.get(claveNombre) || [];
      listaNombre.push(c);
      porNombre.set(claveNombre, listaNombre);
    });

    const gruposPorCodigo = [...porCodigo.values()].filter(g => g.length > 1);
    // Solo se listan como "por nombre" los grupos que NO comparten ya el
    // mismo código (para no avisar dos veces del mismo problema).
    const gruposPorNombre = [...porNombre.values()].filter(g => g.length > 1 && new Set(g.map(c => c.cod_cliente_origen || '')).size > 1);

    return { gruposPorCodigo, gruposPorNombre, total: gruposPorCodigo.length + gruposPorNombre.length };
  }, [clientesMaestro]);

  // Columnas de la tabla de clientes, para TablaOrdenable.js (26/07/2026, a
  // petición de Sergio: "lo que has hecho de las flechitas en este informe
  // tienes que hacerlo en todos los informes de la app" — ver
  // PantallaAvisosConsumo.js, donde se probó primero). `valor` es lo que se
  // usa para ordenar al clicar la cabecera; `render` sigue pintando EXACTAMENTE
  // igual que antes (mismos badges/colores/bordes).
  const BORDE_GRUPO_CABECERA = 'border-l-2 !border-l-slate-300 dark:!border-l-slate-600';
  const BORDE_GRUPO_CELDA = 'border-l-2 !border-l-slate-200 dark:!border-l-slate-700';
  const columnasClientes = [
    { titulo: 'Cliente', valor: (f) => f.nombre_cliente, render: (f) => f.nombre_cliente },
    // Columna "Distribuidor" (2026-08-25, selector múltiple): solo se
    // incluye con más de un distribuidor elegido a la vez — con uno solo
    // sería una columna redundante (todas las filas dirían lo mismo).
    ...(variosDistribuidores ? [
      { titulo: 'Distribuidor', valor: (f) => f.nombreDistribuidor || '', render: (f) => f.nombreDistribuidor || '—' }
    ] : []),
    { titulo: 'Zona', valor: (f) => f.zona || '', render: (f) => f.zona || '—' },
    { titulo: 'Preventista', valor: (f) => f.preventista || '', render: (f) => f.preventista || '—' },
    { titulo: 'Tipología', valor: (f) => f.tipologia || '', render: (f) => f.tipologia || '—' },
    {
      titulo: 'Estado', valor: (f) => f.estado,
      render: (f) => <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${BADGE_ESTADO[f.estado]}`}>{ETIQUETA_ESTADO[f.estado]}</span>,
    },
    { titulo: 'Uds. periodo', derecha: true, valor: (f) => f.udsActual, render: (f) => formateadorNumero.format(f.udsActual) },
    { titulo: 'Uds. año anterior', derecha: true, valor: (f) => f.udsAnterior, render: (f) => formateadorNumero.format(f.udsAnterior) },
    {
      titulo: 'Diferencia', derecha: true, valor: (f) => f.udsActual - f.udsAnterior,
      render: (f) => (
        <span className={`${colorPorSigno(f.udsActual - f.udsAnterior)} font-semibold`}>
          {f.udsActual - f.udsAnterior >= 0 ? '+' : ''}{formateadorNumero.format(f.udsActual - f.udsAnterior)}
        </span>
      ),
    },
    {
      titulo: 'Variación', derecha: true, valor: (f) => f.variacion ?? 0,
      render: (f) => (
        <span className={`${f.variacion !== null ? colorPorSigno(f.variacion) : ''} font-semibold`}>
          {f.variacion === null ? '—' : `${f.variacion >= 0 ? '+' : ''}${f.variacion.toFixed(0)}%`}
        </span>
      ),
    },
    {
      titulo: 'Facturación', derecha: true, claseCabecera: BORDE_GRUPO_CABECERA, claseCelda: BORDE_GRUPO_CELDA,
      valor: (f) => f.facturacionActual, render: (f) => formateadorEuros.format(f.facturacionActual),
    },
    { titulo: 'Fact. año anterior', derecha: true, valor: (f) => f.facturacionAnterior, render: (f) => formateadorEuros.format(f.facturacionAnterior) },
    {
      titulo: 'Dif. €', derecha: true, valor: (f) => f.facturacionActual - f.facturacionAnterior,
      render: (f) => (
        <span className={`${colorPorSigno(f.facturacionActual - f.facturacionAnterior)} font-semibold`}>
          {f.facturacionActual - f.facturacionAnterior >= 0 ? '+' : ''}{formateadorEuros.format(f.facturacionActual - f.facturacionAnterior)}
        </span>
      ),
    },
    {
      titulo: 'Var. €', derecha: true, valor: (f) => f.variacionEuros ?? 0,
      render: (f) => (
        <span className={`${f.variacionEuros !== null ? colorPorSigno(f.variacionEuros) : ''} font-semibold`}>
          {f.variacionEuros === null ? '—' : `${f.variacionEuros >= 0 ? '+' : ''}${f.variacionEuros.toFixed(0)}%`}
        </span>
      ),
    },
    {
      titulo: 'Referencias', derecha: true, claseCabecera: BORDE_GRUPO_CABECERA, claseCelda: BORDE_GRUPO_CELDA,
      valor: (f) => f.refsActual, render: (f) => f.refsActual,
    },
    { titulo: 'Refs. año anterior', derecha: true, valor: (f) => f.refsAnterior, render: (f) => f.refsAnterior },
    { titulo: 'Última compra', valor: (f) => f.ultimaFecha || '', render: (f) => f.ultimaFecha || '—' },
  ];

  // Fila de TOTALES: se pasa ya construida a TablaOrdenable (prop
  // `filaTotales`) para que se quede SIEMPRE al final, pase lo que pase con
  // el orden elegido en las demás filas — igual que antes de este cambio.
  const filaTotalesClientes = filasFiltradas.length > 0 ? (
    <tr className={trTotales}>
      {/* Primera celda fija en horizontal, a juego con la columna "Cliente"
          fijada por TablaOrdenable.js — mismo fondo que esta fila de
          totales (bg-slate-50/dark:bg-slate-900, ver `trTotales` en
          uiClasses.js) para que no se note el corte al desplazar. */}
      <td className={`${tdClasses} sticky left-0 z-[2] bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700`}>TOTALES ({filasFiltradas.length})</td>
      {/* Una celda vacía más cuando la columna "Distribuidor" está presente
          (2026-08-25) — el número de <td> aquí tiene que casar siempre con
          columnasClientes, ver comentario de TablaOrdenable.js sobre filaTotales. */}
      {variosDistribuidores && <td className={tdClasses}></td>}
      <td className={tdClasses}></td>
      <td className={tdClasses}></td>
      <td className={tdClasses}></td>
      <td className={tdClasses}></td>
      <td className={tdRightClasses}>{formateadorNumero.format(totalesFiltrados.totalActual)}</td>
      <td className={tdRightClasses}>{formateadorNumero.format(totalesFiltrados.totalAnterior)}</td>
      <td className={`${tdRightClasses} ${colorPorSigno(totalesFiltrados.diferencia)}`}>
        {totalesFiltrados.diferencia >= 0 ? '+' : ''}{formateadorNumero.format(totalesFiltrados.diferencia)}
      </td>
      <td className={`${tdRightClasses} ${totalesFiltrados.variacion !== null ? colorPorSigno(totalesFiltrados.variacion) : ''}`}>
        {totalesFiltrados.variacion === null ? '—' : `${totalesFiltrados.variacion >= 0 ? '+' : ''}${totalesFiltrados.variacion.toFixed(0)}%`}
      </td>
      <td className={`${tdRightClasses} ${BORDE_GRUPO_CABECERA}`}>{formateadorEuros.format(totalesFiltrados.facturacionActual)}</td>
      <td className={tdRightClasses}>{formateadorEuros.format(totalesFiltrados.facturacionAnterior)}</td>
      <td className={`${tdRightClasses} ${colorPorSigno(totalesFiltrados.diferenciaEuros)}`}>
        {totalesFiltrados.diferenciaEuros >= 0 ? '+' : ''}{formateadorEuros.format(totalesFiltrados.diferenciaEuros)}
      </td>
      <td className={`${tdRightClasses} ${totalesFiltrados.variacionEuros !== null ? colorPorSigno(totalesFiltrados.variacionEuros) : ''}`}>
        {totalesFiltrados.variacionEuros === null ? '—' : `${totalesFiltrados.variacionEuros >= 0 ? '+' : ''}${totalesFiltrados.variacionEuros.toFixed(0)}%`}
      </td>
      <td className={`${tdRightClasses} ${BORDE_GRUPO_CABECERA}`}>{formateadorNumero.format(totalesFiltrados.refsActual)}</td>
      <td className={tdRightClasses}>{formateadorNumero.format(totalesFiltrados.refsAnterior)}</td>
      <td className={tdClasses}></td>
    </tr>
  ) : null;

  return (
    <div>
      <h2 className={tituloPantalla}>Sell-Out por Cliente Final</h2>
      <p className={subtitulo}>Elige uno, varios o todos los distribuidores para ver el detalle de sus clientes: qué compran, cuánto y cómo evolucionan frente al mismo periodo del año pasado.</p>

      <div className={`${filtroContenedor} mb-4`}>
        <FiltroMultiSelect
          label="Distribuidor"
          values={idsDistribuidores}
          onChange={setIdsDistribuidores}
          placeholder="-- Elegir distribuidor(es) --"
          opciones={listaDistribuidores || []}
          getValue={(d) => d.id}
          getLabel={(d) => d.nombre_distribuidor}
          vacioSignificaTodos={false}
        />

        {idsDistribuidores.length > 0 && mesesDisponibles.length > 0 && (
          <FiltroTexto
            label="Buscar cliente"
            value={busqueda}
            onChange={setBusqueda}
            placeholder="Nombre del cliente..."
          />
        )}

        {idsDistribuidores.length > 0 && mesesDisponibles.length > 0 && (
          <FiltroMultiSelect
            label="Zona"
            values={filtroZona}
            onChange={setFiltroZona}
            placeholder="Todas las zonas"
            opciones={opcionesZona}
            getValue={(codigo) => codigo}
            getLabel={(codigo) => etiquetaZona(codigo)}
          />
        )}

        {idsDistribuidores.length > 0 && mesesDisponibles.length > 0 && (
          <FiltroMultiSelect
            label="Preventista"
            values={filtroPreventista}
            onChange={setFiltroPreventista}
            placeholder="Todos los preventistas"
            opciones={opcionesPreventista}
            getValue={(p) => p}
            getLabel={(p) => p}
          />
        )}

        {idsDistribuidores.length > 0 && mesesDisponibles.length > 0 && (
          <FiltroMultiSelect
            label="Cliente"
            values={filtroClienteId}
            onChange={setFiltroClienteId}
            placeholder="Todos los clientes"
            opciones={opcionesCliente}
          />
        )}
      </div>

      {idsDistribuidores.length > 0 && mesesDisponibles.length > 0 && (
        <PeriodoComparador aniosDisponibles={aniosDisponibles} onChange={setRangosPorAnio} />
      )}

      {idsDistribuidores.length === 0 && (
        <div className={tarjeta}>
          <p className="text-sm text-slate-500 dark:text-slate-400">Elige uno o varios distribuidores arriba para ver sus clientes.</p>
        </div>
      )}

      {idsDistribuidores.length > 0 && cargando && (
        <div className="text-slate-500 dark:text-slate-400">Cargando datos de los distribuidores elegidos...</div>
      )}

      {idsDistribuidores.length > 0 && !cargando && mesesDisponibles.length === 0 && (
        <div className={tarjeta}>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {variosDistribuidores
              ? 'Estos distribuidores todavía no tienen ningún dato de Sell-Out por Cliente importado.'
              : 'Este distribuidor todavía no tiene ningún dato de Sell-Out por Cliente importado.'}
          </p>
        </div>
      )}

      {idsDistribuidores.length > 0 && !cargando && mesesDisponibles.length > 0 && (
        <>
          {duplicados.total > 0 && (
            <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/40 text-amber-800 dark:text-amber-300 rounded-xl p-4 mb-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <strong>⚠ Posibles clientes duplicados en el maestro de {variosDistribuidores ? 'los distribuidores elegidos' : 'este distribuidor'} ({duplicados.total} grupo(s))</strong>
                <button type="button" onClick={() => setMostrarDuplicados(v => !v)} className="text-xs underline shrink-0">
                  {mostrarDuplicados ? 'Ocultar detalle' : 'Ver detalle'}
                </button>
              </div>
              {mostrarDuplicados && (
                <div className="mt-3 space-y-3">
                  {duplicados.gruposPorCodigo.length > 0 && (
                    <div>
                      <p className="font-semibold mb-1">Mismo código de cliente en varios documentos (no debería pasar nunca):</p>
                      <ul className="list-disc pl-5 space-y-0.5">
                        {duplicados.gruposPorCodigo.map((grupo, i) => (
                          <li key={i}>
                            {variosDistribuidores && <>[{mapaNombreDistribuidor.get(grupo[0].id_distribuidor) || grupo[0].id_distribuidor}] </>}
                            Código <strong>{grupo[0].cod_cliente_origen}</strong>: {grupo.map(c => `"${c.nombre_cliente}"`).join(', ')}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {duplicados.gruposPorNombre.length > 0 && (
                    <div>
                      <p className="font-semibold mb-1">Mismo nombre con código de cliente distinto (revisar a mano — podrían ser legítimamente distintos):</p>
                      <ul className="list-disc pl-5 space-y-0.5">
                        {duplicados.gruposPorNombre.map((grupo, i) => (
                          <li key={i}>
                            {variosDistribuidores && <>[{mapaNombreDistribuidor.get(grupo[0].id_distribuidor) || grupo[0].id_distribuidor}] </>}
                            "{grupo[0].nombre_cliente}": códigos {grupo.map(c => c.cod_cliente_origen || '(sin código)').join(', ')}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    No se fusiona nada automáticamente. Si confirmas que son el mismo cliente, corrígelo a mano (borrar el
                    documento sobrante desde Firebase o volviendo a importar eligiendo "usar existente" para ese cliente).
                  </p>
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            {entryComparacion
              ? <>Comparando <strong>{periodoActualLabel}</strong> frente a <strong>{periodoAnteriorLabel}</strong>.</>
              : <>Mostrando <strong>{periodoActualLabel}</strong> — marca un segundo año en "Qué años comparar" arriba para ver la evolución interanual (nuevos/recuperados/perdidos).</>}
          </p>

          {/* KPIs — a petición de Sergio (2026-07-19, tres rondas de
              feedback):
              1) Las 3 métricas de volumen (Uds., Facturación, Referencias)
                 muestran valor actual + valor de comparación + %, TODO en
                 una sola línea centrada — ver <FilaComparativa/> (archivo
                 propio, compartido con Marcas).
              2) Grid con nº fijo de columnas (no flex-wrap con flex-1), para
                 que la última fila no se quede nunca estirada a todo el
                 ancho.
              3) Todas las tarjetas centran su contenido.
              4) "Los KPI deberían cambiar cuando se hace algún filtro":
                 antes las 3 de "Volumen del periodo" salían SIEMPRE del
                 total del distribuidor entero, ignorando Zona/Preventista/
                 Cliente/Búsqueda/Estado — ahora salen de `totalesFiltrados`
                 (los mismos números que la fila TOTALES al pie de la
                 tabla, que ya sí respetaba los filtros). Los 4 de
                 "Movimiento de clientes" salen de `statusCounts`, que
                 respeta Zona/Preventista/Cliente/Búsqueda pero NO el propio
                 filtro de Estado (si lo respetara, marcar "Nuevos" pondría
                 Activos/Recuperados/Perdidos a 0 — dejarían de servir como
                 referencia). */}
          <div className="mb-5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">
              Volumen del periodo
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
              <div className={kpiCard + ' flex flex-col items-center text-center'}>
                <div className={kpiTitulo}>Uds. totales</div>
                <FilaComparativa
                  valorActual={formateadorNumero.format(totalesFiltrados.totalActual)}
                  periodoActualLabel={periodoActualLabel}
                  valorAnterior={entryComparacion ? formateadorNumero.format(totalesFiltrados.totalAnterior) : null}
                  periodoAnteriorLabel={periodoAnteriorLabel}
                  variacion={totalesFiltrados.variacion}
                />
              </div>
              <div className={kpiCard + ' flex flex-col items-center text-center'}>
                <div className={kpiTitulo}>Facturación</div>
                <FilaComparativa
                  valorActual={formateadorEuros.format(totalesFiltrados.facturacionActual)}
                  periodoActualLabel={periodoActualLabel}
                  valorAnterior={entryComparacion ? formateadorEuros.format(totalesFiltrados.facturacionAnterior) : null}
                  periodoAnteriorLabel={periodoAnteriorLabel}
                  variacion={totalesFiltrados.variacionEuros}
                />
              </div>
              <div className={kpiCard + ' flex flex-col items-center text-center'}>
                <div className={kpiTitulo}>Referencias trabajadas</div>
                <FilaComparativa
                  valorActual={String(totalesFiltrados.refsActual)}
                  periodoActualLabel={periodoActualLabel}
                  valorAnterior={entryComparacion ? String(totalesFiltrados.refsAnterior) : null}
                  periodoAnteriorLabel={periodoAnteriorLabel}
                  variacion={totalesFiltrados.varReferencias}
                />
              </div>
            </div>

            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">
              Movimiento de clientes {entryComparacion ? <>({periodoActualLabel} vs {periodoAnteriorLabel})</> : null}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className={kpiCard + ' flex flex-col items-center text-center'}>
                <div className={kpiTitulo}>Activos</div>
                <div className="text-3xl font-bold !text-emerald-600 dark:!text-emerald-400">{statusCounts.activos}</div>
              </div>
              <div className={kpiCard + ' flex flex-col items-center text-center'}>
                <div className={kpiTitulo}>Nuevos</div>
                <div className="text-3xl font-bold !text-sky-600 dark:!text-sky-400">{statusCounts.nuevos}</div>
              </div>
              <div className={kpiCard + ' flex flex-col items-center text-center'}>
                <div className={kpiTitulo}>Recuperados</div>
                <div className="text-3xl font-bold !text-indigo-600 dark:!text-indigo-400">{statusCounts.recuperados}</div>
              </div>
              <div className={kpiCard + ' flex flex-col items-center text-center'}>
                <div className={kpiTitulo}>Perdidos</div>
                <div className="text-3xl font-bold !text-red-600 dark:!text-red-400">{statusCounts.perdidos}</div>
              </div>
            </div>
          </div>

          {/* Filtro por estado */}
          <div className="flex flex-wrap gap-2 mb-3">
            {['todos', 'activo', 'nuevo', 'recuperado', 'perdido'].map(est => (
              <button
                key={est}
                type="button"
                onClick={() => setFiltroEstado(est)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold !border-0 transition-colors ${
                  filtroEstado === est ? 'bg-indigo-50 dark:bg-indigo-500/15 !text-indigo-700 dark:!text-indigo-300' : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400'
                }`}
              >
                {est === 'todos' ? `Todos (${filasBase.length})` : `${ETIQUETA_ESTADO[est]} (${filasBase.filter(f => f.estado === est).length})`}
              </button>
            ))}
          </div>

          {/* Tabla de clientes */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-700">
            {filasFiltradas.length === 0 ? (
              <p className={`${tdClasses} p-3`}>No hay clientes que cumplan este filtro.</p>
            ) : (
              <TablaOrdenable filas={filasFiltradas} columnas={columnasClientes} keyExtractor={(f) => f.id_cliente} filaTotales={filaTotalesClientes} />
            )}
          </div>

          {/* Zona de peligro: borrar todos los datos de este distribuidor —
              solo tiene sentido con EXACTAMENTE un distribuidor elegido
              (2026-08-25, selector múltiple: con varios o "todos" elegidos
              no hay forma de saber cuál de ellos se quiere borrar sin un
              selector aparte, así que se oculta — decisión de Sergio). */}
          {idsDistribuidores.length === 1 && (
            <div className="border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10 rounded-xl p-4 mt-5 text-sm">
              <strong className="text-red-700 dark:text-red-400">⚠ Borrar todos los datos de Sell-Out por Cliente de este distribuidor</strong>
              <p className="text-slate-700 dark:text-slate-300 mt-1 mb-3">
                Mueve a la papelera (recuperable, no se pierde nada) todos los clientes y movimientos de este distribuidor concreto —
                los demás distribuidores no se tocan.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label className={etiqueta}>Escribe BORRAR para confirmar:</label>
                <input
                  type="text"
                  value={confirmacionBorrado}
                  onChange={(e) => setConfirmacionBorrado(e.target.value)}
                  disabled={borrando}
                  className={`${inputClasses} !border-red-400 dark:!border-red-500/60 w-32`}
                />
                <button
                  type="button"
                  onClick={handleBorrarDistribuidor}
                  disabled={borrando || confirmacionBorrado.toUpperCase() !== 'BORRAR'}
                  className={`${botonPeligro} disabled:opacity-50`}
                >
                  {borrando ? 'Borrando...' : 'Borrar datos de este distribuidor'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default DashboardSellOutClientes;
