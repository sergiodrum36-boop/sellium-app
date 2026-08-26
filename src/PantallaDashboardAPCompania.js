/*
 * PantallaDashboardAPCompania.js (Versión 1.0)
 * Nuevo dashboard, a petición de Sergio: "igual que el de Gestión pero en
 * relación a Control A&P (Visión Compañía)".
 *
 * Es una copia estructural de PantallaDashboard.js (mismos 3 KPIs de
 * siempre + los mismos 4 gráficos + PeriodoComparador + filtros de
 * Distribuidor/Marca), pero sustituyendo la fórmula del "A&P Generado" por
 * la que ya usa ControlAPVisionComercial.js — es decir, la forma en que
 * COMPAÑÍA (no la vista real por distribuidor) mide el A&P Generado:
 *
 *  - Dashboard de Gestión (PantallaDashboard.js) y "Control A&P"
 *    (ControlAP.js) calculan el Generado SOLO a partir del Sell-In
 *    (unidades_compradas × ap_por_unidad, `generadoSellIn` de
 *    calculosAP.js) — el Stock Inicial que el distribuidor ya tenía antes
 *    de usar la app NO cuenta.
 *  - "Control A&P (Visión Compañía)" (ControlAPVisionComercial.js) SUMA
 *    también el Stock Inicial declarado de cada distribuidor/marca (a la
 *    tasa ACTUAL de A&P de la marca, `marca.AP_Generado_Por_Unidad`, porque
 *    el Stock Inicial no guarda con qué tasa se generó en su momento) — así
 *    no se infla artificialmente el % de gasto sobre lo generado en
 *    distribuidores que ya tenían stock declarado. Ese tratamiento del
 *    Stock Inicial es EXCLUSIVO de esta vista de Compañía, igual que en
 *    ControlAPVisionComercial.js; no toca ni sustituye la vista real.
 *  - El GASTO (numerador) es siempre el mismo en las tres pantallas: sale
 *    del Sell-Out (regaladas + muestras + Acuerdo + aportación manual, vía
 *    `gastoTotal` de calculosAP.js).
 *
 * El Stock Inicial no tiene fecha (`mes_ano`): es un punto de partida, no un
 * movimiento de un mes concreto. Por eso, igual que en
 * ControlAPVisionComercial.js, el periodo elegido en PeriodoComparador NO
 * le afecta (solo se filtra por Distribuidor/Marca) — se suma siempre igual
 * al total y al desglose por Marca, pero NO puede aparecer en el gráfico
 * "Evolución Mensual" (no hay mes al que asignarlo), que sigue mostrando
 * solo el Generado por Sell-In mes a mes.
 *
 * Se añade un 4º KPI, "% GASTADO / GENERADO" (mismo cálculo que
 * ControlAPVisionComercial.js: Gastado ÷ Generado × 100, con `null` → "—"
 * cuando el Generado es 0 y no hay gasto con el que compararlo), a petición
 * explícita de Sergio.
 *
 * El resto (estructura de filtros, tarjetas interactivas al hacer clic en
 * una barra, useDarkMode, colores, PeriodoComparador) se mantiene idéntico
 * a PantallaDashboard.js para que ambos dashboards se vean y se manejen
 * igual.
 *
 * Se añade un 5º KPI, "GASTO MEDIO / BOTELLA" (2026-08-26, a petición
 * explícita de Sergio: "gasto medio por botella en cada marca"), calculado
 * como A&P Gastado Total ÷ (Botellas Vendidas + Regaladas + Muestras) del
 * periodo/filtro actual. El dato de origen (`ventas_uds`/`regaladas_uds`/
 * `muestras_uds`) ya existía en cada movimiento de Sell-Out desde siempre
 * (`parserLiquidacion.js`); lo que faltaba era agregarlo por
 * Distribuidor/Marca/periodo en ESTA pantalla — la de ControlAP.js sigue
 * siendo por distribuidor individual, esta es la vista agregada de
 * Compañía que Sergio realmente mira.
 * NOTA: el denominador aquí (vendidas+regaladas+muestras) es distinto,
 * A PROPÓSITO Y A PETICIÓN EXPLÍCITA DE SERGIO (26/08/2026), del de "Media
 * Gasto x Unidad Movida" en ControlAP.js (vendidas+regaladas, excluye
 * muestras deliberadamente desde su v5.4) — son dos pantallas con criterios
 * distintos ahora mismo, no un descuido.
 *
 * Se añade también un 6º KPI, "STOCK ACTUAL" (2026-08-26, a petición de
 * Sergio), calculado en `calculosStock.js` (nuevo módulo compartido con
 * ControlAPVisionComercial.js — ver ese archivo). A PROPÓSITO ignora el
 * periodo elegido (usa el histórico SIN filtrar por fecha): el Stock es un
 * saldo a día de hoy, no algo que ocurre "durante" un periodo — solo
 * respeta los filtros de Distribuidor/Marca, igual que ya hace Stock
 * Inicial en esta misma pantalla.
 *
 * CAMBIO (limpieza de menú, a petición de Sergio: el Dashboard de Gestión
 * sin Stock Inicial no le sirve, solo le interesa Compras + Stock Inicial):
 * este componente pasa a ocupar el hueco de "Gestión" en el grupo
 * "Dashboard" del Sidebar (ver Layout.js) — PantallaDashboard.js (el
 * antiguo, sin Stock Inicial) sigue existiendo intacto, solo deja de tener
 * acceso desde el menú. Al quedar este como el único "Dashboard" visible,
 * se simplifican el título en pantalla ("Dashboard de Gestión", igual que
 * el antiguo) y el texto explicativo, quitando la comparación con la otra
 * versión.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  getMarcasGlobales,
  getDistribuidoresPorUsuario,
  getHistoricoSellInGeneral,
  getHistoricoSellOutGeneral,
  getStockInicialGeneral
} from './firebaseApi';
import { valorRegaladas, valorMuestras, valorAcuerdo, valorAportacionManual, generadoSellIn, gastoTotal, unidadesAcuerdo } from './calculosAP';
import { calcularStockActualPorMarca } from './calculosStock';
import { Coins, CreditCard, Scale, Percent, Wine, Boxes } from 'lucide-react';
import { inputClasses, botonPrimario, botonSecundario, botonExito, filtroContenedor, colorPorSigno } from './uiClasses';
import PeriodoComparador from './PeriodoComparador';
// Exportar a PDF (resumen ejecutivo de KPIs), a petición de Sergio — ver
// pdfExport.js.
import { crearDocumentoPdf, añadirTablaKpis, descargarPdf, añadirTituloSeccion, añadirTablaGenerica, describirPeriodo } from './pdfExport';

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell, LineChart, Line,
  ResponsiveContainer, CartesianGrid
} from 'recharts';

export const PANTALLA_DASHBOARD_AP_COMPANIA = 'DASHBOARD_AP_COMPANIA';

// Colores FIJOS por categoría (no por posición en el array) para que cada
// categoría del "Composición del A&P Gastado" tenga siempre el mismo color,
// aparezca o no alguna de las otras categorías. Mismos colores que
// PantallaDashboard.js, para que ambos dashboards se lean igual.
const COLOR_POR_CATEGORIA = {
  'Regaladas': '#6366F1',
  'Muestras': '#10B981',
  'Acuerdo': '#F59E0B',
  'Aportación directa': '#EF4444'
};
const COLORS = ['#6366F1', '#10B981', '#F59E0B', '#EF4444'];
// Fase 8 (especificación Sergio: "paleta más consistente") — antes gold/wine,
// ver mismo cambio en PantallaDashboard.js.
const COLOR_GENERADO = '#6366F1';
const COLOR_GASTADO = '#F59E0B';
const formateadorMoneda = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const formateadorMonedaCorta = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

// % Gastado / Generado (mismo criterio que ControlAPVisionComercial.js): si
// no hay Generado (denominador 0) pero tampoco hay gasto, es 0% (no hay
// nada que evaluar); si hay gasto sin Generado, el ratio no tiene sentido
// numérico (sería infinito) y se muestra como "—" en vez de un porcentaje
// engañoso.
const calcularPorcentaje = (generado, gastado) => {
  if (generado === 0) return gastado === 0 ? 0 : null;
  return (gastado / generado) * 100;
};
const formatearPorcentaje = (valor) => {
  if (valor === null) return '—';
  return `${valor.toFixed(1)}%`;
};

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

// A partir de todos los movimientos, calcula el primer y último mes con
// datos. El Stock Inicial (sin mes_ano) no participa en este cálculo, igual
// que no participa en la Evolución Mensual — ver cabecero del archivo.
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
// que ya usa `mov.mes_ano` en Firestore.
const construirMesesPermitidos = (rangosPorAnio) => {
  const set = new Set();
  rangosPorAnio.forEach(({ anio, meses }) => {
    meses.forEach(m => set.add(`${anio}-${String(m + 1).padStart(2, '0')}`));
  });
  return set;
};

function PantallaDashboardAPCompania({ idUsuario }) {

  const modoOscuro = useDarkMode();
  // Contraste subido (Fase 8, especificación Sergio: "algunos elementos se
  // mezclan con el fondo oscuro", +10-15%) — ver mismo cambio en
  // DashboardVentasReales.js/PantallaDashboard.js.
  const colorEje = modoOscuro ? '#cbd5e1' : '#6b7280';
  const colorGrid = modoOscuro ? '#475569' : '#e5e7eb';
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
  const [rawStockInicial, setRawStockInicial] = useState([]);
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

  const [kpis, setKpis] = useState({ generado: 0, gastado: 0, diferencia: 0, porcentaje: 0, gastoMedioBotella: 0, stockActual: 0 });
  const [datosGrafico1, setDatosGrafico1] = useState([]); // Generado vs Gastado por Marca (top 10)
  const [datosGrafico2, setDatosGrafico2] = useState([]); // Composición del gasto
  const [datosGrafico3, setDatosGrafico3] = useState([]); // Top 5 Distribuidores por gasto
  const [datosGrafico4, setDatosGrafico4] = useState([]); // Evolución mensual

  // Años que existen de verdad en el histórico importado — se pasan tal
  // cual a PeriodoComparador (nunca hardcodeados), igual que en el
  // Dashboard de Gestión.
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
        const [marcasGlobales, distris, sellIn, sellOut, stockInicial] = await Promise.all([
          getMarcasGlobales(),
          getDistribuidoresPorUsuario(idUsuario),
          getHistoricoSellInGeneral(idUsuario),
          getHistoricoSellOutGeneral(idUsuario),
          getStockInicialGeneral(idUsuario)
        ]);

        setMarcas(marcasGlobales);
        setDistribuidores(distris);
        setRawSellIn(sellIn);
        setRawSellOut(sellOut);
        setRawStockInicial(stockInicial);

        const mapaM = new Map(marcasGlobales.map(m => [m.id, m.nombre_marca]));
        const mapaD = new Map(distris.map(d => [d.id, d.nombre_distribuidor]));
        setMapaMarcas(mapaM);
        setMapaDistribuidores(mapaD);

        // Guardamos el rango real de datos (basado en Sell-In/Sell-Out, el
        // Stock Inicial no tiene mes) para "aniosDisponibles" y para el
        // texto informativo de abajo. El primer cálculo de KPIs/gráficos ya
        // no se dispara aquí: en cuanto termine de cargar, se monta
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

  const procesar = (sellIn, sellOut, stockInicial, f, rangos, mapaM, mapaD, marcasList) => {
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
    // Stock Inicial: NO se filtra por periodo (no tiene mes_ano, ver
    // cabecero del archivo) — solo por Distribuidor/Marca, igual que en
    // ControlAPVisionComercial.js.
    const stockInicialFiltrado = (stockInicial || []).filter(s =>
      (!f.id_distribuidor || s.id_distribuidor === f.id_distribuidor) &&
      (!f.id_marca || s.id_marca === f.id_marca)
    );

    // Tasa actual de A&P por marca, para valorar el Stock Inicial (que no
    // guarda con qué tasa se generó en su momento) — mismo criterio que
    // ControlAPVisionComercial.js.
    const mapaTasaApActual = new Map(marcasList.map(m => [m.id, Number(m.AP_Generado_Por_Unidad) || 0]));
    const valorStockInicial = (s) => (Number(s.stock_inicial) || 0) * (mapaTasaApActual.get(s.id_marca) || 0);

    // --- KPIs y composición del gasto ---
    let totalGenerado = 0, totalGastado = 0;
    let totalRegaladas = 0, totalMuestras = 0, totalAcuerdo = 0, totalAportacion = 0;
    // Botellas "que salen al mercado" (vendidas + regaladas + muestras),
    // para el KPI "Gasto Medio / Botella" — a petición explícita de Sergio
    // (26/08/2026) SÍ incluye muestras aquí (a diferencia de "Media Gasto x
    // Unidad Movida" de ControlAP.js). NO incluye unidades de Acuerdo (ya
    // tienen su propio precio pactado aparte, ver valorAcuerdo). Aparte se
    // trackea `totalAcuerdoUds` (unidades de Acuerdo) para poder mostrar
    // "Unidades" en "Composición del A&P Gastado" (2026-08-26, a petición
    // de Sergio) — ahí SÍ interesa esa partida por separado, es solo el
    // denominador de Gasto Medio/Botella el que la excluye a propósito.
    let totalVentasUds = 0, totalRegaladasUds = 0, totalMuestrasUds = 0, totalAcuerdoUds = 0;

    sellInFiltrado.forEach(mov => { totalGenerado += generadoSellIn(mov); });
    stockInicialFiltrado.forEach(s => { totalGenerado += valorStockInicial(s); });
    sellOutFiltrado.forEach(mov => {
      totalGastado += gastoTotal(mov);
      totalRegaladas += valorRegaladas(mov);
      totalMuestras += valorMuestras(mov);
      totalAcuerdo += valorAcuerdo(mov);
      totalAportacion += valorAportacionManual(mov);
      totalVentasUds += Number(mov.ventas_uds) || 0;
      totalRegaladasUds += Number(mov.regaladas_uds) || 0;
      totalMuestrasUds += Number(mov.muestras_uds) || 0;
      totalAcuerdoUds += unidadesAcuerdo(mov);
    });

    const unidadesParaMediaBotella = totalVentasUds + totalRegaladasUds + totalMuestrasUds;
    const gastoMedioBotella = unidadesParaMediaBotella === 0 ? 0 : (totalGastado / unidadesParaMediaBotella);

    // Stock Actual (2026-08-26, a petición de Sergio): Stock Inicial
    // declarado + Compras - Salidas, acumulado hasta HOY — a propósito
    // ignora el periodo elegido (rangos/f no se le pasan), solo respeta
    // Distribuidor/Marca. Usa `sellIn`/`sellOut`/`stockInicial` SIN filtrar
    // por periodo (los parámetros originales de procesar, no los
    // *Filtrado de arriba). Ver calculosStock.js para el detalle y por qué
    // es distinto del criterio de "Gasto Medio / Botella".
    const { total: stockActualTotal } = calcularStockActualPorMarca({
      historicoSellIn: sellIn,
      historicoSellOut: sellOut,
      stockInicialGeneral: stockInicial,
      marcas: marcasList,
      idsDistribuidor: f.id_distribuidor ? [f.id_distribuidor] : [],
      idMarca: f.id_marca,
    });

    setKpis({
      generado: totalGenerado,
      gastado: totalGastado,
      diferencia: totalGenerado - totalGastado,
      porcentaje: calcularPorcentaje(totalGenerado, totalGastado),
      gastoMedioBotella,
      stockActual: stockActualTotal
    });

    // OJO: por construcción, Regaladas + Muestras + Acuerdo + Aportación
    // directa DEBE sumar exactamente el mismo total que "A&P GASTADO TOTAL"
    // (son las mismas 4 partidas que componen gastoTotal) — el Stock
    // Inicial no interviene aquí, solo afecta al lado del Generado.
    // `unidades: null` en Aportación directa a propósito — es una
    // aportación monetaria puntual (aportacion_euros), no tiene botellas
    // asociadas, así que no hay unidad que mostrar (el PDF la imprime como
    // "—", ver handleExportarPdf).
    setDatosGrafico2([
      { name: 'Regaladas', value: totalRegaladas, unidades: totalRegaladasUds },
      { name: 'Muestras', value: totalMuestras, unidades: totalMuestrasUds },
      { name: 'Acuerdo', value: totalAcuerdo, unidades: totalAcuerdoUds },
      { name: 'Aportación directa', value: totalAportacion, unidades: null },
    ]);

    // --- Por marca (Gráfico 1): top 10 por A&P Generado (Sell-In + Stock Inicial) ---
    const aggMarca = new Map();
    sellInFiltrado.forEach(mov => {
      const nombre = mapaM.get(mov.id_marca) || 'Desconocida';
      const d = aggMarca.get(nombre) || { nombre, generado: 0, gastado: 0 };
      d.generado += generadoSellIn(mov);
      aggMarca.set(nombre, d);
    });
    stockInicialFiltrado.forEach(s => {
      const nombre = mapaM.get(s.id_marca) || 'Desconocida';
      const d = aggMarca.get(nombre) || { nombre, generado: 0, gastado: 0 };
      d.generado += valorStockInicial(s);
      aggMarca.set(nombre, d);
    });
    sellOutFiltrado.forEach(mov => {
      const nombre = mapaM.get(mov.id_marca) || 'Desconocida';
      const d = aggMarca.get(nombre) || { nombre, generado: 0, gastado: 0 };
      d.gastado += gastoTotal(mov);
      aggMarca.set(nombre, d);
    });
    // Orden descendente por A&P Generado, igual que en el Dashboard de
    // Gestión, para que la barra horizontal se lea de mayor a menor
    // presupuesto de A&P por marca.
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

    // --- Evolución mensual (Gráfico 4): SOLO Sell-In/Sell-Out, el Stock
    // Inicial no tiene mes al que asignarse (ver cabecero del archivo). ---
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
  // requiriendo el botón (comportamiento sin cambios respecto al Dashboard
  // de Gestión).
  useEffect(() => {
    if (cargando) return;
    procesar(rawSellIn, rawSellOut, rawStockInicial, filtros, rangosPorAnio, mapaMarcas, mapaDistribuidores, marcas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangosPorAnio, cargando]);

  const handleFiltroChange = (e) => {
    const { name, value } = e.target;
    setFiltros(prev => ({ ...prev, [name]: value }));
  };

  const handleActualizar = () => procesar(rawSellIn, rawSellOut, rawStockInicial, filtros, rangosPorAnio, mapaMarcas, mapaDistribuidores, marcas);

  const handleLimpiarFiltros = () => {
    // "Limpiar" quita Distribuidor/Marca, sin tocar el periodo elegido en
    // PeriodoComparador (igual que en el Dashboard de Gestión).
    const def = { id_distribuidor: '', id_marca: '' };
    setFiltros(def);
    procesar(rawSellIn, rawSellOut, rawStockInicial, def, rangosPorAnio, mapaMarcas, mapaDistribuidores, marcas);
  };

  // Exportar a PDF — INFORME completo (2026-08-26, a petición de Sergio:
  // el PDF anterior era solo la tabla de 6 KPIs, sin desglose ni indicar
  // qué Distribuidor/Marca/Periodo estaba filtrado — si lo exportaba con
  // una marca concreta seleccionada, el PDF no lo reflejaba en ningún
  // sitio). Ahora reproduce, como tablas, TODO lo que ya se ve en pantalla:
  // KPIs + desglose por Marca + composición del gasto + por Distribuidor +
  // evolución mensual — usando los mismos `datosGraficoN` que ya alimentan
  // los gráficos, así que el informe queda automáticamente coherente con
  // lo que Sergio está mirando (mismos filtros de Distribuidor/Marca/
  // Periodo ya aplicados, sin recalcular nada aparte). Ver pdfExport.js
  // para los helpers nuevos (añadirTituloSeccion/añadirTablaGenerica/
  // describirPeriodo).
  const handleExportarPdf = () => {
    const doc = crearDocumentoPdf('Dashboard de Gestión', [
      `Distribuidor: ${distribuidorSeleccionadoGestion || 'Todos'}`,
      `Marca: ${marcaSeleccionada || 'Todas'}`,
      `Periodo: ${describirPeriodo(rangosPorAnio) || '—'}`,
      rangoDisponible ? `Histórico cargado desde ${rangoDisponible.min} hasta ${rangoDisponible.max}` : null,
    ]);

    // --- KPIs Principales ---
    let y = añadirTablaKpis(doc, [
      { label: 'A&P Generado Total', valorBase: formateadorMoneda.format(kpis.generado) },
      { label: 'A&P Gastado Total', valorBase: formateadorMoneda.format(kpis.gastado) },
      { label: 'Diferencia (Balance)', valorBase: formateadorMoneda.format(kpis.diferencia) },
      { label: '% Gastado / Generado', valorBase: formatearPorcentaje(kpis.porcentaje) },
      { label: 'Gasto Medio / Botella', valorBase: formateadorMoneda.format(kpis.gastoMedioBotella) },
      { label: 'Stock Actual (uds)', valorBase: Math.round(kpis.stockActual).toLocaleString('es-ES') },
    ]);

    // --- Desglose por Marca (mismos datos que el gráfico "A&P Generado
    // vs. Gastado por Marca" — si hay una Marca filtrada, esta tabla sale
    // con una única fila: el "estudio de esa marca concreta"). ---
    if (datosGrafico1.length > 0) {
      y = añadirTituloSeccion(doc, `Desglose por Marca${datosGrafico1.length === 10 ? ' (Top 10)' : ''}`, y + 10);
      y = añadirTablaGenerica(
        doc,
        ['Marca', 'A&P Generado (€)', 'A&P Gastado (€)', 'Diferencia (€)', '% Gastado/Generado'],
        datosGrafico1.map(d => [
          d.nombre,
          formateadorMoneda.format(d.generado),
          formateadorMoneda.format(d.gastado),
          formateadorMoneda.format(d.generado - d.gastado),
          formatearPorcentaje(calcularPorcentaje(d.generado, d.gastado)),
        ]),
        y
      );
    }

    // --- Composición del A&P Gastado --- (columna "Unidades" añadida
    // 2026-08-26 a petición de Sergio: cuántas botellas componen cada
    // importe en €, no solo el € en sí. "Aportación directa" imprime "—"
    // porque es una aportación monetaria puntual sin botellas asociadas.)
    if (datosGrafico2.length > 0) {
      const totalComposicion = datosGrafico2.reduce((acc, d) => acc + d.value, 0);
      y = añadirTituloSeccion(doc, 'Composición del A&P Gastado', y + 10);
      y = añadirTablaGenerica(
        doc,
        ['Categoría', 'Unidades', 'Importe (€)', '% del Gasto'],
        datosGrafico2.map(d => [
          d.name,
          d.unidades == null ? '—' : Math.round(d.unidades).toLocaleString('es-ES'),
          formateadorMoneda.format(d.value),
          totalComposicion === 0 ? '—' : `${((d.value / totalComposicion) * 100).toFixed(1)}%`,
        ]),
        y
      );
    }

    // --- Top Distribuidores por A&P Gastado ---
    if (datosGrafico3.length > 0) {
      y = añadirTituloSeccion(doc, `Top Distribuidores por A&P Gastado${datosGrafico3.length === 5 ? ' (Top 5)' : ''}`, y + 10);
      y = añadirTablaGenerica(
        doc,
        ['Distribuidor', 'A&P Gastado (€)'],
        datosGrafico3.map(d => [d.nombre, formateadorMoneda.format(d.gasto)]),
        y
      );
    }

    // --- Evolución Mensual (Sell-In/Sell-Out; el Stock Inicial no tiene
    // mes al que asignarse, ver cabecera del archivo) ---
    if (datosGrafico4.length > 0) {
      y = añadirTituloSeccion(doc, 'Evolución Mensual', y + 10);
      añadirTablaGenerica(
        doc,
        ['Mes', 'A&P Generado (€)', 'A&P Gastado (€)', 'Diferencia (€)'],
        datosGrafico4.map(d => [
          d.mes,
          formateadorMoneda.format(d.generado),
          formateadorMoneda.format(d.gastado),
          formateadorMoneda.format(d.generado - d.gastado),
        ]),
        y
      );
    }

    // Nombre de fichero: si hay Marca/Distribuidor filtrado, se refleja en
    // el nombre (p.ej. para poder mandar "el informe de Palomo Cojo DO
    // Rueda" sin tener que renombrarlo a mano).
    const partesNombre = ['Dashboard_Gestion'];
    if (distribuidorSeleccionadoGestion) partesNombre.push(distribuidorSeleccionadoGestion.replace(/[^a-zA-Z0-9]+/g, '_').substring(0, 25));
    if (marcaSeleccionada) partesNombre.push(marcaSeleccionada.replace(/[^a-zA-Z0-9]+/g, '_').substring(0, 25));
    partesNombre.push(new Date().toISOString().slice(0, 10));
    descargarPdf(doc, `${partesNombre.join('_')}.pdf`);
  };

  // TARJETAS INTERACTIVAS: clic en una barra de "A&P Generado vs. Gastado
  // por Marca" o de "Top 5 Distribuidores por Gasto de A&P" filtra TODO el
  // dashboard a ese elemento — mismo patrón que el Dashboard de Gestión.
  const obtenerNombreDePayload = (d) => d?.payload?.nombre ?? d?.nombre;

  const handleClickMarca = (payload) => {
    const nombre = obtenerNombreDePayload(payload);
    const id = mapaMarcaPorNombre.get(nombre);
    if (!id) return;
    const nuevo = { ...filtros, id_marca: filtros.id_marca === id ? '' : id };
    setFiltros(nuevo);
    procesar(rawSellIn, rawSellOut, rawStockInicial, nuevo, rangosPorAnio, mapaMarcas, mapaDistribuidores, marcas);
  };

  const handleClickDistribuidorGestion = (payload) => {
    const nombre = obtenerNombreDePayload(payload);
    const id = mapaDistribuidorPorNombreGestion.get(nombre);
    if (!id) return;
    const nuevo = { ...filtros, id_distribuidor: filtros.id_distribuidor === id ? '' : id };
    setFiltros(nuevo);
    procesar(rawSellIn, rawSellOut, rawStockInicial, nuevo, rangosPorAnio, mapaMarcas, mapaDistribuidores, marcas);
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
      <h2 className="text-xl font-medium text-slate-900 dark:text-white mb-1">Dashboard de Gestión</h2>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
        El A&P Generado se calcula sobre Compras (Sell-In) + Stock Inicial declarado (a la tasa actual de A&P de cada marca). El Stock Inicial no tiene fecha, así que no depende del periodo elegido y no aparece en la Evolución Mensual. El Gasto sigue saliendo siempre del Sell-Out.
      </p>

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
          valor={formateadorMoneda.format(kpis.generado)}
          Icon={Coins}
          colorText="text-indigo-600 dark:text-indigo-400"
          colorBg="bg-indigo-50 dark:bg-indigo-500/10"
        />
        <KpiBox
          titulo="A&P GASTADO TOTAL"
          valor={formateadorMoneda.format(kpis.gastado)}
          Icon={CreditCard}
          colorText="text-amber-600 dark:text-amber-400"
          colorBg="bg-amber-50 dark:bg-amber-500/10"
        />
        <KpiBox
          titulo="DIFERENCIA (Balance)"
          valor={formateadorMoneda.format(kpis.diferencia)}
          Icon={Scale}
          colorText={colorPorSigno(kpis.diferencia)}
          colorBg={kpis.diferencia < 0 ? 'bg-red-50 dark:bg-red-500/10' : 'bg-emerald-50 dark:bg-emerald-500/10'}
        />
        <KpiBox
          titulo="% GASTADO / GENERADO"
          valor={formatearPorcentaje(kpis.porcentaje)}
          Icon={Percent}
          colorText={colorPorSigno(kpis.diferencia)}
          colorBg={kpis.diferencia < 0 ? 'bg-red-50 dark:bg-red-500/10' : 'bg-emerald-50 dark:bg-emerald-500/10'}
        />
        <KpiBox
          titulo="GASTO MEDIO / BOTELLA"
          valor={formateadorMoneda.format(kpis.gastoMedioBotella)}
          Icon={Wine}
          colorText="text-indigo-600 dark:text-indigo-400"
          colorBg="bg-indigo-50 dark:bg-indigo-500/10"
        />
        <KpiBox
          titulo="STOCK ACTUAL"
          valor={`${Math.round(kpis.stockActual).toLocaleString('es-ES')} uds`}
          Icon={Boxes}
          colorText={kpis.stockActual < 0 ? 'text-red-600 dark:text-red-400' : 'text-indigo-600 dark:text-indigo-400'}
          colorBg={kpis.stockActual < 0 ? 'bg-red-50 dark:bg-red-500/10' : 'bg-indigo-50 dark:bg-indigo-500/10'}
        />
      </div>

      <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mt-7 mb-3">Visualizaciones</h3>
      <div className="grid gap-5 grid-cols-[repeat(auto-fit,minmax(min(440px,100%),1fr))]">

        <GraficoBox titulo={`A&P Generado (Sell-In + Stock Inicial) vs. Gastado por Marca ${datosGrafico1.length === 10 ? '(Top 10)' : ''}`}>
          {/* Barra horizontal: evita que se corten los nombres de marca
              largos. Orden descendente por A&P Generado ya aplicado en
              procesar(). Colores: indigo para Generado, ámbar para Gastado
              (ver COLOR_GENERADO/COLOR_GASTADO más arriba, Fase 8). Tarjeta interactiva: clic en
              una barra filtra todo el dashboard a esa marca (mismo filtro
              que el desplegable "Marca" de arriba, pero se aplica al
              instante, sin pulsar "ACTUALIZAR"). */}
          {marcaSeleccionada && (
            <div className="flex justify-center mb-2">
              <button
                type="button"
                onClick={() => {
                  const nuevo = { ...filtros, id_marca: '' };
                  setFiltros(nuevo);
                  procesar(rawSellIn, rawSellOut, rawStockInicial, nuevo, rangosPorAnio, mapaMarcas, mapaDistribuidores, marcas);
                }}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-500/15 !text-indigo-700 dark:!text-indigo-300 !border-0"
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
              <Bar dataKey="generado" fill={COLOR_GENERADO} name="A&P Generado" radius={[0, 3, 3, 0]} cursor="pointer" onClick={handleClickMarca}>
                {datosGrafico1.map((entry) => (
                  <Cell key={entry.nombre} fillOpacity={!marcaSeleccionada || marcaSeleccionada === entry.nombre ? 1 : 0.3} />
                ))}
              </Bar>
              <Bar dataKey="gastado" fill={COLOR_GASTADO} name="A&P Gastado" radius={[0, 3, 3, 0]} cursor="pointer" onClick={handleClickMarca}>
                {datosGrafico1.map((entry) => (
                  <Cell key={entry.nombre} fillOpacity={!marcaSeleccionada || marcaSeleccionada === entry.nombre ? 1 : 0.3} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </GraficoBox>

        <GraficoBox titulo="Composición del A&P Gastado">
          {/* Donut con recorte central: sin etiquetas dentro de las
              porciones, con el total gastado superpuesto en el centro del
              agujero. La leyenda "externa" con nombre/€/% va en HTML debajo
              del gráfico. */}
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
                  procesar(rawSellIn, rawSellOut, rawStockInicial, nuevo, rangosPorAnio, mapaMarcas, mapaDistribuidores, marcas);
                }}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-500/15 !text-indigo-700 dark:!text-indigo-300 !border-0"
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
          {/* Solo Sell-In/Sell-Out: el Stock Inicial no tiene mes al que
              asignarse (ver cabecero del archivo), así que este gráfico NO
              incluye su importe — a diferencia del KPI y del gráfico por
              Marca, que sí lo suman. */}
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={datosGrafico4} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={colorGrid} />
              <XAxis dataKey="mes" tick={{ fill: colorEje, fontSize: 11 }} stroke={colorGrid} />
              <YAxis tickFormatter={(v) => formateadorMonedaCorta.format(v)} tick={{ fill: colorEje, fontSize: 11 }} stroke={colorGrid} />
              <Tooltip formatter={(value) => formateadorMoneda.format(value)} contentStyle={tooltipContentStyle} />
              <Legend wrapperStyle={legendStyle} />
              <Line type="monotone" dataKey="generado" stroke={COLORS[0]} strokeWidth={2} name="A&P Generado (Sell-In)" dot={{ r: 3 }} />
              <Line type="monotone" dataKey="gastado" stroke={COLORS[1]} strokeWidth={2} name="A&P Gastado" dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center mt-2">
            El Stock Inicial no aparece aquí (no tiene mes concreto) — sí está incluido en los KPIs y en el gráfico por Marca.
          </p>
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
      <p className={`text-2xl font-semibold ${colorText}`}>{valor}</p>
    </div>
  </div>
);

const GraficoBox = ({ titulo, children }) => (
  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
    <h4 className="text-center text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">{titulo}</h4>
    {children}
  </div>
);

export default PantallaDashboardAPCompania;
