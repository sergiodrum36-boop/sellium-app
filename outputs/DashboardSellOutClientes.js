/*
 * DashboardSellOutClientes.js
 * Análisis de Sell-Out por Cliente Final (a petición de Sergio): se elige un
 * distribuidor y se ve el detalle de SUS clientes — cuánto compran, cuántas
 * referencias trabajan, y cómo evolucionan frente al mismo periodo del año
 * anterior (nuevos, recuperados, activos, perdidos).
 *
 * Mismo patrón "Desde/Hasta + comparar contra el mismo rango un año antes"
 * que PantallaRecuperacionVentas.js — aquí a nivel de CLIENTE en vez de a
 * nivel de distribuidor/marca.
 *
 * Decisiones confirmadas por Sergio (ver conversación):
 *  - El KPI de volumen es UNIDADES (uds_totales = Ventas+Promo+Regalos —
 *    los regalos SÍ cuentan). Por ahora no se calcula ningún importe.
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
 */

import React, { useState, useEffect, useMemo } from 'react';
import { getMovimientosSellOutClientesPorDistribuidor } from './firebaseApi';
import {
  inputClasses, filtroContenedor, etiqueta, tarjeta,
  thClasses, tdClasses, tdRightClasses, colorPorSigno,
  kpiCard, kpiTitulo, kpiValor, tituloPantalla, subtitulo
} from './uiClasses';

const NOMBRES_MES_COMPLETO = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const formateadorNumero = new Intl.NumberFormat('es-ES');

const formatearMes = (mesAno) => {
  if (!mesAno) return '—';
  const [y, m] = mesAno.split('-').map(Number);
  return `${NOMBRES_MES_COMPLETO[m - 1] || '?'} ${y}`;
};

const calcularMesAnioAnterior = (mesAno) => {
  if (!mesAno) return '';
  const [y, m] = mesAno.split('-');
  return `${Number(y) - 1}-${m}`;
};

const BADGE_ESTADO = {
  activo: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30',
  nuevo: 'bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-500/30',
  recuperado: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30',
  perdido: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/30'
};
const ETIQUETA_ESTADO = { activo: 'Activo', nuevo: 'Nuevo', recuperado: 'Recuperado', perdido: 'Perdido' };

function DashboardSellOutClientes({ idUsuario, listaDistribuidores }) {
  const [idDistribuidor, setIdDistribuidor] = useState('');
  const [movimientos, setMovimientos] = useState([]);
  const [cargando, setCargando] = useState(false);

  const [mesDesde, setMesDesde] = useState('');
  const [mesHasta, setMesHasta] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    if (!idDistribuidor || !idUsuario) { setMovimientos([]); return; }
    (async () => {
      setCargando(true);
      try {
        const datos = await getMovimientosSellOutClientesPorDistribuidor(idUsuario, idDistribuidor);
        setMovimientos(datos);
      } catch (error) {
        console.error('Error cargando Sell-Out por Cliente:', error);
        alert('No se pudieron cargar los datos de este distribuidor: ' + error.message);
      }
      setCargando(false);
    })();
  }, [idUsuario, idDistribuidor]);

  const mesesDisponibles = useMemo(() => {
    const set = new Set();
    movimientos.forEach(m => { if (m.mes_ano) set.add(m.mes_ano); });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [movimientos]);

  useEffect(() => {
    if (mesesDisponibles.length > 0) {
      if (!mesesDisponibles.includes(mesDesde)) setMesDesde(mesesDisponibles[mesesDisponibles.length - 1]);
      if (!mesesDisponibles.includes(mesHasta)) setMesHasta(mesesDisponibles[0]);
    } else {
      setMesDesde(''); setMesHasta('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesesDisponibles]);

  const mesDesdeOrdenado = mesDesde && mesHasta ? (mesDesde <= mesHasta ? mesDesde : mesHasta) : '';
  const mesHastaOrdenado = mesDesde && mesHasta ? (mesDesde <= mesHasta ? mesHasta : mesDesde) : '';

  const mesesEnRango = useMemo(
    () => (mesDesdeOrdenado ? mesesDisponibles.filter(m => m >= mesDesdeOrdenado && m <= mesHastaOrdenado) : []),
    [mesesDisponibles, mesDesdeOrdenado, mesHastaOrdenado]
  );
  const setMesesEnRango = useMemo(() => new Set(mesesEnRango), [mesesEnRango]);
  const mesesAnterioresEnRango = useMemo(() => mesesEnRango.map(calcularMesAnioAnterior), [mesesEnRango]);
  const setMesesAnteriores = useMemo(() => new Set(mesesAnterioresEnRango), [mesesAnterioresEnRango]);

  const rangoActualLabel = !mesDesdeOrdenado ? '—'
    : (mesDesdeOrdenado === mesHastaOrdenado ? formatearMes(mesHastaOrdenado) : `${formatearMes(mesDesdeOrdenado)} – ${formatearMes(mesHastaOrdenado)}`);
  const rangoAnteriorLabel = mesesAnterioresEnRango.length > 0
    ? (mesesAnterioresEnRango.length === 1 ? formatearMes(mesesAnterioresEnRango[0]) : `${formatearMes(mesesAnterioresEnRango[0])} – ${formatearMes(mesesAnterioresEnRango[mesesAnterioresEnRango.length - 1])}`)
    : '—';

  // --------------------------------------------------------------
  // Agregación por cliente
  // --------------------------------------------------------------
  const filasClientes = useMemo(() => {
    if (mesesEnRango.length === 0) return [];

    const porCliente = new Map(); // id_cliente -> acumulador

    movimientos.forEach(mv => {
      if (!mv.id_cliente) return;
      let acc = porCliente.get(mv.id_cliente);
      if (!acc) {
        acc = {
          id_cliente: mv.id_cliente,
          nombre_cliente: mv.nombre_cliente,
          tipologia: '',
          udsActual: 0,
          udsAnterior: 0,
          refsActual: new Set(),
          refsAnterior: new Set(),
          huboAntes: false,       // alguna compra en un mes ANTERIOR al rango actual (fuera del rango año-anterior también cuenta)
          ultimaFecha: null
        };
        porCliente.set(mv.id_cliente, acc);
      }
      if (mv.nombre_cliente) acc.nombre_cliente = mv.nombre_cliente;

      const uds = mv.uds_totales || 0;
      if (setMesesEnRango.has(mv.mes_ano)) {
        acc.udsActual += uds;
        if (uds !== 0 && mv.id_marca) acc.refsActual.add(mv.id_marca);
        if (mv.tipologia) acc.tipologia = mv.tipologia;
      } else if (setMesesAnteriores.has(mv.mes_ano)) {
        acc.udsAnterior += uds;
        if (uds !== 0 && mv.id_marca) acc.refsAnterior.add(mv.id_marca);
      } else if (mv.mes_ano && mesDesdeOrdenado && mv.mes_ano < mesDesdeOrdenado) {
        if (uds !== 0) acc.huboAntes = true;
      }

      if (mv.fecha && (!acc.ultimaFecha || mv.fecha > acc.ultimaFecha)) acc.ultimaFecha = mv.fecha;
    });

    const filas = [];
    porCliente.forEach(acc => {
      const huboActual = acc.udsActual > 0;
      const huboPrevio = acc.udsAnterior > 0;
      if (!huboActual && !huboPrevio) return; // sin actividad relevante en ninguno de los dos periodos

      let estado;
      if (huboActual && huboPrevio) estado = 'activo';
      else if (huboActual && !huboPrevio && !acc.huboAntes) estado = 'nuevo';
      else if (huboActual && !huboPrevio && acc.huboAntes) estado = 'recuperado';
      else estado = 'perdido';

      const variacion = acc.udsAnterior > 0
        ? ((acc.udsActual - acc.udsAnterior) / acc.udsAnterior) * 100
        : (acc.udsActual > 0 ? null : 0); // null = "no aplica" (no había base el año pasado)

      filas.push({
        id_cliente: acc.id_cliente,
        nombre_cliente: acc.nombre_cliente,
        tipologia: acc.tipologia,
        udsActual: acc.udsActual,
        udsAnterior: acc.udsAnterior,
        variacion,
        refsActual: acc.refsActual.size,
        refsAnterior: acc.refsAnterior.size,
        estado,
        ultimaFecha: acc.ultimaFecha
      });
    });

    return filas.sort((a, b) => b.udsActual - a.udsActual);
  }, [movimientos, mesesEnRango, setMesesEnRango, setMesesAnteriores, mesDesdeOrdenado]);

  const filasFiltradas = filasClientes.filter(f => {
    if (filtroEstado !== 'todos' && f.estado !== filtroEstado) return false;
    if (busqueda && !f.nombre_cliente.toLowerCase().includes(busqueda.toLowerCase())) return false;
    return true;
  });

  // --------------------------------------------------------------
  // KPIs
  // --------------------------------------------------------------
  const kpis = useMemo(() => {
    const totalActual = filasClientes.reduce((a, f) => a + f.udsActual, 0);
    const totalAnterior = filasClientes.reduce((a, f) => a + f.udsAnterior, 0);
    const varTotal = totalAnterior > 0 ? ((totalActual - totalAnterior) / totalAnterior) * 100 : null;
    const refsActualTotal = new Set();
    movimientos.forEach(mv => { if (setMesesEnRango.has(mv.mes_ano) && (mv.uds_totales || 0) !== 0 && mv.id_marca) refsActualTotal.add(mv.id_marca); });
    return {
      clientesActivos: filasClientes.filter(f => f.estado === 'activo').length,
      clientesNuevos: filasClientes.filter(f => f.estado === 'nuevo').length,
      clientesRecuperados: filasClientes.filter(f => f.estado === 'recuperado').length,
      clientesPerdidos: filasClientes.filter(f => f.estado === 'perdido').length,
      totalActual,
      totalAnterior,
      varTotal,
      referenciasActual: refsActualTotal.size
    };
  }, [filasClientes, movimientos, setMesesEnRango]);

  return (
    <div>
      <h2 className={tituloPantalla}>Sell-Out por Cliente Final</h2>
      <p className={subtitulo}>Elige un distribuidor para ver el detalle de sus clientes: qué compran, cuánto y cómo evolucionan frente al mismo periodo del año pasado.</p>

      <div className={`${filtroContenedor} mb-4`}>
        <div>
          <label className={etiqueta}>Distribuidor</label><br />
          <select value={idDistribuidor} onChange={e => setIdDistribuidor(e.target.value)} className={inputClasses}>
            <option value="">-- Elegir distribuidor --</option>
            {(listaDistribuidores || []).map(d => (
              <option key={d.id} value={d.id}>{d.nombre_distribuidor}</option>
            ))}
          </select>
        </div>

        {idDistribuidor && mesesDisponibles.length > 0 && (
          <>
            <div>
              <label className={etiqueta}>Desde</label><br />
              <select value={mesDesde} onChange={e => setMesDesde(e.target.value)} className={inputClasses}>
                {mesesDisponibles.slice().reverse().map(m => <option key={m} value={m}>{formatearMes(m)}</option>)}
              </select>
            </div>
            <div>
              <label className={etiqueta}>Hasta</label><br />
              <select value={mesHasta} onChange={e => setMesHasta(e.target.value)} className={inputClasses}>
                {mesesDisponibles.slice().reverse().map(m => <option key={m} value={m}>{formatearMes(m)}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className={etiqueta}>Buscar cliente</label><br />
              <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Nombre del cliente..." className={`${inputClasses} w-full`} />
            </div>
          </>
        )}
      </div>

      {!idDistribuidor && (
        <div className={tarjeta}>
          <p className="text-sm text-slate-500 dark:text-slate-400">Elige un distribuidor arriba para ver sus clientes.</p>
        </div>
      )}

      {idDistribuidor && cargando && (
        <div className="text-slate-500 dark:text-slate-400">Cargando datos del distribuidor...</div>
      )}

      {idDistribuidor && !cargando && mesesDisponibles.length === 0 && (
        <div className={tarjeta}>
          <p className="text-sm text-slate-500 dark:text-slate-400">Este distribuidor todavía no tiene ningún dato de Sell-Out por Cliente importado.</p>
        </div>
      )}

      {idDistribuidor && !cargando && mesesDisponibles.length > 0 && (
        <>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            Comparando <strong>{rangoActualLabel}</strong> frente a <strong>{rangoAnteriorLabel}</strong> (mismo periodo, año anterior).
          </p>

          {/* KPIs */}
          <div className="flex flex-wrap gap-3 mb-5">
            <div className={kpiCard}>
              <div className={kpiTitulo}>Uds. totales del periodo</div>
              <div className={kpiValor}>{formateadorNumero.format(kpis.totalActual)}</div>
              {kpis.varTotal !== null && (
                <div className={`text-xs font-semibold mt-1 ${colorPorSigno(kpis.varTotal)}`}>
                  {kpis.varTotal >= 0 ? '+' : ''}{kpis.varTotal.toFixed(1)}% vs {rangoAnteriorLabel}
                </div>
              )}
            </div>
            <div className={kpiCard}>
              <div className={kpiTitulo}>Referencias trabajadas</div>
              <div className={kpiValor}>{kpis.referenciasActual}</div>
            </div>
            <div className={kpiCard}>
              <div className={kpiTitulo}>Clientes activos</div>
              <div className={kpiValor}>{kpis.clientesActivos}</div>
            </div>
            <div className={kpiCard}>
              <div className={kpiTitulo}>Clientes nuevos</div>
              <div className="text-xl font-semibold !text-sky-600 dark:!text-sky-400">{kpis.clientesNuevos}</div>
            </div>
            <div className={kpiCard}>
              <div className={kpiTitulo}>Recuperados</div>
              <div className="text-xl font-semibold !text-indigo-600 dark:!text-indigo-400">{kpis.clientesRecuperados}</div>
            </div>
            <div className={kpiCard}>
              <div className={kpiTitulo}>Clientes perdidos</div>
              <div className="text-xl font-semibold !text-red-600 dark:!text-red-400">{kpis.clientesPerdidos}</div>
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
                  filtroEstado === est ? 'bg-wine-soft !text-slate-900 dark:!text-white' : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400'
                }`}
              >
                {est === 'todos' ? `Todos (${filasClientes.length})` : `${ETIQUETA_ESTADO[est]} (${filasClientes.filter(f => f.estado === est).length})`}
              </button>
            ))}
          </div>

          {/* Tabla de clientes */}
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={thClasses}>Cliente</th>
                  <th className={thClasses}>Tipología</th>
                  <th className={thClasses}>Estado</th>
                  <th className={thClasses}>Uds. periodo</th>
                  <th className={thClasses}>Uds. año anterior</th>
                  <th className={thClasses}>Variación</th>
                  <th className={thClasses}>Referencias</th>
                  <th className={thClasses}>Refs. año anterior</th>
                  <th className={thClasses}>Última compra</th>
                </tr>
              </thead>
              <tbody>
                {filasFiltradas.map(f => (
                  <tr key={f.id_cliente}>
                    <td className={tdClasses}>{f.nombre_cliente}</td>
                    <td className={tdClasses}>{f.tipologia || '—'}</td>
                    <td className={tdClasses}>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${BADGE_ESTADO[f.estado]}`}>
                        {ETIQUETA_ESTADO[f.estado]}
                      </span>
                    </td>
                    <td className={tdRightClasses}>{formateadorNumero.format(f.udsActual)}</td>
                    <td className={tdRightClasses}>{formateadorNumero.format(f.udsAnterior)}</td>
                    <td className={`${tdRightClasses} ${f.variacion !== null ? colorPorSigno(f.variacion) : ''} !font-semibold`}>
                      {f.variacion === null ? '—' : `${f.variacion >= 0 ? '+' : ''}${f.variacion.toFixed(0)}%`}
                    </td>
                    <td className={tdRightClasses}>{f.refsActual}</td>
                    <td className={tdRightClasses}>{f.refsAnterior}</td>
                    <td className={tdClasses}>{f.ultimaFecha || '—'}</td>
                  </tr>
                ))}
                {filasFiltradas.length === 0 && (
                  <tr><td className={tdClasses} colSpan={9}>No hay clientes que cumplan este filtro.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default DashboardSellOutClientes;
