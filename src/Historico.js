/*
 * Historico.js (Versión 5.5 - Rediseño visual Fase 3)
 * Cambios sobre la 5.4: solo la maquetación pasa a Tailwind CSS (con
 * soporte de modo oscuro). La lógica de filtrado/borrado no cambia.
 *
 * CAMBIO (paginación, a petición de Sergio - repaso/auditoría de la app):
 * la tabla ya no pinta TODOS los movimientos filtrados de golpe (con mucho
 * histórico acumulado podían ser miles de filas). Ver usePaginacion.js —
 * los TOTALES y la exportación a Excel siguen usando `movimientosFiltrados`
 * completo, sin paginar; solo el <tbody> usa la página actual.
 *
 * CAMBIO (papelera, a petición de Sergio): "Borrar" ya no elimina el
 * registro de Firestore de verdad — lo mueve a la papelera (recuperable
 * desde la nueva pantalla "Papelera", en Herramientas), ver
 * firebaseApi.js/moverAPapelera. Cada borrado queda además registrado en
 * "Auditoría".
 */

import React, { useState, useEffect } from 'react';
import { moverAPapelera } from './firebaseApi';
import { auth } from './firebaseConfig';
import * as XLSX from 'xlsx';
import { valorRegaladas, valorMuestras, valorAcuerdo, unidadesAcuerdo, gastoTotal } from './calculosAP';
import { inputClasses, botonSecundario, botonExito, botonPeligro, etiqueta, filtroContenedor, tdClasses, tdRightClasses, trTotales } from './uiClasses';
import SelectorMesAno from './SelectorMesAno';
import usePaginacion, { TAMAÑO_PAGINA_DEFECTO } from './usePaginacion';
import Paginacion from './Paginacion';
import TablaOrdenable, { ordenarPorConfig } from './TablaOrdenable';

const formateadorMoneda = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

function Historico({ idDistribuidor, marcas, listaDistribuidores, historicoSellOut, onDataDeleted }) {

  const [cargando, setCargando] = useState(false);
  const [mapaMarcas, setMapaMarcas] = useState(new Map());
  const [movimientosFiltrados, setMovimientosFiltrados] = useState([]);
  const [filtros, setFiltros] = useState({ fechaInicio: '', fechaFin: '', id_marca: '' });

  useEffect(() => {
    const mapaM = new Map();
    marcas.forEach(m => mapaM.set(m.id, m.nombre_marca));
    setMapaMarcas(mapaM);
  }, [marcas]);

  // Aplicar filtros
  useEffect(() => {
    setCargando(true);
    const movsConCalculo = (historicoSellOut || []).map(mov => {
      return {
        ...mov,
        valor_regaladas_calc: valorRegaladas(mov),
        valor_muestras_calc: valorMuestras(mov),
        valor_acuerdo_calc: valorAcuerdo(mov),
        unidades_acuerdo_calc: unidadesAcuerdo(mov),
        total_ap_movimiento: gastoTotal(mov)
      };
    });
    movsConCalculo.sort((a, b) => (b.mes_ano || '').localeCompare(a.mes_ano || ''));

    const filtrados = movsConCalculo.filter(mov => {
      const matchMarca = !filtros.id_marca || mov.id_marca === filtros.id_marca;
      const matchFechaInicio = !filtros.fechaInicio || mov.mes_ano >= filtros.fechaInicio;
      const matchFechaFin = !filtros.fechaFin || mov.mes_ano <= filtros.fechaFin;
      return matchMarca && matchFechaInicio && matchFechaFin;
    });
    setMovimientosFiltrados(filtrados);
    setCargando(false);

  }, [filtros, historicoSellOut]);

  const handleFiltroChange = (e) => {
    const { name, value } = e.target;
    setFiltros(prev => ({ ...prev, [name]: value }));
  };

  const handleExportarExcel = () => {
    if (movimientosFiltrados.length === 0) {
      alert("No hay datos filtrados para exportar.");
      return;
    }
    const distriNombre = listaDistribuidores.find(d => d.id === idDistribuidor)?.nombre_distribuidor || idDistribuidor;
    const periodo = (filtros.fechaInicio || filtros.fechaFin)
      ? `Desde: ${filtros.fechaInicio || 'Inicio'} - Hasta: ${filtros.fechaFin || 'Fin'}`
      : 'Histórico Completo';

    const header = [
      ["Reporte:", "Histórico de Ventas y A&P (Sell-Out)"],
      ["Distribuidor:", distriNombre],
      ["Periodo:", periodo],
      []
    ];

    // --- ¡AÑADIDA COLUMNA PRECIO! ---
    const tableHeader = [
      "Mes/Año", "Marca", "Precio Unitario (€)", "Ventas (uds)", "Ventas (€)", "Muestras (uds)",
      "Regaladas (uds)", "Acuerdo (uds)", "Valor Acuerdo (€)", "Aportación (€)", "TOTAL A&P (€)"
    ];

    const tableBody = movimientosFiltrados.map(mov => ([
      mov.mes_ano,
      mapaMarcas.get(mov.id_marca) || 'N/A',
      mov.coste_unidad, // <-- El precio guardado
      mov.ventas_uds,
      mov.ventas_euros,
      mov.muestras_uds,
      mov.regaladas_uds,
      mov.unidades_acuerdo_calc,
      mov.valor_acuerdo_calc,
      mov.aportacion_euros,
      mov.total_ap_movimiento
    ]));

    const finalData = [ ...header, tableHeader, ...tableBody ];

    const worksheet = XLSX.utils.aoa_to_sheet(finalData);
    // Ajustar anchos (añadidas columnas de Acuerdo)
    worksheet['!cols'] = [ {wch:10}, {wch:30}, {wch:15}, {wch:12}, {wch:12}, {wch:12}, {wch:12}, {wch:12}, {wch:14}, {wch:12}, {wch:15} ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Histórico Sell-Out");

    const nombreArchivo = `Historico_SellOut_${distriNombre.substring(0, 15)}_${filtros.fechaInicio || 'hist'}.xlsx`;
    XLSX.writeFile(workbook, nombreArchivo);
  };

  const handleBorrarMovimiento = async (mov, nombreMarca) => {
    if (!window.confirm(`¿Mover a la papelera el registro de ${nombreMarca} para el mes ${mov.mes_ano}? Podrás recuperarlo desde "Papelera" (Herramientas) si fue un error.`)) {
      return;
    }
    try {
      await moverAPapelera('historicoSellOut', mov.id, {
        idUsuario: mov.id_usuario,
        actorUid: auth.currentUser?.uid,
        actorEmail: auth.currentUser?.email,
        resumen: `Sell-Out: ${nombreMarca} · ${mov.mes_ano}`
      });
      onDataDeleted();
      alert("Registro movido a la papelera.");
    } catch (error) {
      console.error("Error al borrar:", error);
      alert("Error al borrar el registro: " + error.message);
    }
  };

  // Columnas de la tabla (TablaOrdenable, 26/07/2026 — flechitas de ordenar
  // en todos los informes de la app, a petición de Sergio).
  const columnasHistorico = [
    { titulo: 'Mes/Año', valor: mov => mov.mes_ano || '', render: mov => mov.mes_ano },
    { titulo: 'Marca', valor: mov => mapaMarcas.get(mov.id_marca) || '', render: mov => <span className="font-semibold">{mapaMarcas.get(mov.id_marca) || 'Marca Desconocida'}</span> },
    { titulo: 'Precio (€)', derecha: true, valor: mov => mov.coste_unidad || 0, render: mov => formateadorMoneda.format(mov.coste_unidad) },
    { titulo: 'Ventas (uds)', derecha: true, valor: mov => mov.ventas_uds || 0, render: mov => Math.round(mov.ventas_uds) },
    { titulo: 'Ventas (€)', derecha: true, valor: mov => mov.ventas_euros || 0, render: mov => formateadorMoneda.format(mov.ventas_euros) },
    { titulo: 'Muestras (uds)', derecha: true, valor: mov => mov.muestras_uds || 0, render: mov => Math.round(mov.muestras_uds) },
    { titulo: 'Regaladas (uds)', derecha: true, valor: mov => mov.regaladas_uds || 0, render: mov => Math.round(mov.regaladas_uds) },
    { titulo: 'Acuerdo (uds)', derecha: true, valor: mov => mov.unidades_acuerdo_calc || 0, render: mov => Math.round(mov.unidades_acuerdo_calc || 0) },
    {
      titulo: 'Valor Acuerdo (€)', derecha: true, valor: mov => mov.valor_acuerdo_calc || 0,
      claseCabecera: '!text-amber-600 dark:!text-amber-400',
      render: mov => formateadorMoneda.format(mov.valor_acuerdo_calc || 0),
    },
    {
      titulo: 'Aportación Manual (€) ⓘ', derecha: true, valor: mov => mov.aportacion_euros || 0,
      render: mov => formateadorMoneda.format(mov.aportacion_euros),
    },
    {
      titulo: 'TOTAL A&P (€)', derecha: true, valor: mov => mov.total_ap_movimiento || 0,
      claseCabecera: '!bg-indigo-50 dark:!bg-indigo-500/20 !text-indigo-700 dark:!text-indigo-300',
      claseCelda: 'font-semibold bg-indigo-50/60 dark:bg-indigo-500/20',
      render: mov => formateadorMoneda.format(mov.total_ap_movimiento),
    },
    {
      titulo: 'Acciones', claseCelda: 'text-center',
      render: mov => (
        <button className={botonPeligro} onClick={() => handleBorrarMovimiento(mov, mapaMarcas.get(mov.id_marca) || 'Marca Desconocida')}>
          Borrar
        </button>
      ),
    },
  ];

  // Paginación (ver usePaginacion.js): se ordena movimientosFiltrados
  // COMPLETO antes de paginar (modo controlado de TablaOrdenable — ver su
  // cabecera). Los totales de abajo y la exportación a Excel de arriba usan
  // movimientosFiltrados igual que antes, sin ordenar/paginar.
  const [orden, setOrden] = useState(null);
  const { pagina, totalPaginas, itemsPagina, irPaginaAnterior, irPaginaSiguiente } = usePaginacion(ordenarPorConfig(movimientosFiltrados, columnasHistorico, orden));

  if (cargando) {
    return <div className="text-slate-500 dark:text-slate-400">Actualizando datos...</div>;
  }

  // Totales de la tabla (sobre los datos ya filtrados)
  const totales = movimientosFiltrados.reduce((acc, mov) => {
    acc.ventas_uds += mov.ventas_uds || 0;
    acc.ventas_euros += mov.ventas_euros || 0;
    acc.muestras_uds += mov.muestras_uds || 0;
    acc.regaladas_uds += mov.regaladas_uds || 0;
    acc.unidades_acuerdo_calc += mov.unidades_acuerdo_calc || 0;
    acc.valor_acuerdo_calc += mov.valor_acuerdo_calc || 0;
    acc.aportacion_euros += mov.aportacion_euros || 0;
    acc.total_ap_movimiento += mov.total_ap_movimiento || 0;
    return acc;
  }, {
    ventas_uds: 0, ventas_euros: 0, muestras_uds: 0, regaladas_uds: 0,
    unidades_acuerdo_calc: 0, valor_acuerdo_calc: 0, aportacion_euros: 0, total_ap_movimiento: 0
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <h3 className="text-lg font-medium text-slate-900 dark:text-white">Histórico de Movimientos (Ventas y A&P)</h3>
        <button onClick={handleExportarExcel} className={botonExito}>
          Exportar a Excel (Datos Filtrados)
        </button>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Mostrando todos los movimientos guardados para este distribuidor.</p>

      <div className={filtroContenedor}>
        <label className={etiqueta}>Desde:</label>
        <SelectorMesAno value={filtros.fechaInicio} onChange={(v) => setFiltros(prev => ({ ...prev, fechaInicio: v }))} />
        <label className={etiqueta}>Hasta:</label>
        <SelectorMesAno value={filtros.fechaFin} onChange={(v) => setFiltros(prev => ({ ...prev, fechaFin: v }))} />
        <label className={etiqueta}>Marca:</label>
        <select name="id_marca" value={filtros.id_marca} onChange={handleFiltroChange} className={`${inputClasses} min-w-[200px]`}>
          <option value="">-- Todas las Marcas --</option>
          {marcas.map(m => (
            <option key={m.id} value={m.id}>{m.nombre_marca}</option>
          ))}
        </select>
        <button className={`${botonSecundario} ml-auto`} onClick={() => setFiltros({ fechaInicio: '', fechaFin: '', id_marca: '' })}>
          Limpiar Filtros
        </button>
      </div>

      <div className="mt-5 rounded-lg border border-slate-200 dark:border-slate-800">
        {movimientosFiltrados.length === 0 ? (
          <p className={`${tdClasses} text-center py-5`}>No hay movimientos históricos que coincidan con los filtros.</p>
        ) : (
          <TablaOrdenable
            filas={itemsPagina}
            columnas={columnasHistorico}
            keyExtractor={mov => mov.id}
            orden={orden}
            onOrdenChange={setOrden}
            filaTotales={
              <tr className={trTotales}>
                <td className={tdClasses}>TOTALES</td>
                <td className={tdClasses}></td>
                <td className={tdClasses}></td>
                <td className={tdRightClasses}>{Math.round(totales.ventas_uds)}</td>
                <td className={tdRightClasses}>{formateadorMoneda.format(totales.ventas_euros)}</td>
                <td className={tdRightClasses}>{Math.round(totales.muestras_uds)}</td>
                <td className={tdRightClasses}>{Math.round(totales.regaladas_uds)}</td>
                <td className={tdRightClasses}>{Math.round(totales.unidades_acuerdo_calc)}</td>
                <td className={tdRightClasses}>{formateadorMoneda.format(totales.valor_acuerdo_calc)}</td>
                <td className={tdRightClasses}>{formateadorMoneda.format(totales.aportacion_euros)}</td>
                <td className={`${tdRightClasses} bg-indigo-50/60 dark:bg-indigo-500/20`}>
                  {formateadorMoneda.format(totales.total_ap_movimiento)}
                </td>
                <td className={tdClasses}></td>
              </tr>
            }
          />
        )}
      </div>

      <Paginacion
        pagina={pagina}
        totalPaginas={totalPaginas}
        totalRegistros={movimientosFiltrados.length}
        tamañoPagina={TAMAÑO_PAGINA_DEFECTO}
        onAnterior={irPaginaAnterior}
        onSiguiente={irPaginaSiguiente}
      />
    </div>
  );
}

export default Historico;
