/*
 * ControlAP.js (Versión 5.4)
 * Cambios sobre la 5.3:
 *  - "Aportación (€)" ahora suma el dinero real aportado al distribuidor
 *    (precio de Acuerdo especial + aportación manual puntual), en vez del
 *    campo manual "aportacion_euros" (que al importar desde Excel siempre
 *    se guardaba a 0 y por eso la columna salía siempre en blanco).
 *  - Se quita la columna "Acuerdo" (unidades): no aportaba información útil
 *    por sí sola: su valor en € ya se ve reflejado en "Aportación".
 *  - "Media Gasto x Unidad Movida" ahora se calcula SOLO sobre botellas
 *    vendidas + regaladas (las que realmente llegan al mercado). Antes
 *    también contaba muestras y unidades de Acuerdo, lo que distorsionaba
 *    la media en marcas con muchas muestras o mucho Acuerdo.
 *  - Nuevo filtro de Distribuidor(es): multi-selección (uno, varios o
 *    todos), para poder ver el total general combinado de varios
 *    distribuidores. Para esto, el componente ahora recibe el histórico
 *    GENERAL (de todos los distribuidores del usuario) en vez del histórico
 *    ya filtrado a un solo distribuidor.
 */

import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { ChevronDown } from 'lucide-react';
import { valorRegaladas, valorMuestras, valorAcuerdo, valorAportacionManual } from './calculosAP';
import { inputClasses, botonSecundario, botonExito, etiqueta, filtroContenedor, tdClasses, tdRightClasses, trTotales, kpiCard, kpiTitulo, kpiValor, colorPorSigno } from './uiClasses';
import SelectorMesAno from './SelectorMesAno';
import TablaOrdenable from './TablaOrdenable';

const formateadorMoneda = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
});

// colorPorSigno (rojo/verde según el signo del valor) se centralizó en
// uiClasses.js (rediseño visual, Fase 3) porque también la usan
// ControlAPVisionComercial.js, KpiCard.js y el Dashboard — antes estaba
// definida aquí como función local. El comportamiento no cambia: sigue
// forzando "!" para ganarle a la especificidad CSS de tdRightClasses (ver
// el comentario de la función en uiClasses.js).

function ControlAP({ idDistribuidor, marcas, listaDistribuidores, historicoSellInGeneral, historicoSellOutGeneral }) {

  const [cargando, setCargando] = useState(true);

  const [kpis, setKpis] = useState({
    ap_generado: 0,
    ap_gastado: 0,
    diferencia: 0,
    media_gasto_por_unidad: 0,
    ventas_uds: 0,
    regaladas_uds: 0,
    muestras_uds: 0,
    aportacion_euros: 0
  });
  const [detallePorMarca, setDetallePorMarca] = useState([]);

  const [filtros, setFiltros] = useState({
    fechaInicio: '',
    fechaFin: '',
    id_marca: '',
  });

  // --- Filtro de Distribuidor(es) ---
  // Por defecto, solo el distribuidor que está activo en la pantalla
  // principal (mismo comportamiento que antes). El usuario puede ampliar
  // aquí la selección a varios o a todos para ver el total combinado.
  // Un array vacío significa "sin filtro" = todos los distribuidores.
  const [idsDistribuidorSel, setIdsDistribuidorSel] = useState(idDistribuidor ? [idDistribuidor] : []);

  useEffect(() => {
    setIdsDistribuidorSel(idDistribuidor ? [idDistribuidor] : []);
  }, [idDistribuidor]);

  useEffect(() => {
    setCargando(true);

    const matchDistribuidor = (mov) => idsDistribuidorSel.length === 0 || idsDistribuidorSel.includes(mov.id_distribuidor);

    const movSellInFiltrados = (historicoSellInGeneral || []).filter(mov => {
      const matchMarca = !filtros.id_marca || mov.id_marca === filtros.id_marca;
      const matchFechaInicio = !filtros.fechaInicio || mov.mes_ano >= filtros.fechaInicio;
      const matchFechaFin = !filtros.fechaFin || mov.mes_ano <= filtros.fechaFin;
      return matchDistribuidor(mov) && matchMarca && matchFechaInicio && matchFechaFin;
    });

    const movSellOutFiltrados = (historicoSellOutGeneral || []).filter(mov => {
      const matchMarca = !filtros.id_marca || mov.id_marca === filtros.id_marca;
      const matchFechaInicio = !filtros.fechaInicio || mov.mes_ano >= filtros.fechaInicio;
      const matchFechaFin = !filtros.fechaFin || mov.mes_ano <= filtros.fechaFin;
      return matchDistribuidor(mov) && matchMarca && matchFechaInicio && matchFechaFin;
    });

    const generadPorMarca = new Map();
    const gastadoPorMarca = new Map();
    const ventasUdsPorMarca = new Map();
    const regaladasUdsPorMarca = new Map();
    const muestrasUdsPorMarca = new Map();
    const aportacionEurosPorMarca = new Map();

    movSellInFiltrados.forEach(mov => {
      const totalActual = generadPorMarca.get(mov.id_marca) || 0;
      const generado = mov.unidades_compradas * mov.ap_por_unidad;
      generadPorMarca.set(mov.id_marca, totalActual + generado);
    });

    movSellOutFiltrados.forEach(mov => {
      const totalGastoActual = gastadoPorMarca.get(mov.id_marca) || 0;
      const gasto = valorRegaladas(mov) + valorMuestras(mov) + valorAcuerdo(mov) + valorAportacionManual(mov);
      gastadoPorMarca.set(mov.id_marca, totalGastoActual + gasto);

      const totalVentas = ventasUdsPorMarca.get(mov.id_marca) || 0;
      ventasUdsPorMarca.set(mov.id_marca, totalVentas + (mov.ventas_uds || 0));

      const totalRegaladas = regaladasUdsPorMarca.get(mov.id_marca) || 0;
      regaladasUdsPorMarca.set(mov.id_marca, totalRegaladas + (mov.regaladas_uds || 0));

      const totalMuestras = muestrasUdsPorMarca.get(mov.id_marca) || 0;
      muestrasUdsPorMarca.set(mov.id_marca, totalMuestras + (mov.muestras_uds || 0));

      // Aportación = dinero realmente aportado al distribuidor: el importe
      // del precio de Acuerdo especial (unidades_acuerdo × €/Botella,
      // columna "Total acuerdo" del Excel) + cualquier aportación manual
      // puntual. Las unidades de Acuerdo en sí ya no se muestran aparte.
      const totalAportacion = aportacionEurosPorMarca.get(mov.id_marca) || 0;
      aportacionEurosPorMarca.set(mov.id_marca, totalAportacion + valorAcuerdo(mov) + valorAportacionManual(mov));
    });

    let kpiGeneradoTotal = 0, kpiGastoTotal = 0;
    let kpiVentasUdsTotal = 0, kpiRegaladasUdsTotal = 0, kpiMuestrasUdsTotal = 0, kpiAportacionEurosTotal = 0;

    const detalleFinal = marcas.map(marca => {
      if (filtros.id_marca && marca.id !== filtros.id_marca) {
        return null;
      }
      const ap_generado = generadPorMarca.get(marca.id) || 0;
      const ap_gastado = gastadoPorMarca.get(marca.id) || 0;

      const ventas_uds = ventasUdsPorMarca.get(marca.id) || 0;
      const regaladas_uds = regaladasUdsPorMarca.get(marca.id) || 0;
      const muestras_uds = muestrasUdsPorMarca.get(marca.id) || 0;
      const aportacion_euros = aportacionEurosPorMarca.get(marca.id) || 0;

      // Media de gasto SOLO sobre botellas que realmente se mueven al
      // mercado (vendidas + regaladas). Las muestras no generan venta y el
      // Acuerdo ya tiene su propio precio pactado aparte, así que no cuentan
      // para esta media.
      const unidadesParaMedia = ventas_uds + regaladas_uds;
      const media_gasto = (unidadesParaMedia === 0) ? 0 : (ap_gastado / unidadesParaMedia);

      kpiGeneradoTotal += ap_generado;
      kpiGastoTotal += ap_gastado;
      kpiVentasUdsTotal += ventas_uds;
      kpiRegaladasUdsTotal += regaladas_uds;
      kpiMuestrasUdsTotal += muestras_uds;
      kpiAportacionEurosTotal += aportacion_euros;

      return {
        id_marca: marca.id,
        nombre_marca: marca.nombre_marca,
        ap_generado, ap_gastado,
        diferencia: ap_generado - ap_gastado,
        media_gasto_por_unidad: media_gasto,
        ventas_uds, regaladas_uds, muestras_uds, aportacion_euros
      };
    }).filter(Boolean);

    const kpiDiferenciaTotal = kpiGeneradoTotal - kpiGastoTotal;
    const kpiUnidadesParaMediaTotal = kpiVentasUdsTotal + kpiRegaladasUdsTotal;
    const kpiMediaGastoTotal = (kpiUnidadesParaMediaTotal === 0) ? 0 : (kpiGastoTotal / kpiUnidadesParaMediaTotal);

    setKpis({
      ap_generado: kpiGeneradoTotal,
      ap_gastado: kpiGastoTotal,
      diferencia: kpiDiferenciaTotal,
      media_gasto_por_unidad: kpiMediaGastoTotal,
      ventas_uds: kpiVentasUdsTotal,
      regaladas_uds: kpiRegaladasUdsTotal,
      muestras_uds: kpiMuestrasUdsTotal,
      aportacion_euros: kpiAportacionEurosTotal
    });

    setDetallePorMarca(detalleFinal.filter(
      fila => fila.ap_generado > 0 || fila.ap_gastado > 0
    ));

    setCargando(false);

  }, [historicoSellInGeneral, historicoSellOutGeneral, filtros, marcas, idsDistribuidorSel]);

  const handleFiltroChange = (e) => {
    const { name, value } = e.target;
    setFiltros(prev => ({ ...prev, [name]: value }));
  };

  const todosLosIds = (listaDistribuidores || []).map(d => d.id);
  const mostrandoTodos = idsDistribuidorSel.length === 0 || idsDistribuidorSel.length >= todosLosIds.length;

  const etiquetaDistribuidoresSeleccionados = () => {
    if (mostrandoTodos) return 'Todos los distribuidores';
    if (idsDistribuidorSel.length === 1) {
      return (listaDistribuidores || []).find(d => d.id === idsDistribuidorSel[0])?.nombre_distribuidor || '1 distribuidor';
    }
    return `${idsDistribuidorSel.length} distribuidores`;
  };

  const handleExportarExcel = () => {
    const distriTexto = mostrandoTodos
      ? 'Todos los distribuidores'
      : (listaDistribuidores || [])
          .filter(d => idsDistribuidorSel.includes(d.id))
          .map(d => d.nombre_distribuidor)
          .join(', ');
    const periodo = (filtros.fechaInicio || filtros.fechaFin)
      ? `Desde: ${filtros.fechaInicio || 'Inicio'} - Hasta: ${filtros.fechaFin || 'Fin'}`
      : 'Histórico Completo';

    const header = [
      ["Reporte:", "Control A&P"],
      ["Distribuidor(es):", distriTexto],
      ["Periodo:", periodo],
      []
    ];

    const tableHeader = [
      "Marca", "Unidades Vendidas", "Unidades Regaladas", "Muestras", "Aportación (€)",
      "A&P Generado (€)", "A&P Gastado (€)", "Diferencia (€)", "Media Gasto X Unidad Movida (€)"
    ];

    const tableBody = detallePorMarca.map(fila => ([
      fila.nombre_marca,
      Math.round(fila.ventas_uds), Math.round(fila.regaladas_uds), Math.round(fila.muestras_uds),
      fila.aportacion_euros.toFixed(2),
      fila.ap_generado.toFixed(2),
      fila.ap_gastado.toFixed(2),
      fila.diferencia.toFixed(2),
      fila.media_gasto_por_unidad.toFixed(2)
    ]));

    const tableTotals = [[
      "TOTALES",
      Math.round(kpis.ventas_uds), Math.round(kpis.regaladas_uds), Math.round(kpis.muestras_uds),
      kpis.aportacion_euros.toFixed(2),
      kpis.ap_generado.toFixed(2),
      kpis.ap_gastado.toFixed(2),
      kpis.diferencia.toFixed(2),
      kpis.media_gasto_por_unidad.toFixed(2)
    ]];

    const finalData = [ ...header, tableHeader, ...tableBody, tableTotals ];
    const worksheet = XLSX.utils.aoa_to_sheet(finalData);
    worksheet['!cols'] = [ {wch:30}, {wch:15}, {wch:15}, {wch:10}, {wch:15}, {wch:20}, {wch:20}, {wch:20}, {wch:25} ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Control A&P");
    const nombreArchivoDistri = distriTexto.replace(/[^a-zA-Z0-9]+/g, '_').substring(0, 25);
    XLSX.writeFile(workbook, `ControlAP_${nombreArchivoDistri}_${filtros.fechaInicio || 'hist'}.xlsx`);
  };

  return (
    <div>
      <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-4">Control A&P del Distribuidor</h3>

      <div className={`${filtroContenedor} mb-5`}>
        <div className="flex items-center gap-2">
          <label className={etiqueta}>Distribuidor(es):</label>
          <MultiSelectDropdown
            opciones={(listaDistribuidores || []).map(d => ({ value: d.id, label: d.nombre_distribuidor }))}
            seleccionados={idsDistribuidorSel}
            onChange={setIdsDistribuidorSel}
            placeholder="Todos"
            anchoClase="min-w-[220px]"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className={etiqueta}>Desde:</label>
          <SelectorMesAno value={filtros.fechaInicio} onChange={(v) => setFiltros(prev => ({ ...prev, fechaInicio: v }))} />
        </div>
        <div className="flex items-center gap-2">
          <label className={etiqueta}>Hasta:</label>
          <SelectorMesAno value={filtros.fechaFin} onChange={(v) => setFiltros(prev => ({ ...prev, fechaFin: v }))} />
        </div>
        <div className="flex items-center gap-2">
          <label className={etiqueta}>Marca:</label>
          <select name="id_marca" value={filtros.id_marca} onChange={handleFiltroChange} className={inputClasses}>
            <option value="">-- Todas las Marcas --</option>
            {marcas.map(m => (
              <option key={m.id} value={m.id}>{m.nombre_marca}</option>
            ))}
          </select>
        </div>
        <button
          className={`${botonSecundario} ml-auto`}
          onClick={() => { setFiltros({ fechaInicio: '', fechaFin: '', id_marca: '' }); setIdsDistribuidorSel(idDistribuidor ? [idDistribuidor] : []); }}
        >
          Limpiar Filtros
        </button>
      </div>

      {cargando ? (
        <div className="text-slate-500 dark:text-slate-400">Calculando A&P...</div>
      ) : (
        <>
          <p className="text-xs text-slate-500 dark:text-slate-400 -mt-2 mb-3">
            Mostrando: <strong>{etiquetaDistribuidoresSeleccionados()}</strong>
          </p>

          <div className="flex flex-wrap gap-3 mb-5">
            <KpiBox titulo="A&P GENERADO (Filtrado)" valor={kpis.ap_generado} colorClass={colorPorSigno(kpis.ap_generado)} />
            <KpiBox titulo="A&P GASTADO (Filtrado)" valor={kpis.ap_gastado} colorClass={colorPorSigno(kpis.ap_gastado)} />
            <KpiBox titulo="DIFERENCIA (Filtrado)" valor={kpis.diferencia} colorClass={colorPorSigno(kpis.diferencia)} />
            <KpiBox titulo="MEDIA GASTO X UNIDAD MOVIDA" valor={kpis.media_gasto_por_unidad} colorClass={colorPorSigno(kpis.media_gasto_por_unidad)} />
          </div>

          <div className="flex justify-between items-center mb-3">
            <h4 className="text-base font-medium text-slate-900 dark:text-white">Detalle por Referencia</h4>
            <button onClick={handleExportarExcel} className={botonExito}>
              Exportar a Excel
            </button>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800">
            {detallePorMarca.length === 0 ? (
              <p className={`${tdClasses} text-center py-5`}>No hay movimientos de A&P para los filtros seleccionados.</p>
            ) : (
              <TablaOrdenable
                filas={detallePorMarca}
                keyExtractor={fila => fila.id_marca}
                columnas={[
                  { titulo: 'Marca', valor: fila => fila.nombre_marca, render: fila => <span className="font-semibold">{fila.nombre_marca}</span> },
                  { titulo: 'Uds Vendidas', derecha: true, valor: fila => fila.ventas_uds, render: fila => <span className={colorPorSigno(fila.ventas_uds)}>{Math.round(fila.ventas_uds)}</span> },
                  { titulo: 'Uds Regaladas', derecha: true, valor: fila => fila.regaladas_uds, render: fila => <span className={colorPorSigno(fila.regaladas_uds)}>{Math.round(fila.regaladas_uds)}</span> },
                  { titulo: 'Muestras', derecha: true, valor: fila => fila.muestras_uds, render: fila => <span className={colorPorSigno(fila.muestras_uds)}>{Math.round(fila.muestras_uds)}</span> },
                  { titulo: 'Aportación (€)', derecha: true, valor: fila => fila.aportacion_euros, render: fila => <span className={colorPorSigno(fila.aportacion_euros)}>{formateadorMoneda.format(fila.aportacion_euros)}</span> },
                  { titulo: 'A&P GENERADO (€)', derecha: true, valor: fila => fila.ap_generado, render: fila => <span className={colorPorSigno(fila.ap_generado)}>{formateadorMoneda.format(fila.ap_generado)}</span> },
                  { titulo: 'A&P GASTADO (€)', derecha: true, valor: fila => fila.ap_gastado, render: fila => <span className={colorPorSigno(fila.ap_gastado)}>{formateadorMoneda.format(fila.ap_gastado)}</span> },
                  { titulo: 'DIFERENCIA (€)', derecha: true, valor: fila => fila.diferencia, render: fila => <span className={`font-semibold ${colorPorSigno(fila.diferencia)}`}>{formateadorMoneda.format(fila.diferencia)}</span> },
                  { titulo: 'MEDIA GASTO X UNID. MOVIDA (€)', derecha: true, valor: fila => fila.media_gasto_por_unidad, render: fila => <span className={colorPorSigno(fila.media_gasto_por_unidad)}>{formateadorMoneda.format(fila.media_gasto_por_unidad)}</span> },
                ]}
                filaTotales={
                  <tr className={trTotales}>
                    <td className={tdClasses}>TOTALES</td>
                    <td className={`${tdRightClasses} ${colorPorSigno(kpis.ventas_uds)}`}>{Math.round(kpis.ventas_uds)}</td>
                    <td className={`${tdRightClasses} ${colorPorSigno(kpis.regaladas_uds)}`}>{Math.round(kpis.regaladas_uds)}</td>
                    <td className={`${tdRightClasses} ${colorPorSigno(kpis.muestras_uds)}`}>{Math.round(kpis.muestras_uds)}</td>
                    <td className={`${tdRightClasses} ${colorPorSigno(kpis.aportacion_euros)}`}>{formateadorMoneda.format(kpis.aportacion_euros)}</td>
                    <td className={`${tdRightClasses} ${colorPorSigno(kpis.ap_generado)}`}>{formateadorMoneda.format(kpis.ap_generado)}</td>
                    <td className={`${tdRightClasses} ${colorPorSigno(kpis.ap_gastado)}`}>{formateadorMoneda.format(kpis.ap_gastado)}</td>
                    <td className={`${tdRightClasses} ${colorPorSigno(kpis.diferencia)}`}>{formateadorMoneda.format(kpis.diferencia)}</td>
                    <td className={`${tdRightClasses} ${colorPorSigno(kpis.media_gasto_por_unidad)}`}>{formateadorMoneda.format(kpis.media_gasto_por_unidad)}</td>
                  </tr>
                }
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

// --- Componentes de Estilo (Helpers) ---
const KpiBox = ({ titulo, valor, colorClass = 'text-slate-900 dark:text-white' }) => (
  <div className={kpiCard}>
    <div className={kpiTitulo}>{titulo}</div>
    <div className={`${kpiValor} ${colorClass}`}>{formateadorMoneda.format(valor)}</div>
  </div>
);

// --- Desplegable de selección múltiple (Distribuidor: uno, varios o todos) ---
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

export default ControlAP;
