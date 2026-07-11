/*
 * PantallaDashboard.js (Versión 8.2 - Selector de periodo unificado)
 * Cambios sobre la 8.1:
 *  - El selector de fechas (Desde/Hasta + botones de acceso rápido "Solo
 *    <año>"/"Solo <año-1>"/"<año-1> y <año>"/"Todo el histórico") se
 *    sustituye por PeriodoComparador.js, el mismo componente ya usado en el
 *    Dashboard de Ventas Reales — a petición explícita de reutilizar
 *    exactamente ese selector aquí también.
 *  - IMPORTANTE — alcance de este cambio: SOLO el selector de fechas. El
 *    resto de la lógica de este dashboard sigue igual que antes: sigue
 *    siendo un único conjunto de datos filtrado (no hay "año base" vs "año
 *    de comparación" como en Ventas Reales, ni KPIs/gráficos duplicados por
 *    año). Si en el futuro se quiere esa comparativa completa aquí también,
 *    es un cambio bastante más grande, ya comentado con el usuario y
 *    pospuesto a propósito.
 *  - Como PeriodoComparador entrega `rangosPorAnio` (un array de
 *    { anio, meses }, con `meses` como índices 0-11 no necesariamente
 *    consecutivos — soporta trimestres/semestres sueltos y combinaciones de
 *    meses cualquiera), el viejo filtro `enRango(mesAno, fechaInicio,
 *    fechaFin)` — que solo sabía comparar un tramo contiguo — deja de tener
 *    sentido. Se sustituye por un Set de strings "YYYY-MM" (construido a
 *    partir de rangosPorAnio) y una comprobación de pertenencia simple.
 *  - El resto de comentarios de versiones anteriores (8.1, 8.0) se dejan
 *    íntegros más abajo por contexto histórico.
 *
 * --- Comentarios de la versión 8.1 (Rediseño visual Fase 3) ---
 *  - Gráfico "A&P Generado vs. Gastado por Marca": ahora es de barras
 *    horizontales (evita que se corten nombres de marca largos), ordenado
 *    de forma descendente por A&P Generado, con colores gold/wine.
 *  - Gráfico "Composición del A&P Gastado": pasa de pie a donut (recorte
 *    central ~70%), sin etiquetas dentro de las porciones y con el total
 *    gastado superpuesto en el centro. La leyenda externa con nombre/€/%
 *    ya existía como desglose en HTML debajo del gráfico.
 *  - La lógica de datos (cálculo de KPIs, filtros, agregaciones) NO cambia
 *    salvo el criterio de orden del Top 10 por marca (antes actividad
 *    total, ahora A&P Generado).
 *
 * --- Comentarios de la versión 8.0 (sobre la 7.0) ---
 *  - Toda la maquetación pasa de estilos inline a Tailwind CSS, con soporte
 *    de modo oscuro (coherente con el sidebar de Layout.js).
 *  - Tarjetas KPI con icono y color por categoría (estilo "metric card").
 *  - Los gráficos (recharts) se recolorean dinámicamente en modo oscuro
 *    (rejilla, ejes, tooltip, leyenda) mediante el hook useDarkMode.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  getMarcasGlobales,
  getDistribuidoresPorUsuario,
  getHistoricoSellInGeneral,
  getHistoricoSellOutGeneral
} from './firebaseApi';
import { valorRegaladas, valorMuestras, valorAcuerdo, valorAportacionManual, generadoSellIn, gastoTotal } from './calculosAP';
import { Coins, CreditCard, Scale } from 'lucide-react';
import { inputClasses, botonPrimario, botonSecundario, botonExito, filtroContenedor, colorPorSigno } from './uiClasses';
import PeriodoComparador from './PeriodoComparador';
// Exportar a PDF (resumen ejecutivo de KPIs), a petición de Sergio — ver
// pdfExport.js para el porqué de que sea un resumen y no un volcado.
import { crearDocumentoPdf, añadirTablaKpis, descargarPdf } from './pdfExport';

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell, LineChart, Line,
  ResponsiveContainer, CartesianGrid
} from 'recharts';

// Colores FIJOS por categoría (no por posición en el array) para que cada
// categoría del "Composición del A&P Gastado" tenga siempre el mismo color,
// aparezca o no alguna de las otras categorías.
const COLOR_POR_CATEGORIA = {
  'Regaladas': '#6366F1',
  'Muestras': '#10B981',
  'Acuerdo': '#F59E0B',
  'Aportación directa': '#EF4444'
};
const COLORS = ['#6366F1', '#10B981', '#F59E0B', '#EF4444'];
// Colores del rediseño visual (Fase 3) para el gráfico "A&P Generado vs.
// Gastado por Marca": deben coincidir con los tokens "gold"/"wine" definidos
// en tailwind.config.js. Recharts pinta en SVG (prop "fill"), así que no
// puede tomar directamente una clase de Tailwind — de ahí que se repitan
// aquí como hex. Si se cambia el tono en tailwind.config.js, actualizar
// también estas dos constantes para que no se desincronicen.
const COLOR_GOLD = '#C9A227';
const COLOR_WINE = '#A13D52';
const formateadorMoneda = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
// Versión sin decimales para ejes (más limpio: "12.500 €" en vez de "12.500,00 €")
const formateadorMonedaCorta = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

// Detecta si el modo oscuro (clase "dark" en <html>, gestionada por Layout.js)
// está activo, y se mantiene sincronizado si el usuario cambia el toggle.
function useDarkMode() {
  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );
  useEffect(() => {
    const el = document.documentElement;
    const actualizar = () => setIsDark(el.classList.contains('dark'));
    const obs = new MutationObserver(actualizar);
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

// A partir de todos los movimientos, calcula el primer y último mes con datos.
// Devuelve null si no hay ningún movimiento (para poder usar un valor por defecto).
const calcularRangoDeDatos = (sellIn, sellOut) => {
  const meses = [...sellIn, ...sellOut].map(m => m.mes_ano).filter(Boolean);
  if (meses.length === 0) return null;
  let min = meses[0], max = meses[0];
  for (const m of meses) {
    if (m < min) min = m;
    if (m > max) max = m;
  }
  return { min, max };
};

// Convierte lo que entrega PeriodoComparador ([{ anio, meses }, ...], con
// `meses` en índice 0-11) en un Set de strings "YYYY-MM" — el mismo formato
// que ya usa `mov.mes_ano` en Firestore — para poder filtrar por simple
// pertenencia (`.has(...)`), sirva el periodo elegido para un tramo
// contiguo o para una combinación suelta de meses/trimestres/semestres.
const construirMesesPermitidos = (rangosPorAnio) => {
  const set = new Set();
  rangosPorAnio.forEach(({ anio, meses }) => {
    meses.forEach(m => set.add(`${anio}-${String(m + 1).padStart(2, '0')}`));
  });
  return set;
};

function PantallaDashboard({ idUsuario }) {

  const modoOscuro = useDarkMode();
  const colorEje = modoOscuro ? '#94a3b8' : '#6b7280';
  const colorGrid = modoOscuro ? '#334155' : '#e5e7eb';
  const tooltipContentStyle = {
    borderRadius: 8,
    fontSize: 13,
    ...(modoOscuro
      ? { backgroundColor: '#1e293b', border: '1px solid #334155', color: '#e2e8f0' }
      : { backgroundColor: '#ffffff', border: '1px solid #e5e7eb', color: '#111827' })
  };
  const legendStyle = { fontSize: 12, color: colorEje };

  const [mapaMarcas, setMapaMarcas] = useState(new Map());
  const [mapaDistribuidores, setMapaDistribuidores] = useState(new Map());
  const [distribuidores, setDistribuidores] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [rawSellIn, setRawSellIn] = useState([]);
  const [rawSellOut, setRawSellOut] = useState([]);
  const [cargando, setCargando] = useState(true);

  // Rango de meses que realmente tienen datos (se calcula tras cargar).
  const [rangoDisponible, setRangoDisponible] = useState(null);

  const anoActual = new Date().getFullYear();

  // El periodo (qué meses/trimestres/semestres/años) ya no vive en
  // `filtros` — lo controla PeriodoComparador y llega aquí a través de
  // `rangosPorAnio`. `filtros` se queda solo con Distribuidor/Marca.
  const [filtros, setFiltros] = useState({
    id_distribuidor: '',
    id_marca: ''
  });
  const [rangosPorAnio, setRangosPorAnio] = useState([]);

  // Nombre → id, para poder traducir el "nombre" que llega en el payload de
  // clic de una barra (los datos de los gráficos solo llevan el nombre) al
  // id que realmente usan `filtros.id_marca`/`id_distribuidor`.
  const mapaMarcaPorNombre = useMemo(() => {
    const mapa = new Map();
    marcas.forEach(m => mapa.set(m.nombre_marca, m.id));
    return mapa;
  }, [marcas]);
  const mapaDistribuidorPorNombreGestion = useMemo(() => {
    const mapa = new Map();
    distribuidores.forEach(d => mapa.set(d.nombre_distribuidor, d.id));
    return mapa;
  }, [distribuidores]);

  const [kpis, setKpis] = useState({ generado: 0, gastado: 0, diferencia: 0 });
  const [datosGrafico1, setDatosGrafico1] = useState([]); // Generado vs Gastado por Marca (top 10)
  const [datosGrafico2, setDatosGrafico2] = useState([]); // Composición del gasto
  const [datosGrafico3, setDatosGrafico3] = useState([]); // Top 5 Distribuidores por gasto
  const [datosGrafico4, setDatosGrafico4] = useState([]); // Evolución mensual

  // Años que existen de verdad en el histórico importado — se pasan tal
  // cual a PeriodoComparador (nunca hardcodeados), igual que en Ventas
  // Reales.
  const aniosDisponibles = useMemo(() => {
    if (!rangoDisponible) return [];
    const minY = parseInt(rangoDisponible.min.split('-')[0], 10);
    const maxY = parseInt(rangoDisponible.max.split('-')[0], 10);
    const arr = [];
    for (let y = minY; y <= maxY; y++) arr.push(y);
    return arr;
  }, [rangoDisponible]);

  useEffect(() => {
    if (!idUsuario) return;
    const cargar = async () => {
      setCargando(true);
      try {
        const [marcasGlobales, distris, sellIn, sellOut] = await Promise.all([
          getMarcasGlobales(),
          getDistribuidoresPorUsuario(idUsuario),
          getHistoricoSellInGeneral(idUsuario),
          getHistoricoSellOutGeneral(idUsuario)
        ]);

        setMarcas(marcasGlobales);
        setDistribuidores(distris);
        setRawSellIn(sellIn);
        setRawSellOut(sellOut);

        const mapaM = new Map(marcasGlobales.map(m => [m.id, m.nombre_marca]));
        const mapaD = new Map(distris.map(d => [d.id, d.nombre_distribuidor]));
        setMapaMarcas(mapaM);
        setMapaDistribuidores(mapaD);

        // Guardamos el rango real de datos para "aniosDisponibles" y para
        // el texto informativo de abajo. El primer cálculo de KPIs/gráficos
        // ya no se dispara aquí: en cuanto termine de cargar, se monta
        // PeriodoComparador con su valor por defecto (año actual completo,
        // ver más abajo) y su propio efecto dispara `onChange` →
        // `setRangosPorAnio` → el useEffect de más abajo llama a `procesar`.
        const rango = calcularRangoDeDatos(sellIn, sellOut);
        setRangoDisponible(rango);
      } catch (error) {
        console.error("Error cargando datos del dashboard:", error);
        alert("Error al cargar datos del dashboard: " + error.message);
      }
      setCargando(false);
    };
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idUsuario]);

  const procesar = (sellIn, sellOut, f, rangos, mapaM, mapaD) => {
    const mesesPermitidos = construirMesesPermitidos(rangos);
    const sellInFiltrado = sellIn.filter(mov =>
      mesesPermitidos.has(mov.mes_ano) &&
      (!f.id_distribuidor || mov.id_distribuidor === f.id_distribuidor) &&
      (!f.id_marca || mov.id_marca === f.id_marca)
    );
    const sellOutFiltrado = sellOut.filter(mov =>
      mesesPermitidos.has(mov.mes_ano) &&
      (!f.id_distribuidor || mov.id_distribuidor === f.id_distribuidor) &&
      (!f.id_marca || mov.id_marca === f.id_marca)
    );

    // --- KPIs y composición del gasto ---
    let totalGenerado = 0, totalGastado = 0;
    let totalRegaladas = 0, totalMuestras = 0, totalAcuerdo = 0, totalAportacion = 0;

    sellInFiltrado.forEach(mov => { totalGenerado += generadoSellIn(mov); });
    sellOutFiltrado.forEach(mov => {
      totalGastado += gastoTotal(mov);
      totalRegaladas += valorRegaladas(mov);
      totalMuestras += valorMuestras(mov);
      totalAcuerdo += valorAcuerdo(mov);
      totalAportacion += valorAportacionManual(mov);
    });

    setKpis({ generado: totalGenerado, gastado: totalGastado, diferencia: totalGenerado - totalGastado });

    // OJO: por construcción, Regaladas + Muestras + Acuerdo + Aportación
    // directa DEBE sumar exactamente el mismo total que "A&P GASTADO TOTAL"
    // (son las mismas 4 partidas que componen gastoTotal). Si alguna vez no
    // coincide, es señal de que hay algún dato suelto no numérico en Firestore
    // — por eso ya no se ocultan las categorías en 0€: así se ve todo el
    // desglose siempre y es más fácil detectar si algo no cuadra.
    setDatosGrafico2([
      { name: 'Regaladas', value: totalRegaladas },
      { name: 'Muestras', value: totalMuestras },
      { name: 'Acuerdo', value: totalAcuerdo },
      { name: 'Aportación directa', value: totalAportacion },
    ]);

    // --- Por marca (Gráfico 1): top 10 por A&P Generado (ver orden más abajo) ---
    const aggMarca = new Map();
    sellInFiltrado.forEach(mov => {
      const nombre = mapaM.get(mov.id_marca) || 'Desconocida';
      const d = aggMarca.get(nombre) || { nombre, generado: 0, gastado: 0 };
      d.generado += generadoSellIn(mov);
      aggMarca.set(nombre, d);
    });
    sellOutFiltrado.forEach(mov => {
      const nombre = mapaM.get(mov.id_marca) || 'Desconocida';
      const d = aggMarca.get(nombre) || { nombre, generado: 0, gastado: 0 };
      d.gastado += gastoTotal(mov);
      aggMarca.set(nombre, d);
    });
    // Orden descendente por A&P Generado (rediseño visual, Fase 3) — antes
    // se ordenaba por actividad total (generado + gastado); ahora el criterio
    // es explícitamente el Generado, para que la barra horizontal se lea de
    // mayor a menor presupuesto de A&P por marca.
    const top10Marcas = Array.from(aggMarca.values())
      .sort((a, b) => b.generado - a.generado)
      .slice(0, 10);
    setDatosGrafico1(top10Marcas);

    // --- Por distribuidor (Gráfico 3) ---
    const aggDist = new Map();
    sellOutFiltrado.forEach(mov => {
      const nombre = mapaD.get(mov.id_distribuidor) || 'Desconocido';
      const d = aggDist.get(nombre) || { nombre, gasto: 0 };
      d.gasto += gastoTotal(mov);
      aggDist.set(nombre, d);
    });
    setDatosGrafico3(Array.from(aggDist.values()).sort((a, b) => b.gasto - a.gasto).slice(0, 5));

    // --- Evolución mensual (Gráfico 4) ---
    const aggMes = new Map();
    sellInFiltrado.forEach(mov => {
      const d = aggMes.get(mov.mes_ano) || { mes: mov.mes_ano, generado: 0, gastado: 0 };
      d.generado += generadoSellIn(mov);
      aggMes.set(mov.mes_ano, d);
    });
    sellOutFiltrado.forEach(mov => {
      const d = aggMes.get(mov.mes_ano) || { mes: mov.mes_ano, generado: 0, gastado: 0 };
      d.gastado += gastoTotal(mov);
      aggMes.set(mov.mes_ano, d);
    });
    setDatosGrafico4(Array.from(aggMes.values()).sort((a, b) => a.mes.localeCompare(b.mes)));
  };

  // El periodo (rangosPorAnio) es reactivo: en cuanto cambia — incluida la
  // primera vez, justo cuando termina de cargar y se monta PeriodoComparador
  // con su valor por defecto — se recalculan KPIs y gráficos sin necesidad
  // de pulsar "Actualizar". Distribuidor/Marca, en cambio, siguen
  // requiriendo el botón (comportamiento sin cambios respecto a antes).
  useEffect(() => {
    if (cargando) return;
    procesar(rawSellIn, rawSellOut, filtros, rangosPorAnio, mapaMarcas, mapaDistribuidores);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangosPorAnio, cargando]);

  const handleFiltroChange = (e) => {
    const { name, value } = e.target;
    setFiltros(prev => ({ ...prev, [name]: value }));
  };

  const handleActualizar = () => procesar(rawSellIn, rawSellOut, filtros, rangosPorAnio, mapaMarcas, mapaDistribuidores);

  const handleLimpiarFiltros = () => {
    // "Limpiar" quita Distribuidor/Marca, sin tocar el periodo elegido en
    // PeriodoComparador (igual que antes: "sin tocar las fechas").
    const def = { id_distribuidor: '', id_marca: '' };
    setFiltros(def);
    procesar(rawSellIn, rawSellOut, def, rangosPorAnio, mapaMarcas, mapaDistribuidores);
  };

  // Exportar a PDF (resumen ejecutivo de los 3 KPIs, ver pdfExport.js) — a
  // petición de Sergio. El subtítulo recoge los años marcados en
  // PeriodoComparador (rangosPorAnio); si no hay ninguno aún, se omite.
  const handleExportarPdf = () => {
    const años = rangosPorAnio.map(r => r.anio).join(', ');
    const doc = crearDocumentoPdf('Dashboard de Gestión', años ? `Años: ${años}` : undefined);
    añadirTablaKpis(doc, [
      { label: 'A&P Generado Total', valorBase: formateadorMoneda.format(kpis.generado) },
      { label: 'A&P Gastado Total', valorBase: formateadorMoneda.format(kpis.gastado) },
      { label: 'Diferencia (Balance)', valorBase: formateadorMoneda.format(kpis.diferencia) },
    ]);
    descargarPdf(doc, `Dashboard_Gestion_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // TARJETAS INTERACTIVAS: clic en una barra de "A&P Generado vs. Gastado
  // por Marca" o de "Top 5 Distribuidores por Gasto de A&P" filtra TODO el
  // dashboard a ese elemento — reutiliza los mismos filtros.id_marca/
  // id_distribuidor que ya usan los desplegables de arriba. A diferencia de
  // esos desplegables (que requieren pulsar "ACTUALIZAR"), el clic en la
  // tarjeta aplica el cambio al instante, porque el propio clic ya es la
  // acción de "quiero ver esto ahora". Un segundo clic sobre el mismo
  // elemento lo desmarca (vuelve a "todos").
  const obtenerNombreDePayload = (d) => d?.payload?.nombre ?? d?.nombre;

  const handleClickMarca = (payload) => {
    const nombre = obtenerNombreDePayload(payload);
    const id = mapaMarcaPorNombre.get(nombre);
    if (!id) return;
    const nuevo = { ...filtros, id_marca: filtros.id_marca === id ? '' : id };
    setFiltros(nuevo);
    procesar(rawSellIn, rawSellOut, nuevo, rangosPorAnio, mapaMarcas, mapaDistribuidores);
  };

  const handleClickDistribuidorGestion = (payload) => {
    const nombre = obtenerNombreDePayload(payload);
    const id = mapaDistribuidorPorNombreGestion.get(nombre);
    if (!id) return;
    const nuevo = { ...filtros, id_distribuidor: filtros.id_distribuidor === id ? '' : id };
    setFiltros(nuevo);
    procesar(rawSellIn, rawSellOut, nuevo, rangosPorAnio, mapaMarcas, mapaDistribuidores);
  };

  const marcaSeleccionada = filtros.id_marca
    ? marcas.find(m => m.id === filtros.id_marca)?.nombre_marca
    : null;
  const distribuidorSeleccionadoGestion = filtros.id_distribuidor
    ? distribuidores.find(d => d.id === filtros.id_distribuidor)?.nombre_distribuidor
    : null;

  if (cargando) {
    return <div className="p-5 text-center text-slate-500 dark:text-slate-400">Cargando dashboard...</div>;
  }

  return (
    <div>
      <h2 className="text-xl font-medium text-slate-900 dark:text-white mb-5">Dashboard de Gestión</h2>

      <PeriodoComparador
        aniosDisponibles={aniosDisponibles}
        onChange={setRangosPorAnio}
        tipoInicial="anio"
        aniosIniciales={[anoActual]}
      />

      <div className={filtroContenedor}>
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Distribuidor:</label>
        <select name="id_distribuidor" value={filtros.id_distribuidor} onChange={handleFiltroChange} className={inputClasses}>
          <option value="">-- Todos sus Distribuidores --</option>
          {distribuidores.map(d => (
            <option key={d.id} value={d.id}>{d.nombre_distribuidor}</option>
          ))}
        </select>

        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Marca:</label>
        <select name="id_marca" value={filtros.id_marca} onChange={handleFiltroChange} className={inputClasses}>
          <option value="">-- Todas las Marcas --</option>
          {marcas.map(m => (
            <option key={m.id} value={m.id}>{m.nombre_marca}</option>
          ))}
        </select>

        <button className={botonPrimario} onClick={handleActualizar}>
          ACTUALIZAR
        </button>
        <button className={botonSecundario} onClick={handleLimpiarFiltros}>
          Limpiar
        </button>
      </div>

      {rangoDisponible && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
          Histórico cargado desde <strong>{rangoDisponible.min}</strong> hasta <strong>{rangoDisponible.max}</strong>.
        </p>
      )}

      <div className="flex justify-between items-center mt-7 mb-3">
        <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">KPIs Principales</h3>
        <button onClick={handleExportarPdf} className={botonExito}>Exportar a PDF</button>
      </div>
      <div className="flex flex-wrap gap-4">
        <KpiBox
          titulo="A&P GENERADO TOTAL"
          valor={kpis.generado}
          Icon={Coins}
          colorText="text-indigo-600 dark:text-indigo-400"
          colorBg="bg-indigo-50 dark:bg-indigo-500/10"
        />
        <KpiBox
          titulo="A&P GASTADO TOTAL"
          valor={kpis.gastado}
          Icon={CreditCard}
          colorText="text-amber-600 dark:text-amber-400"
          colorBg="bg-amber-50 dark:bg-amber-500/10"
        />
        <KpiBox
          titulo="DIFERENCIA (Balance)"
          valor={kpis.diferencia}
          Icon={Scale}
          colorText={colorPorSigno(kpis.diferencia)}
          colorBg={kpis.diferencia < 0 ? 'bg-red-50 dark:bg-red-500/10' : 'bg-emerald-50 dark:bg-emerald-500/10'}
        />
      </div>

      <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mt-7 mb-3">Visualizaciones</h3>
      <div className="grid gap-5 grid-cols-[repeat(auto-fit,minmax(min(440px,100%),1fr))]">

        <GraficoBox titulo={`A&P Generado vs. Gastado por Marca ${datosGrafico1.length === 10 ? '(Top 10)' : ''}`}>
          {/* Barra horizontal (rediseño visual, Fase 3): evita que se corten
              los nombres de marca largos (antes iban en el eje X, girados
              -40º, y aun así se truncaban a 14 caracteres). Orden descendente
              por A&P Generado ya aplicado en procesar(). Colores: gold para
              Generado, wine para Gastado (tokens de tailwind.config.js).
              Tarjeta interactiva: clic en una barra filtra todo el dashboard
              a esa marca (mismo filtro que el desplegable "Marca" de arriba,
              pero se aplica al instante, sin pulsar "ACTUALIZAR"). */}
          {marcaSeleccionada && (
            <div className="flex justify-center mb-2">
              <button
                type="button"
                onClick={() => {
                  const nuevo = { ...filtros, id_marca: '' };
                  setFiltros(nuevo);
                  procesar(rawSellIn, rawSellOut, nuevo, rangosPorAnio, mapaMarcas, mapaDistribuidores);
                }}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-wine-soft !text-slate-900 dark:!text-white !border-0"
              >
                Filtrando: {marcaSeleccionada} ✕
              </button>
            </div>
          )}
          <ResponsiveContainer width="100%" height={Math.max(260, datosGrafico1.length * 38 + 40)}>
            <BarChart data={datosGrafico1} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={colorGrid} />
              <XAxis type="number" tickFormatter={(v) => formateadorMonedaCorta.format(v)} tick={{ fill: colorEje, fontSize: 11 }} stroke={colorGrid} />
              <YAxis
                dataKey="nombre"
                type="category"
                tick={{ fill: colorEje, fontSize: 11 }}
                stroke={colorGrid}
                width={130}
                tickFormatter={(v) => (v && v.length > 18 ? v.slice(0, 17) + '…' : v)}
              />
              <Tooltip formatter={(value) => formateadorMoneda.format(value)} labelFormatter={(label) => label} contentStyle={tooltipContentStyle} />
              <Legend wrapperStyle={legendStyle} />
              <Bar dataKey="generado" fill={COLOR_GOLD} name="A&P Generado" radius={[0, 3, 3, 0]} cursor="pointer" onClick={handleClickMarca}>
                {datosGrafico1.map((entry) => (
                  <Cell key={entry.nombre} fillOpacity={!marcaSeleccionada || marcaSeleccionada === entry.nombre ? 1 : 0.3} />
                ))}
              </Bar>
              <Bar dataKey="gastado" fill={COLOR_WINE} name="A&P Gastado" radius={[0, 3, 3, 0]} cursor="pointer" onClick={handleClickMarca}>
                {datosGrafico1.map((entry) => (
                  <Cell key={entry.nombre} fillOpacity={!marcaSeleccionada || marcaSeleccionada === entry.nombre ? 1 : 0.3} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </GraficoBox>

        <GraficoBox titulo="Composición del A&P Gastado">
          {/* Donut (rediseño visual, Fase 3): recorte central ~70%
              (innerRadius 66 sobre outerRadius 95), sin etiquetas dentro de
              las porciones, y el total gastado superpuesto en el centro del
              agujero. La leyenda "externa" con nombre/€/% ya existía
              como desglose en HTML debajo del gráfico (ver más abajo); se
              quita el <Legend> propio de Recharts porque solo mostraba el
              nombre, sin € ni %, y quedaba duplicado con ese desglose. */}
          <div className="relative">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={datosGrafico2}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={66}
                  outerRadius={95}
                  fill="#8884d8"
                >
                  {datosGrafico2.map((entry) => (
                    <Cell key={entry.name} fill={COLOR_POR_CATEGORIA[entry.name] || '#9CA3AF'} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formateadorMoneda.format(value)} contentStyle={tooltipContentStyle} />
              </PieChart>
            </ResponsiveContainer>

            {/* Total gastado, centrado en el agujero del donut */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Total Gastado</span>
              <span className="text-lg font-bold text-slate-900 dark:text-white">{formateadorMonedaCorta.format(kpis.gastado)}</span>
            </div>
          </div>

          {/* Leyenda externa: nombre + € + % por categoría — en HTML normal, nunca se corta ni se superpone */}
          <div className="mt-2.5 border-t border-slate-100 dark:border-slate-800 pt-2.5">
            {datosGrafico2.map((d) => {
              const total = datosGrafico2.reduce((acc, x) => acc + x.value, 0);
              const pct = total > 0 ? (d.value / total) * 100 : 0;
              return (
                <div key={d.name} className="flex justify-between items-center text-sm py-1 px-0.5 text-slate-700 dark:text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-sm inline-block"
                      style={{ backgroundColor: COLOR_POR_CATEGORIA[d.name] || '#9CA3AF' }}
                    />
                    {d.name}
                  </span>
                  <strong>{formateadorMoneda.format(d.value)} ({pct.toFixed(0)}%)</strong>
                </div>
              );
            })}
          </div>

          {(() => {
            const sumaCategorias = datosGrafico2.reduce((acc, d) => acc + d.value, 0);
            const diferencia = Math.round((kpis.gastado - sumaCategorias) * 100) / 100;
            if (Math.abs(diferencia) < 0.01) {
              return (
                <p className="text-xs text-slate-400 dark:text-slate-500 text-center mt-2">
                  Suma de categorías: {formateadorMoneda.format(sumaCategorias)} (coincide con el A&P Gastado Total).
                </p>
              );
            }
            return (
              <p className="text-xs text-red-600 dark:text-red-400 text-center mt-2 font-semibold">
                ⚠️ La suma de categorías ({formateadorMoneda.format(sumaCategorias)}) no coincide con el A&P Gastado
                Total ({formateadorMoneda.format(kpis.gastado)}) — diferencia de {formateadorMoneda.format(diferencia)}.
                Puede haber algún movimiento con un dato no numérico; avísanos si ves esto.
              </p>
            );
          })()}
        </GraficoBox>

        <GraficoBox titulo="Top 5 Distribuidores por Gasto de A&P">
          {/* Tarjeta interactiva: clic en una barra filtra todo el dashboard a ese
              distribuidor (mismo filtro que el desplegable "Distribuidor" de arriba,
              aplicado al instante). Un segundo clic sobre la misma barra lo quita. */}
          {distribuidorSeleccionadoGestion && (
            <div className="flex justify-center mb-2">
              <button
                type="button"
                onClick={() => {
                  const nuevo = { ...filtros, id_distribuidor: '' };
                  setFiltros(nuevo);
                  procesar(rawSellIn, rawSellOut, nuevo, rangosPorAnio, mapaMarcas, mapaDistribuidores);
                }}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-wine-soft !text-slate-900 dark:!text-white !border-0"
              >
                Filtrando: {distribuidorSeleccionadoGestion} ✕
              </button>
            </div>
          )}
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={datosGrafico3} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={colorGrid} />
              <XAxis type="number" tickFormatter={(v) => formateadorMonedaCorta.format(v)} tick={{ fill: colorEje, fontSize: 11 }} stroke={colorGrid} />
              <YAxis dataKey="nombre" type="category" tick={{ fill: colorEje, fontSize: 11 }} stroke={colorGrid} width={130} />
              <Tooltip formatter={(value) => formateadorMoneda.format(value)} contentStyle={tooltipContentStyle} />
              <Bar dataKey="gasto" fill="#F97316" name="Gasto Total" radius={[0, 3, 3, 0]} cursor="pointer" onClick={handleClickDistribuidorGestion}>
                {datosGrafico3.map((entry) => (
                  <Cell key={entry.nombre} fillOpacity={!distribuidorSeleccionadoGestion || distribuidorSeleccionadoGestion === entry.nombre ? 1 : 0.3} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </GraficoBox>

        <GraficoBox titulo="Evolución Mensual (Generado vs Gastado)">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={datosGrafico4} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={colorGrid} />
              <XAxis dataKey="mes" tick={{ fill: colorEje, fontSize: 11 }} stroke={colorGrid} />
              <YAxis tickFormatter={(v) => formateadorMonedaCorta.format(v)} tick={{ fill: colorEje, fontSize: 11 }} stroke={colorGrid} />
              <Tooltip formatter={(value) => formateadorMoneda.format(value)} contentStyle={tooltipContentStyle} />
              <Legend wrapperStyle={legendStyle} />
              <Line type="monotone" dataKey="generado" stroke={COLORS[0]} strokeWidth={2} name="A&P Generado" dot={{ r: 3 }} />
              <Line type="monotone" dataKey="gastado" stroke={COLORS[1]} strokeWidth={2} name="A&P Gastado" dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </GraficoBox>

      </div>
    </div>
  );
}

const KpiBox = ({ titulo, valor, Icon, colorText, colorBg }) => (
  <div className="flex-1 min-w-[240px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 flex items-start gap-4 shadow-sm">
    <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${colorBg}`}>
      <Icon size={20} className={colorText} />
    </div>
    <div className="min-w-0">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 tracking-wide mb-1">{titulo}</p>
      <p className={`text-2xl font-semibold ${colorText}`}>{formateadorMoneda.format(valor)}</p>
    </div>
  </div>
);

const GraficoBox = ({ titulo, children }) => (
  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
    <h4 className="text-center text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">{titulo}</h4>
    {children}
  </div>
);

export default PantallaDashboard;
