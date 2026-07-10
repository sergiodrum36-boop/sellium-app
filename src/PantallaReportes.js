/*
 * PantallaReportes.js (Versión 3.0 - Rediseño visual + Exportación a Power BI)
 * Cambios sobre la 2.2:
 *  - Maquetación pasa a Tailwind CSS (con soporte de modo oscuro), igual que
 *    el resto de la app.
 *  - Se añade "Exportar TODO para Power BI": un único Excel con varias hojas
 *    (Distribuidores, Marcas, HistoricoSellIn, HistoricoSellOut) con TODO el
 *    histórico, sin filtrar por fecha (los filtros se aplican luego dentro
 *    de Power BI). Siempre se guarda con el MISMO nombre de archivo, así que
 *    si cada mes lo guardas en la misma carpeta, en Power BI Desktop solo
 *    hace falta pulsar "Actualizar" — no hay que reconfigurar nada.
 *  - Se corrige un bug en el cálculo de "TOTAL A&P GASTADO" del export de
 *    Sell-Out puntual: no sumaba el valor de "Acuerdo". Ahora usa las mismas
 *    fórmulas centralizadas de calculosAP.js que el resto de la app.
 *  - Las exportaciones puntuales (Sell-In / Sell-Out por rango de fechas) se
 *    mantienen tal cual, solo con el nuevo estilo visual.
 */

import React, { useState, useEffect } from 'react';
import {
  getHistoricoSellInGeneral,
  getHistoricoSellOutGeneral,
  getDistribuidoresPorUsuario,
  getMarcasGlobales
} from './firebaseApi';
import { valorAcuerdo, unidadesAcuerdo, gastoTotal, generadoSellIn } from './calculosAP';
import * as XLSX from 'xlsx';
import { botonExito, botonInfo, botonSecundario, etiqueta, filtroContenedor, tarjeta, tituloPantalla, subtitulo } from './uiClasses';
import SelectorMesAno from './SelectorMesAno';

const NOMBRE_ARCHIVO_POWERBI = 'Datos_MiAppComercial_PowerBI.xlsx';

function PantallaReportes({ idUsuario }) {

  // --- ESTADOS ---
  const [cargando, setCargando] = useState(true);

  // Filtros de fecha (solo para las exportaciones puntuales de más abajo)
  const [filtros, setFiltros] = useState({
    fechaInicio: '', // ej: "2025-01"
    fechaFin: '',   // ej: "2025-12"
  });

  // Datos brutos (cargados 1 vez)
  const [rawMarcas, setRawMarcas] = useState([]);
  const [rawDistribuidores, setRawDistribuidores] = useState([]);
  const [rawSellIn, setRawSellIn] = useState([]);
  const [rawSellOut, setRawSellOut] = useState([]);

  // Mapas para traducir IDs a Nombres
  const [mapaMarcas, setMapaMarcas] = useState(new Map());
  const [mapaDistribuidores, setMapaDistribuidores] = useState(new Map());

  // --- Cargar TODOS los datos (1 vez) ---
  useEffect(() => {
    if (!idUsuario) return;

    const cargarDatosGenerales = async () => {
      setCargando(true);
      try {
        const [marcas, distribuidores, movSellIn, movSellOut] = await Promise.all([
          getMarcasGlobales(),
          getDistribuidoresPorUsuario(idUsuario),
          getHistoricoSellInGeneral(idUsuario),
          getHistoricoSellOutGeneral(idUsuario)
        ]);

        // Cargar Mapas
        const mapaM = new Map();
        marcas.forEach(m => mapaM.set(m.id, m.nombre_marca));
        setMapaMarcas(mapaM);

        const mapaD = new Map();
        distribuidores.forEach(d => mapaD.set(d.id, d.nombre_distribuidor));
        setMapaDistribuidores(mapaD);

        // Guardar Datos Brutos
        setRawMarcas(marcas);
        setRawDistribuidores(distribuidores);
        setRawSellIn(movSellIn);
        setRawSellOut(movSellOut);

      } catch (error) {
        console.error("Error cargando datos generales:", error);
        alert("Error al cargar los datos: " + error.message);
      }
      setCargando(false);
    };
    cargarDatosGenerales();
  }, [idUsuario]);

  // --- EXPORTACIÓN COMPLETA PARA POWER BI (todo el histórico, sin filtrar) ---
  const handleExportarParaPowerBI = () => {
    if (rawSellIn.length === 0 && rawSellOut.length === 0) {
      alert('Todavía no hay movimientos guardados para exportar.');
      return;
    }

    const hojaDistribuidoresDatos = rawDistribuidores.map(d => ({
      "ID Distribuidor": d.id,
      "Distribuidor": d.nombre_distribuidor
    }));

    const hojaMarcasDatos = rawMarcas.map(m => ({
      "ID Marca": m.id,
      "Marca": m.nombre_marca,
      "Precio Oficial (€)": m.Coste_Unidad || 0,
      "A&P Generado por Unidad (€)": m.AP_Generado_Por_Unidad || 0
    }));

    const hojaSellInDatos = rawSellIn.map(mov => ({
      "Mes/Año": mov.mes_ano,
      "ID Distribuidor": mov.id_distribuidor,
      "Distribuidor": mapaDistribuidores.get(mov.id_distribuidor) || 'N/A',
      "ID Marca": mov.id_marca,
      "Marca": mapaMarcas.get(mov.id_marca) || 'N/A',
      "Unidades Compradas": mov.unidades_compradas || 0,
      "Facturación (€)": mov.facturacion_euros || 0,
      "A&P Generado (€)": generadoSellIn(mov)
    }));

    const hojaSellOutDatos = rawSellOut.map(mov => ({
      "Mes/Año": mov.mes_ano,
      "ID Distribuidor": mov.id_distribuidor,
      "Distribuidor": mapaDistribuidores.get(mov.id_distribuidor) || 'N/A',
      "ID Marca": mov.id_marca,
      "Marca": mapaMarcas.get(mov.id_marca) || 'N/A',
      "Precio Unitario (€)": mov.coste_unidad || 0,
      "Ventas (uds)": mov.ventas_uds || 0,
      "Ventas (€)": mov.ventas_euros || 0,
      "Muestras (uds)": mov.muestras_uds || 0,
      "Regaladas (uds)": mov.regaladas_uds || 0,
      "Acuerdo (uds)": unidadesAcuerdo(mov),
      "Valor Acuerdo (€)": valorAcuerdo(mov),
      "Aportación Manual (€)": mov.aportacion_euros || 0,
      "TOTAL A&P GASTADO (€)": gastoTotal(mov)
    }));

    const hojaDistribuidores = XLSX.utils.json_to_sheet(hojaDistribuidoresDatos);
    const hojaMarcas = XLSX.utils.json_to_sheet(hojaMarcasDatos);
    const hojaSellIn = XLSX.utils.json_to_sheet(hojaSellInDatos);
    const hojaSellOut = XLSX.utils.json_to_sheet(hojaSellOutDatos);

    hojaDistribuidores['!cols'] = [{ wch: 18 }, { wch: 32 }];
    hojaMarcas['!cols'] = [{ wch: 18 }, { wch: 32 }, { wch: 16 }, { wch: 22 }];
    hojaSellIn['!cols'] = [{ wch: 10 }, { wch: 18 }, { wch: 32 }, { wch: 18 }, { wch: 32 }, { wch: 16 }, { wch: 15 }, { wch: 15 }];
    hojaSellOut['!cols'] = [{ wch: 10 }, { wch: 18 }, { wch: 32 }, { wch: 18 }, { wch: 32 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 18 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, hojaDistribuidores, "Distribuidores");
    XLSX.utils.book_append_sheet(workbook, hojaMarcas, "Marcas");
    XLSX.utils.book_append_sheet(workbook, hojaSellIn, "HistoricoSellIn");
    XLSX.utils.book_append_sheet(workbook, hojaSellOut, "HistoricoSellOut");

    // Nombre de archivo SIEMPRE igual: así, guardándolo cada vez en la misma
    // carpeta, Power BI solo necesita "Actualizar" (sin reconfigurar la ruta).
    XLSX.writeFile(workbook, NOMBRE_ARCHIVO_POWERBI);
  };

  // --- EXPORTACIÓN PUNTUAL SELL-IN (por rango de fechas) ---
  const handleExportarSellIn = () => {
    const movimientosFiltrados = rawSellIn.filter(mov => {
      const matchFechaInicio = !filtros.fechaInicio || mov.mes_ano >= filtros.fechaInicio;
      const matchFechaFin = !filtros.fechaFin || mov.mes_ano <= filtros.fechaFin;
      return matchFechaInicio && matchFechaFin;
    });

    if (movimientosFiltrados.length === 0) {
      alert(`No se encontraron compras (Sell-In) para ese rango de fechas.`);
      return;
    }

    const datosParaExportar = movimientosFiltrados.map(mov => ({
      "Mes/Año": mov.mes_ano,
      "ID Distribuidor": mov.id_distribuidor,
      "Distribuidor": mapaDistribuidores.get(mov.id_distribuidor) || 'N/A',
      "ID Marca": mov.id_marca,
      "Marca": mapaMarcas.get(mov.id_marca) || 'N/A',
      "Unidades Compradas": mov.unidades_compradas,
      "Facturación (€)": mov.facturacion_euros,
      "A&P Generado (€)": generadoSellIn(mov)
    }));

    const tableHeader = [
      "Mes/Año", "ID Distribuidor", "Distribuidor", "ID Marca", "Marca",
      "Unidades Compradas", "Facturación (€)", "A&P Generado (€)"
    ];

    const worksheet = XLSX.utils.json_to_sheet(datosParaExportar, { header: tableHeader });
    worksheet['!cols'] = [{ wch: 10 }, { wch: 15 }, { wch: 30 }, { wch: 15 }, { wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sell-In General");
    XLSX.writeFile(workbook, `Reporte_SellIn_General_${filtros.fechaInicio || 'inicio'}_${filtros.fechaFin || 'fin'}.xlsx`);
  };

  // --- EXPORTACIÓN PUNTUAL SELL-OUT (por rango de fechas) ---
  const handleExportarSellOut = () => {
    const movimientosFiltrados = rawSellOut.filter(mov => {
      const matchFechaInicio = !filtros.fechaInicio || mov.mes_ano >= filtros.fechaInicio;
      const matchFechaFin = !filtros.fechaFin || mov.mes_ano <= filtros.fechaFin;
      return matchFechaInicio && matchFechaFin;
    });

    if (movimientosFiltrados.length === 0) {
      alert(`No se encontraron ventas/gastos (Sell-Out) para ese rango de fechas.`);
      return;
    }

    const datosParaExportar = movimientosFiltrados.map(mov => ({
      "Mes/Año": mov.mes_ano,
      "ID Distribuidor": mov.id_distribuidor,
      "Distribuidor": mapaDistribuidores.get(mov.id_distribuidor) || 'N/A',
      "ID Marca": mov.id_marca,
      "Marca": mapaMarcas.get(mov.id_marca) || 'N/A',
      "Ventas (uds)": mov.ventas_uds,
      "Ventas (€)": mov.ventas_euros,
      "Muestras (uds)": mov.muestras_uds,
      "Regaladas (uds)": mov.regaladas_uds,
      "Acuerdo (uds)": unidadesAcuerdo(mov),
      "Valor Acuerdo (€)": valorAcuerdo(mov),
      "Aportación (€)": mov.aportacion_euros,
      "TOTAL A&P GASTADO (€)": gastoTotal(mov)
    }));

    const tableHeader = [
      "Mes/Año", "ID Distribuidor", "Distribuidor", "ID Marca", "Marca",
      "Ventas (uds)", "Ventas (€)", "Muestras (uds)", "Regaladas (uds)",
      "Acuerdo (uds)", "Valor Acuerdo (€)", "Aportación (€)", "TOTAL A&P GASTADO (€)"
    ];

    const worksheet = XLSX.utils.json_to_sheet(datosParaExportar, { header: tableHeader });
    worksheet['!cols'] = [{ wch: 10 }, { wch: 15 }, { wch: 30 }, { wch: 15 }, { wch: 30 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 20 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sell-Out General");
    XLSX.writeFile(workbook, `Reporte_SellOut_General_${filtros.fechaInicio || 'inicio'}_${filtros.fechaFin || 'fin'}.xlsx`);
  };

  // --- RENDERIZADO ---
  return (
    <div>
      <h2 className={tituloPantalla}>Reportes Generales</h2>
      <p className={subtitulo}>Datos consolidados de todos sus distribuidores, listos para exportar y analizar en Power BI.</p>

      {cargando ? (
        <div className="text-slate-500 dark:text-slate-400">Cargando todos los datos... (esto puede tardar un momento la primera vez)</div>
      ) : (
        <div className="flex flex-col gap-5 max-w-3xl">

          {/* --- EXPORTACIÓN PARA POWER BI --- */}
          <div className={tarjeta}>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">Exportar todo para Power BI</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Genera un único Excel con 4 hojas (Distribuidores, Marcas, Histórico Sell-In e Histórico Sell-Out)
              con <strong>todo el histórico</strong> de todos sus distribuidores, sin filtrar por fecha — los filtros
              y el análisis se hacen luego dentro de Power BI.
            </p>

            <button onClick={handleExportarParaPowerBI} className={`${botonExito} !px-6 !py-2.5 text-base`}>
              Descargar datos para Power BI
            </button>

            <div className="bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/30 rounded-lg p-4 mt-4 text-sm text-slate-700 dark:text-slate-300">
              <p className="font-semibold text-slate-900 dark:text-white mb-2">Cómo conectarlo en Power BI Desktop (solo la primera vez):</p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Guarda siempre el archivo descargado (<code className="text-xs bg-white/60 dark:bg-slate-900/60 px-1 py-0.5 rounded">{NOMBRE_ARCHIVO_POWERBI}</code>) en la misma carpeta.</li>
                <li>En Power BI Desktop: <em>Obtener datos → Excel</em>, selecciona ese archivo.</li>
                <li>Marca las 4 hojas (Distribuidores, Marcas, HistoricoSellIn, HistoricoSellOut) y pulsa <em>Transformar datos</em> o <em>Cargar</em>.</li>
                <li>En el modelo, relaciona "ID Distribuidor" e "ID Marca" entre las tablas para poder cruzar los datos.</li>
              </ol>
              <p className="mt-2">
                A partir de ahí, cada vez que quieras actualizar el dashboard: vuelve aquí, pulsa el botón de arriba
                (sobrescribe el mismo archivo) y en Power BI solo tienes que darle a <strong>Actualizar</strong> — no hace
                falta reconfigurar nada.
              </p>
            </div>
          </div>

          {/* --- EXPORTACIONES PUNTUALES POR RANGO --- */}
          <div className={tarjeta}>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">Exportaciones puntuales por rango de fechas</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Para sacar un Excel suelto de Sell-In o Sell-Out de un periodo concreto (deje ambos campos vacíos para exportar todo el histórico).
            </p>

            <div className={`${filtroContenedor} mb-4`}>
              <label className={etiqueta}>Desde:</label>
              <SelectorMesAno value={filtros.fechaInicio} onChange={(v) => setFiltros(prev => ({ ...prev, fechaInicio: v }))} />
              <label className={etiqueta}>Hasta:</label>
              <SelectorMesAno value={filtros.fechaFin} onChange={(v) => setFiltros(prev => ({ ...prev, fechaFin: v }))} />
              <button className={`${botonSecundario} ml-auto`} onClick={() => setFiltros({ fechaInicio: '', fechaFin: '' })}>
                Limpiar
              </button>
            </div>

            <div className="flex gap-3">
              <button onClick={handleExportarSellIn} className={botonInfo}>
                Exportar Compras (Sell-In) del Rango
              </button>
              <button onClick={handleExportarSellOut} className={botonInfo}>
                Exportar Ventas y Gastos (Sell-Out) del Rango
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PantallaReportes;
