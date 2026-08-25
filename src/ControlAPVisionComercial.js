/*
 * ControlAPVisionComercial.js (Versión 1.1)
 * Cambios sobre la 1.0:
 *  - El Stock Inicial declarado del distribuidor (el que ya tenía en su
 *    almacén al empezar a usar la app, importado desde el Excel de
 *    liquidación) ahora SE SUMA como si fueran unidades compradas de
 *    Sell-In, tanto en "Uds Compradas (Sell-In)" como en "A&P Generado (€)".
 *    Motivo: de cara a Compañía, esas botellas ya estaban colocadas en el
 *    distribuidor, así que generan su A&P igual que una compra — no
 *    incluirlas infla artificialmente el "% Gastado/Generado" para
 *    distribuidores con Stock Inicial declarado. Como el Stock Inicial no
 *    guarda con qué tasa de A&P se generó en su momento, se usa la tasa
 *    ACTUAL de la marca (marca.AP_Generado_Por_Unidad) — es una
 *    aproximación, coherente con que esta vista ya es un ejercicio
 *    aproximado para Compañía, no la vista real (ver más abajo).
 *    IMPORTANTE: este tratamiento es EXCLUSIVO de esta pantalla. En
 *    ControlAP.js (la vista real sobre Sell-Out) el Stock Inicial sigue sin
 *    sumarse como compra, tal y como estaba documentado en firebaseApi.js.
 *
 * Pestaña "aparte" de Control A&P, pensada para reflejar cómo mide la
 * COMPAÑÍA el gasto de A&P por distribuidor: comparándolo contra el
 * Sell-In (lo que hemos vendido/facturado AL distribuidor), no contra el
 * Sell-Out (lo que el distribuidor ha movido realmente al mercado).
 *
 * IMPORTANTE — esto es una vista de negocio, no la más "correcta" técnicamente:
 *  - "Control A&P" (ControlAP.js) sigue siendo la vista real: compara el
 *    gasto contra lo que el distribuidor ha vendido/regalado de verdad
 *    (Sell-Out). Esa es la que dice lo que REALMENTE se ha gastado sobre lo
 *    que se ha vendido. No se toca ni se sustituye.
 *  - Esta vista existe solo porque, de cara a Compañía, el gasto se suele
 *    comparar contra el Sell-In (lo que hemos "colocado" en el distribuidor,
 *    incluido el Stock Inicial ya colocado antes de usar la app), aunque ese
 *    dato no represente el gasto real por unidad vendida. Es un ejercicio
 *    adicional, no una corrección de la vista real.
 *
 * El GASTO (numerador) sigue saliendo siempre del Sell-Out (regaladas +
 * muestras + Acuerdo + aportación manual, vía calculosAP.gastoTotal) — ahí
 * es donde vive el detalle real del gasto, eso no cambia. Lo que cambia es
 * el DENOMINADOR: en vez de dividir entre unidades de Sell-Out, se compara
 * el gasto contra el A&P Generado por el Sell-In (unidades_compradas x
 * ap_por_unidad, vía calculosAP.generadoSellIn, más el Stock Inicial como
 * se explica arriba), expresado como "% Gastado / Generado".
 *
 * Mismo patrón de filtros (Distribuidor multi-selección, fechas, marca) y
 * mismo componente MultiSelectDropdown autocontenido que en ControlAP.js,
 * siguiendo el estilo del proyecto (componentes por archivo, sin extraer a
 * un componente compartido). El filtro de fechas NO afecta al Stock Inicial
 * (no tiene mes concreto, es un punto de partida), solo a los movimientos
 * de Sell-In/Sell-Out.
 *
 * CAMBIO (limpieza de menú, a petición de Sergio: la vista real sobre
 * Sell-Out —ControlAP.js— no le sirve, solo le interesa Compras + Stock
 * Inicial): "Control A&P" (real) se quita del Sidebar (ver Layout.js);
 * ControlAP.js sigue existiendo intacto, solo deja de tener acceso desde el
 * menú. Al quedar esta pantalla como la única versión visible de "Control
 * A&P", se simplifican el título y el texto explicativo (ya no hace falta
 * distinguirla de "la vista real" ni aclarar que "no la sustituye").
 */

import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { ChevronDown } from 'lucide-react';
import { generadoSellIn, gastoTotal } from './calculosAP';
import { inputClasses, botonSecundario, botonExito, etiqueta, filtroContenedor, tdClasses, tdRightClasses, trTotales, kpiCard, kpiTitulo, kpiValor, colorPorSigno } from './uiClasses';
import SelectorMesAno from './SelectorMesAno';
import TablaOrdenable from './TablaOrdenable';

const formateadorMoneda = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
});

// % Gastado / Generado. Si no hay A&P Generado (Sell-In = 0) pero sí hay
// gasto, el ratio no tiene denominador válido: se devuelve null y se
// muestra como "—" en vez de un porcentaje engañoso (p.ej. infinito).
const calcularPorcentaje = (generado, gastado) => {
  if (generado === 0) return gastado === 0 ? 0 : null;
  return (gastado / generado) * 100;
};

const formatearPorcentaje = (valor) => {
  if (valor === null) return '—';
  return `${valor.toFixed(1)}%`;
};

// colorPorSigno (antes "colorPorDiferencia", local a este archivo) se
// centralizó en uiClasses.js (rediseño visual, Fase 3) — mismo criterio que
// en ControlAP.js: rojo si hay sobregasto (Diferencia negativa, Gastado >
// Generado), verde si hay margen. Se aplica igual a la columna de
// Diferencia y a la de %, para que ambas cuenten la misma historia.

function ControlAPVisionComercial({ idDistribuidor, marcas, listaDistribuidores, historicoSellInGeneral, historicoSellOutGeneral, stockInicialGeneral }) {

  const [cargando, setCargando] = useState(true);

  const [kpis, setKpis] = useState({
    ap_generado: 0,
    ap_gastado: 0,
    diferencia: 0,
    porcentaje: 0,
    unidades_compradas: 0,
  });
  const [detallePorMarca, setDetallePorMarca] = useState([]);

  const [filtros, setFiltros] = useState({
    fechaInicio: '',
    fechaFin: '',
    id_marca: '',
  });

  // --- Filtro de Distribuidor(es): igual que en ControlAP.js ---
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

    // Stock Inicial declarado: se trata como si fueran unidades compradas
    // (ver cabecera del archivo). No se filtra por fecha (no tiene mes
    // concreto), solo por distribuidor y marca, igual que el resto.
    const stockInicialFiltrado = (stockInicialGeneral || []).filter(s => {
      const matchMarca = !filtros.id_marca || s.id_marca === filtros.id_marca;
      return matchDistribuidor(s) && matchMarca;
    });

    const generadoPorMarca = new Map();
    const unidadesCompradasPorMarca = new Map();
    const gastadoPorMarca = new Map();

    movSellInFiltrados.forEach(mov => {
      const totalGeneradoActual = generadoPorMarca.get(mov.id_marca) || 0;
      generadoPorMarca.set(mov.id_marca, totalGeneradoActual + generadoSellIn(mov));

      const totalUdsActual = unidadesCompradasPorMarca.get(mov.id_marca) || 0;
      unidadesCompradasPorMarca.set(mov.id_marca, totalUdsActual + (Number(mov.unidades_compradas) || 0));
    });

    // Stock Inicial → se suma a "Uds Compradas" y a "A&P Generado" usando la
    // tasa ACTUAL de A&P de la marca (no hay tasa histórica guardada para
    // este dato, es una aproximación intencionada de esta vista).
    stockInicialFiltrado.forEach(s => {
      const unidades = Number(s.stock_inicial) || 0;
      const marca = marcas.find(m => m.id === s.id_marca);
      const tasaApActual = (marca && Number(marca.AP_Generado_Por_Unidad)) || 0;

      const totalUdsActual = unidadesCompradasPorMarca.get(s.id_marca) || 0;
      unidadesCompradasPorMarca.set(s.id_marca, totalUdsActual + unidades);

      const totalGeneradoActual = generadoPorMarca.get(s.id_marca) || 0;
      generadoPorMarca.set(s.id_marca, totalGeneradoActual + (unidades * tasaApActual));
    });

    movSellOutFiltrados.forEach(mov => {
      const totalGastoActual = gastadoPorMarca.get(mov.id_marca) || 0;
      gastadoPorMarca.set(mov.id_marca, totalGastoActual + gastoTotal(mov));
    });

    let kpiGeneradoTotal = 0, kpiGastoTotal = 0, kpiUnidadesCompradasTotal = 0;

    const detalleFinal = marcas.map(marca => {
      if (filtros.id_marca && marca.id !== filtros.id_marca) {
        return null;
      }
      const ap_generado = generadoPorMarca.get(marca.id) || 0;
      const ap_gastado = gastadoPorMarca.get(marca.id) || 0;
      const unidades_compradas = unidadesCompradasPorMarca.get(marca.id) || 0;

      kpiGeneradoTotal += ap_generado;
      kpiGastoTotal += ap_gastado;
      kpiUnidadesCompradasTotal += unidades_compradas;

      return {
        id_marca: marca.id,
        nombre_marca: marca.nombre_marca,
        ap_generado,
        ap_gastado,
        diferencia: ap_generado - ap_gastado,
        porcentaje: calcularPorcentaje(ap_generado, ap_gastado),
        unidades_compradas,
      };
    }).filter(Boolean);

    setKpis({
      ap_generado: kpiGeneradoTotal,
      ap_gastado: kpiGastoTotal,
      diferencia: kpiGeneradoTotal - kpiGastoTotal,
      porcentaje: calcularPorcentaje(kpiGeneradoTotal, kpiGastoTotal),
      unidades_compradas: kpiUnidadesCompradasTotal,
    });

    setDetallePorMarca(detalleFinal.filter(
      fila => fila.ap_generado > 0 || fila.ap_gastado > 0
    ));

    setCargando(false);

  }, [historicoSellInGeneral, historicoSellOutGeneral, stockInicialGeneral, filtros, marcas, idsDistribuidorSel]);

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
      ["Reporte:", "Control A&P - Visión Compañía (sobre Sell-In)"],
      ["Distribuidor(es):", distriTexto],
      ["Periodo:", periodo],
      []
    ];

    const tableHeader = [
      "Marca", "Uds Compradas (Sell-In)", "A&P Generado (€)", "A&P Gastado (€)", "Diferencia (€)", "% Gastado/Generado"
    ];

    const tableBody = detallePorMarca.map(fila => ([
      fila.nombre_marca,
      Math.round(fila.unidades_compradas),
      fila.ap_generado.toFixed(2),
      fila.ap_gastado.toFixed(2),
      fila.diferencia.toFixed(2),
      formatearPorcentaje(fila.porcentaje)
    ]));

    const tableTotals = [[
      "TOTALES",
      Math.round(kpis.unidades_compradas),
      kpis.ap_generado.toFixed(2),
      kpis.ap_gastado.toFixed(2),
      kpis.diferencia.toFixed(2),
      formatearPorcentaje(kpis.porcentaje)
    ]];

    const finalData = [ ...header, tableHeader, ...tableBody, tableTotals ];
    const worksheet = XLSX.utils.aoa_to_sheet(finalData);
    worksheet['!cols'] = [ {wch:30}, {wch:20}, {wch:18}, {wch:18}, {wch:18}, {wch:18} ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Vision Compañia AP");
    const nombreArchivoDistri = distriTexto.replace(/[^a-zA-Z0-9]+/g, '_').substring(0, 25);
    XLSX.writeFile(workbook, `ControlAP_VisionCompania_${nombreArchivoDistri}_${filtros.fechaInicio || 'hist'}.xlsx`);
  };

  return (
    <div>
      <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-1">Control A&P del Distribuidor</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
        Compara el gasto A&P (Sell-Out) contra el presupuesto que genera el Sell-In de cada distribuidor (Compras + Stock Inicial declarado, a la tasa actual de A&P de cada marca).
      </p>

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
            <KpiBox titulo="A&P GENERADO (Sell-In)" valor={formateadorMoneda.format(kpis.ap_generado)} colorClass={colorPorSigno(kpis.diferencia)} />
            <KpiBox titulo="A&P GASTADO (Sell-Out)" valor={formateadorMoneda.format(kpis.ap_gastado)} colorClass={colorPorSigno(kpis.diferencia)} />
            <KpiBox titulo="DIFERENCIA (Filtrado)" valor={formateadorMoneda.format(kpis.diferencia)} colorClass={colorPorSigno(kpis.diferencia)} />
            <KpiBox titulo="% GASTADO / GENERADO" valor={formatearPorcentaje(kpis.porcentaje)} colorClass={colorPorSigno(kpis.diferencia)} />
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
                  { titulo: 'Uds Compradas (Sell-In)', derecha: true, valor: fila => fila.unidades_compradas, render: fila => Math.round(fila.unidades_compradas) },
                  { titulo: 'A&P GENERADO (€)', derecha: true, valor: fila => fila.ap_generado, render: fila => formateadorMoneda.format(fila.ap_generado) },
                  { titulo: 'A&P GASTADO (€)', derecha: true, valor: fila => fila.ap_gastado, render: fila => formateadorMoneda.format(fila.ap_gastado) },
                  { titulo: 'DIFERENCIA (€)', derecha: true, valor: fila => fila.diferencia, render: fila => <span className={`font-semibold ${colorPorSigno(fila.diferencia)}`}>{formateadorMoneda.format(fila.diferencia)}</span> },
                  { titulo: '% GASTADO / GENERADO', derecha: true, valor: fila => fila.porcentaje ?? 0, render: fila => <span className={`font-semibold ${colorPorSigno(fila.diferencia)}`}>{formatearPorcentaje(fila.porcentaje)}</span> },
                ]}
                filaTotales={
                  <tr className={trTotales}>
                    <td className={tdClasses}>TOTALES</td>
                    <td className={tdRightClasses}>{Math.round(kpis.unidades_compradas)}</td>
                    <td className={tdRightClasses}>{formateadorMoneda.format(kpis.ap_generado)}</td>
                    <td className={tdRightClasses}>{formateadorMoneda.format(kpis.ap_gastado)}</td>
                    <td className={`${tdRightClasses} ${colorPorSigno(kpis.diferencia)}`}>{formateadorMoneda.format(kpis.diferencia)}</td>
                    <td className={`${tdRightClasses} ${colorPorSigno(kpis.diferencia)}`}>{formatearPorcentaje(kpis.porcentaje)}</td>
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
    <div className={`${kpiValor} ${colorClass}`}>{valor}</div>
  </div>
);

// --- Desplegable de selección múltiple (Distribuidor: uno, varios o todos) ---
// Duplicado a propósito (igual que en ControlAP.js): estilo del proyecto es
// componentes autocontenidos por archivo, sin componente compartido.
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

export default ControlAPVisionComercial;
