/*
 * HistoricoSellIn.js (Versión 5.4 - Rediseño visual Fase 3)
 * Cambios sobre la 5.3: solo la maquetación pasa a Tailwind CSS (con
 * soporte de modo oscuro), igual que su pantalla gemela Historico.js.
 * La lógica de filtrado/borrado no cambia.
 *
 * CAMBIO (paginación, a petición de Sergio - repaso/auditoría de la app):
 * mismo cambio que en Historico.js — ver usePaginacion.js. Los totales y la
 * exportación a Excel siguen usando `movimientosFiltrados` completo.
 *
 * CAMBIO (papelera, a petición de Sergio): mismo cambio que en su pantalla
 * gemela Historico.js — "Borrar" mueve el registro a la papelera en vez de
 * eliminarlo de verdad, ver firebaseApi.js/moverAPapelera.
 */

import React, { useState, useEffect } from 'react';
import { moverAPapelera } from './firebaseApi';
import { auth } from './firebaseConfig';
import * as XLSX from 'xlsx';
import { inputClasses, botonSecundario, botonExito, botonPeligro, etiqueta, filtroContenedor, thClasses, tdClasses, tdRightClasses, trTotales } from './uiClasses';
import SelectorMesAno from './SelectorMesAno';
import usePaginacion, { TAMAÑO_PAGINA_DEFECTO } from './usePaginacion';
import Paginacion from './Paginacion';

const formateadorMoneda = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

function HistoricoSellIn({ idDistribuidor, marcas, listaDistribuidores, historicoSellIn, onDataDeleted }) {

  const [cargando, setCargando] = useState(false);
  const [mapaMarcas, setMapaMarcas] = useState(new Map());
  const [movimientosFiltrados, setMovimientosFiltrados] = useState([]);

  // ¡Los filtros SÍ existen!
  const [filtros, setFiltros] = useState({ fechaInicio: '', fechaFin: '', id_marca: '' });

  // Cargar Mapa de Marcas (para traducir IDs)
  useEffect(() => {
    const mapaM = new Map();
    marcas.forEach(m => mapaM.set(m.id, m.nombre_marca));
    setMapaMarcas(mapaM);
  }, [marcas]);

  // Aplicar filtros (Depende de las PROPS)
  useEffect(() => {
    setCargando(true);

    // 1. Calcular el A&P Generado (¡su nueva columna!)
    const movsConCalculo = (historicoSellIn || []).map(mov => {
      const ap_generado = (mov.unidades_compradas || 0) * (mov.ap_por_unidad || 0);
      return {
        ...mov,
        ap_generado: ap_generado
      };
    });

    // 2. Ordenar
    movsConCalculo.sort((a, b) => (b.mes_ano || '').localeCompare(a.mes_ano || ''));

    // 3. ¡Aplicar Filtros!
    const filtrados = movsConCalculo.filter(mov => {
      const matchMarca = !filtros.id_marca || mov.id_marca === filtros.id_marca;
      const matchFechaInicio = !filtros.fechaInicio || mov.mes_ano >= filtros.fechaInicio;
      const matchFechaFin = !filtros.fechaFin || mov.mes_ano <= filtros.fechaFin;
      return matchMarca && matchFechaInicio && matchFechaFin;
    });

    setMovimientosFiltrados(filtrados);
    setCargando(false);

  }, [filtros, historicoSellIn]); // Se recalcula si cambian los filtros o los datos

  // ¡Manejador de Filtros SÍ existe!
  const handleFiltroChange = (e) => {
    const { name, value } = e.target;
    setFiltros(prev => ({ ...prev, [name]: value }));
  };

  // ¡Función de Exportar SÍ existe!
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
      ["Reporte:", "Histórico de Compras (Sell-In)"],
      ["Distribuidor:", distriNombre],
      ["Periodo:", periodo],
      []
    ];

    // ¡Cabecera de tabla con la nueva columna!
    const tableHeader = [
      "Mes/Año", "Marca", "Unidades Compradas", "Facturación (€)", "A&P Generado (€)"
    ];

    // ¡Cuerpo de tabla con la nueva columna!
    const tableBody = movimientosFiltrados.map(mov => ([
      mov.mes_ano,
      mapaMarcas.get(mov.id_marca) || 'N/A',
      mov.unidades_compradas,
      mov.facturacion_euros,
      mov.ap_generado // <-- Nuevo Dato
    ]));

    const finalData = [ ...header, tableHeader, ...tableBody ];

    const worksheet = XLSX.utils.aoa_to_sheet(finalData);
    worksheet['!cols'] = [ {wch:10}, {wch:30}, {wch:20}, {wch:20}, {wch:20} ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Histórico Sell-In");

    const nombreArchivo = `Historico_SellIn_${distriNombre.substring(0, 15)}_${filtros.fechaInicio || 'hist'}.xlsx`;
    XLSX.writeFile(workbook, nombreArchivo);
  };

  // ¡Función de Borrar SÍ existe!
  const handleBorrarMovimiento = async (mov, nombreMarca) => {
    if (!window.confirm(`¿Mover a la papelera la COMPRA de ${nombreMarca} para el mes ${mov.mes_ano}? Podrás recuperarla desde "Papelera" (Herramientas) si fue un error.`)) {
      return;
    }
    try {
      await moverAPapelera('historicoSellIn', mov.id, {
        idUsuario: mov.id_usuario,
        actorUid: auth.currentUser?.uid,
        actorEmail: auth.currentUser?.email,
        resumen: `Sell-In: ${nombreMarca} · ${mov.mes_ano}`
      });
      onDataDeleted(); // Avisar al padre para que refresque
      alert("Registro movido a la papelera.");
    } catch (error) {
      console.error("Error al borrar:", error);
      alert("Error al borrar el registro: " + error.message);
    }
  };

  // Paginación (ver usePaginacion.js): sobre movimientosFiltrados completo;
  // los totales de abajo y la exportación a Excel de arriba no cambian.
  const { pagina, totalPaginas, itemsPagina, irPaginaAnterior, irPaginaSiguiente } = usePaginacion(movimientosFiltrados);

  if (cargando) {
    return <div className="text-slate-500 dark:text-slate-400">Actualizando datos...</div>;
  }

  // Totales de la tabla (sobre los datos ya filtrados)
  const totales = movimientosFiltrados.reduce((acc, mov) => {
    acc.unidades_compradas += mov.unidades_compradas || 0;
    acc.facturacion_euros += mov.facturacion_euros || 0;
    acc.ap_generado += mov.ap_generado || 0;
    return acc;
  }, { unidades_compradas: 0, facturacion_euros: 0, ap_generado: 0 });

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <h3 className="text-lg font-medium text-slate-900 dark:text-white">Histórico de Movimientos (Compras / Sell-In)</h3>
        <button onClick={handleExportarExcel} className={botonExito}>
          Exportar a Excel (Datos Filtrados)
        </button>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Mostrando todas las compras guardadas para este distribuidor.</p>

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

      <div className="overflow-x-auto mt-5 rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className={thClasses}>Mes/Año</th>
              <th className={thClasses}>Marca</th>
              <th className={thClasses}>Unidades Compradas</th>
              <th className={thClasses}>Facturación (€)</th>
              <th className={`${thClasses} !bg-indigo-50 dark:!bg-indigo-500/20 !text-indigo-700 dark:!text-indigo-300`}>A&P Generado (€)</th>
              <th className={thClasses}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {movimientosFiltrados.length > 0 ? (
              itemsPagina.map(mov => {
                const nombreMarca = mapaMarcas.get(mov.id_marca) || 'N/A';
                return (
                  <tr key={mov.id}>
                    <td className={tdClasses}>{mov.mes_ano}</td>
                    <td className={`${tdClasses} font-semibold`}>{nombreMarca}</td>
                    <td className={tdRightClasses}>{Math.round(mov.unidades_compradas)}</td>
                    <td className={tdRightClasses}>{formateadorMoneda.format(mov.facturacion_euros)}</td>
                    <td className={`${tdRightClasses} font-semibold bg-indigo-50/60 dark:bg-indigo-500/20`}>
                      {formateadorMoneda.format(mov.ap_generado)}
                    </td>
                    <td className={`${tdClasses} text-center`}>
                      <button
                        className={botonPeligro}
                        onClick={() => handleBorrarMovimiento(mov, nombreMarca)}
                      >
                        Borrar
                      </button>
                    </td>
                  </tr>
                )
              })
            ) : (
              <tr>
                <td colSpan="6" className={`${tdClasses} text-center py-5`}>
                  No hay movimientos históricos que coincidan con los filtros.
                </td>
              </tr>
            )}
            {movimientosFiltrados.length > 0 && (
              <tr className={trTotales}>
                <td className={tdClasses}>TOTALES</td>
                <td className={tdClasses}></td>
                <td className={tdRightClasses}>{Math.round(totales.unidades_compradas)}</td>
                <td className={tdRightClasses}>{formateadorMoneda.format(totales.facturacion_euros)}</td>
                <td className={`${tdRightClasses} bg-indigo-50/60 dark:bg-indigo-500/20`}>
                  {formateadorMoneda.format(totales.ap_generado)}
                </td>
                <td className={tdClasses}></td>
              </tr>
            )}
          </tbody>
        </table>
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

export default HistoricoSellIn;
