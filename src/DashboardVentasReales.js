/*
 * DashboardVentasReales.js
 * Dashboard de las Ventas Reales importadas desde el Excel mensual de
 * QlikSense (Distribuidor / Familia / Subfamilia=Marca / Uds / Cajas /
 * Importe). Los filtros de Distribuidor/Familia/Subfamilia son reactivos
 * (sin botón "Actualizar"): al cambiarlos, KPIs, gráficos y tabla se
 * recalculan al vuelo.
 *
 * CAMBIO (sustituye a PeriodoSelector.js por completo): el periodo ya no es
 * un único rango Desde/Hasta con una comparativa opcional aparte. Ahora hay
 * un solo componente, PeriodoComparador.js, con dos decisiones
 * independientes:
 *  1. Qué periodo ver (mes / trimestre / semestre / año completo / rango
 *     personalizado de meses).
 *  2. Qué años comparar (cualquier combinación de los años reales del
 *     histórico importado).
 * Eso da un dataset POR AÑO marcado (`datosPorAnio`), no uno solo. La vieja
 * sección "Comparativa de Periodos" (con su tabla y su segundo gráfico,
 * activada marcando "años extra" sobre un único Desde/Hasta) queda
 * eliminada por completo: hacía manualmente, y peor integrada, lo mismo que
 * ahora hace el propio PeriodoComparador — mantener ambas habría sido dos
 * maneras distintas de "comparar años" conviviendo en la misma pantalla.
 *
 * Reglas de qué se ve por año (a petición explícita):
 *  - KPIs: el año más reciente MARCADO es el valor principal; el anterior
 *    (si hay al menos dos marcados) da el delta. Delta es null (no "0%") si
 *    no hay un segundo año marcado.
 *  - Evolución del Importe: una línea por año marcado, eje X = los meses del
 *    periodo elegido (no fijo Ene-Dic).
 *  - Importe por Distribuidor: barras agrupadas, una por año (base y
 *    comparación) para cada uno de los Top 8 distribuidores del año base.
 *  - Importe por Familia: un donut por año (base y comparación), con el
 *    mismo orden/color de familia en ambos para poder comparar a simple
 *    vista, más una leyenda única con el importe de los dos años por fila.
 *  - Detalle y exportación a Excel: solo año base (sí tiene sentido aquí,
 *    a diferencia de los KPIs/gráficos: es un listado de movimientos, no un
 *    resumen — mezclar dos años en la misma tabla sería confuso).
 *
 * CAMBIO (KPIs de concentración/mix + Tipología Vino-Licor, a petición
 * explícita de Sergio): se añaden tres KPIs nuevos y una sección de
 * visualización nueva, todos calculados sobre el mismo par año base/año de
 * comparación que ya usa el resto del dashboard. [Los dos primeros fueron
 * sustituidos después — ver el segundo CAMBIO de más abajo]:
 *  - Tipología principal (peso % Vino/Licor): qué tipología concentra más
 *    importe y con qué peso, por año. La tipología de cada marca viene de
 *    la nueva colección `tipologiasMarca` (pantalla "Tipología
 *    (Vino/Licor)"), con fallback a una sugerencia automática por palabras
 *    clave (`inferirTipologiaPorNombre`) para marcas aún sin clasificar a
 *    mano — así el KPI y el donut nunca excluyen importe por falta de
 *    revisión manual, simplemente lo agrupan bajo "Sin clasificar".
 * La sección "Peso por Tipología" es interactiva igual que Distribuidor y
 * Familia: clic en el donut o en la leyenda filtra todo el dashboard a esa
 * tipología (nuevo `filtros.tipologias`), reutilizando el mismo patrón de
 * `coincideFiltrosCategoria` + `Cell fillOpacity` + chip "Filtrando: X ✕".
 *
 * CAMBIO (a petición de Sergio, tras revisar los "KPIs Avanzados"):
 *  - "Concentración Top 5 Distribuidores" no reflejaba un 80/20 real (era un
 *    Top 5 fijo, contaba qué % se llevaban SIEMPRE 5 distribuidores). Se
 *    sustituye por un Pareto de verdad: cuántos distribuidores (y qué % del
 *    total de distribuidores del periodo/filtro) hacen falta, de mayor a
 *    menor importe, para acumular el 80% del importe total — ver
 *    `calcularConcentracionPareto` y `UMBRAL_PARETO`.
 *  - "Anchura de Línea Media" (mix de marcas por distribuidor) no le
 *    resultaba útil a Sergio. Se sustituye por el mismo cálculo de Pareto
 *    80/20 pero aplicado a Familia en vez de Distribuidor, reutilizando la
 *    misma función genérica.
 *  - "Tipología Principal" mantiene su valor titular (la tipología que más
 *    pesa y su %), pero ahora añade debajo un desglose compacto con el % de
 *    TODAS las tipologías del año base (Vino/Licor/Coctelería/Sin
 *    clasificar) — así se ve de un vistazo qué supone cada una, no solo la
 *    que manda. `KpiBox` admite ahora `children` para poder añadir este
 *    contenido extra sin tocar el resto de tarjetas.
 *
 * CAMBIO (FIX DEFINITIVO, tras investigación con capturas de Sergio: el %
 * de "Sin clasificar" no bajaba aunque en "Tipología de Referencias" todo
 * apareciera ya clasificado): `mapaTipologiaPorMarca` sugería la tipología
 * automática usando el nombre de marca DENORMALIZADO en la propia venta
 * (`v.nombre_marca`, el texto literal del Excel importado, p.ej. "PALOMO
 * CAZADOR"), mientras que TipologiaReferencias.js sugiere sobre el nombre
 * ACTUAL de esa marca en el catálogo `marcas` (p.ej. "Palomo Cazador DO
 * Ribera del Duero", que sí contiene "Ribera" → Vino). Al reconciliar la
 * importación, el texto corto del Excel puede quedar enlazado por id_marca
 * a una marca de catálogo con nombre distinto/más largo — cada pantalla
 * adivinaba entonces sobre un texto distinto y llegaba a una conclusión
 * distinta para la MISMA marca (confirmado comparando el mismo ID de
 * Firestore visible en ambas pantallas). Se corrige recibiendo ahora
 * `marcasGlobales` como prop y usando el nombre+familia del catálogo para
 * la sugerencia automática cuando la marca existe ahí, igual que hace
 * TipologiaReferencias; solo se usa el nombre denormalizado de la venta
 * como último recurso para referencias huérfanas (id_marca sin documento
 * en `marcas`).
 *
 * CAMBIO (paginación, a petición de Sergio - repaso/auditoría de la app):
 * la tabla "Detalle" pintaba TODAS las filas de `filasTabla` de golpe — con
 * un año completo de Ventas Reales importadas (todos los distribuidores x
 * todas las marcas x 12 meses) fácilmente son miles de filas. Ver
 * usePaginacion.js. La exportación a Excel (`handleExportarExcel`) sigue
 * usando `filasTabla` completo, sin paginar.
 *
 * CAMBIO (exportar a PDF, a petición de Sergio): nuevo botón "Exportar KPIs
 * a PDF" junto a "Exportar a Excel", con estilo `botonSecundario` para
 * diferenciarlo visualmente (el de Excel sigue en verde/`botonExito`). A
 * diferencia de Excel, que vuelca `filasTabla` completo (el detalle línea a
 * línea del año base), el PDF (`handleExportarPdf`, ver pdfExport.js) es un
 * resumen ejecutivo con los 7 KPIs que ya se ven en pantalla, comparando
 * año base vs. año de comparación cuando hay dos años marcados.
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronDown, Package, Boxes, Euro, Tag, Target, Layers, Wine } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell, LineChart, Line,
  ResponsiveContainer, CartesianGrid
} from 'recharts';
import * as XLSX from 'xlsx';
import {
  inputClasses, botonSecundario, botonExito, filtroContenedor, etiqueta,
  thClasses, tdClasses, tdRightClasses, trTotales, colorPorSigno
} from './uiClasses';
import PeriodoComparador from './PeriodoComparador';
import { inferirTipologiaPorNombre } from './tipologia';
// Exportar a PDF (resumen ejecutivo de los 7 KPIs), a petición de Sergio —
// ver pdfExport.js. A diferencia de handleExportarExcel (que exporta
// filasTabla, el detalle línea a línea del año base), esto exporta la
// misma tabla de KPIs que ya se ve en pantalla, con año base vs. año de
// comparación cuando hay dos años marcados.
import { crearDocumentoPdf, añadirTablaKpis, descargarPdf } from './pdfExport';
import usePaginacion, { TAMAÑO_PAGINA_DEFECTO } from './usePaginacion';
import Paginacion from './Paginacion';

const formateadorMoneda = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const formateadorMonedaCorta = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const formateadorNumero = new Intl.NumberFormat('es-ES');
// Paleta de "años" (Distribuidor, línea de Evolución, texto de la leyenda de
// Familia): violeta/naranja como primeros dos colores — máximo contraste
// entre año base y año de comparación — con el resto de tonos vivos detrás
// por si se marcan 3+ años. Sustituye a la paleta anterior (indigo/emerald),
// que quedaba correcta pero apagada; a petición explícita de usar colores
// más vivos.
const COLORS = ['#8B5CF6', '#F97316', '#10B981', '#EF4444', '#0EA5E9', '#EAB308', '#EC4899', '#14B8A6'];
const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
// Paleta vívida y diferenciada para el donut de "Importe por Familia" —
// sustituye a la gama vino/dorado/gris anterior, que resultaba plana y poco
// visual (varios tonos de vino demasiado parecidos entre sí). Deliberadamente
// sin solaparse con COLORS (violeta/naranja de arriba) para no confundir
// "color = año" con "color = familia" en la misma pantalla.
const PALETA_FAMILIA = ['#EC4899', '#06B6D4', '#F59E0B', '#84CC16', '#F43F5E', '#14B8A6'];
// Umbral del KPI de concentración 80/20 (Pareto real, ver
// calcularConcentracionPareto): qué fracción del importe total se usa como
// corte — 0.8 = el clásico "80% del importe en manos de una minoría".
const UMBRAL_PARETO = 0.8;
// Paleta de Tipología por NOMBRE (no por índice, a diferencia de
// PALETA_FAMILIA): hay cinco valores posibles (Vino/Licor/Coctelería/Sin
// clasificar/Ajuste-Rappel) y así el color de cada uno es siempre el mismo
// sin importar si algún año no tiene datos de una tipología concreta (el
// filtro por value>0 de más abajo podría dejar los dos donuts con distinto
// número de porciones, y con color-por-índice eso desincronizaría los
// colores). "Ajuste/Rappel" tiene color propio por si algún día se muestra
// en otro sitio, aunque el donut de Tipología no la incluye (ver
// TIPOLOGIAS_PRODUCTO).
const PALETA_TIPOLOGIA = { 'Vino': '#7C2D92', 'Licor': '#F59E0B', 'Coctelería': '#0EA5E9', 'Sin clasificar': '#94A3B8', 'Ajuste/Rappel': '#8B5CF6' };
// Tipologías que SÍ cuentan como "producto vendido" para el donut/leyenda de
// "Peso por Tipología" y para el KPI "Tipología principal": deliberadamente
// NO incluye "Ajuste/Rappel" — esa tipología es para rappels/descuentos/
// abonos (normalmente importe negativo), que no son un producto y
// distorsionarían el reparto real de ventas si se mezclaran en el % de
// peso. Sigue siendo una tipología asignable en la pantalla de
// mantenimiento (para dejar constancia de qué es cada línea), solo que no
// entra en este cálculo concreto.
const TIPOLOGIAS_PRODUCTO = ['Vino', 'Licor', 'Coctelería', 'Sin clasificar'];

// Suma Uds/Cajas/Importe de un array de filas y calcula el precio medio.
// Función de módulo (no depende de nada del componente) para que se pueda
// llamar tanto sobre el año base como sobre el de comparación sin duplicar
// lógica.
const sumarKpis = (filas) => {
  let uds = 0, cajas = 0, importe = 0;
  (filas || []).forEach(f => {
    uds += f.uds || 0;
    cajas += f.cajas || 0;
    importe += f.importe_euros || 0;
  });
  return { uds, cajas, importe, precioMedio: uds > 0 ? importe / uds : 0 };
};

// Detecta si el modo oscuro está activo (igual que en PantallaDashboard.js)
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

function DashboardVentasReales({ ventasReales, tipologiasMarca = [], marcasGlobales = [] }) {
  const modoOscuro = useDarkMode();
  const colorEje = modoOscuro ? '#94a3b8' : '#6b7280';
  const colorGrid = modoOscuro ? '#334155' : '#e5e7eb';
  const tooltipContentStyle = {
    borderRadius: 8,
    fontSize: 13,
    ...(modoOscuro
      ? { backgroundColor: '#475569', border: '1px solid #64748b', color: '#f8fafc', boxShadow: '0 4px 14px rgba(0,0,0,0.45)' }
      : { backgroundColor: '#ffffff', border: '1px solid #e5e7eb', color: '#111827', boxShadow: '0 4px 14px rgba(0,0,0,0.12)' })
  };
  const legendStyle = { fontSize: 12, color: colorEje };

  // Distribuidor/Familia/Subfamilia admiten selección múltiple: un array
  // vacío significa "todos/todas" (sin filtrar); con elementos, se incluye
  // cualquier fila cuyo valor esté en el array (es un OR, no un AND). El
  // periodo/años a comparar ya NO vive aquí — lo controla PeriodoComparador
  // y llega a través de `rangosPorAnio`.
  const [filtros, setFiltros] = useState({
    idsDistribuidor: [],
    familias: [],
    idsMarca: [],
    tipologias: []
  });

  // [{ anio, mesInicio, mesFin }, ...] — uno por año marcado en
  // PeriodoComparador, todos con el mismo rango de meses.
  const [rangosPorAnio, setRangosPorAnio] = useState([]);

  const rangoDisponible = useMemo(() => {
    const meses = ventasReales.map(v => v.mes_ano).filter(Boolean);
    if (meses.length === 0) return null;
    return { min: meses.reduce((a, b) => (b < a ? b : a)), max: meses.reduce((a, b) => (b > a ? b : a)) };
  }, [ventasReales]);

  // Años que existen de verdad en el histórico importado — se pasan tal
  // cual a PeriodoComparador (nunca hardcodeados).
  const aniosDisponibles = useMemo(() => {
    if (!rangoDisponible) return [];
    const minY = parseInt(rangoDisponible.min.split('-')[0], 10);
    const maxY = parseInt(rangoDisponible.max.split('-')[0], 10);
    const arr = [];
    for (let y = minY; y <= maxY; y++) arr.push(y);
    return arr;
  }, [rangoDisponible]);

  const distribuidoresDisponibles = useMemo(() => {
    const mapa = new Map();
    ventasReales.forEach(v => { if (v.id_distribuidor && !mapa.has(v.id_distribuidor)) mapa.set(v.id_distribuidor, v.nombre_distribuidor); });
    return Array.from(mapa, ([id, nombre]) => ({ id, nombre })).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  }, [ventasReales]);

  // Nombre → id de distribuidor, para poder traducir el "nombre" que llega
  // en el payload de clic de una barra (los datos del gráfico solo llevan
  // el nombre) al id que realmente usa el filtro `idsDistribuidor`.
  const mapaDistribuidorPorNombre = useMemo(() => {
    const mapa = new Map();
    distribuidoresDisponibles.forEach(d => mapa.set(d.nombre, d.id));
    return mapa;
  }, [distribuidoresDisponibles]);

  const familiasDisponibles = useMemo(() => {
    const set = new Set();
    ventasReales.forEach(v => { if (v.familia) set.add(v.familia); });
    return Array.from(set).sort();
  }, [ventasReales]);

  const marcasDisponibles = useMemo(() => {
    const mapa = new Map();
    ventasReales.forEach(v => {
      if (!v.id_marca) return;
      if (filtros.familias.length > 0 && !filtros.familias.includes(v.familia)) return;
      if (!mapa.has(v.id_marca)) mapa.set(v.id_marca, v.nombre_marca);
    });
    return Array.from(mapa, ([id, nombre]) => ({ id, nombre })).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  }, [ventasReales, filtros.familias]);

  // Tipología (Vino/Licor) por id_marca: primero la asignación manual de la
  // colección `tipologiasMarca` (pantalla de mantenimiento); si una marca no
  // tiene asignación manual, se usa la sugerencia automática por palabras
  // clave — mismo criterio que TipologiaReferencias usa para "sugerida
  // automáticamente", así el Dashboard y la pantalla de mantenimiento nunca
  // se contradicen. Si tampoco hay sugerencia clara, queda "Sin clasificar"
  // — nunca se excluye importe del total por esto.
  //
  // CAMBIO (bug real detectado con Sergio): la sugerencia automática usaba
  // el nombre TAL CUAL viene denormalizado en la venta (`v.nombre_marca`,
  // el texto literal del Excel, p.ej. "PALOMO CAZADOR"), mientras que
  // TipologiaReferencias.js sugiere sobre el nombre ACTUAL de la marca en
  // el catálogo (p.ej. "Palomo Cazador DO Ribera del Duero" — que sí
  // contiene "Ribera", palabra clave de Vino). Cuando el nombre de venta no
  // coincide textualmente con el de catálogo (habitual: la reconciliación
  // de la importación enlaza el texto corto del Excel a una marca ya
  // existente con un nombre más largo/descriptivo), cada pantalla adivinaba
  // sobre un texto distinto y llegaban a conclusiones distintas — la marca
  // se veía "ya clasificada" (por sugerencia) en Tipología de Referencias
  // pero "Sin clasificar" en el Dashboard. Se corrige usando, para la
  // sugerencia automática, el nombre+familia de la marca EN EL CATÁLOGO
  // (`marcasGlobales`) cuando existe — igual que hace TipologiaReferencias
  // — y solo cayendo al nombre denormalizado de la venta para las
  // referencias huérfanas (id_marca sin documento en `marcas`).
  const mapaTipologiaPorMarca = useMemo(() => {
    const mapa = new Map();
    (tipologiasMarca || []).forEach(t => { if (t.id_marca) mapa.set(t.id_marca, t.tipologia); });
    const mapaCatalogo = new Map((marcasGlobales || []).map(m => [m.id, m]));
    const infoMarca = new Map();
    ventasReales.forEach(v => {
      if (v.id_marca && !infoMarca.has(v.id_marca)) {
        const catalogo = mapaCatalogo.get(v.id_marca);
        infoMarca.set(v.id_marca, catalogo
          ? { nombre: catalogo.nombre_marca, familia: catalogo.familia }
          : { nombre: v.nombre_marca, familia: v.familia });
      }
    });
    infoMarca.forEach((info, idMarca) => {
      if (!mapa.has(idMarca)) {
        const sugerida = inferirTipologiaPorNombre(info.nombre, info.familia);
        if (sugerida) mapa.set(idMarca, sugerida);
      }
    });
    return mapa;
  }, [tipologiasMarca, ventasReales, marcasGlobales]);

  const obtenerTipologia = (v) => mapaTipologiaPorMarca.get(v.id_marca) || 'Sin clasificar';

  // Filtros de categoría (Distribuidor/Familia/Subfamilia/Tipología) — sin
  // tocar el resto, reutilizados tal cual dentro de datosPorAnio.
  const coincideFiltrosCategoria = (v) =>
    (filtros.idsDistribuidor.length === 0 || filtros.idsDistribuidor.includes(v.id_distribuidor)) &&
    (filtros.familias.length === 0 || filtros.familias.includes(v.familia)) &&
    (filtros.idsMarca.length === 0 || filtros.idsMarca.includes(v.id_marca)) &&
    (filtros.tipologias.length === 0 || filtros.tipologias.includes(obtenerTipologia(v)));

  // Un dataset de filas por cada año marcado en PeriodoComparador, cada uno
  // filtrado por su propio [mesInicio, mesFin] (mismo rango de meses en
  // todos, distinto año) y por los filtros de categoría de arriba.
  const datosPorAnio = useMemo(() => {
    const resultado = {};
    rangosPorAnio.forEach(({ anio, meses }) => {
      resultado[anio] = ventasReales.filter(mov => {
        if (!mov.mes_ano) return false;
        const [y, m] = mov.mes_ano.split('-');
        const anioMov = parseInt(y, 10);
        const mesIdx = parseInt(m, 10) - 1;
        return anioMov === Number(anio) && meses.includes(mesIdx) && coincideFiltrosCategoria(mov);
      });
    });
    return resultado;
  },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [rangosPorAnio, ventasReales, filtros.idsDistribuidor, filtros.familias, filtros.idsMarca, filtros.tipologias, mapaTipologiaPorMarca]);

  // Object.keys() siempre da strings, incluso si los años se guardaron como
  // número — es justo lo que queremos: anioBase/anioComparacion se usan como
  // claves de datosPorAnio y como texto en pantalla, nunca en aritmética.
  const aniosOrdenados = Object.keys(datosPorAnio).sort();
  const anioBase = aniosOrdenados[aniosOrdenados.length - 1];
  const anioComparacion = aniosOrdenados.length > 1 ? aniosOrdenados[aniosOrdenados.length - 2] : null;

  const kpisBase = useMemo(() => sumarKpis(datosPorAnio[anioBase]), [datosPorAnio, anioBase]);
  const kpisComparacion = useMemo(
    () => (anioComparacion ? sumarKpis(datosPorAnio[anioComparacion]) : null),
    [datosPorAnio, anioComparacion]
  );

  // null (no "0%") cuando no hay un segundo año marcado con el que comparar
  // — un 0% sería engañoso, parecería "sin cambios" cuando en realidad no
  // hay dato de comparación.
  const calcularDelta = (actual, anterior) => {
    if (!kpisComparacion || !anterior) return null;
    return ((actual - anterior) / anterior) * 100;
  };

  const deltaUds = calcularDelta(kpisBase.uds, kpisComparacion?.uds);
  const deltaCajas = calcularDelta(kpisBase.cajas, kpisComparacion?.cajas);
  const deltaImporte = calcularDelta(kpisBase.importe, kpisComparacion?.importe);
  const deltaPrecioMedio = calcularDelta(kpisBase.precioMedio, kpisComparacion?.precioMedio);

  // Filas del año base y del año de comparación — el detalle y la
  // exportación a Excel siguen usando solo el año base (ver nota del
  // cabecero), pero Distribuidor y Familia ahora comparan ambos años, igual
  // que los KPIs, a petición explícita: enseñar únicamente el año base ahí
  // hacía imposible ver el año anterior en esos dos gráficos.
  const filasAnioBase = useMemo(() => datosPorAnio[anioBase] || [], [datosPorAnio, anioBase]);
  const filasAnioComparacion = useMemo(
    () => (anioComparacion ? datosPorAnio[anioComparacion] || [] : []),
    [datosPorAnio, anioComparacion]
  );

  // Top 8 distribuidores por importe del año base; para cada uno se añade
  // también el importe del año de comparación (0 si ese año no vendió nada
  // a ese distribuidor), para poder pintar una barra al lado de la otra.
  const datosPorDistribuidor = useMemo(() => {
    const aggBase = new Map();
    filasAnioBase.forEach(f => {
      const nombre = f.nombre_distribuidor || 'Desconocido';
      aggBase.set(nombre, (aggBase.get(nombre) || 0) + (f.importe_euros || 0));
    });
    const top8 = Array.from(aggBase.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([nombre]) => nombre);

    const aggComparacion = new Map();
    filasAnioComparacion.forEach(f => {
      const nombre = f.nombre_distribuidor || 'Desconocido';
      aggComparacion.set(nombre, (aggComparacion.get(nombre) || 0) + (f.importe_euros || 0));
    });

    return top8.map(nombre => ({
      nombre,
      [anioBase]: aggBase.get(nombre) || 0,
      ...(anioComparacion ? { [anioComparacion]: aggComparacion.get(nombre) || 0 } : {})
    }));
  }, [filasAnioBase, filasAnioComparacion, anioBase, anioComparacion]);

  // KPI genérico de concentración 80/20 (Pareto real): ordenando las
  // entidades (distribuidor o familia, según `obtenerClave`) de más a menos
  // importe, cuántas hacen falta para acumular el UMBRAL_PARETO (80%) del
  // importe total — y qué % representa esa cantidad sobre el total de
  // entidades del periodo/filtro. Cuantas MENOS entidades (menor %) hagan
  // falta, más concentrado está el negocio en pocas manos. Se usa tanto para
  // Distribuidor como para Familia reutilizando la misma función.
  const calcularConcentracionPareto = (filas, obtenerClave) => {
    if (!filas || filas.length === 0) return null;
    const agg = new Map();
    let total = 0;
    filas.forEach(f => {
      const importe = f.importe_euros || 0;
      total += importe;
      const clave = obtenerClave(f) || 'Desconocido';
      agg.set(clave, (agg.get(clave) || 0) + importe);
    });
    if (total === 0 || agg.size === 0) return null;
    const ordenado = Array.from(agg.values()).sort((a, b) => b - a);
    let acumulado = 0;
    let cantidad = 0;
    for (const valor of ordenado) {
      acumulado += valor;
      cantidad += 1;
      if (acumulado / total >= UMBRAL_PARETO) break;
    }
    return { cantidad, totalEntidades: ordenado.length, pctEntidades: (cantidad / ordenado.length) * 100 };
  };

  const concentracionDistribuidorBase = useMemo(
    () => calcularConcentracionPareto(filasAnioBase, f => f.nombre_distribuidor),
    [filasAnioBase]
  );
  const concentracionDistribuidorComparacion = useMemo(
    () => (anioComparacion ? calcularConcentracionPareto(filasAnioComparacion, f => f.nombre_distribuidor) : null),
    [filasAnioComparacion, anioComparacion]
  );

  const concentracionFamiliaBase = useMemo(
    () => calcularConcentracionPareto(filasAnioBase, f => f.familia),
    [filasAnioBase]
  );
  const concentracionFamiliaComparacion = useMemo(
    () => (anioComparacion ? calcularConcentracionPareto(filasAnioComparacion, f => f.familia) : null),
    [filasAnioComparacion, anioComparacion]
  );

  // El delta compara el % de entidades (no la cantidad en bruto), porque el
  // nº total de distribuidores/familias puede variar de un año a otro — el
  // % es lo comparable de verdad.
  const deltaConcentracionDistribuidor = calcularDelta(concentracionDistribuidorBase?.pctEntidades, concentracionDistribuidorComparacion?.pctEntidades);
  const deltaConcentracionFamilia = calcularDelta(concentracionFamiliaBase?.pctEntidades, concentracionFamiliaComparacion?.pctEntidades);

  // Ranking de familias del año base (mayor a menor importe) — decide tanto
  // qué familias son "principales" (máx. 5, el resto va a "Otros") como el
  // orden y el color que se usa en AMBOS donuts (base y comparación), para
  // que la misma familia use siempre el mismo color en los dos.
  const datosPorFamiliaRanking = useMemo(() => {
    const agg = new Map();
    filasAnioBase.forEach(f => {
      const nombre = f.familia || 'Sin familia';
      agg.set(nombre, (agg.get(nombre) || 0) + (f.importe_euros || 0));
    });
    return Array.from(agg.entries()).sort((a, b) => b[1] - a[1]);
  }, [filasAnioBase]);

  const LIMITE_FAMILIAS = 6;
  const nombresFamiliasPrincipales = datosPorFamiliaRanking.slice(0, LIMITE_FAMILIAS - 1).map(([nombre]) => nombre);
  const hayFamiliasOtros = datosPorFamiliaRanking.length > LIMITE_FAMILIAS - 1;
  const ordenFamilias = hayFamiliasOtros ? [...nombresFamiliasPrincipales, 'Otros'] : nombresFamiliasPrincipales;

  // Agrupa cualquier conjunto de filas (año base o año de comparación) según
  // el mismo ranking de familias de arriba, así los dos donuts son
  // directamente comparables índice a índice.
  const agregarPorFamilia = (filas) => {
    const agg = new Map();
    filas.forEach(f => {
      const nombreOriginal = f.familia || 'Sin familia';
      const clave = nombresFamiliasPrincipales.includes(nombreOriginal) ? nombreOriginal : 'Otros';
      agg.set(clave, (agg.get(clave) || 0) + (f.importe_euros || 0));
    });
    return ordenFamilias.map(nombre => ({ name: nombre, value: agg.get(nombre) || 0 }));
  };

  const datosPorFamiliaAnioBase = useMemo(
    () => agregarPorFamilia(filasAnioBase),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filasAnioBase, ordenFamilias.join(',')]
  );
  const datosPorFamiliaAnioComparacion = useMemo(
    () => (anioComparacion ? agregarPorFamilia(filasAnioComparacion) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filasAnioComparacion, anioComparacion, ordenFamilias.join(',')]
  );

  // Importe agrupado por Tipología (Vino/Licor/Coctelería/Sin clasificar) —
  // a diferencia de Familia, aquí las categorías son fijas
  // (TIPOLOGIAS_PRODUCTO), así que no hace falta un "ranking" previo: basta
  // con sumar y, si alguna categoría no tuvo importe ese año, se omite de
  // ese donut (el color sigue siendo el mismo si reaparece, porque
  // PALETA_TIPOLOGIA es por nombre). Se agrega por TODAS las tipologías
  // (incluida "Ajuste/Rappel") pero solo se devuelven las de
  // TIPOLOGIAS_PRODUCTO — así el importe de rappels/descuentos/abonos queda
  // fuera del donut y de su % sin necesidad de un filtro aparte.
  const agregarPorTipologia = (filas) => {
    const agg = new Map();
    filas.forEach(f => {
      const tipo = obtenerTipologia(f);
      agg.set(tipo, (agg.get(tipo) || 0) + (f.importe_euros || 0));
    });
    return TIPOLOGIAS_PRODUCTO.map(nombre => ({ name: nombre, value: agg.get(nombre) || 0 })).filter(d => d.value > 0);
  };

  const datosPorTipologiaAnioBase = useMemo(
    () => agregarPorTipologia(filasAnioBase),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filasAnioBase, mapaTipologiaPorMarca]
  );
  const datosPorTipologiaAnioComparacion = useMemo(
    () => (anioComparacion ? agregarPorTipologia(filasAnioComparacion) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filasAnioComparacion, anioComparacion, mapaTipologiaPorMarca]
  );

  // KPI "Tipología principal": cuál de las tipologías concentra más importe
  // ese año y qué % del total representa — responde directamente a "el peso
  // porcentual sobre lo que más se vende por tipología" pedido por Sergio.
  const calcularTipologiaPrincipal = (datos) => {
    if (!datos || datos.length === 0) return null;
    const total = datos.reduce((acc, d) => acc + d.value, 0);
    if (total === 0) return null;
    const principal = [...datos].sort((a, b) => b.value - a.value)[0];
    return { nombre: principal.name, pct: (principal.value / total) * 100 };
  };

  const tipologiaPrincipalBase = useMemo(
    () => calcularTipologiaPrincipal(datosPorTipologiaAnioBase),
    [datosPorTipologiaAnioBase]
  );
  const tipologiaPrincipalComparacion = useMemo(
    () => (anioComparacion ? calcularTipologiaPrincipal(datosPorTipologiaAnioComparacion) : null),
    [datosPorTipologiaAnioComparacion, anioComparacion]
  );
  // El delta solo tiene sentido si la tipología principal es LA MISMA en los
  // dos años — comparar el % de "Vino" en un año contra el % de "Licor" en
  // el otro (porque cambió cuál manda) sería una variación sin significado.
  const deltaTipologiaPrincipal = (tipologiaPrincipalBase && tipologiaPrincipalComparacion
    && tipologiaPrincipalBase.nombre === tipologiaPrincipalComparacion.nombre)
    ? calcularDelta(tipologiaPrincipalBase.pct, tipologiaPrincipalComparacion.pct)
    : null;

  // Desglose de TODAS las tipologías (no solo la principal), para mostrar
  // debajo del KPI "Tipología Principal" qué supone cada categoría — a
  // petición de Sergio, sin sustituir el dato titular (la principal), solo
  // añadiéndolo como contexto extra. Incluye el año de comparación (si lo
  // hay) con el mismo peso visual que el año base — a diferencia del valor
  // titular de la tarjeta (grande vs. pequeño), aquí las tres categorías
  // deben verse igual de "importantes" entre sí y entre los dos años.
  const desgloseTipologia = useMemo(() => {
    const totalBase = datosPorTipologiaAnioBase.reduce((acc, d) => acc + d.value, 0);
    const totalComparacion = datosPorTipologiaAnioComparacion.reduce((acc, d) => acc + d.value, 0);
    const nombres = new Set([
      ...datosPorTipologiaAnioBase.map(d => d.name),
      ...datosPorTipologiaAnioComparacion.map(d => d.name)
    ]);
    return TIPOLOGIAS_PRODUCTO
      .filter(nombre => nombres.has(nombre))
      .map(nombre => {
        const base = datosPorTipologiaAnioBase.find(d => d.name === nombre);
        const comparacion = datosPorTipologiaAnioComparacion.find(d => d.name === nombre);
        return {
          nombre,
          pctBase: totalBase > 0 && base ? (base.value / totalBase) * 100 : 0,
          pctComparacion: (anioComparacion && totalComparacion > 0 && comparacion) ? (comparacion.value / totalComparacion) * 100 : null,
        };
      })
      .sort((a, b) => b.pctBase - a.pctBase);
  }, [datosPorTipologiaAnioBase, datosPorTipologiaAnioComparacion, anioComparacion]);

  // Una fila por mes ELEGIDO (no fijo Ene-Dic, y no necesariamente
  // consecutivos — p.ej. Ene+Abr+Jul si así se marcaron), con una columna de
  // importe por cada año marcado — así se pueden solapar varias líneas (una
  // por año) sobre el mismo eje de meses.
  const datosEvolucionPorAnio = useMemo(() => {
    if (rangosPorAnio.length === 0) return [];
    const meses = [...rangosPorAnio[0].meses].sort((a, b) => a - b);
    const filas = [];
    meses.forEach(m => {
      const fila = { mes: MESES_CORTOS[m] };
      aniosOrdenados.forEach(anio => {
        let importe = 0;
        (datosPorAnio[anio] || []).forEach(f => {
          const mesIdx = parseInt(f.mes_ano.split('-')[1], 10) - 1;
          if (mesIdx === m) importe += f.importe_euros || 0;
        });
        fila[anio] = importe;
      });
      filas.push(fila);
    });
    return filas;
  },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [rangosPorAnio, datosPorAnio, aniosOrdenados.join(',')]);

  const filasTabla = useMemo(() =>
    [...filasAnioBase].sort((a, b) => (b.mes_ano || '').localeCompare(a.mes_ano || '')),
  [filasAnioBase]);

  // Paginación de la tabla "Detalle" (ver usePaginacion.js y cabecera del
  // archivo). handleExportarExcel, más abajo, sigue usando filasTabla
  // completo — la paginación es solo para lo que se pinta en pantalla.
  const { pagina, totalPaginas, itemsPagina, irPaginaAnterior, irPaginaSiguiente } = usePaginacion(filasTabla);

  const handleLimpiarFiltros = () => {
    setFiltros({ idsDistribuidor: [], familias: [], idsMarca: [], tipologias: [] });
  };

  // TARJETAS INTERACTIVAS: clic en una barra de "Importe por Distribuidor" o
  // en una porción/fila de leyenda de "Importe por Familia" filtra TODO el
  // dashboard (KPIs, el otro gráfico, evolución y tabla) a ese elemento —
  // reutiliza exactamente los mismos `filtros.idsDistribuidor`/`familias`
  // que ya usan los desplegables de arriba, así que no hace falta ninguna
  // lógica de filtrado nueva: basta con que el clic los actualice. Un
  // segundo clic sobre el mismo elemento lo desmarca (vuelve a "todos").
  // Recharts entrega el dato del punto pinchado unas veces plano y otras
  // anidado en `.payload` según el gráfico — se comprueban ambas formas.
  const obtenerNombreDePayload = (d) => d?.payload?.nombre ?? d?.nombre ?? d?.payload?.name ?? d?.name;

  const handleClickDistribuidor = (payload) => {
    const nombre = obtenerNombreDePayload(payload);
    const id = mapaDistribuidorPorNombre.get(nombre);
    if (!id) return;
    setFiltros(prev => {
      const yaActivo = prev.idsDistribuidor.length === 1 && prev.idsDistribuidor[0] === id;
      return { ...prev, idsDistribuidor: yaActivo ? [] : [id] };
    });
  };

  const handleClickFamilia = (payload) => {
    const nombre = obtenerNombreDePayload(payload);
    if (!nombre || nombre === 'Otros') return; // "Otros" es un cajón de varias familias reales: filtrar por ese texto literal no encontraría nada.
    setFiltros(prev => {
      const yaActivo = prev.familias.length === 1 && prev.familias[0] === nombre;
      return { ...prev, familias: yaActivo ? [] : [nombre], idsMarca: [] };
    });
  };

  const handleClickTipologia = (payload) => {
    const nombre = obtenerNombreDePayload(payload);
    if (!nombre) return;
    setFiltros(prev => {
      const yaActivo = prev.tipologias.length === 1 && prev.tipologias[0] === nombre;
      return { ...prev, tipologias: yaActivo ? [] : [nombre] };
    });
  };

  const distribuidorSeleccionado = filtros.idsDistribuidor.length === 1
    ? distribuidoresDisponibles.find(d => d.id === filtros.idsDistribuidor[0])?.nombre
    : null;
  const familiaSeleccionada = filtros.familias.length === 1 ? filtros.familias[0] : null;
  const tipologiaSeleccionada = filtros.tipologias.length === 1 ? filtros.tipologias[0] : null;

  const handleExportarExcel = () => {
    if (filasTabla.length === 0) {
      alert('No hay datos filtrados para exportar.');
      return;
    }
    const datos = filasTabla.map(f => ({
      "Mes/Año": f.mes_ano,
      "Distribuidor": f.nombre_distribuidor,
      "Familia": f.familia,
      "Subfamilia (Marca)": f.nombre_marca,
      "Uds": f.uds,
      "Cajas": f.cajas,
      "Importe (€)": f.importe_euros
    }));
    const worksheet = XLSX.utils.json_to_sheet(datos);
    worksheet['!cols'] = [{ wch: 10 }, { wch: 30 }, { wch: 20 }, { wch: 30 }, { wch: 10 }, { wch: 10 }, { wch: 14 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Ventas Reales");
    XLSX.writeFile(workbook, `VentasReales_${anioBase || 'sin_datos'}.xlsx`);
  };

  // Exportar a PDF (resumen ejecutivo de los 7 KPIs, ver pdfExport.js) — a
  // petición de Sergio. Los KPIs "de texto" (concentración, tipología
  // principal) van como valorBase/valorComparacion ya formateados en texto
  // (no tiene sentido una columna "Variación" separada para ellos además del
  // texto, así que su delta no se pasa por separado salvo donde ya existe
  // como número comparable).
  const handleExportarPdf = () => {
    const subtitulo = `Año ${anioBase}${anioComparacion ? ` vs. ${anioComparacion}` : ''}`;
    const doc = crearDocumentoPdf('Dashboard de Ventas Reales', subtitulo);
    añadirTablaKpis(doc, [
      {
        label: 'Unidades Vendidas',
        valorBase: formateadorNumero.format(kpisBase.uds),
        valorComparacion: kpisComparacion ? formateadorNumero.format(kpisComparacion.uds) : null,
        delta: deltaUds,
      },
      {
        label: 'Cajas Vendidas',
        valorBase: formateadorNumero.format(Math.round(kpisBase.cajas)),
        valorComparacion: kpisComparacion ? formateadorNumero.format(Math.round(kpisComparacion.cajas)) : null,
        delta: deltaCajas,
      },
      {
        label: 'Importe Total',
        valorBase: formateadorMoneda.format(kpisBase.importe),
        valorComparacion: kpisComparacion ? formateadorMoneda.format(kpisComparacion.importe) : null,
        delta: deltaImporte,
      },
      {
        label: 'Precio Medio / Ud',
        valorBase: formateadorMoneda.format(kpisBase.precioMedio),
        valorComparacion: kpisComparacion ? formateadorMoneda.format(kpisComparacion.precioMedio) : null,
        delta: deltaPrecioMedio,
      },
      {
        label: 'Concentración 80/20 (Distribuidores)',
        valorBase: concentracionDistribuidorBase ? `${concentracionDistribuidorBase.cantidad} distrib. (${concentracionDistribuidorBase.pctEntidades.toFixed(0)}%)` : '—',
        valorComparacion: concentracionDistribuidorComparacion ? `${concentracionDistribuidorComparacion.cantidad} distrib. (${concentracionDistribuidorComparacion.pctEntidades.toFixed(0)}%)` : null,
        delta: deltaConcentracionDistribuidor,
      },
      {
        label: 'Concentración 80/20 (Familias)',
        valorBase: concentracionFamiliaBase ? `${concentracionFamiliaBase.cantidad} familias (${concentracionFamiliaBase.pctEntidades.toFixed(0)}%)` : '—',
        valorComparacion: concentracionFamiliaComparacion ? `${concentracionFamiliaComparacion.cantidad} familias (${concentracionFamiliaComparacion.pctEntidades.toFixed(0)}%)` : null,
        delta: deltaConcentracionFamilia,
      },
      {
        label: 'Tipología Principal',
        valorBase: tipologiaPrincipalBase ? `${tipologiaPrincipalBase.nombre} · ${tipologiaPrincipalBase.pct.toFixed(0)}%` : '—',
        valorComparacion: tipologiaPrincipalComparacion ? `${tipologiaPrincipalComparacion.nombre} · ${tipologiaPrincipalComparacion.pct.toFixed(0)}%` : null,
        delta: deltaTipologiaPrincipal,
      },
    ], { anioBase, anioComparacion });
    descargarPdf(doc, `Dashboard_VentasReales_${anioBase || 'sin_datos'}.pdf`);
  };

  return (
    <div>
      <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-4">Dashboard de Ventas Reales</h3>

      <PeriodoComparador aniosDisponibles={aniosDisponibles} onChange={setRangosPorAnio} />

      <div className={filtroContenedor}>
        <div className="flex items-center gap-2">
          <label className={etiqueta}>Distribuidor:</label>
          <MultiSelectDropdown
            opciones={distribuidoresDisponibles.map(d => ({ value: d.id, label: d.nombre }))}
            seleccionados={filtros.idsDistribuidor}
            onChange={(nuevos) => setFiltros(prev => ({ ...prev, idsDistribuidor: nuevos }))}
            placeholder="-- Todos --"
            anchoClase="min-w-[180px]"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className={etiqueta}>Familia:</label>
          <MultiSelectDropdown
            opciones={familiasDisponibles.map(f => ({ value: f, label: f }))}
            seleccionados={filtros.familias}
            onChange={(nuevos) => setFiltros(prev => ({ ...prev, familias: nuevos, idsMarca: [] }))}
            placeholder="-- Todas --"
            anchoClase="min-w-[160px]"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className={etiqueta}>Subfamilia (Marca):</label>
          <MultiSelectDropdown
            opciones={marcasDisponibles.map(m => ({ value: m.id, label: m.nombre }))}
            seleccionados={filtros.idsMarca}
            onChange={(nuevos) => setFiltros(prev => ({ ...prev, idsMarca: nuevos }))}
            placeholder="-- Todas --"
            anchoClase="min-w-[180px]"
          />
        </div>

        <button className={`${botonSecundario} ml-auto`} onClick={handleLimpiarFiltros}>Limpiar</button>
      </div>

      {rangoDisponible ? (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
          Datos cargados desde <strong>{rangoDisponible.min}</strong> hasta <strong>{rangoDisponible.max}</strong>.
        </p>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-4">
          Todavía no hay ventas reales importadas. Usa la pestaña "Importar Excel (QlikSense)" para subir el primer archivo.
        </p>
      )}

      {rangoDisponible && aniosOrdenados.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-4">
          Marca al menos un año arriba, en "Qué años comparar", para ver los datos.
        </p>
      )}

      {rangoDisponible && aniosOrdenados.length > 0 && (
        <>
          <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mt-7 mb-3">KPIs</h4>
          <div className="flex flex-wrap gap-4">
            <KpiBox
              titulo="UNIDADES VENDIDAS"
              Icon={Package}
              anioBase={anioBase}
              valorBase={formateadorNumero.format(kpisBase.uds)}
              anioComparacion={anioComparacion}
              valorComparacion={kpisComparacion ? formateadorNumero.format(kpisComparacion.uds) : null}
              delta={deltaUds}
              colorText="text-indigo-600 dark:text-indigo-400"
              colorBg="bg-indigo-50 dark:bg-indigo-500/10"
            />
            <KpiBox
              titulo="CAJAS VENDIDAS"
              Icon={Boxes}
              anioBase={anioBase}
              valorBase={formateadorNumero.format(Math.round(kpisBase.cajas))}
              anioComparacion={anioComparacion}
              valorComparacion={kpisComparacion ? formateadorNumero.format(Math.round(kpisComparacion.cajas)) : null}
              delta={deltaCajas}
              colorText="text-sky-600 dark:text-sky-400"
              colorBg="bg-sky-50 dark:bg-sky-500/10"
            />
            <KpiBox
              titulo="IMPORTE TOTAL"
              Icon={Euro}
              ancho="grande"
              anioBase={anioBase}
              valorBase={formateadorMoneda.format(kpisBase.importe)}
              anioComparacion={anioComparacion}
              valorComparacion={kpisComparacion ? formateadorMoneda.format(kpisComparacion.importe) : null}
              delta={deltaImporte}
              colorText="text-emerald-600 dark:text-emerald-400"
              colorBg="bg-emerald-50 dark:bg-emerald-500/10"
            />
            <KpiBox
              titulo="PRECIO MEDIO / UD"
              Icon={Tag}
              anioBase={anioBase}
              valorBase={formateadorMoneda.format(kpisBase.precioMedio)}
              anioComparacion={anioComparacion}
              valorComparacion={kpisComparacion ? formateadorMoneda.format(kpisComparacion.precioMedio) : null}
              delta={deltaPrecioMedio}
              colorText="text-amber-600 dark:text-amber-400"
              colorBg="bg-amber-50 dark:bg-amber-500/10"
            />
          </div>

          <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mt-7 mb-3">KPIs Avanzados</h4>
          <div className="flex flex-wrap gap-4">
            <KpiBox
              titulo="CONCENTRACIÓN 80/20 (DISTRIBUIDORES)"
              Icon={Target}
              anioBase={anioBase}
              valorBase={concentracionDistribuidorBase ? `${concentracionDistribuidorBase.cantidad} distrib. (${concentracionDistribuidorBase.pctEntidades.toFixed(0)}%)` : '—'}
              anioComparacion={anioComparacion}
              valorComparacion={concentracionDistribuidorComparacion ? `${concentracionDistribuidorComparacion.cantidad} distrib. (${concentracionDistribuidorComparacion.pctEntidades.toFixed(0)}%)` : null}
              delta={deltaConcentracionDistribuidor}
              colorText="text-fuchsia-600 dark:text-fuchsia-400"
              colorBg="bg-fuchsia-50 dark:bg-fuchsia-500/10"
            />
            <KpiBox
              titulo="CONCENTRACIÓN 80/20 (FAMILIAS)"
              Icon={Layers}
              anioBase={anioBase}
              valorBase={concentracionFamiliaBase ? `${concentracionFamiliaBase.cantidad} familias (${concentracionFamiliaBase.pctEntidades.toFixed(0)}%)` : '—'}
              anioComparacion={anioComparacion}
              valorComparacion={concentracionFamiliaComparacion ? `${concentracionFamiliaComparacion.cantidad} familias (${concentracionFamiliaComparacion.pctEntidades.toFixed(0)}%)` : null}
              delta={deltaConcentracionFamilia}
              colorText="text-cyan-600 dark:text-cyan-400"
              colorBg="bg-cyan-50 dark:bg-cyan-500/10"
            />
            <KpiBox
              titulo="TIPOLOGÍA PRINCIPAL"
              Icon={Wine}
              anioBase={anioBase}
              valorBase={tipologiaPrincipalBase ? `${tipologiaPrincipalBase.nombre} · ${tipologiaPrincipalBase.pct.toFixed(0)}%` : '—'}
              anioComparacion={anioComparacion}
              valorComparacion={tipologiaPrincipalComparacion ? `${tipologiaPrincipalComparacion.nombre} · ${tipologiaPrincipalComparacion.pct.toFixed(0)}%` : null}
              delta={deltaTipologiaPrincipal}
              colorText="text-rose-600 dark:text-rose-400"
              colorBg="bg-rose-50 dark:bg-rose-500/10"
              ocultarValores
            >
              {desgloseTipologia.length > 0 && (
                <div>
                  {anioComparacion && (
                    <div className="flex justify-between items-center text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1.5">
                      <span></span>
                      <span className="flex items-center gap-3">
                        <span className="w-14 text-right">{anioBase}</span>
                        <span className="w-14 text-right">{anioComparacion}</span>
                      </span>
                    </div>
                  )}
                  {desgloseTipologia.map(d => (
                    <div key={d.nombre} className="flex justify-between items-center text-base text-slate-500 dark:text-slate-400 py-1.5">
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: PALETA_TIPOLOGIA[d.nombre] }} />
                        {d.nombre}
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="w-14 text-right font-bold text-slate-700 dark:text-slate-200">{d.pctBase.toFixed(0)}%</span>
                        {anioComparacion && (
                          <span className="w-14 text-right font-bold text-slate-700 dark:text-slate-200">
                            {d.pctComparacion != null ? `${d.pctComparacion.toFixed(0)}%` : '—'}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </KpiBox>
          </div>

          <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mt-7 mb-3">Visualizaciones</h4>
          <div className="grid gap-5 grid-cols-[repeat(auto-fit,minmax(min(440px,100%),1fr))]">

            <GraficoBox titulo={anioComparacion ? `Importe por Distribuidor (Top 8) — ${anioBase} vs. ${anioComparacion}` : `Importe por Distribuidor (Top 8) — ${anioBase}`}>
              {/* Tarjeta interactiva: clic en una barra filtra todo el dashboard a ese
                  distribuidor (mismo filtro que el desplegable "Distribuidor" de arriba).
                  Un segundo clic sobre la misma barra quita el filtro. */}
              {distribuidorSeleccionado && (
                <div className="flex justify-center mb-2">
                  <button
                    type="button"
                    onClick={() => setFiltros(prev => ({ ...prev, idsDistribuidor: [] }))}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-wine-soft !text-slate-900 dark:!text-white !border-0"
                  >
                    Filtrando: {distribuidorSeleccionado} ✕
                  </button>
                </div>
              )}
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={datosPorDistribuidor} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={colorGrid} />
                  <XAxis type="number" tickFormatter={(v) => formateadorMonedaCorta.format(v)} tick={{ fill: colorEje, fontSize: 11 }} stroke={colorGrid} />
                  <YAxis dataKey="nombre" type="category" tick={{ fill: colorEje, fontSize: 11 }} stroke={colorGrid} width={130} />
                  <Tooltip formatter={(value) => formateadorMoneda.format(value)} contentStyle={tooltipContentStyle} />
                  {anioComparacion && <Legend wrapperStyle={legendStyle} />}
                  <Bar dataKey={anioBase} name={anioBase} fill={COLORS[0]} radius={[0, 3, 3, 0]} cursor="pointer" onClick={handleClickDistribuidor}>
                    {datosPorDistribuidor.map((entry) => (
                      <Cell key={entry.nombre} fillOpacity={!distribuidorSeleccionado || distribuidorSeleccionado === entry.nombre ? 1 : 0.3} />
                    ))}
                  </Bar>
                  {anioComparacion && (
                    <Bar dataKey={anioComparacion} name={anioComparacion} fill={COLORS[1]} radius={[0, 3, 3, 0]} cursor="pointer" onClick={handleClickDistribuidor}>
                      {datosPorDistribuidor.map((entry) => (
                        <Cell key={entry.nombre} fillOpacity={!distribuidorSeleccionado || distribuidorSeleccionado === entry.nombre ? 1 : 0.3} />
                      ))}
                    </Bar>
                  )}
                </BarChart>
              </ResponsiveContainer>
            </GraficoBox>

            <GraficoBox titulo={anioComparacion ? `Importe por Familia — ${anioBase} vs. ${anioComparacion}` : `Importe por Familia — ${anioBase}`}>
              {/* Tarjeta interactiva: clic en una porción del rosco o en una fila de la
                  leyenda filtra todo el dashboard a esa familia (mismo filtro que el
                  desplegable "Familia" de arriba). Un segundo clic la quita. "Otros"
                  no es clicable (es una suma de varias familias reales, no una familia). */}
              {familiaSeleccionada && (
                <div className="flex justify-center mb-2">
                  <button
                    type="button"
                    onClick={() => setFiltros(prev => ({ ...prev, familias: [] }))}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-wine-soft !text-slate-900 dark:!text-white !border-0"
                  >
                    Filtrando: {familiaSeleccionada} ✕
                  </button>
                </div>
              )}
              <div className={`flex ${anioComparacion ? 'flex-row' : 'justify-center'} gap-2`}>
                <div className="flex-1 min-w-0">
                  <p className="text-center text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1">{anioBase}</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={datosPorFamiliaAnioBase} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={75} cursor="pointer" onClick={handleClickFamilia}>
                        {datosPorFamiliaAnioBase.map((entry, i) => (
                          <Cell key={entry.name} fill={PALETA_FAMILIA[i % PALETA_FAMILIA.length]} fillOpacity={!familiaSeleccionada || familiaSeleccionada === entry.name ? 1 : 0.3} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formateadorMoneda.format(value)} contentStyle={tooltipContentStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {anioComparacion && (
                  <div className="flex-1 min-w-0">
                    <p className="text-center text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1">{anioComparacion}</p>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={datosPorFamiliaAnioComparacion} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={75} cursor="pointer" onClick={handleClickFamilia}>
                          {datosPorFamiliaAnioComparacion.map((entry, i) => (
                            <Cell key={entry.name} fill={PALETA_FAMILIA[i % PALETA_FAMILIA.length]} fillOpacity={!familiaSeleccionada || familiaSeleccionada === entry.name ? 1 : 0.3} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => formateadorMoneda.format(value)} contentStyle={tooltipContentStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className="mt-2.5 border-t border-slate-100 dark:border-slate-800 pt-2.5">
                {datosPorFamiliaAnioBase.map((d, i) => {
                  const totalBase = datosPorFamiliaAnioBase.reduce((acc, x) => acc + x.value, 0);
                  const pctBase = totalBase > 0 ? (d.value / totalBase) * 100 : 0;
                  const comparacion = datosPorFamiliaAnioComparacion[i];
                  const totalComparacion = datosPorFamiliaAnioComparacion.reduce((acc, x) => acc + x.value, 0);
                  const pctComparacion = comparacion && totalComparacion > 0 ? (comparacion.value / totalComparacion) * 100 : 0;
                  const esClicable = d.name !== 'Otros';
                  return (
                    <div
                      key={d.name}
                      onClick={() => handleClickFamilia(d)}
                      className={`flex justify-between items-center text-sm py-1 px-1.5 -mx-1.5 rounded-md transition-colors text-slate-700 dark:text-slate-300
                        ${esClicable ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60' : ''}
                        ${familiaSeleccionada === d.name ? 'bg-slate-100 dark:bg-slate-800' : ''}`}
                    >
                      <span className="flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-sm inline-block"
                          style={{ backgroundColor: PALETA_FAMILIA[i % PALETA_FAMILIA.length] }}
                        />
                        {d.name}
                      </span>
                      {/* Los dos años se escriben con el mismo tamaño/peso de letra — ninguno es
                          "el importante" y el otro "la letra pequeña" — y cada año usa un color
                          fijo propio (el mismo que sus barras en "Importe por Distribuidor"),
                          igual que el rosco distingue familias por color. */}
                      <span className="text-right">
                        <span className="text-sm font-semibold" style={{ color: COLORS[0] }}>
                          {anioBase}: {formateadorMoneda.format(d.value)} ({pctBase.toFixed(0)}%)
                        </span>
                        {comparacion && (
                          <span className="block text-sm font-semibold" style={{ color: COLORS[1] }}>
                            {anioComparacion}: {formateadorMoneda.format(comparacion.value)} ({pctComparacion.toFixed(0)}%)
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </GraficoBox>

            <GraficoBox titulo="Evolución del Importe por Año">
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={datosEvolucionPorAnio} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={colorGrid} />
                  <XAxis dataKey="mes" tick={{ fill: colorEje, fontSize: 11 }} stroke={colorGrid} />
                  <YAxis tickFormatter={(v) => formateadorMonedaCorta.format(v)} tick={{ fill: colorEje, fontSize: 11 }} stroke={colorGrid} />
                  <Tooltip formatter={(value) => formateadorMoneda.format(value)} contentStyle={tooltipContentStyle} />
                  <Legend wrapperStyle={legendStyle} />
                  {aniosOrdenados.map((anio, i) => (
                    <Line key={anio} type="monotone" dataKey={anio} name={anio} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </GraficoBox>

            <GraficoBox titulo={anioComparacion ? `Peso por Tipología (Vino/Licor/Coctelería) — ${anioBase} vs. ${anioComparacion}` : `Peso por Tipología (Vino/Licor/Coctelería) — ${anioBase}`}>
              {/* Tarjeta interactiva, mismo patrón que Distribuidor/Familia: clic en el
                  rosco o en una fila de la leyenda filtra todo el dashboard a esa
                  tipología. Un segundo clic la quita. */}
              {tipologiaSeleccionada && (
                <div className="flex justify-center mb-2">
                  <button
                    type="button"
                    onClick={() => setFiltros(prev => ({ ...prev, tipologias: [] }))}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-wine-soft !text-slate-900 dark:!text-white !border-0"
                  >
                    Filtrando: {tipologiaSeleccionada} ✕
                  </button>
                </div>
              )}
              <div className={`flex ${anioComparacion ? 'flex-row' : 'justify-center'} gap-2`}>
                <div className="flex-1 min-w-0">
                  <p className="text-center text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1">{anioBase}</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={datosPorTipologiaAnioBase} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={75} cursor="pointer" onClick={handleClickTipologia}>
                        {datosPorTipologiaAnioBase.map((entry) => (
                          <Cell key={entry.name} fill={PALETA_TIPOLOGIA[entry.name]} fillOpacity={!tipologiaSeleccionada || tipologiaSeleccionada === entry.name ? 1 : 0.3} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formateadorMoneda.format(value)} contentStyle={tooltipContentStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {anioComparacion && (
                  <div className="flex-1 min-w-0">
                    <p className="text-center text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1">{anioComparacion}</p>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={datosPorTipologiaAnioComparacion} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={75} cursor="pointer" onClick={handleClickTipologia}>
                          {datosPorTipologiaAnioComparacion.map((entry) => (
                            <Cell key={entry.name} fill={PALETA_TIPOLOGIA[entry.name]} fillOpacity={!tipologiaSeleccionada || tipologiaSeleccionada === entry.name ? 1 : 0.3} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => formateadorMoneda.format(value)} contentStyle={tooltipContentStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className="mt-2.5 border-t border-slate-100 dark:border-slate-800 pt-2.5">
                {datosPorTipologiaAnioBase.map((d) => {
                  const totalBase = datosPorTipologiaAnioBase.reduce((acc, x) => acc + x.value, 0);
                  const pctBase = totalBase > 0 ? (d.value / totalBase) * 100 : 0;
                  const comparacion = datosPorTipologiaAnioComparacion.find(x => x.name === d.name);
                  const totalComparacion = datosPorTipologiaAnioComparacion.reduce((acc, x) => acc + x.value, 0);
                  const pctComparacion = comparacion && totalComparacion > 0 ? (comparacion.value / totalComparacion) * 100 : 0;
                  return (
                    <div
                      key={d.name}
                      onClick={() => handleClickTipologia(d)}
                      className={`flex justify-between items-center text-sm py-1 px-1.5 -mx-1.5 rounded-md transition-colors text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60
                        ${tipologiaSeleccionada === d.name ? 'bg-slate-100 dark:bg-slate-800' : ''}`}
                    >
                      <span className="flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-sm inline-block"
                          style={{ backgroundColor: PALETA_TIPOLOGIA[d.name] }}
                        />
                        {d.name}
                      </span>
                      <span className="text-right">
                        <span className="text-sm font-semibold" style={{ color: COLORS[0] }}>
                          {anioBase}: {formateadorMoneda.format(d.value)} ({pctBase.toFixed(0)}%)
                        </span>
                        {comparacion && (
                          <span className="block text-sm font-semibold" style={{ color: COLORS[1] }}>
                            {anioComparacion}: {formateadorMoneda.format(comparacion.value)} ({pctComparacion.toFixed(0)}%)
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </GraficoBox>
          </div>

          <div className="flex justify-between items-center mt-8 mb-3">
            <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Detalle — {anioBase}</h4>
            <div className="flex gap-2">
              <button onClick={handleExportarPdf} className={botonSecundario}>Exportar KPIs a PDF</button>
              <button onClick={handleExportarExcel} className={botonExito}>Exportar a Excel</button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className={thClasses}>Mes/Año</th>
                  <th className={thClasses}>Distribuidor</th>
                  <th className={thClasses}>Familia</th>
                  <th className={thClasses}>Subfamilia (Marca)</th>
                  <th className={thClasses}>Uds</th>
                  <th className={thClasses}>Cajas</th>
                  <th className={thClasses}>Importe (€)</th>
                </tr>
              </thead>
              <tbody>
                {filasTabla.length > 0 ? (
                  itemsPagina.map(f => (
                    <tr key={f.id}>
                      <td className={tdClasses}>{f.mes_ano}</td>
                      <td className={`${tdClasses} font-semibold`}>{f.nombre_distribuidor}</td>
                      <td className={tdClasses}>{f.familia || '—'}</td>
                      <td className={tdClasses}>
                        {f.nombre_marca}
                        {tipologiaSeleccionada === 'Sin clasificar' && (
                          <div className="mt-0.5 font-mono text-[10px] text-slate-400 dark:text-slate-600">
                            ID: {f.id_marca || '(sin id_marca)'}
                          </div>
                        )}
                      </td>
                      <td className={tdRightClasses}>{formateadorNumero.format(f.uds || 0)}</td>
                      <td className={tdRightClasses}>{formateadorNumero.format(Math.round(f.cajas || 0))}</td>
                      <td className={tdRightClasses}>{formateadorMoneda.format(f.importe_euros || 0)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" className={`${tdClasses} text-center py-5`}>No hay ventas reales que coincidan con los filtros.</td>
                  </tr>
                )}
                {filasTabla.length > 0 && (
                  <tr className={trTotales}>
                    <td className={tdClasses}>TOTALES</td>
                    <td className={tdClasses}></td>
                    <td className={tdClasses}></td>
                    <td className={tdClasses}></td>
                    <td className={tdRightClasses}>{formateadorNumero.format(kpisBase.uds)}</td>
                    <td className={tdRightClasses}>{formateadorNumero.format(Math.round(kpisBase.cajas))}</td>
                    <td className={tdRightClasses}>{formateadorMoneda.format(kpisBase.importe)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <Paginacion
            pagina={pagina}
            totalPaginas={totalPaginas}
            totalRegistros={filasTabla.length}
            tamañoPagina={TAMAÑO_PAGINA_DEFECTO}
            onAnterior={irPaginaAnterior}
            onSiguiente={irPaginaSiguiente}
          />
        </>
      )}
    </div>
  );
}

// Se muestran los valores REALES de los dos años (base y comparación) uno
// junto al otro — no solo el valor del año base con un "-35%" debajo, que
// obliga a adivinar de memoria cuál era el número del año anterior. El %
// de variación se conserva como dato adicional, debajo de ambos, no como
// sustituto del dato de comparación.
// `anioComparacion`/`valorComparacion`/`delta` son null cuando solo hay un
// año marcado — en ese caso no se muestra ni la segunda columna ni el %.
// Tamaño de letra y caja de icono igualados al KpiBox de PantallaDashboard.js
// (Dashboard de Gestión) — a petición explícita de que esta tarjeta se vea
// igual de grande que aquella.
//
// No todas las tarjetas necesitan el mismo ancho: "Importe Total" muestra
// dos importes en euros (miles + decimales + símbolo), bastante más largos
// que un entero de unidades/cajas o un precio unitario — con el mismo
// min-width que las demás, el segundo importe (año de comparación) se salía
// de la tarjeta. `ancho="grande"` le da más sitio; el resto usa "normal" y
// se reparten el espacio sobrante por igual entre ellas (mismo flex-grow),
// para que se vean parejas.
const ANCHOS_KPI = {
  normal: 'flex-1 min-w-[230px]',
  grande: 'flex-[1.6] min-w-[360px]',
};

// `children` (opcional) permite añadir contenido extra debajo del delta sin
// afectar a las tarjetas que no lo usan — por ahora solo lo usa "Tipología
// Principal" para su desglose de categorías.
const KpiBox = ({ titulo, Icon, ancho = 'normal', anioBase, valorBase, anioComparacion, valorComparacion, delta, colorText, colorBg, ocultarValores = false, children }) => (
  <div className={`${ANCHOS_KPI[ancho]} bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm`}>
    <div className="flex items-center gap-3 mb-3">
      <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${colorBg}`}>
        <Icon size={20} className={colorText} />
      </div>
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 tracking-wide">{titulo}</p>
    </div>

    {/* CAMBIO (a petición de Sergio): "Tipología Principal" ya no destaca un
        único valor titular grande (p.ej. "Vino · 86%") con el desglose de
        las 3 categorías como nota pequeña debajo — a Sergio le resultaba
        redundante con el desglose y quería que las 3 categorías se vean
        igual de grandes/protagonistas. `ocultarValores` oculta este bloque
        (valor grande + comparación + delta) para esa tarjeta, dejando solo
        el desglose (via `children`) como contenido principal. El resto de
        tarjetas no pasan esta prop y siguen mostrando el valor titular como
        siempre. */}
    {!ocultarValores && (
      <>
        <div className="flex items-end gap-4">
          <div>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">{anioBase}</p>
            <p className={`text-3xl font-bold ${colorText}`}>{valorBase}</p>
          </div>
          {anioComparacion && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">{anioComparacion}</p>
              <p className="text-xl font-semibold text-slate-500 dark:text-slate-400">{valorComparacion}</p>
            </div>
          )}
        </div>

        {delta != null && (
          <p className={`text-xs font-semibold mt-2 ${colorPorSigno(delta)}`}>
            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
          </p>
        )}
      </>
    )}

    {children}
  </div>
);

// Desplegable de selección múltiple (checkboxes) con el mismo aspecto que el
// resto de inputs de la app. Un array vacío de "seleccionados" se muestra
// como el placeholder (equivale a "todos/todas", sin filtrar).
const MultiSelectDropdown = ({ opciones, seleccionados, onChange, placeholder, anchoClase }) => {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickFuera = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setAbierto(false);
    };
    document.addEventListener('mousedown', handleClickFuera);
    return () => document.removeEventListener('mousedown', handleClickFuera);
  }, []);

  const alternar = (valor) => {
    if (seleccionados.includes(valor)) {
      onChange(seleccionados.filter(v => v !== valor));
    } else {
      onChange([...seleccionados, valor]);
    }
  };

  const etiquetaBoton = seleccionados.length === 0
    ? placeholder
    : seleccionados.length === 1
      ? (opciones.find(o => o.value === seleccionados[0])?.label || String(seleccionados[0]))
      : `${seleccionados.length} seleccionados`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setAbierto(v => !v)}
        className={`${inputClasses} ${anchoClase || 'min-w-[180px]'} flex items-center justify-between gap-1 text-left`}
      >
        <span className="truncate">{etiquetaBoton}</span>
        <ChevronDown size={14} className="shrink-0 opacity-60" />
      </button>
      {abierto && (
        <div className="absolute z-20 mt-1 min-w-full w-max max-w-xs max-h-64 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-md shadow-lg p-1">
          <div className="flex justify-between px-2 py-1 border-b border-slate-100 dark:border-slate-700 mb-1">
            <button type="button" className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline" onClick={() => onChange(opciones.map(o => o.value))}>
              Todos
            </button>
            <button type="button" className="text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:underline" onClick={() => onChange([])}>
              Ninguno
            </button>
          </div>
          {opciones.length === 0 && <p className="px-2 py-1 text-xs text-slate-400">Sin opciones</p>}
          {opciones.map(o => (
            <label key={o.value} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={seleccionados.includes(o.value)}
                onChange={() => alternar(o.value)}
                className="rounded border-slate-300 dark:border-slate-600"
              />
              <span className="truncate">{o.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

const GraficoBox = ({ titulo, children }) => (
  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
    <h4 className="text-center text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">{titulo}</h4>
    {children}
  </div>
);

export default DashboardVentasReales;
