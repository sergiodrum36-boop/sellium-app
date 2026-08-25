/*
 * PantallaRecuperacionVentas.js
 * Nueva pantalla (a petición de Sergio, dentro del punto "ranking/scorecard
 * de distribuidores" del repaso de mejoras): un informe mensual que compara,
 * por distribuidor y por marca, las compras (Facturación de Ventas Reales)
 * del mes elegido contra el MISMO MES DEL AÑO ANTERIOR — para detectar de un
 * vistazo qué distribuidores están comprando menos de lo esperado y, dentro
 * de cada uno, qué marca concreta hay que "empujar" este mes para recuperar
 * el nivel del año pasado.
 *
 * Decisiones tomadas con Sergio:
 *  - Comparativa: mismo mes del año anterior (respeta la estacionalidad —
 *    un mes flojo puede ser normal todos los años, no solo una caída real).
 *  - Datos: solo Facturación (cajas + importe de `ventasReales`), no A&P.
 *  - Formato: pantalla en la app + exportable a Excel y PDF.
 *  - Selección "Desde"/"Hasta": permite analizar un único mes (el caso por
 *    defecto, Desde = Hasta) o juntar varios meses seguidos en una sola
 *    comparativa (p.ej. Enero-Marzo), comparando siempre contra el mismo
 *    rango de meses un año antes.
 *
 * Semáforo por distribuidor (sobre el TOTAL de todas sus marcas ese mes):
 *  - "Sin histórico": el distribuidor facturó menos de IMPORTE_MINIMO_ANALISIS
 *    € en el mismo mes del año pasado — no hay base fiable para comparar
 *    (evita alarmas por ruido en importes minúsculos).
 *  - Rojo: cae 30% o más frente al año pasado.
 *  - Amarillo: cae entre 10% y 30%.
 *  - Verde: estable o en crecimiento.
 * Umbrales ajustables aquí abajo si Sergio quiere afinarlos con el uso real.
 *
 * El detalle por marca de cada distribuidor calcula "cajas que faltan" /
 * "importe que falta" = lo que le faltó comprar este mes para igualar el
 * mismo mes del año pasado — es literalmente la respuesta a "qué necesito
 * venderle este mes", ordenado de mayor a menor oportunidad.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { getVentasRealesGeneral } from './firebaseApi';
import {
  inputClasses, botonSecundario, botonExito, etiqueta, filtroContenedor, tarjeta,
  tdClasses, tdRightClasses, trTotales, colorPorSigno, tituloPantalla, subtitulo,
  kpiCard, kpiTitulo, kpiValor
} from './uiClasses';
import TablaOrdenable from './TablaOrdenable';
import * as XLSX from 'xlsx';
import { crearDocumentoPdf, descargarPdf } from './pdfExport';
import autoTable from 'jspdf-autotable';

export const PANTALLA_RECUPERACION_VENTAS = 'RECUPERACION_VENTAS';

const NOMBRES_MES_COMPLETO = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

// Umbrales del semáforo (% de variación frente al mismo mes del año
// anterior) e importe mínimo del año pasado para considerar la comparativa
// fiable. Ver cabecera del archivo.
const UMBRAL_ROJO = -30;
const UMBRAL_AMARILLO = -10;
const IMPORTE_MINIMO_ANALISIS = 30;

const BADGE_SEMAFORO = {
  rojo: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/30',
  amarillo: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30',
  verde: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30',
  sin_historico: 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600'
};
const ETIQUETA_SEMAFORO = { rojo: 'Atención', amarillo: 'Vigilar', verde: 'Bien', sin_historico: 'Sin histórico' };

const formateadorMoneda = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const formateadorNumero = new Intl.NumberFormat('es-ES');

const formatearMes = (mesAno) => {
  if (!mesAno) return '—';
  const [y, m] = mesAno.split('-').map(Number);
  return `${NOMBRES_MES_COMPLETO[m - 1] || '?'} ${y}`;
};

// "YYYY-MM" del mismo mes, un año antes.
const calcularMesAnioAnterior = (mesAno) => {
  if (!mesAno) return '';
  const [y, m] = mesAno.split('-');
  return `${Number(y) - 1}-${m}`;
};

function PantallaRecuperacionVentas({ idUsuario }) {
  const [ventasReales, setVentasReales] = useState([]);
  const [cargando, setCargando] = useState(true);
  // "Desde"/"Hasta" permiten analizar un solo mes (Desde = Hasta, el caso
  // por defecto) o varios meses seguidos juntos (p.ej. Enero-Marzo), a
  // petición de Sergio, para comparativas trimestrales/semestrales.
  const [mesDesde, setMesDesde] = useState('');
  const [mesHasta, setMesHasta] = useState('');
  const [idDistribuidorSeleccionado, setIdDistribuidorSeleccionado] = useState('');

  useEffect(() => {
    if (!idUsuario) { setVentasReales([]); setCargando(false); return; }
    (async () => {
      setCargando(true);
      try {
        const datos = await getVentasRealesGeneral(idUsuario);
        setVentasReales(datos);
      } catch (error) {
        console.error('Error cargando Ventas Reales para Recuperación de Ventas:', error);
      }
      setCargando(false);
    })();
  }, [idUsuario]);

  // Meses con datos, más reciente primero.
  const mesesDisponibles = useMemo(() => {
    const set = new Set();
    ventasReales.forEach(v => { if (v.mes_ano) set.add(v.mes_ano); });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [ventasReales]);

  useEffect(() => {
    if (mesesDisponibles.length > 0) {
      if (!mesesDisponibles.includes(mesDesde)) setMesDesde(mesesDisponibles[0]);
      if (!mesesDisponibles.includes(mesHasta)) setMesHasta(mesesDisponibles[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesesDisponibles]);

  // "Desde" y "Hasta" pueden llegar en cualquier orden (el usuario puede
  // tocar primero el que quiera) — se ordenan aquí para tener siempre un
  // rango cronológico válido.
  const mesDesdeOrdenado = mesDesde && mesHasta ? (mesDesde <= mesHasta ? mesDesde : mesHasta) : '';
  const mesHastaOrdenado = mesDesde && mesHasta ? (mesDesde <= mesHasta ? mesHasta : mesDesde) : '';

  // Todos los meses con datos dentro del rango elegido (ambos extremos
  // incluidos) y esos mismos meses un año antes — aunque algún mes concreto
  // del año pasado no tenga datos, simplemente suma 0 y no rompe nada.
  const mesesEnRango = useMemo(() => {
    if (!mesDesdeOrdenado || !mesHastaOrdenado) return [];
    return mesesDisponibles.filter(m => m >= mesDesdeOrdenado && m <= mesHastaOrdenado);
  }, [mesesDisponibles, mesDesdeOrdenado, mesHastaOrdenado]);

  const mesesAnterioresEnRango = useMemo(
    () => mesesEnRango.map(calcularMesAnioAnterior),
    [mesesEnRango]
  );

  // Etiquetas legibles del período elegido y de su equivalente el año
  // pasado — se usan en la pantalla, el Excel y el PDF.
  const rangoActualLabel = !mesDesdeOrdenado
    ? '—'
    : (mesDesdeOrdenado === mesHastaOrdenado
        ? formatearMes(mesHastaOrdenado)
        : `${formatearMes(mesDesdeOrdenado)} – ${formatearMes(mesHastaOrdenado)}`);
  const rangoAnteriorLabel = !mesDesdeOrdenado
    ? '—'
    : (mesDesdeOrdenado === mesHastaOrdenado
        ? formatearMes(calcularMesAnioAnterior(mesHastaOrdenado))
        : `${formatearMes(calcularMesAnioAnterior(mesDesdeOrdenado))} – ${formatearMes(calcularMesAnioAnterior(mesHastaOrdenado))}`);

  // Agrega ventasReales de un conjunto de meses por Distribuidor+Marca (cajas+importe).
  const agregados = useMemo(() => {
    const construir = (listaMeses) => {
      const mapa = new Map();
      if (!listaMeses || listaMeses.length === 0) return mapa;
      const setMeses = new Set(listaMeses);
      ventasReales.forEach(v => {
        if (!setMeses.has(v.mes_ano)) return;
        const key = `${v.id_distribuidor}|${v.id_marca}`;
        const fila = mapa.get(key) || {
          id_distribuidor: v.id_distribuidor,
          nombre_distribuidor: v.nombre_distribuidor || 'N/A',
          id_marca: v.id_marca,
          nombre_marca: v.nombre_marca || 'N/A',
          cajas: 0,
          importe: 0
        };
        fila.cajas += Number(v.cajas) || 0;
        fila.importe += Number(v.importe_euros) || 0;
        mapa.set(key, fila);
      });
      return mapa;
    };
    return { actual: construir(mesesEnRango), anterior: construir(mesesAnterioresEnRango) };
  }, [ventasReales, mesesEnRango, mesesAnterioresEnRango]);

  // Por distribuidor: todas sus marcas (mes actual ∪ mismo mes año pasado),
  // con "cajas/importe que faltan" y el semáforo del total del distribuidor.
  const distribuidores = useMemo(() => {
    const mapaDist = new Map();
    const registrar = (mapaOrigen, sufijo) => {
      mapaOrigen.forEach(fila => {
        const dist = mapaDist.get(fila.id_distribuidor) || {
          id_distribuidor: fila.id_distribuidor,
          nombre_distribuidor: fila.nombre_distribuidor,
          marcas: new Map()
        };
        const marca = dist.marcas.get(fila.id_marca) || {
          id_marca: fila.id_marca,
          nombre_marca: fila.nombre_marca,
          cajasActual: 0, importeActual: 0, cajasAnterior: 0, importeAnterior: 0
        };
        marca[`cajas${sufijo}`] = fila.cajas;
        marca[`importe${sufijo}`] = fila.importe;
        dist.marcas.set(fila.id_marca, marca);
        mapaDist.set(fila.id_distribuidor, dist);
      });
    };
    registrar(agregados.actual, 'Actual');
    registrar(agregados.anterior, 'Anterior');

    return Array.from(mapaDist.values()).map(dist => {
      const marcas = Array.from(dist.marcas.values())
        .map(m => ({
          ...m,
          importePerdido: Math.max(0, (m.importeAnterior || 0) - (m.importeActual || 0)),
          cajasPerdidas: Math.max(0, (m.cajasAnterior || 0) - (m.cajasActual || 0))
        }))
        .sort((a, b) => b.importePerdido - a.importePerdido);

      const importeActualTotal = marcas.reduce((s, m) => s + (m.importeActual || 0), 0);
      const importeAnteriorTotal = marcas.reduce((s, m) => s + (m.importeAnterior || 0), 0);
      const variacionPct = importeAnteriorTotal > 0
        ? ((importeActualTotal - importeAnteriorTotal) / importeAnteriorTotal) * 100
        : null;
      const semaforo = importeAnteriorTotal < IMPORTE_MINIMO_ANALISIS
        ? 'sin_historico'
        : (variacionPct <= UMBRAL_ROJO ? 'rojo' : (variacionPct <= UMBRAL_AMARILLO ? 'amarillo' : 'verde'));

      return {
        id_distribuidor: dist.id_distribuidor,
        nombre_distribuidor: dist.nombre_distribuidor,
        marcas,
        importeActualTotal,
        importeAnteriorTotal,
        variacionPct,
        semaforo,
        importePerdidoTotal: marcas.reduce((s, m) => s + m.importePerdido, 0)
      };
    }).sort((a, b) => b.importePerdidoTotal - a.importePerdidoTotal);
  }, [agregados]);

  useEffect(() => {
    if (distribuidores.length > 0 && !distribuidores.some(d => d.id_distribuidor === idDistribuidorSeleccionado)) {
      setIdDistribuidorSeleccionado(distribuidores[0].id_distribuidor);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distribuidores]);

  const distribuidorSeleccionado = distribuidores.find(d => d.id_distribuidor === idDistribuidorSeleccionado);

  const kpis = useMemo(() => {
    const nRojo = distribuidores.filter(d => d.semaforo === 'rojo').length;
    const nAmarillo = distribuidores.filter(d => d.semaforo === 'amarillo').length;
    const importeRecuperable = distribuidores.reduce((s, d) => s + d.importePerdidoTotal, 0);
    return { nRojo, nAmarillo, importeRecuperable };
  }, [distribuidores]);

  // Etiqueta segura para nombres de archivo (sin espacios ni acentos raros).
  const nombreArchivoPeriodo = mesDesdeOrdenado
    ? (mesDesdeOrdenado === mesHastaOrdenado ? mesHastaOrdenado : `${mesDesdeOrdenado}_a_${mesHastaOrdenado}`)
    : 'sin_periodo';

  const handleExportarExcel = () => {
    const datos = [];
    distribuidores.forEach(d => {
      d.marcas.forEach(m => {
        datos.push({
          'Distribuidor': d.nombre_distribuidor,
          'Marca': m.nombre_marca,
          [`Cajas ${rangoAnteriorLabel}`]: Math.round(m.cajasAnterior || 0),
          [`Cajas ${rangoActualLabel}`]: Math.round(m.cajasActual || 0),
          'Cajas que faltan': Math.round(m.cajasPerdidas),
          [`Importe ${rangoAnteriorLabel}`]: Math.round((m.importeAnterior || 0) * 100) / 100,
          [`Importe ${rangoActualLabel}`]: Math.round((m.importeActual || 0) * 100) / 100,
          'Importe que falta': Math.round(m.importePerdido * 100) / 100
        });
      });
    });
    const worksheet = XLSX.utils.json_to_sheet(datos);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Recuperacion Ventas');
    XLSX.writeFile(workbook, `Recuperacion_Ventas_${nombreArchivoPeriodo}.xlsx`);
  };

  const handleExportarPdf = () => {
    const doc = crearDocumentoPdf(
      'Recuperación de Ventas',
      `Período analizado: ${rangoActualLabel} · comparado con ${rangoAnteriorLabel}`
    );
    const head = [['Distribuidor', `Importe ${rangoAnteriorLabel}`, `Importe ${rangoActualLabel}`, 'Variación', 'Estado']];
    const body = distribuidores.map(d => [
      d.nombre_distribuidor,
      formateadorMoneda.format(d.importeAnteriorTotal),
      formateadorMoneda.format(d.importeActualTotal),
      d.variacionPct === null ? '—' : `${d.variacionPct >= 0 ? '+' : ''}${d.variacionPct.toFixed(1)}%`,
      ETIQUETA_SEMAFORO[d.semaforo]
    ]);
    autoTable(doc, {
      startY: 34,
      head,
      body,
      theme: 'grid',
      headStyles: { fillColor: [71, 85, 105], fontSize: 9 },
      styles: { fontSize: 8, cellPadding: 2 }
    });
    descargarPdf(doc, `Recuperacion_Ventas_${nombreArchivoPeriodo}.pdf`);
  };

  if (cargando) {
    return <div className="text-slate-500 dark:text-slate-400">Cargando...</div>;
  }

  return (
    <div>
      <h2 className={tituloPantalla}>Recuperación de Ventas</h2>
      <p className={subtitulo}>
        Compara lo que ha comprado cada distribuidor este mes con el mismo mes del año anterior, marca a marca, para saber a quién y qué venderle este mes y recuperar el nivel del año pasado. Basado en Facturación (Ventas Reales).
      </p>

      {mesesDisponibles.length === 0 ? (
        <div className={tarjeta}>
          <p className="text-sm text-slate-600 dark:text-slate-300">Todavía no hay datos de Ventas Reales importados.</p>
        </div>
      ) : (
        <>
          <div className={filtroContenedor}>
            <label className={etiqueta}>Desde:</label>
            <select
              value={mesDesde}
              onChange={(e) => setMesDesde(e.target.value)}
              className={`${inputClasses} min-w-[160px]`}
            >
              {mesesDisponibles.map(m => (
                <option key={m} value={m}>{formatearMes(m)}</option>
              ))}
            </select>
            <label className={etiqueta}>Hasta:</label>
            <select
              value={mesHasta}
              onChange={(e) => setMesHasta(e.target.value)}
              className={`${inputClasses} min-w-[160px]`}
            >
              {mesesDisponibles.map(m => (
                <option key={m} value={m}>{formatearMes(m)}</option>
              ))}
            </select>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Comparando con {rangoAnteriorLabel}
            </span>
            <div className="flex gap-2 ml-auto">
              <button type="button" onClick={handleExportarExcel} className={botonSecundario}>Exportar a Excel</button>
              <button type="button" onClick={handleExportarPdf} className={botonExito}>Exportar a PDF</button>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 mt-4">
            <div className={kpiCard}>
              <p className={kpiTitulo}>DISTRIBUIDORES EN ROJO</p>
              <p className={`${kpiValor} !text-red-600 dark:!text-red-400`}>{kpis.nRojo}</p>
            </div>
            <div className={kpiCard}>
              <p className={kpiTitulo}>DISTRIBUIDORES A VIGILAR</p>
              <p className={`${kpiValor} !text-amber-600 dark:!text-amber-400`}>{kpis.nAmarillo}</p>
            </div>
            <div className={kpiCard}>
              <p className={kpiTitulo}>IMPORTE A RECUPERAR (vs. año anterior)</p>
              <p className={kpiValor}>{formateadorMoneda.format(kpis.importeRecuperable)}</p>
            </div>
          </div>

          <div className={`${tarjeta} mt-5`}>
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
              Distribuidores — ordenados por importe a recuperar (haz clic en uno para ver el detalle por marca)
            </h4>
            <div className="rounded-lg border border-slate-200 dark:border-slate-700">
              <TablaOrdenable
                filas={distribuidores}
                keyExtractor={d => d.id_distribuidor}
                onFilaClick={d => setIdDistribuidorSeleccionado(d.id_distribuidor)}
                claseFila={d => d.id_distribuidor === idDistribuidorSeleccionado ? 'bg-slate-100 dark:bg-slate-700' : ''}
                columnas={[
                  { titulo: 'Distribuidor', valor: d => d.nombre_distribuidor, render: d => <span className="font-semibold">{d.nombre_distribuidor}</span> },
                  {
                    titulo: 'Estado', valor: d => ETIQUETA_SEMAFORO[d.semaforo] || '', render: d => (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${BADGE_SEMAFORO[d.semaforo]}`}>{ETIQUETA_SEMAFORO[d.semaforo]}</span>
                    ),
                  },
                  { titulo: `Importe ${rangoAnteriorLabel}`, derecha: true, valor: d => d.importeAnteriorTotal, render: d => formateadorMoneda.format(d.importeAnteriorTotal) },
                  { titulo: `Importe ${rangoActualLabel}`, derecha: true, valor: d => d.importeActualTotal, render: d => formateadorMoneda.format(d.importeActualTotal) },
                  {
                    titulo: 'Variación', derecha: true, valor: d => d.variacionPct ?? 0, render: d => (
                      <span className={colorPorSigno(d.variacionPct ?? 0)}>{d.variacionPct === null ? '—' : `${d.variacionPct >= 0 ? '+' : ''}${d.variacionPct.toFixed(1)}%`}</span>
                    ),
                  },
                  { titulo: 'Importe a recuperar', derecha: true, valor: d => d.importePerdidoTotal, render: d => formateadorMoneda.format(d.importePerdidoTotal) },
                ]}
              />
            </div>
          </div>

          {distribuidorSeleccionado && (
            <div className={`${tarjeta} mt-5`}>
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
                {distribuidorSeleccionado.nombre_distribuidor} — qué venderle para recuperar {rangoAnteriorLabel}
              </h4>
              <div className="rounded-lg border border-slate-200 dark:border-slate-700">
                <TablaOrdenable
                  filas={distribuidorSeleccionado.marcas}
                  keyExtractor={m => m.id_marca}
                  columnas={[
                    { titulo: 'Marca', valor: m => m.nombre_marca, render: m => <span className="font-semibold">{m.nombre_marca}</span> },
                    { titulo: `Cajas ${rangoAnteriorLabel}`, derecha: true, valor: m => m.cajasAnterior || 0, render: m => formateadorNumero.format(Math.round(m.cajasAnterior || 0)) },
                    { titulo: `Cajas ${rangoActualLabel}`, derecha: true, valor: m => m.cajasActual || 0, render: m => formateadorNumero.format(Math.round(m.cajasActual || 0)) },
                    {
                      titulo: 'Cajas que faltan', derecha: true, valor: m => m.cajasPerdidas, render: m => (
                        <span className={m.cajasPerdidas > 0 ? '!text-red-600 dark:!text-red-400 font-semibold' : ''}>{formateadorNumero.format(Math.round(m.cajasPerdidas))}</span>
                      ),
                    },
                    {
                      titulo: 'Importe que falta', derecha: true, valor: m => m.importePerdido, render: m => (
                        <span className={m.importePerdido > 0 ? '!text-red-600 dark:!text-red-400 font-semibold' : ''}>{formateadorMoneda.format(m.importePerdido)}</span>
                      ),
                    },
                  ]}
                  filaTotales={
                    <tr className={trTotales}>
                      <td className={tdClasses}>TOTAL A RECUPERAR</td>
                      <td className={tdClasses}></td>
                      <td className={tdClasses}></td>
                      <td className={tdRightClasses}>
                        {formateadorNumero.format(Math.round(distribuidorSeleccionado.marcas.reduce((s, m) => s + m.cajasPerdidas, 0)))}
                      </td>
                      <td className={tdRightClasses}>{formateadorMoneda.format(distribuidorSeleccionado.importePerdidoTotal)}</td>
                    </tr>
                  }
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default PantallaRecuperacionVentas;
