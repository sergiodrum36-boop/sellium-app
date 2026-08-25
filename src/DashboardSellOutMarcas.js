/*
 * DashboardSellOutMarcas.js
 * Análisis de Sell-Out por MARCA (a petición de Sergio, 2026-07-18: "solo
 * comparamos clientes pero no puedo ver las referencias, necesitaré también
 * la comparativa de las marcas"). Mismo dato de partida que
 * DashboardSellOutClientes.js (`movimientosSellOutClientes` de un
 * distribuidor) pero agregado por Marca en vez de por Cliente: cuántas
 * unidades vende cada marca, a cuántos clientes distintos, y cómo evoluciona
 * frente al mismo periodo elegido para comparar (mismo componente
 * `PeriodoComparador.js` que el resto de dashboards de la app).
 *
 * Estados por marca (mismo concepto que Activo/Nuevo/Recuperado/Perdido de
 * clientes, aplicado a nivel de marca):
 *   Activa: se vendió en el periodo actual Y en el periodo de comparación.
 *   Nueva: se vende ahora y nunca se había vendido antes a este distribuidor.
 *   Recuperada: se vende ahora, no en el periodo de comparación, pero SÍ en
 *     algún mes anterior al periodo actual (no es la primera vez).
 *   Perdida: se vendió en el periodo de comparación y no se vende ahora.
 * Solo se listan marcas con actividad en el periodo actual y/o en el de
 * comparación — igual que en el dashboard de clientes.
 *
 * De momento esta pantalla NO cruza cliente×marca (qué marcas compra cada
 * cliente concreto) — Sergio lo mencionó como posible ampliación futura,
 * pendiente de confirmar si hace falta.
 *
 * "Corregir marca" (2026-07-18, a petición de Sergio: detectó una marca con
 * unidades que a todas luces pertenecían a otra — p.ej. "PALOMO COJO 3L"
 * había absorbido ventas que en realidad eran de "Palomo Cojo DO Rueda").
 * Causa típica: un texto de producto genérico del archivo (sin indicar
 * formato) se reconcilió, en su día, contra la marca equivocada durante la
 * importación — y desde que existe la "memoria de alias" (ver
 * ImportarSellOutClientes.js/firebaseApi.js sección 21g-21h), esa decisión
 * errónea se repite sola en cada importación siguiente sin volver a
 * preguntar. Cada fila de la tabla tiene un botón "Corregir" que abre un
 * modal para: elegir la marca correcta, elegir en qué meses corregirlo
 * (normalmente todos los que tiene esa marca) y, si existe, borrar el alias
 * guardado que causó el error para que no se repita en la próxima
 * importación. Usa `reasignarMarcaSellOutClientesPorMeses` (firebaseApi.js),
 * que es más quirúrgica que "Fusionar Marcas": solo mueve los movimientos de
 * ESOS meses concretos, sin tocar el resto de ventas legítimas de la marca
 * de origen (que puede seguir siendo un producto real).
 *
 * Facturación (€) (2026-07-19, a petición de Sergio: "aquí también hay que
 * incluir la facturación igual que en la de clientes") — mismo patrón que
 * DashboardSellOutClientes.js: se suma `facturacion_euros` de cada
 * movimiento por marca, con su propia comparativa y variación, tarjeta KPI
 * aparte y columnas de tabla separadas con un borde vertical del resto. OJO:
 * mismo aviso que en Clientes, solo los movimientos importados DESPUÉS de
 * que se añadiera ese campo traen este dato.
 *
 * SELECTOR DE DISTRIBUIDOR MÚLTIPLE (2026-08-25, a petición de Sergio:
 * "tiene que estar la opción de poder escoger a uno, varios o todos los
 * distribuidores, esto tiene que ser para sell out por cliente y marca") —
 * mismo cambio que DashboardSellOutClientes.js (ver el comentario extenso
 * allí): `idsDistribuidores` pasa a ser estado LOCAL de esta pantalla (ya no
 * el selector global compartido con "Gestión por Distribuidor"), con
 * <FiltroMultiSelect vacioSignificaTodos={false}/>. La única diferencia real
 * con Clientes es cómo se agrupan las filas: aquí se agrupa por MARCA, y
 * `id_marca` es un id del catálogo GLOBAL (compartido por todos los
 * distribuidores) — si se agregaran movimientos de varios distribuidores
 * agrupando tal cual por `id_marca`, las ventas de la misma marca en
 * distribuidores distintos se MEZCLARÍAN en una sola fila, perdiendo de
 * vista de qué distribuidor viene cada una (lo contrario de lo que se pidió:
 * "todo junto, CON columna Distribuidor"). Por eso, con más de un
 * distribuidor elegido (`modoMultiDistribuidor`), antes de agregar se
 * sustituye `id_marca` por una clave compuesta `"idDistribuidor::idMarca"`
 * SOLO para la agrupación (`movimientosParaAgregacion` — `nombre_marca` no
 * se toca, así que se sigue viendo el nombre real de la marca); con un solo
 * distribuidor elegido no se toca nada y el comportamiento es idéntico al de
 * antes. "Corregir marca" (mueve movimientos de una marca real a otra) deja
 * de tener sentido con varios distribuidores a la vez — se oculta esa
 * columna y el modal en ese caso, ver más abajo.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getMovimientosSellOutClientesPorDistribuidor, getAliasProductosSellOutPorDistribuidor, reasignarMarcaSellOutClientesPorMeses, deleteDocument } from './firebaseApi';
import {
  inputClasses, filtroContenedor, etiqueta, tarjeta,
  tdClasses, colorPorSigno,
  kpiCard, kpiTitulo, tituloPantalla, subtitulo,
  botonSecundario, botonExito
} from './uiClasses';
import TablaOrdenable from './TablaOrdenable';
import PeriodoComparador from './PeriodoComparador';
// formatearPeriodo/FilaComparativa/FiltroSelect/FiltroTexto (2026-07-19, a
// petición de Sergio: "todo estos últimos cambios tiene que hacerse en las
// dos pestañas de Cliente y Marca") — compartidos con
// DashboardSellOutClientes.js, ver cabecera de cada archivo.
import { formatearPeriodo, entradaAMesesAno } from './formatearPeriodo';
import FilaComparativa from './FilaComparativa';
import FiltroTexto from './FiltroTexto';
// Zona/Preventista/Cliente usan selección múltiple con casillas (2026-07-19,
// tercera vuelta a petición de Sergio: "tiene que ser un filtro donde pueda
// seleccionar los clientes que quiera o deseleccionar los que no quiera...
// los demás filtros también tienen que tener esa opción, igual quiero
// seleccionar dos zonas o a 4 comerciales") — ver cabecera de
// FiltroMultiSelect.js. Mismo componente que DashboardSellOutClientes.js.
import FiltroMultiSelect from './FiltroMultiSelect';
// La agregación por periodo (uds/€/estado/variaciones) es idéntica a la de
// DashboardSellOutClientes.js salvo por el campo de agrupación, así que vive
// en un módulo propio y compartido — ver cabecera de ese archivo.
import { agregarSellOutPorPeriodo } from './agregacionSellOutPorPeriodo';

const formateadorNumero = new Intl.NumberFormat('es-ES');
const formateadorEuros = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

// Mapeo de código de comercial (C.CIAL/Zona) a nombre de zona — mismo mapeo
// que DashboardSellOutClientes.js (confirmado por Sergio, 2026-07-18).
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
const ETIQUETA_ESTADO = { activo: 'Activa', nuevo: 'Nueva', recuperado: 'Recuperada', perdido: 'Perdida' };

// idsDistribuidores: estado LOCAL de esta pantalla (array de ids), ya NO
// compartido con "Gestión por Distribuidor" — ver comentario de cabecera
// "SELECTOR DE DISTRIBUIDOR MÚLTIPLE" (2026-08-25).
function DashboardSellOutMarcas({ idUsuario, listaDistribuidores, marcasGlobales }) {
  const [idsDistribuidores, setIdsDistribuidores] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [cargando, setCargando] = useState(false);

  // id -> nombre_distribuidor, para la columna "Distribuidor" y el mensaje
  // de "Corregir marca". true con más de un distribuidor elegido a la vez.
  const mapaNombreDistribuidor = useMemo(() => {
    const m = new Map();
    (listaDistribuidores || []).forEach(d => m.set(d.id, d.nombre_distribuidor));
    return m;
  }, [listaDistribuidores]);
  const modoMultiDistribuidor = idsDistribuidores.length > 1;

  // [{ anio, meses }, ...] — uno por año marcado en PeriodoComparador, todos
  // con el mismo conjunto de meses (índices 0-11), como en DashboardSellOutClientes.js.
  const [rangosPorAnio, setRangosPorAnio] = useState([]);

  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [busqueda, setBusqueda] = useState('');
  const [filtroZona, setFiltroZona] = useState([]);
  const [filtroPreventista, setFiltroPreventista] = useState([]);
  const [filtroClienteId, setFiltroClienteId] = useState([]);

  // --- Modal "Corregir marca" (solo disponible con UN distribuidor elegido
  // — ver comentario de cabecera) ---
  const [marcaACorregir, setMarcaACorregir] = useState(null); // fila de filasMarcas, o null si el modal está cerrado
  const [marcaDestinoId, setMarcaDestinoId] = useState('');
  const [mesesCorregirSeleccionados, setMesesCorregirSeleccionados] = useState(new Set());
  const [aliasRelacionados, setAliasRelacionados] = useState([]);
  const [aliasABorrar, setAliasABorrar] = useState(new Set());
  const [cargandoAlias, setCargandoAlias] = useState(false);
  const [corrigiendo, setCorrigiendo] = useState(false);

  // Carga en paralelo los movimientos de CADA distribuidor elegido y los
  // junta en un único array — mismo patrón que DashboardSellOutClientes.js
  // (ver el comentario extenso allí sobre la caché por-distribuidor).
  const cargarMovimientos = useCallback(async () => {
    if (!idsDistribuidores.length || !idUsuario) { setMovimientos([]); return; }
    setCargando(true);
    try {
      const resultadosPorDistribuidor = await Promise.all(
        idsDistribuidores.map(id => getMovimientosSellOutClientesPorDistribuidor(idUsuario, id))
      );
      setMovimientos(resultadosPorDistribuidor.flat());
    } catch (error) {
      console.error('Error cargando Sell-Out por Marca:', error);
      alert('No se pudieron cargar los datos de los distribuidores elegidos: ' + error.message);
    }
    setCargando(false);
  }, [idUsuario, idsDistribuidores]);

  useEffect(() => { cargarMovimientos(); }, [cargarMovimientos]);

  // Al cambiar la selección de distribuidor(es), los filtros de
  // zona/preventista/cliente de la selección anterior ya no tienen sentido
  // (mismo motivo que DashboardSellOutClientes.js).
  useEffect(() => {
    setFiltroZona([]);
    setFiltroPreventista([]);
    setFiltroClienteId([]);
  }, [idsDistribuidores]);

  // Opciones de los desplegables de filtro — solo códigos/nombres que de
  // verdad aparecen en los movimientos del distribuidor elegido.
  const opcionesZona = useMemo(() => {
    const codigos = new Set();
    movimientos.forEach(m => { if (m.comercial) codigos.add(m.comercial); });
    return Array.from(codigos).sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0));
  }, [movimientos]);

  const opcionesPreventista = useMemo(() => {
    const set = new Set();
    movimientos.forEach(m => { if (m.preventista) set.add(m.preventista); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [movimientos]);

  const opcionesCliente = useMemo(() => {
    const mapa = new Map();
    movimientos.forEach(m => { if (m.id_cliente && !mapa.has(m.id_cliente)) mapa.set(m.id_cliente, m.nombre_cliente); });
    return [...mapa.entries()]
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [movimientos]);

  // Movimientos ya filtrados por zona/preventista/cliente — se usan para la
  // agregación por marca y los KPIs en vez de `movimientos` directamente
  // (el modal "Corregir marca" sigue usando `movimientos` sin filtrar a
  // propósito, porque corrige datos de verdad, no una vista).
  const movimientosFiltrados = useMemo(() => {
    if (filtroZona.length === 0 && filtroPreventista.length === 0 && filtroClienteId.length === 0) return movimientos;
    return movimientos.filter(m => {
      if (filtroZona.length > 0 && !filtroZona.includes(m.comercial)) return false;
      if (filtroPreventista.length > 0 && !filtroPreventista.includes(m.preventista)) return false;
      if (filtroClienteId.length > 0 && !filtroClienteId.includes(m.id_cliente)) return false;
      return true;
    });
  }, [movimientos, filtroZona, filtroPreventista, filtroClienteId]);

  // Meses con algún dato importado.
  const mesesDisponibles = useMemo(() => {
    const set = new Set();
    movimientos.forEach(m => { if (m.mes_ano) set.add(m.mes_ano); });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [movimientos]);

  // Años que existen de verdad en el histórico importado de este
  // distribuidor — se pasan tal cual a PeriodoComparador (nunca hardcodeados).
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
  // existir si solo se marca un año).
  const entryBase = rangosPorAnio.length > 0 ? rangosPorAnio[rangosPorAnio.length - 1] : null;
  const entryComparacion = rangosPorAnio.length > 1 ? rangosPorAnio[rangosPorAnio.length - 2] : null;

  const mesesPeriodoActual = useMemo(() => entradaAMesesAno(entryBase), [entryBase]);
  const mesesPeriodoAnterior = useMemo(() => entradaAMesesAno(entryComparacion), [entryComparacion]);

  const setMesesActual = useMemo(() => new Set(mesesPeriodoActual), [mesesPeriodoActual]);
  const setMesesAnterior = useMemo(() => new Set(mesesPeriodoAnterior), [mesesPeriodoAnterior]);
  // Primer mes del periodo actual — para decidir si una venta fuera de los
  // dos periodos es "de antes" (Recuperada) o no.
  const inicioPeriodoActual = useMemo(
    () => (mesesPeriodoActual.length > 0 ? mesesPeriodoActual.slice().sort()[0] : ''),
    [mesesPeriodoActual]
  );

  const periodoActualLabel = formatearPeriodo(entryBase);
  const periodoAnteriorLabel = formatearPeriodo(entryComparacion);

  // Solo se activa con más de un distribuidor elegido (ver comentario de
  // cabecera "SELECTOR DE DISTRIBUIDOR MÚLTIPLE"): sustituye `id_marca` por
  // una clave compuesta "idDistribuidor::idMarca" ÚNICAMENTE para que la
  // agregación de abajo agrupe cada marca POR DISTRIBUIDOR en vez de
  // mezclar las ventas de la misma marca en distintos distribuidores en una
  // sola fila. `nombre_marca` no se toca — la fila sigue mostrando el
  // nombre real de la marca, no la clave compuesta.
  const movimientosParaAgregacion = useMemo(() => {
    if (!modoMultiDistribuidor) return movimientosFiltrados;
    return movimientosFiltrados.map(mv => ({ ...mv, id_marca: `${mv.id_distribuidor}::${mv.id_marca}` }));
  }, [movimientosFiltrados, modoMultiDistribuidor]);

  // --------------------------------------------------------------
  // Agregación por marca
  // --------------------------------------------------------------
  const filasMarcas = useMemo(() => {
    if (mesesPeriodoActual.length === 0) return [];

    // Mismo bucle de agregación que DashboardSellOutClientes.js, en un
    // módulo compartido (ver cabecera de agregacionSellOutPorPeriodo.js).
    // Dos diferencias respecto a Clientes, las dos a propósito:
    //  - se parte de `movimientosParaAgregacion` (== movimientosFiltrados
    //    salvo con varios distribuidores elegidos, ver arriba): aquí el
    //    filtro de Zona/Preventista/Cliente se aplica ANTES, sobre los
    //    movimientos crudos, porque cada línea trae su propia zona y una
    //    MARCA no tiene zona propia (no es un atributo de la entidad
    //    agrupada).
    //  - sin `camposArrastre` propio salvo 'id_distribuidor' (solo con
    //    varios elegidos, para la columna "Distribuidor"): no hay
    //    tipología/zona/preventista que arrastrar a la fila de una marca.
    const filas = agregarSellOutPorPeriodo({
      movimientos: movimientosParaAgregacion,
      campoId: 'id_marca',
      campoNombre: 'nombre_marca',
      campoDistinto: 'id_cliente',
      prefijoDistintos: 'clientes',
      setMesesActual,
      setMesesAnterior,
      inicioPeriodoActual,
      camposArrastre: modoMultiDistribuidor ? ['id_distribuidor'] : undefined
    });

    return modoMultiDistribuidor
      ? filas.map(f => ({ ...f, nombreDistribuidor: mapaNombreDistribuidor.get(f.id_distribuidor) || f.id_distribuidor }))
      : filas;
  }, [movimientosParaAgregacion, mesesPeriodoActual, setMesesActual, setMesesAnterior, inicioPeriodoActual, modoMultiDistribuidor, mapaNombreDistribuidor]);

  // filasBase: filasMarcas + búsqueda por nombre, SIN el filtro de estado
  // (zona/preventista/cliente ya están aplicados más arriba, dentro de
  // movimientosFiltrados → filasMarcas). Se usa para los contadores de las
  // píldoras "Filtro por estado" y para los 4 KPI de "Movimiento de
  // marcas" — a propósito no respeta el propio filtro de estado, igual que
  // en DashboardSellOutClientes.js: si lo respetara, marcar "Nuevas" pondría
  // Activas/Recuperadas/Perdidas a 0, y dejarían de servir de referencia.
  const filasBase = useMemo(
    () => filasMarcas.filter(f => !busqueda || f.nombre_marca.toLowerCase().includes(busqueda.toLowerCase())),
    [filasMarcas, busqueda]
  );

  const filasFiltradas = useMemo(
    () => filasBase.filter(f => filtroEstado === 'todos' || f.estado === filtroEstado),
    [filasBase, filtroEstado]
  );

  // --------------------------------------------------------------
  // Totales sobre filasFiltradas (a petición de Sergio, 2026-07-19: "los
  // KPI deberían cambiar cuando se hace algún filtro") — mismo patrón que
  // totalesFiltrados en DashboardSellOutClientes.js. "Clientes que
  // compraron" se recalcula desde movimientosFiltrados restringido a las
  // marcas que pasan el filtro (no puede sumarse la columna "Clientes" de
  // cada marca — un mismo cliente que compra varias marcas se contaría
  // varias veces).
  // --------------------------------------------------------------
  const totalesFiltrados = useMemo(() => {
    const totalActual = filasFiltradas.reduce((a, f) => a + f.udsActual, 0);
    const totalAnterior = filasFiltradas.reduce((a, f) => a + f.udsAnterior, 0);
    const diferencia = totalActual - totalAnterior;
    const variacion = totalAnterior > 0 ? (diferencia / totalAnterior) * 100 : (totalActual > 0 ? null : 0);

    const facturacionActual = filasFiltradas.reduce((a, f) => a + f.facturacionActual, 0);
    const facturacionAnterior = filasFiltradas.reduce((a, f) => a + f.facturacionAnterior, 0);
    const diferenciaEuros = facturacionActual - facturacionAnterior;
    const variacionEuros = facturacionAnterior > 0 ? (diferenciaEuros / facturacionAnterior) * 100 : (facturacionActual > 0 ? null : 0);

    // OJO: contra `movimientosParaAgregacion`, no `movimientosFiltrados` —
    // con varios distribuidores elegidos, `filasFiltradas[].id_marca` es la
    // clave compuesta "idDistribuidor::idMarca" (ver `movimientosParaAgregacion`
    // más arriba), así que hay que comparar contra movimientos que también
    // tengan esa misma clave compuesta en `id_marca`, o nunca habría match.
    const idsMarcasFiltradas = new Set(filasFiltradas.map(f => f.id_marca));
    const clientesActualSet = new Set();
    const clientesAnteriorSet = new Set();
    movimientosParaAgregacion.forEach(mv => {
      if (!mv.id_marca || !idsMarcasFiltradas.has(mv.id_marca) || (mv.uds_totales || 0) === 0 || !mv.id_cliente) return;
      if (setMesesActual.has(mv.mes_ano)) clientesActualSet.add(mv.id_cliente);
      else if (setMesesAnterior.has(mv.mes_ano)) clientesAnteriorSet.add(mv.id_cliente);
    });
    const varClientes = clientesAnteriorSet.size > 0
      ? ((clientesActualSet.size - clientesAnteriorSet.size) / clientesAnteriorSet.size) * 100
      : (clientesActualSet.size > 0 ? null : 0);

    return {
      totalActual, totalAnterior, diferencia, variacion,
      facturacionActual, facturacionAnterior, diferenciaEuros, variacionEuros,
      clientesActual: clientesActualSet.size,
      clientesAnterior: clientesAnteriorSet.size,
      varClientes
    };
  }, [filasFiltradas, movimientosParaAgregacion, setMesesActual, setMesesAnterior]);

  // KPIs de "Movimiento de marcas" — sobre filasBase (ver comentario arriba).
  const statusCounts = useMemo(() => ({
    activas: filasBase.filter(f => f.estado === 'activo').length,
    nuevas: filasBase.filter(f => f.estado === 'nuevo').length,
    recuperadas: filasBase.filter(f => f.estado === 'recuperado').length,
    perdidas: filasBase.filter(f => f.estado === 'perdido').length,
  }), [filasBase]);

  // --------------------------------------------------------------
  // Modal "Corregir marca"
  // --------------------------------------------------------------
  // Todos los meses en los que esta marca tiene algún movimiento con este
  // distribuidor — preseleccionados todos por defecto (lo más habitual es
  // que el error se repita en todas las importaciones desde que empezó).
  const mesesDeMarcaACorregir = useMemo(() => {
    if (!marcaACorregir) return [];
    const set = new Set();
    movimientos.forEach(mv => { if (mv.id_marca === marcaACorregir.id_marca && mv.mes_ano) set.add(mv.mes_ano); });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [marcaACorregir, movimientos]);

  const filasAfectadasPreview = useMemo(() => {
    if (!marcaACorregir) return 0;
    return movimientos.filter(mv => mv.id_marca === marcaACorregir.id_marca && mesesCorregirSeleccionados.has(mv.mes_ano)).length;
  }, [marcaACorregir, movimientos, mesesCorregirSeleccionados]);

  const abrirModalCorregir = async (fila) => {
    setMarcaACorregir(fila);
    setMarcaDestinoId('');
    setAliasRelacionados([]);
    setAliasABorrar(new Set());
    setCargandoAlias(true);
    try {
      const alias = await getAliasProductosSellOutPorDistribuidor(idUsuario, idsDistribuidores[0]);
      const relacionados = alias.filter(a => a.id_marca === fila.id_marca);
      setAliasRelacionados(relacionados);
      setAliasABorrar(new Set(relacionados.map(a => a.id))); // marcados por defecto, se pueden desmarcar
    } catch (error) {
      console.error('Error comprobando alias guardados:', error);
    }
    setCargandoAlias(false);
  };

  // Los meses a corregir se preseleccionan (todos) en cuanto se conoce la
  // marca a corregir — en un efecto aparte porque dependen de `movimientos`,
  // que puede tardar en estar filtrado la primera vez.
  useEffect(() => {
    if (marcaACorregir) setMesesCorregirSeleccionados(new Set(mesesDeMarcaACorregir));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marcaACorregir]);

  const cerrarModalCorregir = () => {
    setMarcaACorregir(null);
    setMarcaDestinoId('');
    setMesesCorregirSeleccionados(new Set());
    setAliasRelacionados([]);
    setAliasABorrar(new Set());
  };

  const toggleMesCorregir = (mes) => {
    setMesesCorregirSeleccionados(prev => {
      const next = new Set(prev);
      next.has(mes) ? next.delete(mes) : next.add(mes);
      return next;
    });
  };

  const toggleAliasABorrar = (id) => {
    setAliasABorrar(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleConfirmarCorreccion = async () => {
    if (!marcaDestinoId) { alert('Elige a qué marca hay que reasignar estos movimientos.'); return; }
    if (marcaDestinoId === marcaACorregir.id_marca) { alert('Elige una marca distinta de la que estás corrigiendo.'); return; }
    if (mesesCorregirSeleccionados.size === 0) { alert('Marca al menos un mes a corregir.'); return; }
    const marcaDestino = (marcasGlobales || []).find(m => m.id === marcaDestinoId);
    if (!marcaDestino) { alert('No se ha encontrado esa marca.'); return; }

    if (!window.confirm(
      `Vas a mover ${filasAfectadasPreview} fila(s) de "${marcaACorregir.nombre_marca}" a "${marcaDestino.nombre_marca}" ` +
      `(solo en los meses marcados). Esta acción no se puede deshacer. ¿Continuar?`
    )) return;

    setCorrigiendo(true);
    try {
      const movidos = await reasignarMarcaSellOutClientesPorMeses(
        idUsuario, idsDistribuidores[0], marcaACorregir.id_marca, marcaDestino.id, marcaDestino.nombre_marca,
        [...mesesCorregirSeleccionados]
      );
      for (const idAlias of aliasABorrar) {
        await deleteDocument('aliasProductosSellOut', idAlias);
      }
      await cargarMovimientos();
      cerrarModalCorregir();
      alert(
        `Corregido: ${movidos} fila(s) movidas a "${marcaDestino.nombre_marca}"` +
        (aliasABorrar.size > 0 ? `. Se borraron ${aliasABorrar.size} alias guardado(s) para que no se repita.` : '.')
      );
    } catch (error) {
      console.error('Error corrigiendo marca:', error);
      alert('Error al corregir: ' + error.message);
    }
    setCorrigiendo(false);
  };

  // Columnas de la tabla de marcas, para TablaOrdenable.js (26/07/2026, ver
  // el mismo cambio en DashboardSellOutClientes.js/PantallaAvisosConsumo.js).
  const BORDE_GRUPO_CABECERA = 'border-l-2 !border-l-slate-300 dark:!border-l-slate-600';
  const BORDE_GRUPO_CELDA = 'border-l-2 !border-l-slate-200 dark:!border-l-slate-700';
  const columnasMarcas = [
    { titulo: 'Marca', valor: (f) => f.nombre_marca, render: (f) => f.nombre_marca },
    // Columna "Distribuidor" (2026-08-25, selector múltiple): solo con más
    // de un distribuidor elegido a la vez — igual que en
    // DashboardSellOutClientes.js.
    ...(modoMultiDistribuidor ? [
      { titulo: 'Distribuidor', valor: (f) => f.nombreDistribuidor || '', render: (f) => f.nombreDistribuidor || '—' }
    ] : []),
    {
      titulo: 'Estado', valor: (f) => f.estado,
      render: (f) => <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${BADGE_ESTADO[f.estado]}`}>{ETIQUETA_ESTADO[f.estado]}</span>,
    },
    { titulo: 'Uds. periodo', derecha: true, valor: (f) => f.udsActual, render: (f) => formateadorNumero.format(f.udsActual) },
    { titulo: 'Uds. año anterior', derecha: true, valor: (f) => f.udsAnterior, render: (f) => formateadorNumero.format(f.udsAnterior) },
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
      titulo: 'Clientes', derecha: true, claseCabecera: BORDE_GRUPO_CABECERA, claseCelda: BORDE_GRUPO_CELDA,
      valor: (f) => f.clientesActual, render: (f) => f.clientesActual,
    },
    { titulo: 'Clientes año anterior', derecha: true, valor: (f) => f.clientesAnterior, render: (f) => f.clientesAnterior },
    { titulo: 'Última venta', valor: (f) => f.ultimaFecha || '', render: (f) => f.ultimaFecha || '—' },
    // "Corregir marca" mueve movimientos de una marca real a otra en UN
    // distribuidor concreto — deja de tener sentido (y `id_marca` ya no es
    // el id real, ver `movimientosParaAgregacion`) con varios distribuidores
    // elegidos a la vez, así que se oculta la columna entera.
    ...(!modoMultiDistribuidor ? [{
      titulo: '',
      render: (f) => (
        <button
          type="button"
          onClick={() => abrirModalCorregir(f)}
          className="!bg-slate-200 dark:!bg-slate-700 hover:!bg-slate-300 dark:hover:!bg-slate-600 !text-slate-700 dark:!text-slate-100 !border-0 !font-medium text-[11px] px-2 py-1 rounded whitespace-nowrap"
          title="Estas unidades pertenecen en realidad a otra marca"
        >
          Corregir marca
        </button>
      ),
    }] : []),
  ];

  return (
    <div>
      <h2 className={tituloPantalla}>Sell-Out por Marca</h2>
      <p className={subtitulo}>Elige uno, varios o todos los distribuidores para ver cómo evoluciona cada marca: cuánto vende, a cuántos clientes distintos y cómo cambia frente al periodo de comparación.</p>

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
            label="Buscar marca"
            value={busqueda}
            onChange={setBusqueda}
            placeholder="Nombre de la marca..."
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
          <p className="text-sm text-slate-500 dark:text-slate-400">Elige uno o varios distribuidores arriba para ver sus marcas.</p>
        </div>
      )}

      {idsDistribuidores.length > 0 && cargando && (
        <div className="text-slate-500 dark:text-slate-400">Cargando datos de los distribuidores elegidos...</div>
      )}

      {idsDistribuidores.length > 0 && !cargando && mesesDisponibles.length === 0 && (
        <div className={tarjeta}>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {modoMultiDistribuidor
              ? 'Estos distribuidores todavía no tienen ningún dato de Sell-Out por Cliente importado.'
              : 'Este distribuidor todavía no tiene ningún dato de Sell-Out por Cliente importado.'}
          </p>
        </div>
      )}

      {idsDistribuidores.length > 0 && !cargando && mesesDisponibles.length > 0 && (
        <>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            {entryComparacion
              ? <>Comparando <strong>{periodoActualLabel}</strong> frente a <strong>{periodoAnteriorLabel}</strong>.</>
              : <>Mostrando <strong>{periodoActualLabel}</strong> — marca un segundo año en "Qué años comparar" arriba para ver la evolución interanual (nuevas/recuperadas/perdidas).</>}
          </p>

          {/* KPIs — mismo patrón que DashboardSellOutClientes.js (ver
              comentario extenso allí): comparativa horizontal centrada vía
              <FilaComparativa/>, grid con nº fijo de columnas, y todos
              alimentados por `totalesFiltrados`/`statusCounts` para que
              reaccionen a Zona/Preventista/Cliente/Búsqueda (y, en el caso
              de Uds. totales, también al filtro de Estado). */}
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
                <div className={kpiTitulo}>Clientes que compraron</div>
                <FilaComparativa
                  valorActual={String(totalesFiltrados.clientesActual)}
                  periodoActualLabel={periodoActualLabel}
                  valorAnterior={entryComparacion ? String(totalesFiltrados.clientesAnterior) : null}
                  periodoAnteriorLabel={periodoAnteriorLabel}
                  variacion={totalesFiltrados.varClientes}
                />
              </div>
            </div>

            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">
              Movimiento de marcas {entryComparacion ? <>({periodoActualLabel} vs {periodoAnteriorLabel})</> : null}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className={kpiCard + ' flex flex-col items-center text-center'}>
                <div className={kpiTitulo}>Activas</div>
                <div className="text-3xl font-bold !text-emerald-600 dark:!text-emerald-400">{statusCounts.activas}</div>
              </div>
              <div className={kpiCard + ' flex flex-col items-center text-center'}>
                <div className={kpiTitulo}>Nuevas</div>
                <div className="text-3xl font-bold !text-sky-600 dark:!text-sky-400">{statusCounts.nuevas}</div>
              </div>
              <div className={kpiCard + ' flex flex-col items-center text-center'}>
                <div className={kpiTitulo}>Recuperadas</div>
                <div className="text-3xl font-bold !text-indigo-600 dark:!text-indigo-400">{statusCounts.recuperadas}</div>
              </div>
              <div className={kpiCard + ' flex flex-col items-center text-center'}>
                <div className={kpiTitulo}>Perdidas</div>
                <div className="text-3xl font-bold !text-red-600 dark:!text-red-400">{statusCounts.perdidas}</div>
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
                {est === 'todos' ? `Todas (${filasBase.length})` : `${ETIQUETA_ESTADO[est]} (${filasBase.filter(f => f.estado === est).length})`}
              </button>
            ))}
          </div>

          {/* Tabla de marcas */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-700">
            {filasFiltradas.length === 0 ? (
              <p className={`${tdClasses} p-3`}>No hay marcas que cumplan este filtro.</p>
            ) : (
              <TablaOrdenable filas={filasFiltradas} columnas={columnasMarcas} keyExtractor={(f) => f.id_marca} />
            )}
          </div>
        </>
      )}

      {/* Modal "Corregir marca" */}
      {marcaACorregir && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 max-w-lg w-full max-h-[85vh] overflow-y-auto">
            <h4 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
              Corregir marca: "{marcaACorregir.nombre_marca}"
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Mueve los movimientos de esta marca (solo en los meses que marques) a la marca correcta. No afecta a
              otros meses ni a otras marcas.
            </p>

            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Marca correcta</label>
            <select value={marcaDestinoId} onChange={e => setMarcaDestinoId(e.target.value)} className={`${inputClasses} w-full mb-4`}>
              <option value="">-- Elegir marca --</option>
              {(marcasGlobales || [])
                .filter(m => m.id !== marcaACorregir.id_marca)
                .map(m => <option key={m.id} value={m.id}>{m.nombre_marca}</option>)}
            </select>

            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Meses a corregir ({mesesDeMarcaACorregir.length} con datos)
            </label>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {mesesDeMarcaACorregir.map(mes => (
                <button
                  key={mes}
                  type="button"
                  onClick={() => toggleMesCorregir(mes)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold !border-0 transition-colors ${
                    mesesCorregirSeleccionados.has(mes) ? 'bg-indigo-50 dark:bg-indigo-500/15 !text-indigo-700 dark:!text-indigo-300' : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {mes}
                </button>
              ))}
            </div>

            {cargandoAlias && <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Comprobando alias guardados...</p>}
            {!cargandoAlias && aliasRelacionados.length > 0 && (
              <div className="mb-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/40 rounded-lg p-3">
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1">
                  Este distribuidor tiene {aliasRelacionados.length} texto(s) de producto recordado(s) que apuntan a
                  "{marcaACorregir.nombre_marca}" — si es la causa del error, bórralos para que no se repita en la
                  próxima importación:
                </p>
                <div className="space-y-1 mt-2">
                  {aliasRelacionados.map(a => (
                    <label key={a.id} className="flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
                      <input type="checkbox" checked={aliasABorrar.has(a.id)} onChange={() => toggleAliasABorrar(a.id)} />
                      "{a.producto_normalizado}"
                    </label>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-slate-600 dark:text-slate-300 mb-4">
              Se moverán <strong>{filasAfectadasPreview}</strong> fila(s).
            </p>

            <div className="flex gap-2">
              <button
                onClick={handleConfirmarCorreccion}
                disabled={corrigiendo || filasAfectadasPreview === 0}
                className={botonExito}
              >
                {corrigiendo ? 'Corrigiendo...' : 'Confirmar corrección'}
              </button>
              <button onClick={cerrarModalCorregir} disabled={corrigiendo} className={botonSecundario}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DashboardSellOutMarcas;
