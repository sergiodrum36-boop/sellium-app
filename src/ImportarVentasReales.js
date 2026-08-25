/*
 * ImportarVentasReales.js
 * Importador del Excel mensual de ventas reales exportado desde QlikSense
 * (Distribuidor / Familia / Subfamilia / Uds / Cajas / Importe).
 *
 * A diferencia de ImportarExcel.js (que importa UN distribuidor a la vez),
 * este archivo trae TODOS los distribuidores juntos, así que hay que
 * reconciliar tanto los Distribuidores como las Subfamilias (=Marcas) del
 * Excel contra los ya existentes en la app antes de guardar nada.
 *
 * Reglas de negocio confirmadas por el usuario:
 *  - "Subfamilia" del Excel = "Marca" en el resto de la app.
 *  - "Familia" es una categoría nueva que no existía antes; se guarda tal
 *    cual en cada movimiento de ventasReales (no se intenta backfilling
 *    sobre marcas ya existentes, porque las reglas de Firestore de este
 *    proyecto no permiten "update" — solo "create" y "delete").
 *  - El Excel no lleva el mes/año: lo elige el usuario al importar.
 *  - Estos datos son la fuente de verdad frente a los cálculos de Sell-In/
 *    Sell-Out cuando haya diferencias.
 */

import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { parseVentasReales } from './parserVentasReales';
import { encontrarSimilares } from './matching';
import {
  saveNuevoDistribuidor,
  saveNuevaMarca,
  saveVentasReales,
  getVentasRealesByMonth,
  deleteVentasRealesPorDistribuidorYMes,
  saveMapeoImportacion,
  deleteMapeoImportacion
} from './firebaseApi';
import { inputClasses, botonExito, botonSecundario, botonPrimario, tarjeta } from './uiClasses';
import TablaOrdenable from './TablaOrdenable';
import SelectorMesAno from './SelectorMesAno';

const norm = (s) => String(s || '').trim().toUpperCase();

// encontrarSimilares() (de matching.js) espera objetos con campo "nombre_marca".
// Los distribuidores usan "nombre_distribuidor", así que los adaptamos antes
// de comparar y volvemos a exponer "nombre_distribuidor" en el resultado.
const encontrarDistribuidoresSimilares = (nombre, distribuidores, umbralMinimo = 0.5) => {
  const adaptados = (distribuidores || []).map(d => ({ id: d.id, nombre_marca: d.nombre_distribuidor }));
  return encontrarSimilares(nombre, adaptados, umbralMinimo).map(r => ({
    distribuidor: { id: r.marca.id, nombre_distribuidor: r.marca.nombre_marca },
    score: r.score
  }));
};

function ImportarVentasReales({ idUsuario, listaDistribuidores, marcasGlobales, mapeoImportacion, onImportComplete }) {

  const [nombreArchivo, setNombreArchivo] = useState('');
  const [parseando, setParseando] = useState(false);
  const [error, setError] = useState(null);
  const [resultado, setResultado] = useState(null); // { filas, avisos }

  const [mesAno, setMesAno] = useState('');
  const [cargandoConflictos, setCargandoConflictos] = useState(false);
  const [distribuidoresConDatosDelMes, setDistribuidoresConDatosDelMes] = useState(new Set());

  // decisionDistribuidor[nombreExcel] = { accion: 'crear'|'usar_existente'|'omitir', idExistente }
  const [decisionDistribuidor, setDecisionDistribuidor] = useState({});
  // decisionMarca[subfamiliaExcel] = { accion: 'crear'|'usar_existente'|'omitir', idExistente, familia }
  const [decisionMarca, setDecisionMarca] = useState({});
  // decisionConflicto[nombreExcelDistribuidor] = 'sobrescribir' | 'omitir'  (solo si ya hay datos ese mes)
  const [decisionConflicto, setDecisionConflicto] = useState({});

  const [importando, setImportando] = useState(false);
  const [resumenFinal, setResumenFinal] = useState(null);
  // Nombres (Excel) cuya decisión se ha rellenado automáticamente a partir de
  // una importación anterior — para avisar al usuario de que no hace falta
  // que los toque, aunque puede cambiarlos si quiere.
  const [nombresRecordados, setNombresRecordados] = useState(new Set());

  const mapaDistribuidoresExistentes = new Map((listaDistribuidores || []).map(d => [norm(d.nombre_distribuidor), d]));
  const mapaMarcasExistentes = new Map((marcasGlobales || []).map(m => [norm(m.nombre_marca), m]));

  // Memoria de reconciliación: clave "tipo::NOMBRE_EXCEL_NORMALIZADO" -> última
  // decisión guardada (usar_existente/omitir + id_destino). Se rellena la
  // primera vez que el usuario resuelve un nombre y se reutiliza automática-
  // mente en las siguientes importaciones, para no preguntar dos veces por lo
  // mismo.
  const mapaMemoria = new Map();
  (mapeoImportacion || []).forEach(m => {
    mapaMemoria.set(`${m.tipo}::${m.nombre_excel}`, m);
  });
  const idsDistribuidoresValidos = new Set((listaDistribuidores || []).map(d => d.id));
  const idsMarcasValidas = new Set((marcasGlobales || []).map(m => m.id));

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
      const parsed = parseVentasReales(workbook);
      setResultado(parsed);

      // --- Preselección de Distribuidores ---
      const distribuidoresExcel = [...new Set(parsed.filas.map(f => f.distribuidor))];
      const nuevaDecisionDistribuidor = {};
      const nombresRecordadosNuevos = new Set();
      distribuidoresExcel.forEach(nombreExcel => {
        // 1º: ¿ya resolvimos este nombre en una importación anterior?
        const recordado = mapaMemoria.get(`distribuidor::${norm(nombreExcel)}`);
        if (recordado && (recordado.accion === 'omitir' || idsDistribuidoresValidos.has(recordado.id_destino))) {
          nuevaDecisionDistribuidor[nombreExcel] = {
            accion: recordado.accion,
            idExistente: recordado.accion === 'usar_existente' ? recordado.id_destino : null
          };
          nombresRecordadosNuevos.add(`distribuidor::${nombreExcel}`);
          return;
        }
        const exacto = mapaDistribuidoresExistentes.get(norm(nombreExcel));
        if (exacto) {
          nuevaDecisionDistribuidor[nombreExcel] = { accion: 'usar_existente', idExistente: exacto.id };
          return;
        }
        const candidatas = encontrarDistribuidoresSimilares(nombreExcel, listaDistribuidores, 0.5);
        if (candidatas.length > 0 && candidatas[0].score >= 0.85) {
          nuevaDecisionDistribuidor[nombreExcel] = { accion: 'usar_existente', idExistente: candidatas[0].distribuidor.id };
        } else {
          nuevaDecisionDistribuidor[nombreExcel] = { accion: 'crear', idExistente: null };
        }
      });
      setDecisionDistribuidor(nuevaDecisionDistribuidor);

      // --- Preselección de Subfamilias (=Marcas) ---
      const subfamiliasExcel = [...new Set(parsed.filas.map(f => f.subfamilia))];
      const familiaPorSubfamilia = new Map();
      parsed.filas.forEach(f => {
        if (!familiaPorSubfamilia.has(f.subfamilia) && f.familia) familiaPorSubfamilia.set(f.subfamilia, f.familia);
      });

      const nuevaDecisionMarca = {};
      subfamiliasExcel.forEach(subfamilia => {
        const familiaDetectada = familiaPorSubfamilia.get(subfamilia) || '';
        // 1º: ¿ya resolvimos esta subfamilia en una importación anterior?
        const recordado = mapaMemoria.get(`marca::${norm(subfamilia)}`);
        if (recordado && (recordado.accion === 'omitir' || idsMarcasValidas.has(recordado.id_destino))) {
          nuevaDecisionMarca[subfamilia] = {
            accion: recordado.accion,
            idExistente: recordado.accion === 'usar_existente' ? recordado.id_destino : null,
            familia: familiaDetectada
          };
          nombresRecordadosNuevos.add(`marca::${subfamilia}`);
          return;
        }
        const exacta = mapaMarcasExistentes.get(norm(subfamilia));
        if (exacta) {
          nuevaDecisionMarca[subfamilia] = { accion: 'usar_existente', idExistente: exacta.id, familia: familiaDetectada };
          return;
        }
        const candidatas = encontrarSimilares(subfamilia, marcasGlobales || [], 0.5);
        if (candidatas.length > 0 && candidatas[0].score >= 0.85) {
          nuevaDecisionMarca[subfamilia] = { accion: 'usar_existente', idExistente: candidatas[0].marca.id, familia: familiaDetectada };
        } else {
          nuevaDecisionMarca[subfamilia] = { accion: 'crear', idExistente: null, familia: familiaDetectada };
        }
      });
      setDecisionMarca(nuevaDecisionMarca);
      setNombresRecordados(nombresRecordadosNuevos);

    } catch (err) {
      console.error(err);
      setError('No se pudo leer el archivo: ' + err.message);
    }
    setParseando(false);
  };

  // --------------------------------------------------------------
  // 2. AL ELEGIR EL MES, COMPROBAR QUÉ DISTRIBUIDORES YA TIENEN DATOS ESE MES
  // --------------------------------------------------------------
  const handleMesAnoChange = async (nuevoMes) => {
    setMesAno(nuevoMes);
    setDecisionConflicto({});
    setDistribuidoresConDatosDelMes(new Set());
    if (!nuevoMes) return;
    setCargandoConflictos(true);
    try {
      const ventasDelMes = await getVentasRealesByMonth(idUsuario, nuevoMes);
      setDistribuidoresConDatosDelMes(new Set(ventasDelMes.map(v => v.id_distribuidor)));
    } catch (err) {
      console.error(err);
      alert('No se pudo comprobar si ya había datos para ese mes: ' + err.message);
    }
    setCargandoConflictos(false);
  };

  // --------------------------------------------------------------
  // Cálculos derivados para la previsualización
  // --------------------------------------------------------------
  const distribuidoresExcel = resultado ? [...new Set(resultado.filas.map(f => f.distribuidor))] : [];
  const subfamiliasExcel = resultado ? [...new Set(resultado.filas.map(f => f.subfamilia))] : [];

  // ¿Qué distribuidores (ya resueltos a un ID existente) tienen conflicto este mes?
  const distribuidoresConConflicto = distribuidoresExcel.filter(nombreExcel => {
    const decision = decisionDistribuidor[nombreExcel];
    return decision && decision.accion === 'usar_existente' && distribuidoresConDatosDelMes.has(decision.idExistente);
  });

  const totalFilasAImportar = resultado ? resultado.filas.filter(f => {
    const dDist = decisionDistribuidor[f.distribuidor];
    const dMarca = decisionMarca[f.subfamilia];
    if (!dDist || dDist.accion === 'omitir') return false;
    if (!dMarca || dMarca.accion === 'omitir') return false;
    if (distribuidoresConConflicto.includes(f.distribuidor) && (decisionConflicto[f.distribuidor] || 'omitir') === 'omitir') return false;
    return true;
  }).length : 0;

  const totalDistribuidoresNuevos = Object.values(decisionDistribuidor).filter(d => d.accion === 'crear').length;
  const totalMarcasNuevas = Object.values(decisionMarca).filter(d => d.accion === 'crear').length;

  // --------------------------------------------------------------
  // 3. CONFIRMAR IMPORTACIÓN
  // --------------------------------------------------------------
  const handleConfirmarImportacion = async () => {
    if (!mesAno) { alert('Selecciona el Mes/Año al que corresponden estos datos.'); return; }
    if (!resultado || resultado.filas.length === 0) { alert('No hay datos para importar.'); return; }
    if (!window.confirm(
      `Vas a importar ${totalFilasAImportar} fila(s) de ventas reales para ${mesAno}. ` +
      (totalDistribuidoresNuevos > 0 ? `Se crearán ${totalDistribuidoresNuevos} distribuidor(es) nuevo(s). ` : '') +
      (totalMarcasNuevas > 0 ? `Se crearán ${totalMarcasNuevas} marca(s) nueva(s). ` : '') +
      `¿Continuar?`
    )) return;

    setImportando(true);
    try {
      // --- 1. Crear distribuidores nuevos ---
      const idPorDistribuidorExcel = {};
      for (const nombreExcel of distribuidoresExcel) {
        const decision = decisionDistribuidor[nombreExcel];
        if (decision.accion === 'omitir') continue;
        if (decision.accion === 'usar_existente') {
          idPorDistribuidorExcel[nombreExcel] = decision.idExistente;
        } else {
          const nuevoId = await saveNuevoDistribuidor({
            nombre_distribuidor: norm(nombreExcel),
            id_usuario: idUsuario
          });
          idPorDistribuidorExcel[nombreExcel] = nuevoId;
        }
      }

      // --- 2. Crear marcas nuevas (Subfamilia) ---
      const idPorSubfamiliaExcel = {};
      for (const subfamilia of subfamiliasExcel) {
        const decision = decisionMarca[subfamilia];
        if (decision.accion === 'omitir') continue;
        if (decision.accion === 'usar_existente') {
          idPorSubfamiliaExcel[subfamilia] = decision.idExistente;
        } else {
          const nuevoId = await saveNuevaMarca({
            nombre_marca: norm(subfamilia),
            Coste_Unidad: 0,
            AP_Generado_Por_Unidad: 0,
            familia: decision.familia || ''
          });
          idPorSubfamiliaExcel[subfamilia] = nuevoId;
        }
      }

      // --- 2b. Guardar en memoria las decisiones de esta importación, para
      // que la próxima vez que suban un Excel no se vuelva a preguntar por
      // estos mismos nombres. Un "crear nuevo" pasa a recordarse como "usar
      // el que se acaba de crear" (con su id ya resuelto); un "omitir" se
      // recuerda tal cual. Como no se permite "update" en Firestore, primero
      // se borra la memoria antigua de esa clave (si existía) y se crea la
      // nueva.
      for (const nombreExcel of distribuidoresExcel) {
        const decision = decisionDistribuidor[nombreExcel];
        const claveNorm = norm(nombreExcel);
        const accionFinal = decision.accion === 'omitir' ? 'omitir' : 'usar_existente';
        const idFinal = decision.accion === 'omitir' ? null : idPorDistribuidorExcel[nombreExcel];
        if (accionFinal === 'usar_existente' && !idFinal) continue; // por seguridad
        await deleteMapeoImportacion(idUsuario, 'distribuidor', claveNorm);
        await saveMapeoImportacion(idUsuario, 'distribuidor', claveNorm, accionFinal, idFinal);
      }
      for (const subfamilia of subfamiliasExcel) {
        const decision = decisionMarca[subfamilia];
        const claveNorm = norm(subfamilia);
        const accionFinal = decision.accion === 'omitir' ? 'omitir' : 'usar_existente';
        const idFinal = decision.accion === 'omitir' ? null : idPorSubfamiliaExcel[subfamilia];
        if (accionFinal === 'usar_existente' && !idFinal) continue;
        await deleteMapeoImportacion(idUsuario, 'marca', claveNorm);
        await saveMapeoImportacion(idUsuario, 'marca', claveNorm, accionFinal, idFinal);
      }

      // --- 3. Sobrescribir (borrar datos previos) donde el usuario lo pidió ---
      let borrados = 0;
      for (const nombreExcel of distribuidoresConConflicto) {
        if ((decisionConflicto[nombreExcel] || 'omitir') === 'sobrescribir') {
          const idResuelto = idPorDistribuidorExcel[nombreExcel];
          if (idResuelto) {
            borrados += await deleteVentasRealesPorDistribuidorYMes(idUsuario, idResuelto, mesAno);
          }
        }
      }

      // --- 4. Construir filas finales a guardar ---
      const filasFinal = resultado.filas
        .filter(f => {
          const dDist = decisionDistribuidor[f.distribuidor];
          const dMarca = decisionMarca[f.subfamilia];
          if (!dDist || dDist.accion === 'omitir') return false;
          if (!dMarca || dMarca.accion === 'omitir') return false;
          if (distribuidoresConConflicto.includes(f.distribuidor) && (decisionConflicto[f.distribuidor] || 'omitir') === 'omitir') return false;
          return true;
        })
        .map(f => ({
          id_distribuidor: idPorDistribuidorExcel[f.distribuidor],
          nombre_distribuidor: norm(f.distribuidor),
          id_marca: idPorSubfamiliaExcel[f.subfamilia],
          nombre_marca: norm(f.subfamilia),
          familia: f.familia || '',
          uds: f.uds,
          cajas: f.cajas,
          importe: f.importe
        }));

      if (filasFinal.length > 0) {
        await saveVentasReales(idUsuario, mesAno, filasFinal);
      }

      setResumenFinal({
        mesAno,
        filasImportadas: filasFinal.length,
        distribuidoresNuevos: totalDistribuidoresNuevos,
        marcasNuevas: totalMarcasNuevas,
        borrados
      });

      if (onImportComplete) onImportComplete();

    } catch (err) {
      console.error('Error al importar Ventas Reales:', err);
      alert('Error al importar: ' + err.message);
    }
    setImportando(false);
  };

  const handleReiniciar = () => {
    setNombreArchivo('');
    setResultado(null);
    setError(null);
    setResumenFinal(null);
    setMesAno('');
    setDecisionDistribuidor({});
    setDecisionMarca({});
    setDecisionConflicto({});
    setDistribuidoresConDatosDelMes(new Set());
    setNombresRecordados(new Set());
  };

  // ================================================================
  // RENDERIZADO
  // ================================================================
  return (
    <div>
      <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">Importar Ventas Reales (Excel de QlikSense)</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
        Sube el Excel mensual con las ventas reales por Distribuidor / Familia / Subfamilia. Estos datos se
        consideran la fuente de verdad frente a los cálculos de Sell-In/Sell-Out cuando haya diferencias.
        Nada se guarda hasta que confirmes en el último paso.
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
          {resultado.avisos.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/40 text-amber-800 dark:text-amber-300 rounded-xl p-4 mb-4 text-sm">
              <strong>Avisos:</strong>
              <ul className="list-disc pl-5 mt-1 space-y-0.5">{resultado.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>
            </div>
          )}

          {resultado.filas.length > 0 && (
            <>
              {/* MES/AÑO */}
              <div className={`${tarjeta} mb-4`}>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">1. ¿A qué mes corresponden estos datos?</h4>
                <SelectorMesAno value={mesAno} onChange={handleMesAnoChange} />
                {cargandoConflictos && <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Comprobando si ya hay datos guardados ese mes...</p>}
              </div>

              {/* DISTRIBUIDORES */}
              <div className={`${tarjeta} mb-4`}>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">2. Distribuidores ({distribuidoresExcel.length} en el Excel)</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                  Si un distribuidor del Excel se parece a uno ya existente (pero escrito distinto), te lo sugerimos aquí.
                  Los marcados como <strong>🔁 recordado</strong> ya se resolvieron en una importación anterior y no hace falta tocarlos.
                </p>
                <div className="rounded-lg border border-slate-200 dark:border-slate-700">
                  <TablaOrdenable
                    filas={distribuidoresExcel}
                    keyExtractor={nombreExcel => nombreExcel}
                    columnas={[
                      {
                        titulo: 'Distribuidor (Excel)', valor: nombreExcel => nombreExcel, render: nombreExcel => {
                          const esRecordado = nombresRecordados.has(`distribuidor::${nombreExcel}`);
                          return (
                            <>
                              {nombreExcel}
                              {esRecordado && (
                                <span className="ml-2 inline-block text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300" title="Se ha rellenado solo, recordado de una importación anterior">
                                  🔁 recordado
                                </span>
                              )}
                            </>
                          );
                        },
                      },
                      {
                        titulo: 'Filas', derecha: true,
                        valor: nombreExcel => resultado.filas.filter(f => f.distribuidor === nombreExcel).length,
                        render: nombreExcel => resultado.filas.filter(f => f.distribuidor === nombreExcel).length,
                      },
                      {
                        titulo: 'Decisión', render: nombreExcel => {
                          const decision = decisionDistribuidor[nombreExcel] || { accion: 'crear', idExistente: null };
                          const candidatas = encontrarDistribuidoresSimilares(nombreExcel, listaDistribuidores, 0.5);
                          return (
                            <select
                              value={decision.accion === 'usar_existente' ? `usar:${decision.idExistente}` : decision.accion}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === 'crear' || val === 'omitir') {
                                  setDecisionDistribuidor(prev => ({ ...prev, [nombreExcel]: { accion: val, idExistente: null } }));
                                } else if (val.startsWith('usar:')) {
                                  setDecisionDistribuidor(prev => ({ ...prev, [nombreExcel]: { accion: 'usar_existente', idExistente: val.slice(5) } }));
                                }
                              }}
                              className={`${inputClasses} max-w-xs`}
                            >
                              <option value="crear">Crear como distribuidor nuevo</option>
                              {candidatas.map(c => (
                                <option key={c.distribuidor.id} value={`usar:${c.distribuidor.id}`}>
                                  Es el mismo que "{c.distribuidor.nombre_distribuidor}" ({Math.round(c.score * 100)}% parecido)
                                </option>
                              ))}
                              {(listaDistribuidores || [])
                                .filter(d => !candidatas.some(c => c.distribuidor.id === d.id))
                                .map(d => (
                                  <option key={d.id} value={`usar:${d.id}`}>Usar: {d.nombre_distribuidor}</option>
                                ))}
                              <option value="omitir">Omitir este distribuidor (no importar)</option>
                            </select>
                          );
                        },
                      },
                    ]}
                  />
                </div>
              </div>

              {/* SUBFAMILIAS (=MARCAS) */}
              <div className={`${tarjeta} mb-4`}>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">3. Subfamilias = Marcas ({subfamiliasExcel.length} en el Excel)</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                  Cada "Subfamilia" del Excel se trata como una Marca de la app. La "Familia" detectada se guarda junto a cada movimiento.
                  Los marcados como <strong>🔁 recordado</strong> ya se resolvieron en una importación anterior y no hace falta tocarlos.
                </p>
                <div className="rounded-lg border border-slate-200 dark:border-slate-700">
                  <TablaOrdenable
                    filas={subfamiliasExcel}
                    keyExtractor={subfamilia => subfamilia}
                    columnas={[
                      {
                        titulo: 'Subfamilia (Excel)', valor: subfamilia => subfamilia, render: subfamilia => {
                          const esRecordada = nombresRecordados.has(`marca::${subfamilia}`);
                          return (
                            <>
                              {subfamilia}
                              {esRecordada && (
                                <span className="ml-2 inline-block text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300" title="Se ha rellenado sola, recordada de una importación anterior">
                                  🔁 recordado
                                </span>
                              )}
                            </>
                          );
                        },
                      },
                      {
                        titulo: 'Familia',
                        valor: subfamilia => (decisionMarca[subfamilia] || {}).familia || '',
                        render: subfamilia => {
                          const decision = decisionMarca[subfamilia] || { accion: 'crear', idExistente: null, familia: '' };
                          return decision.familia || <span className="text-slate-400">—</span>;
                        },
                      },
                      {
                        titulo: 'Filas', derecha: true,
                        valor: subfamilia => resultado.filas.filter(f => f.subfamilia === subfamilia).length,
                        render: subfamilia => resultado.filas.filter(f => f.subfamilia === subfamilia).length,
                      },
                      {
                        titulo: 'Decisión', render: subfamilia => {
                          const decision = decisionMarca[subfamilia] || { accion: 'crear', idExistente: null, familia: '' };
                          const candidatas = encontrarSimilares(subfamilia, marcasGlobales || [], 0.5);
                          return (
                            <select
                              value={decision.accion === 'usar_existente' ? `usar:${decision.idExistente}` : decision.accion}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === 'crear' || val === 'omitir') {
                                  setDecisionMarca(prev => ({ ...prev, [subfamilia]: { ...prev[subfamilia], accion: val, idExistente: null } }));
                                } else if (val.startsWith('usar:')) {
                                  setDecisionMarca(prev => ({ ...prev, [subfamilia]: { ...prev[subfamilia], accion: 'usar_existente', idExistente: val.slice(5) } }));
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
                              {(marcasGlobales || [])
                                .filter(m => !candidatas.some(c => c.marca.id === m.id))
                                .map(m => (
                                  <option key={m.id} value={`usar:${m.id}`}>Usar: {m.nombre_marca}</option>
                                ))}
                              <option value="omitir">Omitir esta subfamilia (no importar)</option>
                            </select>
                          );
                        },
                      },
                    ]}
                  />
                </div>
              </div>

              {/* CONFLICTOS DEL MES */}
              {distribuidoresConConflicto.length > 0 && (
                <div className={`${tarjeta} mb-4`}>
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">4. Ya hay datos guardados para {mesAno}</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                    Estos distribuidores ya tienen ventas reales guardadas para el mes elegido. Decide si sobrescribir (borra lo anterior y guarda lo nuevo) u omitir (mantiene lo ya guardado).
                  </p>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700">
                    <TablaOrdenable
                      filas={distribuidoresConConflicto}
                      keyExtractor={nombreExcel => nombreExcel}
                      columnas={[
                        { titulo: 'Distribuidor', valor: nombreExcel => nombreExcel, render: nombreExcel => nombreExcel },
                        {
                          titulo: 'Decisión', render: nombreExcel => (
                            <select
                              value={decisionConflicto[nombreExcel] || 'omitir'}
                              onChange={(e) => setDecisionConflicto(prev => ({ ...prev, [nombreExcel]: e.target.value }))}
                              className={inputClasses}
                            >
                              <option value="omitir">Ya existe — Omitir (no tocar)</option>
                              <option value="sobrescribir">Ya existe — Sobrescribir</option>
                            </select>
                          ),
                        },
                      ]}
                    />
                  </div>
                </div>
              )}

              {/* CONFIRMAR */}
              <div className={tarjeta}>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">5. Confirmar</h4>
                <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
                  Se importarán <strong>{totalFilasAImportar}</strong> fila(s)
                  {totalDistribuidoresNuevos > 0 && <> · {totalDistribuidoresNuevos} distribuidor(es) nuevo(s)</>}
                  {totalMarcasNuevas > 0 && <> · {totalMarcasNuevas} marca(s) nueva(s)</>}.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleConfirmarImportacion}
                    disabled={importando || !mesAno}
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
        </>
      )}

      {resumenFinal && (
        <div className="border border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl p-5">
          <h4 className="text-emerald-700 dark:text-emerald-300 font-semibold mb-2">✅ Importación completada</h4>
          <ul className="list-disc pl-5 text-sm text-slate-700 dark:text-slate-200 space-y-0.5 mb-4">
            <li>Mes: {resumenFinal.mesAno}</li>
            <li>{resumenFinal.filasImportadas} fila(s) de ventas reales guardadas</li>
            {resumenFinal.distribuidoresNuevos > 0 && <li>{resumenFinal.distribuidoresNuevos} distribuidor(es) nuevo(s) creado(s)</li>}
            {resumenFinal.marcasNuevas > 0 && <li>{resumenFinal.marcasNuevas} marca(s) nueva(s) creada(s)</li>}
            {resumenFinal.borrados > 0 && <li>Se sobrescribieron {resumenFinal.borrados} registro(s) antiguo(s) de ese mes</li>}
          </ul>
          <button onClick={handleReiniciar} className={botonPrimario}>
            Importar otro archivo
          </button>
        </div>
      )}
    </div>
  );
}

export default ImportarVentasReales;
