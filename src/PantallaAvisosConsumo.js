/*
 * PantallaAvisosConsumo.js
 * "Avisos de Consumo" (26/07/2026, a petición de Sergio: "analizar aquellos
 * clientes que están comprando menos o han dejado de comprar y así poder
 * hacer la gestión de hablar con el comercial para ver qué está pasando").
 * Ver src/avisosConsumoClientes.js para el diseño completo confirmado con
 * Sergio; resumen:
 *
 *  - Ventana de análisis configurable: cada 3 o 6 meses (nunca fija).
 *  - "Perdidos" y "Caída de consumo" comparan la ventana elegida contra la
 *    MISMA ventana del año pasado (respeta la estacionalidad, mismo criterio
 *    que ya usa el Dashboard Sell-Out Clientes y Recuperación de Ventas).
 *  - "Sin compras desde hace N meses" es distinto: el último mes con
 *    cualquier compra de ESE cliente, sin comparar con el año pasado.
 *  - Cada fila muestra el Preventista que gestiona ese cliente — es el dato
 *    clave para poder ir a hablar con él, no solo para diagnosticar el
 *    problema — y qué marcas compra (o compraba), para saber de qué hablar.
 *  - Métrica: UNIDADES, no €, porque no todos los movimientos antiguos
 *    tienen facturación en € (ver Facturación por Cliente Final).
 *
 * AJUSTES (26/07/2026, feedback de Sergio tras ver la v1): la columna
 * "Distribuidor" solo se muestra cuando el filtro de arriba está en "Todos"
 * (si ya filtró por uno, repetirlo en cada fila no aporta nada). La columna
 * "Cód. comercial" (el código crudo "C.CIAL" del Excel de Sell-Out) no
 * decía nada por sí sola — se sustituye por "Zona", la misma etiqueta
 * legible que ya usa el Dashboard Sell-Out Clientes para ese código
 * (`ZONA_POR_CODIGO`, copiado deliberadamente aquí, ver más abajo). Se
 * añade "Marcas que compra" (histórico completo del cliente) porque sin
 * eso no se sabía qué le vende ese cliente. Y la columna "Uds. hace 1 año"
 * se renombra a algo más explícito + una nota encima de las tablas
 * explicando la comparación (ventana elegida vs la MISMA ventana el año
 * pasado).
 *
 * Primera versión — Sergio: "probemos a ver qué tal queda", puede pedir
 * ajustar el umbral de caída (30% ahora) más adelante si hace falta.
 *
 * AJUSTES 2 (26/07/2026, feedback de Sergio tras verla ya con datos reales):
 * "Marcas que compra" ahora lleva el total de unidades de CADA marca (antes
 * solo el nombre) — "es necesario que ponga el total por cada marca" — y
 * cada tabla admite ordenar por cualquier columna (clic en la cabecera,
 * alterna ascendente/descendente) — "también me hace falta la posibilidad
 * de poder ordenar de mayor a menor o por orden alfabético". El orden de
 * cada tabla es independiente (ordenar "Perdidos" no afecta a "Caída de
 * consumo"), por eso el estado de orden se guarda por tabla (`ordenPorTabla`,
 * clave = el título de la tabla).
 *
 * AJUSTES 3 (26/07/2026, feedback de Sergio: "son 3 informes en total y hay
 * que ordenarlo mejor... tener que subir y bajar tanto hace que sea poco
 * ágil"): las 3 tablas ya NO se apilan todas a la vez — un desplegable
 * elige cuál de los 3 informes se ve (una sola tabla en pantalla), con el
 * recuento de cada uno visible en la propia opción del desplegable.
 *
 * AJUSTES 4 (26/07/2026, feedback de Sergio: "lo que has hecho de las
 * flechitas en este informe tienes que hacerlo en todos los informes de la
 * app"): la lógica de ordenar por cabecera (que vivía aquí, en un
 * `renderTabla` local) se extrajo a `TablaOrdenable.js`, componente
 * compartido que ahora usan también el resto de informes de solo lectura de
 * la app. Esta pantalla es la primera en usarlo (para no tener dos
 * implementaciones del mismo comportamiento).
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AlertTriangle, TrendingDown, Clock } from 'lucide-react';
import { getDistribuidoresPorUsuario, getMovimientosSellOutClientesGeneral } from './firebaseApi';
import { calcularAvisosConsumo, generarVentanaMeses, UMBRAL_CAIDA_PCT_DEFECTO } from './avisosConsumoClientes';
import { MESES_CORTOS } from './formatearPeriodo';
import TablaOrdenable from './TablaOrdenable';
import {
  tarjeta, tituloPantalla, subtitulo, inputClasses, etiqueta,
  botonPrimario, botonSecundario
} from './uiClasses';

export const PANTALLA_AVISOS_CONSUMO = 'AVISOS_CONSUMO';

const formateadorNumero = new Intl.NumberFormat('es-ES');
const formateadorPct = (v) => `${(Number(v) || 0).toFixed(1)}%`;

// Copia deliberada (no un import) del mapeo de código de comercial (C.CIAL)
// a nombre de zona de DashboardSellOutClientes.js — es privado a ese
// fichero y duplicar una constante de 4 líneas es más seguro que exportarla
// desde una pantalla de producción ya en uso solo para reutilizarla aquí.
// Si Sergio da de alta una zona nueva, hay que actualizar las DOS copias.
const ZONA_POR_CODIGO = { '1': 'Cádiz', '2': 'Sevilla', '4': 'Málaga', '20': 'Online' };
const etiquetaZona = (codigo) => {
  const c = String(codigo || '').trim();
  if (!c) return '—';
  return ZONA_POR_CODIGO[c] || `Zona ${c}`;
};

// "Abr 2026 - Jun 2026" a partir del mes más reciente y la ventana elegida
// — solo para el texto explicativo encima de las tablas, no para el cálculo
// (que usa generarVentanaMeses/mesUnAnioAntes directamente en la lógica pura).
const formatearRangoLegible = (mesMasReciente, cantidadMeses) => {
  const meses = generarVentanaMeses(mesMasReciente, cantidadMeses); // más reciente primero
  const aEtiqueta = (mesAno) => {
    const [y, m] = mesAno.split('-').map(Number);
    return `${MESES_CORTOS[m - 1]} ${y}`;
  };
  const desde = aEtiqueta(meses[meses.length - 1]);
  const hasta = aEtiqueta(meses[0]);
  return desde === hasta ? desde : `${desde} - ${hasta}`;
};

function PantallaAvisosConsumo({ idUsuario, bloqueadoPorTodos = false }) {
  const [distribuidores, setDistribuidores] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [ventanaMeses, setVentanaMeses] = useState(3);
  const [idDistribuidorFiltro, setIdDistribuidorFiltro] = useState('');
  // Qué informe de los 3 se muestra — a petición de Sergio, uno a la vez
  // (desplegable) en vez de las 3 tablas apiladas todo el rato.
  const [informeSeleccionado, setInformeSeleccionado] = useState('perdidos');

  const cargarTodo = useCallback(async () => {
    if (!idUsuario) { setDistribuidores([]); setMovimientos([]); setCargando(false); return; }
    setCargando(true);
    try {
      const [dist, movs] = await Promise.all([
        getDistribuidoresPorUsuario(idUsuario),
        getMovimientosSellOutClientesGeneral(idUsuario),
      ]);
      setDistribuidores(dist.sort((a, b) => (a.nombre_distribuidor || '').localeCompare(b.nombre_distribuidor || '', 'es')));
      setMovimientos(movs);
    } catch (error) {
      console.error('Error cargando Avisos de Consumo:', error);
      alert('Error al cargar los datos: ' + error.message);
    }
    setCargando(false);
  }, [idUsuario]);

  useEffect(() => { cargarTodo(); }, [cargarTodo]);

  const mapaDistribuidores = useMemo(() => new Map(distribuidores.map(d => [d.id, d.nombre_distribuidor])), [distribuidores]);

  const movimientosFiltrados = useMemo(
    () => idDistribuidorFiltro ? movimientos.filter(m => m.id_distribuidor === idDistribuidorFiltro) : movimientos,
    [movimientos, idDistribuidorFiltro]
  );

  // Mes más reciente con datos (de los movimientos ya filtrados) — punto de
  // referencia de la ventana "actual", para no depender de si el mes en
  // curso ya tiene datos importados.
  const mesMasReciente = useMemo(() => {
    let max = null;
    movimientosFiltrados.forEach(m => { if (m.mes_ano && (!max || m.mes_ano > max)) max = m.mes_ano; });
    return max;
  }, [movimientosFiltrados]);

  const avisos = useMemo(
    () => calcularAvisosConsumo({ movimientos: movimientosFiltrados, ventanaMeses, mesMasReciente, umbralCaidaPct: UMBRAL_CAIDA_PCT_DEFECTO }),
    [movimientosFiltrados, ventanaMeses, mesMasReciente]
  );

  if (bloqueadoPorTodos) {
    return (
      <div className={tarjeta}>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          "Avisos de Consumo" no está disponible en modo "Todos los usuarios" — elige "Mis datos" o un usuario del selector "Viendo como" (barra lateral) para usar esta pantalla.
        </p>
      </div>
    );
  }

  // Envoltorio fino sobre TablaOrdenable (título + icono + contador + tarjeta
  // + aviso de "ninguno"), para no repetir esa cáscara en cada uno de los 3
  // informes. El ordenar por columna en sí lo hace TablaOrdenable.js.
  const renderTabla = (idTabla, icono, filas, columnas) => (
    <div className={`${tarjeta} mb-6`}>
      <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-3 inline-flex items-center gap-1.5">{icono}{idTabla} ({filas.length})</h3>
      {filas.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Ninguno en esta ventana.</p>
      ) : (
        <TablaOrdenable filas={filas} columnas={columnas} keyExtractor={(f) => f.id_cliente} />
      )}
    </div>
  );

  // "Distribuidor" solo aporta algo si se están viendo VARIOS a la vez —
  // si ya hay uno elegido arriba, repetirlo en cada fila es ruido.
  // `valor` (cuando existe) es lo que se usa para ORDENAR esa columna al
  // clicar la cabecera — no siempre coincide con `render` (que puede
  // devolver JSX, como el aviso "sin asignar").
  const columnasBase = [];
  if (!idDistribuidorFiltro) {
    columnasBase.push({
      titulo: 'Distribuidor',
      valor: (f) => mapaDistribuidores.get(f.id_distribuidor) || '',
      render: (f) => mapaDistribuidores.get(f.id_distribuidor) || f.id_distribuidor || '—',
    });
  }
  const colPreventista = {
    titulo: 'Preventista',
    valor: (f) => f.preventista || '',
    render: (f) => f.preventista || <span className="text-amber-600 dark:text-amber-400">sin asignar</span>,
  };
  const colZona = { titulo: 'Zona', valor: (f) => etiquetaZona(f.comercial), render: (f) => etiquetaZona(f.comercial) };
  // Marcas: cada una con su total histórico de unidades (a petición de
  // Sergio: "es necesario que ponga el total por cada marca") — ya vienen
  // ordenadas de más a menos comprada desde avisosConsumoClientes.js. No es
  // ordenable por cabecera (es una lista, no un valor único).
  const colMarcas = {
    titulo: 'Marcas que compra',
    render: (f) => (f.marcas && f.marcas.length > 0)
      ? f.marcas.map((m) => `${m.nombre} (${formateadorNumero.format(m.uds)})`).join(', ')
      : <span className="text-slate-400">—</span>,
  };

  return (
    <div>
      <h1 className={tituloPantalla}>Avisos de Consumo</h1>
      <p className={subtitulo}>
        Clientes finales que están comprando menos o han dejado de comprar, con el preventista que los gestiona — para saber a quién preguntar qué está pasando.
      </p>

      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div>
          <label className={`${etiqueta} block mb-1`}>Analizar cada</label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setVentanaMeses(3)} className={ventanaMeses === 3 ? botonPrimario : botonSecundario}>3 meses</button>
            <button type="button" onClick={() => setVentanaMeses(6)} className={ventanaMeses === 6 ? botonPrimario : botonSecundario}>6 meses</button>
          </div>
        </div>
        <div className="min-w-[220px]">
          <label className={`${etiqueta} block mb-1`}>Distribuidor</label>
          <select value={idDistribuidorFiltro} onChange={(e) => setIdDistribuidorFiltro(e.target.value)} className={`${inputClasses} w-full`}>
            <option value="">Todos</option>
            {distribuidores.map(d => <option key={d.id} value={d.id}>{d.nombre_distribuidor}</option>)}
          </select>
        </div>
        <div className="min-w-[280px]">
          <label className={`${etiqueta} block mb-1`}>Informe</label>
          <select value={informeSeleccionado} onChange={(e) => setInformeSeleccionado(e.target.value)} className={`${inputClasses} w-full`}>
            <option value="perdidos">Clientes perdidos ({avisos.perdidos.length})</option>
            <option value="caidas">Caída de consumo ({avisos.caidas.length})</option>
            <option value="inactivos">Sin compras desde hace {ventanaMeses}+ meses ({avisos.inactivos.length})</option>
          </select>
        </div>
      </div>

      {cargando ? (
        <div className="text-slate-500 dark:text-slate-400">Cargando datos...</div>
      ) : !mesMasReciente ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No hay movimientos de Sell-Out Clientes importados todavía.</p>
      ) : (
        <>
          {(informeSeleccionado === 'perdidos' || informeSeleccionado === 'caidas') && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Compara los últimos {ventanaMeses} meses con datos ({formatearRangoLegible(mesMasReciente, ventanaMeses)}) contra ESOS MISMOS {ventanaMeses} meses pero un año antes — así una temporada baja normal (verano, Navidad...) no se confunde con una caída real.
            </p>
          )}

          {informeSeleccionado === 'perdidos' && renderTabla('Clientes perdidos', <AlertTriangle size={16} className="text-red-500" />, avisos.perdidos, [
            { titulo: 'Cliente', valor: (f) => f.nombre_cliente, render: (f) => f.nombre_cliente },
            ...columnasBase, colPreventista, colZona, colMarcas,
            { titulo: 'Uds. que compraba (mismo periodo, año pasado)', derecha: true, valor: (f) => f.udsAnterior, render: (f) => formateadorNumero.format(f.udsAnterior) },
          ])}

          {informeSeleccionado === 'caidas' && renderTabla(`Caída de consumo (≥${UMBRAL_CAIDA_PCT_DEFECTO}%)`, <TrendingDown size={16} className="text-amber-500" />, avisos.caidas, [
            { titulo: 'Cliente', valor: (f) => f.nombre_cliente, render: (f) => f.nombre_cliente },
            ...columnasBase, colPreventista, colZona, colMarcas,
            { titulo: 'Uds. antes (año pasado)', derecha: true, valor: (f) => f.udsAnterior, render: (f) => formateadorNumero.format(f.udsAnterior) },
            { titulo: 'Uds. ahora', derecha: true, valor: (f) => f.udsActual, render: (f) => formateadorNumero.format(f.udsActual) },
            { titulo: '% variación', derecha: true, valor: (f) => f.variacion ?? 0, render: (f) => formateadorPct(f.variacion) },
          ])}

          {informeSeleccionado === 'inactivos' && renderTabla(`Sin compras desde hace ${ventanaMeses}+ meses`, <Clock size={16} className="text-slate-500" />, avisos.inactivos, [
            { titulo: 'Cliente', valor: (f) => f.nombre_cliente, render: (f) => f.nombre_cliente },
            ...columnasBase, colPreventista, colZona, colMarcas,
            { titulo: 'Meses sin comprar', derecha: true, valor: (f) => f.mesesSinComprar, render: (f) => f.mesesSinComprar },
          ])}
        </>
      )}
    </div>
  );
}

export default PantallaAvisosConsumo;
