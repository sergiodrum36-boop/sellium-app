/*
 * ImportarExcel.js (NUEVO)
 * Importa un Excel de liquidación (formato "LIQUIDACION <DISTRIBUIDOR> <AÑO>.xlsx",
 * con hojas DATOS / VENTAS STOCK / <MES> <AA>) y sube automáticamente:
 *   - Marcas maestras nuevas (hoja DATOS)
 *   - Compras / Sell-In (hoja VENTAS STOCK)
 *   - Ventas y A&P / Sell-Out (hojas mensuales)
 *
 * Flujo: subir archivo -> previsualizar -> confirmar -> escribir en Firebase.
 * Nunca escribe nada sin que el usuario pulse "Confirmar Importación".
 */

import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { parseLiquidacion } from './parserLiquidacion';
import { encontrarSimilares } from './matching';
import {
  saveNuevoDistribuidor,
  saveNuevaMarca,
  saveMovimientosSellIn,
  saveMovimientosSellOut,
  getHistoricoSellIn,
  getHistoricoSellOut,
  deleteMovimientosPorMeses,
  saveStockInicialImportado,
  deleteStockInicialPorDistribuidorYAnio
} from './firebaseApi';
import { inputClasses, botonExito, botonSecundario, botonPrimario, tarjeta, thClasses, tdClasses } from './uiClasses';

const formateadorMoneda = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const norm = (s) => String(s || '').trim().toUpperCase();

// Desplaza el año de un "mes_ano" tipo "2025-03" sumándole `delta` años,
// manteniendo el mes igual. Se usa cuando el año detectado en el Excel
// (por ejemplo, por una plantilla reutilizada del año anterior) no coincide
// con el año real de los datos, y el usuario lo corrige a mano.
const desplazarAnioMes = (mesAno, delta) => {
  if (!mesAno || !delta) return mesAno;
  const [y, m] = mesAno.split('-');
  return `${parseInt(y, 10) + delta}-${m}`;
};

function ImportarExcel({ idUsuario, marcas, listaDistribuidores, onImportComplete }) {

  const [nombreArchivo, setNombreArchivo] = useState('');
  const [parseando, setParseando] = useState(false);
  const [resultado, setResultado] = useState(null); // salida de parseLiquidacion
  const [error, setError] = useState(null);

  // --- Decisión de distribuidor ---
  const [modoDistribuidor, setModoDistribuidor] = useState('nuevo'); // 'nuevo' | 'existente'
  const [idDistribuidorExistente, setIdDistribuidorExistente] = useState('');
  const [nombreDistribuidorNuevo, setNombreDistribuidorNuevo] = useState('');

  // --- Meses ya existentes para el distribuidor elegido (para detectar duplicados) ---
  const [cargandoConflictos, setCargandoConflictos] = useState(false);
  const [mesesExistentesSellIn, setMesesExistentesSellIn] = useState(new Set());
  const [mesesExistentesSellOut, setMesesExistentesSellOut] = useState(new Set());
  const [decisionMeses, setDecisionMeses] = useState({}); // { mesAno: 'importar' | 'sobrescribir' | 'omitir' }

  // --- Decisión de marcas nuevas ---
  // decisionMarca[nombre_marca] = { accion: 'crear' | 'usar_existente' | 'omitir', idExistente: string|null }
  const [decisionMarca, setDecisionMarca] = useState({});

  const [importando, setImportando] = useState(false);
  const [resumenFinal, setResumenFinal] = useState(null);

  // --- Año detectado vs. año real (por si el Excel trae el año equivocado,
  // p.ej. una plantilla reutilizada del año anterior) ---
  const [anioCorregido, setAnioCorregido] = useState(null);

  const mapaMarcasExistentes = new Map((marcas || []).map(m => [norm(m.nombre_marca), m]));

  // --------------------------------------------------------------
  // 1. SELECCIÓN Y PARSEO DEL ARCHIVO
  // --------------------------------------------------------------
  const handleArchivoSeleccionado = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError(null);
    setResultado(null);
    setResumenFinal(null);
    setNombreArchivo(file.name);
    setParseando(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const parsed = parseLiquidacion(workbook, file.name);

      setResultado(parsed);
      setNombreDistribuidorNuevo(parsed.distribuidorSugerido);
      setAnioCorregido(parsed.anio);

      // ¿El distribuidor sugerido ya existe en la lista? Si sí, preselecciónalo como "existente".
      const coincidencia = (listaDistribuidores || []).find(d => norm(d.nombre_distribuidor) === norm(parsed.distribuidorSugerido));
      if (coincidencia) {
        setModoDistribuidor('existente');
        setIdDistribuidorExistente(coincidencia.id);
      } else {
        setModoDistribuidor('nuevo');
      }

      // Para cada marca del Excel que no coincide EXACTO con una ya existente,
      // busca candidatas parecidas (posibles duplicados con nombre distinto)
      // y preselecciona con cautela: si hay una coincidencia muy alta, sugiere
      // usarla; si no, propone crear una marca nueva (el usuario puede cambiarlo).
      const nuevaDecision = {};
      parsed.marcas.forEach(m => {
        if (mapaMarcasExistentes.has(norm(m.nombre_marca))) return; // ya existe exacta, no hace falta decidir
        const candidatas = encontrarSimilares(m.nombre_marca, marcas || [], 0.5);
        if (candidatas.length > 0 && candidatas[0].score >= 0.85) {
          nuevaDecision[m.nombre_marca] = { accion: 'usar_existente', idExistente: candidatas[0].marca.id };
        } else {
          nuevaDecision[m.nombre_marca] = { accion: 'crear', idExistente: null };
        }
      });
      setDecisionMarca(nuevaDecision);

    } catch (err) {
      console.error(err);
      setError('No se pudo leer el archivo: ' + err.message);
    }
    setParseando(false);
  };

  // --------------------------------------------------------------
  // 2. AL ELEGIR DISTRIBUIDOR EXISTENTE, BUSCAR MESES YA CARGADOS
  // --------------------------------------------------------------
  const handleModoDistribuidorChange = async (modo, idExistente) => {
    setModoDistribuidor(modo);
    setMesesExistentesSellIn(new Set());
    setMesesExistentesSellOut(new Set());
    setDecisionMeses({});

    if (modo !== 'existente' || !idExistente) return;
    setIdDistribuidorExistente(idExistente);
    setCargandoConflictos(true);
    try {
      const [sellIn, sellOut] = await Promise.all([
        getHistoricoSellIn(idUsuario, idExistente),
        getHistoricoSellOut(idUsuario, idExistente)
      ]);
      setMesesExistentesSellIn(new Set(sellIn.map(m => m.mes_ano)));
      setMesesExistentesSellOut(new Set(sellOut.map(m => m.mes_ano)));
    } catch (err) {
      console.error(err);
      alert('No se pudo comprobar si ya había datos para este distribuidor: ' + err.message);
    }
    setCargandoConflictos(false);
  };

  // --------------------------------------------------------------
  // Cálculos derivados para la previsualización
  // --------------------------------------------------------------

  // Si el usuario corrige el año detectado, desplazamos TODOS los mes_ano
  // (compras y ventas) por la misma diferencia de años, para no tener que
  // tocar el parser ni el Excel original.
  const deltaAnio = (resultado && anioCorregido != null && resultado.anio != null) ? (Number(anioCorregido) - Number(resultado.anio)) : 0;

  const comprasAjustadas = resultado
    ? (deltaAnio ? resultado.compras.map(c => ({ ...c, mes_ano: desplazarAnioMes(c.mes_ano, deltaAnio) })) : resultado.compras)
    : [];
  const ventasAjustadas = resultado
    ? (deltaAnio ? resultado.ventas.map(v => ({ ...v, mes_ano: desplazarAnioMes(v.mes_ano, deltaAnio) })) : resultado.ventas)
    : [];

  // El "Stock Inicial" de la hoja VENTAS STOCK no lleva mes, sino que aplica
  // al año completo del Excel — así que se corrige con el mismo año real
  // (corregido o no) que el resto de los datos.
  const anioFinalStock = resultado ? Number(anioCorregido ?? resultado.anio) : null;

  const mesesUnicos = resultado
    ? [...new Set([...comprasAjustadas.map(c => c.mes_ano), ...ventasAjustadas.map(v => v.mes_ano)])].sort()
    : [];

  const conflictoDeMes = (mesAno) => mesesExistentesSellIn.has(mesAno) || mesesExistentesSellOut.has(mesAno);

  const decisionParaMes = (mesAno) => decisionMeses[mesAno] || (conflictoDeMes(mesAno) ? 'omitir' : 'importar');

  const setDecisionMes = (mesAno, valor) => {
    setDecisionMeses(prev => ({ ...prev, [mesAno]: valor }));
  };

  const referenciasSinMarca = resultado
    ? [...new Set([...comprasAjustadas.map(c => c.referencia), ...ventasAjustadas.map(v => v.referencia)])]
        .filter(ref => !mapaMarcasExistentes.has(norm(ref)) && !resultado.marcas.some(m => norm(m.nombre_marca) === norm(ref)))
    : [];

  const totalMarcasNuevasSeleccionadas = Object.values(decisionMarca).filter(d => d.accion === 'crear').length;
  const totalMarcasReutilizadas = Object.values(decisionMarca).filter(d => d.accion === 'usar_existente').length;

  // --------------------------------------------------------------
  // 3. CONFIRMAR IMPORTACIÓN
  // --------------------------------------------------------------
  const handleConfirmarImportacion = async () => {
    if (!resultado) return;

    const nombreDistribuidorFinal = modoDistribuidor === 'nuevo' ? nombreDistribuidorNuevo.trim() : null;
    if (modoDistribuidor === 'nuevo' && !nombreDistribuidorFinal) {
      alert('Escribe un nombre para el nuevo distribuidor.');
      return;
    }
    if (modoDistribuidor === 'existente' && !idDistribuidorExistente) {
      alert('Selecciona un distribuidor existente.');
      return;
    }

    const mesesAImportar = mesesUnicos.filter(m => decisionParaMes(m) !== 'omitir');
    if (mesesAImportar.length === 0) {
      alert('No hay ningún mes seleccionado para importar (todos están marcados como "omitir").');
      return;
    }

    if (!window.confirm(`Vas a importar ${mesesAImportar.length} mes(es) de datos. ¿Continuar?`)) return;

    setImportando(true);
    try {
      // --- a) Distribuidor ---
      let idDistribuidor = idDistribuidorExistente;
      if (modoDistribuidor === 'nuevo') {
        idDistribuidor = await saveNuevoDistribuidor({
          nombre_distribuidor: nombreDistribuidorFinal.toUpperCase(),
          id_usuario: idUsuario
        });
      }

      // --- b) Marcas nuevas ---
      const mapaIdMarcaPorNombre = new Map(marcas.map(m => [norm(m.nombre_marca), m.id]));
      // Mapa completo de datos de marca (precio, A&P) por ID, para resolver coste_unidad/ap_por_unidad
      const mapaMarcaPorId = new Map(marcas.map(m => [m.id, m]));

      for (const m of resultado.marcas) {
        if (mapaIdMarcaPorNombre.has(norm(m.nombre_marca))) continue; // ya existe con nombre exacto

        const decision = decisionMarca[m.nombre_marca];
        if (!decision || decision.accion === 'omitir') continue; // el usuario decidió no importar esta referencia

        if (decision.accion === 'usar_existente' && decision.idExistente) {
          // No crea marca nueva: la referencia del Excel apunta a una marca ya existente
          mapaIdMarcaPorNombre.set(norm(m.nombre_marca), decision.idExistente);
          continue;
        }

        // accion === 'crear'
        const nuevoId = await saveNuevaMarca({
          nombre_marca: m.nombre_marca,
          Coste_Unidad: m.Coste_Unidad,
          AP_Generado_Por_Unidad: m.AP_Generado_Por_Unidad
        });
        mapaIdMarcaPorNombre.set(norm(m.nombre_marca), nuevoId);
        mapaMarcaPorId.set(nuevoId, { id: nuevoId, nombre_marca: m.nombre_marca, Coste_Unidad: m.Coste_Unidad, AP_Generado_Por_Unidad: m.AP_Generado_Por_Unidad });
      }

      // Mapa por NOMBRE de referencia del Excel -> datos de marca (precio, A&P),
      // resolviendo a través del id ya sea existente o recién creado.
      const mapaMarcaCompleta = new Map();
      resultado.marcas.forEach(m => {
        const idResuelto = mapaIdMarcaPorNombre.get(norm(m.nombre_marca));
        const marcaInfo = idResuelto ? mapaMarcaPorId.get(idResuelto) : null;
        mapaMarcaCompleta.set(norm(m.nombre_marca), marcaInfo || { nombre_marca: m.nombre_marca, Coste_Unidad: m.Coste_Unidad, AP_Generado_Por_Unidad: m.AP_Generado_Por_Unidad });
      });

      // --- c) Sobrescribir: borrar meses marcados como "sobrescribir" ---
      const mesesASobrescribir = mesesUnicos.filter(m => decisionParaMes(m) === 'sobrescribir');
      let totalBorradosSellIn = 0, totalBorradosSellOut = 0;
      if (mesesASobrescribir.length > 0) {
        totalBorradosSellIn = await deleteMovimientosPorMeses('historicoSellIn', idUsuario, idDistribuidor, mesesASobrescribir);
        totalBorradosSellOut = await deleteMovimientosPorMeses('historicoSellOut', idUsuario, idDistribuidor, mesesASobrescribir);
      }

      // --- d) Preparar filas de Sell-In (compras) ---
      const mesesSet = new Set(mesesAImportar);
      const filasSellIn = comprasAjustadas
        .filter(c => mesesSet.has(c.mes_ano))
        .filter(c => mapaIdMarcaPorNombre.has(norm(c.referencia)))
        .map(c => {
          const idMarca = mapaIdMarcaPorNombre.get(norm(c.referencia));
          const marcaInfo = mapaMarcaCompleta.get(norm(c.referencia)) || {};
          return {
            id_marca: idMarca,
            nombre_marca: marcaInfo.nombre_marca || c.referencia,
            mes_ano: c.mes_ano,
            coste_unidad: marcaInfo.Coste_Unidad || 0,
            ap_por_unidad: marcaInfo.AP_Generado_Por_Unidad || 0,
            unidades_compradas: c.unidades_compradas,
            facturacion_euros: c.unidades_compradas * (marcaInfo.Coste_Unidad || 0),
            origen: 'import_excel'
          };
        });

      // --- e) Preparar filas de Sell-Out (ventas y A&P) ---
      const filasSellOut = ventasAjustadas
        .filter(v => mesesSet.has(v.mes_ano))
        .filter(v => mapaIdMarcaPorNombre.has(norm(v.referencia)))
        .map(v => {
          const idMarca = mapaIdMarcaPorNombre.get(norm(v.referencia));
          const marcaInfo = mapaMarcaCompleta.get(norm(v.referencia)) || {};
          const costeUnidad = marcaInfo.Coste_Unidad || 0;
          return {
            id_marca: idMarca,
            nombre_marca: marcaInfo.nombre_marca || v.referencia,
            mes_ano: v.mes_ano,
            coste_unidad: costeUnidad,
            ap_por_unidad: marcaInfo.AP_Generado_Por_Unidad || 0,
            ventas_uds: v.ventas_uds,
            ventas_euros: v.ventas_uds * costeUnidad,
            regaladas_uds: v.regaladas_uds,
            valor_regaladas_euros: v.valor_regaladas_euros,
            muestras_uds: v.muestras_uds,
            valor_muestras_euros: v.valor_muestras_euros,
            unidades_acuerdo: v.unidades_acuerdo,
            precio_acuerdo_unidad: v.precio_acuerdo_unidad,
            valor_acuerdo_euros: v.valor_acuerdo_euros,
            aportacion_euros: 0,
            origen: 'import_excel'
          };
        });

      // --- f) Preparar y guardar el Stock Inicial declarado en el Excel (si lo
      // trae) — es informativo, NUNCA se suma como compra; solo sirve de
      // punto de partida para el cálculo de Stock en StockDistribuidor.js.
      // Si ya existía un Stock Inicial guardado para este distribuidor y este
      // mismo año, se sustituye (el Excel recién subido es la fuente de la
      // verdad más reciente).
      const filasStockInicial = (resultado.stockInicial || [])
        .filter(s => mapaIdMarcaPorNombre.has(norm(s.referencia)))
        .map(s => {
          const idMarca = mapaIdMarcaPorNombre.get(norm(s.referencia));
          const marcaInfo = mapaMarcaCompleta.get(norm(s.referencia)) || {};
          return {
            id_marca: idMarca,
            nombre_marca: marcaInfo.nombre_marca || s.referencia,
            anio: anioFinalStock,
            stock_inicial: s.stock_inicial
          };
        });

      if (filasStockInicial.length > 0) {
        await deleteStockInicialPorDistribuidorYAnio(idUsuario, idDistribuidor, anioFinalStock);
        await saveStockInicialImportado(idUsuario, idDistribuidor, filasStockInicial);
      }

      // --- g) Escribir en Firebase (batched) ---
      if (filasSellIn.length > 0) {
        await saveMovimientosSellIn(idUsuario, idDistribuidor, null, filasSellIn);
      }
      if (filasSellOut.length > 0) {
        await saveMovimientosSellOut(idUsuario, idDistribuidor, null, filasSellOut);
      }

      setResumenFinal({
        distribuidor: modoDistribuidor === 'nuevo' ? nombreDistribuidorFinal.toUpperCase() : (listaDistribuidores.find(d => d.id === idDistribuidor)?.nombre_distribuidor || idDistribuidor),
        marcasCreadas: totalMarcasNuevasSeleccionadas,
        mesesImportados: mesesAImportar.length,
        stockInicialGuardado: filasStockInicial.length,
        filasSellIn: filasSellIn.length,
        filasSellOut: filasSellOut.length,
        borradosSellIn: totalBorradosSellIn,
        borradosSellOut: totalBorradosSellOut,
        referenciasOmitidas: referenciasSinMarca
      });

      if (onImportComplete) onImportComplete();

    } catch (err) {
      console.error('Error importando Excel:', err);
      alert('Error durante la importación: ' + err.message);
    }
    setImportando(false);
  };

  const handleReiniciar = () => {
    setNombreArchivo('');
    setResultado(null);
    setError(null);
    setResumenFinal(null);
    setDecisionMarca({});
    setDecisionMeses({});
    setMesesExistentesSellIn(new Set());
    setMesesExistentesSellOut(new Set());
    setAnioCorregido(null);
  };

  // ================================================================
  // RENDERIZADO
  // ================================================================
  return (
    <div>
      <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">Importar Excel de Liquidación</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
        Sube el Excel de liquidación mensual (hojas DATOS / VENTAS STOCK / meses) y se cargarán
        automáticamente las marcas, compras (Sell-In) y ventas/A&P (Sell-Out). Nada se guarda hasta
        que confirmes en el último paso.
      </p>

      {!resumenFinal && (
        <div className={`${tarjeta} mb-4`}>
          <input type="file" accept=".xlsx,.xls" onChange={handleArchivoSeleccionado} disabled={parseando || importando} className="text-sm text-slate-700 dark:text-slate-300" />
          {parseando && <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Leyendo archivo...</p>}
          {error && <p className="text-sm text-red-600 dark:text-red-400 mt-2">{error}</p>}
        </div>
      )}

      {resultado && !resumenFinal && (
        <>
          {/* AVISOS DEL PARSER */}
          {resultado.avisos.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/40 text-amber-800 dark:text-amber-300 rounded-xl p-4 mb-4 text-sm">
              <strong>Avisos:</strong>
              <ul className="list-disc pl-5 mt-1 space-y-0.5">{resultado.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>
            </div>
          )}

          {/* 1. DISTRIBUIDOR */}
          <div className={`${tarjeta} mb-4`}>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">1. Distribuidor</h4>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 flex-wrap">
              <input type="radio" checked={modoDistribuidor === 'nuevo'} onChange={() => handleModoDistribuidorChange('nuevo', null)} />
              Crear distribuidor nuevo:
              <input
                type="text"
                value={nombreDistribuidorNuevo}
                onChange={(e) => setNombreDistribuidorNuevo(e.target.value)}
                disabled={modoDistribuidor !== 'nuevo'}
                className={`${inputClasses} flex-1 min-w-[200px]`}
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 flex-wrap mt-3">
              <input type="radio" checked={modoDistribuidor === 'existente'} onChange={() => handleModoDistribuidorChange('existente', listaDistribuidores[0]?.id || '')} />
              Usar distribuidor ya existente:
              <select
                value={idDistribuidorExistente}
                onChange={(e) => handleModoDistribuidorChange('existente', e.target.value)}
                disabled={modoDistribuidor !== 'existente'}
                className={`${inputClasses} flex-1 min-w-[200px]`}
              >
                <option value="">-- Selecciona --</option>
                {(listaDistribuidores || []).map(d => (
                  <option key={d.id} value={d.id}>{d.nombre_distribuidor}</option>
                ))}
              </select>
            </label>
            {cargandoConflictos && <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Comprobando si ya hay datos cargados para este distribuidor...</p>}
          </div>

          {/* 2. MARCAS */}
          <div className={`${tarjeta} mb-4`}>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">2. Marcas ({resultado.marcas.length} encontradas en el Excel)</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              Si una marca del Excel se parece mucho a una que ya tienes (pero escrita distinto),
              te lo sugerimos aquí para que NO se cree duplicada — pero la decisión final es tuya.
            </p>
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className={thClasses}>Marca (Excel)</th>
                    <th className={thClasses}>Precio</th>
                    <th className={thClasses}>A&P/ud</th>
                    <th className={thClasses}>Decisión</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.marcas.map(m => {
                    const yaExiste = mapaMarcasExistentes.has(norm(m.nombre_marca));
                    if (yaExiste) {
                      return (
                        <tr key={m.nombre_marca}>
                          <td className={tdClasses}>{m.nombre_marca}</td>
                          <td className={`${tdClasses} text-right tabular-nums`}>{formateadorMoneda.format(m.Coste_Unidad)}</td>
                          <td className={`${tdClasses} text-right tabular-nums`}>{formateadorMoneda.format(m.AP_Generado_Por_Unidad)}</td>
                          <td className={tdClasses}><span className="text-emerald-600 dark:text-emerald-400">Ya existe (nombre idéntico)</span></td>
                        </tr>
                      );
                    }

                    const candidatas = encontrarSimilares(m.nombre_marca, marcas || [], 0.5);
                    const decision = decisionMarca[m.nombre_marca] || { accion: 'crear', idExistente: null };

                    return (
                      <tr key={m.nombre_marca}>
                        <td className={tdClasses}>{m.nombre_marca}</td>
                        <td className={`${tdClasses} text-right tabular-nums`}>{formateadorMoneda.format(m.Coste_Unidad)}</td>
                        <td className={`${tdClasses} text-right tabular-nums`}>{formateadorMoneda.format(m.AP_Generado_Por_Unidad)}</td>
                        <td className={tdClasses}>
                          <select
                            value={decision.accion === 'usar_existente' ? `usar:${decision.idExistente}` : decision.accion}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === 'crear' || val === 'omitir') {
                                setDecisionMarca(prev => ({ ...prev, [m.nombre_marca]: { accion: val, idExistente: null } }));
                              } else if (val.startsWith('usar:')) {
                                setDecisionMarca(prev => ({ ...prev, [m.nombre_marca]: { accion: 'usar_existente', idExistente: val.slice(5) } }));
                              }
                            }}
                            className={`${inputClasses} max-w-xs`}
                          >
                            <option value="crear">Crear como marca nueva</option>
                            {candidatas.map(c => (
                              <option key={c.marca.id} value={`usar:${c.marca.id}`}>
                                Es la misma que "{c.marca.nombre_marca}" ({Math.round(c.score * 100)}% parecido)
                              </option>
                            ))}
                            <option value="omitir">Omitir esta referencia (no importar)</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              {totalMarcasNuevasSeleccionadas} marca(s) nueva(s) se crearán · {totalMarcasReutilizadas} referencia(s) se vincularán a marcas ya existentes.
            </p>
            {referenciasSinMarca.length > 0 && (
              <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/40 text-amber-800 dark:text-amber-300 rounded-xl p-4 mt-3 text-sm">
                <strong>⚠️ {referenciasSinMarca.length} referencia(s) en Sell-In/Sell-Out sin marca maestra en la hoja DATOS — se omitirán de la importación:</strong>
                <ul className="list-disc pl-5 mt-1 space-y-0.5">{referenciasSinMarca.map((r, i) => <li key={i}>{r}</li>)}</ul>
              </div>
            )}
          </div>

          {/* AÑO DETECTADO — corregible por si el Excel trae el año equivocado
              (p.ej. una plantilla reutilizada del año anterior con las pestañas
              todavía etiquetadas con el año viejo) */}
          <div className={`${tarjeta} mb-4`}>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Año de los datos</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              Año detectado en el Excel: <strong>{resultado.anio}</strong>. Si no es el año real de estos datos
              (por ejemplo, reutilizaste la plantilla del año pasado y las pestañas todavía dicen el año viejo),
              corrígelo aquí — se ajustan automáticamente todos los meses.
            </p>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              Año real:
              <input
                type="number"
                value={anioCorregido ?? resultado.anio}
                onChange={(e) => setAnioCorregido(e.target.value)}
                className={`${inputClasses} w-28`}
              />
            </label>
            {deltaAnio !== 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                Se desplazarán todos los meses {deltaAnio > 0 ? '+' : ''}{deltaAnio} año(s) respecto al Excel original.
              </p>
            )}
          </div>

          {/* 3. MESES */}
          <div className={`${tarjeta} mb-4`}>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">3. Meses a importar ({mesesUnicos.length})</h4>
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className={thClasses}>Mes</th>
                    <th className={thClasses}>Filas Sell-In</th>
                    <th className={thClasses}>Filas Sell-Out</th>
                    <th className={thClasses}>Estado / Decisión</th>
                  </tr>
                </thead>
                <tbody>
                  {mesesUnicos.map(mes => {
                    const filasIn = comprasAjustadas.filter(c => c.mes_ano === mes).length;
                    const filasOut = ventasAjustadas.filter(v => v.mes_ano === mes).length;
                    const conflicto = conflictoDeMes(mes);
                    const decision = decisionParaMes(mes);
                    return (
                      <tr key={mes}>
                        <td className={tdClasses}>{mes}</td>
                        <td className={`${tdClasses} text-right tabular-nums`}>{filasIn}</td>
                        <td className={`${tdClasses} text-right tabular-nums`}>{filasOut}</td>
                        <td className={tdClasses}>
                          {!conflicto ? (
                            <span className="text-emerald-600 dark:text-emerald-400">Nuevo — se importará</span>
                          ) : (
                            <select value={decision} onChange={(e) => setDecisionMes(mes, e.target.value)} className={inputClasses}>
                              <option value="omitir">Ya existe — Omitir (no tocar)</option>
                              <option value="sobrescribir">Ya existe — Sobrescribir</option>
                            </select>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 4. CONFIRMAR */}
          <div className={tarjeta}>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">4. Confirmar</h4>
            <div className="flex gap-2">
              <button
                onClick={handleConfirmarImportacion}
                disabled={importando}
                className={`${botonExito} !px-5 !py-2.5 text-base`}
              >
                {importando ? 'Importando...' : 'Confirmar Importación'}
              </button>
              <button onClick={handleReiniciar} disabled={importando} className={`${botonSecundario} !px-5 !py-2.5 text-base`}>
                Cancelar / Empezar de nuevo
              </button>
            </div>
          </div>
        </>
      )}

      {resumenFinal && (
        <div className="border border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl p-5">
          <h4 className="text-emerald-700 dark:text-emerald-300 font-semibold mb-2">✅ Importación completada</h4>
          <p className="text-sm text-slate-700 dark:text-slate-200 mb-2">Distribuidor: <strong>{resumenFinal.distribuidor}</strong></p>
          <ul className="list-disc pl-5 text-sm text-slate-700 dark:text-slate-200 space-y-0.5 mb-4">
            <li>{resumenFinal.marcasCreadas} marca(s) nueva(s) creada(s)</li>
            <li>{resumenFinal.mesesImportados} mes(es) importado(s)</li>
            <li>{resumenFinal.filasSellIn} movimientos de Compras (Sell-In) guardados</li>
            <li>{resumenFinal.filasSellOut} movimientos de Ventas/A&P (Sell-Out) guardados</li>
            {resumenFinal.stockInicialGuardado > 0 && (
              <li>{resumenFinal.stockInicialGuardado} marca(s) con Stock Inicial declarado (se usará como punto de partida en la pestaña Stock, sin contar como compra)</li>
            )}
            {(resumenFinal.borradosSellIn > 0 || resumenFinal.borradosSellOut > 0) && (
              <li>Se sobrescribieron {resumenFinal.borradosSellIn + resumenFinal.borradosSellOut} registros antiguos de los meses marcados como "Sobrescribir"</li>
            )}
          </ul>
          <button onClick={handleReiniciar} className={botonPrimario}>
            Importar otro archivo
          </button>
        </div>
      )}
    </div>
  );
}

export default ImportarExcel;
