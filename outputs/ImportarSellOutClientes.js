/*
 * ImportarSellOutClientes.js
 * Importador del detalle de Sell-Out por Cliente Final (ver
 * parserSellOutClientes.js, parserSellOutClientesTxt.js y firebaseApi.js
 * sección 21). Acepta Excel (.xlsx/.xls) y texto de ancho fijo (.txt) — el
 * formato se detecta por la extensión del archivo.
 *
 * Cada IMPORTACIÓN es SIEMPRE de UN distribuidor concreto — el usuario lo
 * elige a mano (nuevo o existente), igual que en ImportarExcel.js. Algunos
 * Excel, sin embargo, traen mezclados los datos de VARIOS distribuidores en
 * el mismo archivo (columna EMPRESA/DISTRIBUIDOR con más de un valor
 * distinto) — en ese caso se pide primero elegir CUÁL de esos distribuidores
 * se importa en esta pasada (paso 0); el resto de filas del archivo se
 * ignoran para esta importación y habrá que repetir el proceso con el mismo
 * archivo para cada distribuidor restante.
 *
 * Pasos: subir archivo -> (si trae varios distribuidores mezclados, elegir
 * cuál se importa ahora) -> elegir distribuidor destino en Sellium ->
 * reconciliar Clientes (por código de cliente propio del distribuidor si el
 * archivo lo trae, o por nombre con matching difuso si no) -> reconciliar
 * Productos (=Marcas, mismo patrón que ImportarVentasReales.js) -> si el
 * archivo no traía Fecha, pedir mes/año a mano -> resolver conflictos con
 * meses ya importados -> confirmar. Nada se guarda hasta el último paso.
 */

import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { parseSellOutClientes } from './parserSellOutClientes';
import { parseSellOutClientesTxt } from './parserSellOutClientesTxt';
import { encontrarSimilares } from './matching';
import {
  saveNuevoDistribuidor,
  saveNuevaMarca,
  saveNuevoClienteSellOut,
  getClientesSellOutPorDistribuidor,
  getMovimientosSellOutClientesPorDistribuidor,
  saveMovimientosSellOutClientes,
  deleteMovimientosPorMeses
} from './firebaseApi';
import { inputClasses, botonExito, botonSecundario, botonPrimario, tarjeta, thClasses, tdClasses } from './uiClasses';
import SelectorMesAno from './SelectorMesAno';

const norm = (s) => String(s || '').trim().toUpperCase();

// encontrarSimilares() (de matching.js) espera objetos con campo "nombre_marca".
// Los clientes usan "nombre_cliente", así que los adaptamos antes de comparar.
const encontrarClientesSimilares = (nombre, clientes, umbralMinimo = 0.5) => {
  const adaptados = (clientes || []).map(c => ({ id: c.id, nombre_marca: c.nombre_cliente }));
  return encontrarSimilares(nombre, adaptados, umbralMinimo).map(r => ({
    cliente: { id: r.marca.id, nombre_cliente: r.marca.nombre_marca },
    score: r.score
  }));
};

// Clave única de un cliente TAL COMO viene en el archivo: si trae código de
// cliente propio del distribuidor, se usa ese (más fiable); si no, el nombre
// normalizado.
const claveClienteExcel = (fila) => (fila.cod_cliente ? `COD:${fila.cod_cliente}` : `NOM:${norm(fila.cliente)}`);

function ImportarSellOutClientes({ idUsuario, listaDistribuidores, marcasGlobales, onImportComplete }) {

  const [nombreArchivo, setNombreArchivo] = useState('');
  const [parseando, setParseando] = useState(false);
  const [error, setError] = useState(null);
  const [resultado, setResultado] = useState(null); // { filas, avisos, hojaLeida }

  // --- Paso 0: si el archivo trae varios distribuidores mezclados (columna
  // EMPRESA/DISTRIBUIDOR con más de un valor), cuál de ellos se importa ahora ---
  const [distribuidorFiltroArchivo, setDistribuidorFiltroArchivo] = useState('');

  // --- Paso 1: distribuidor destino (SIEMPRE uno solo, como ImportarExcel.js) ---
  const [modoDistribuidor, setModoDistribuidor] = useState('nuevo'); // 'nuevo' | 'existente'
  const [idDistribuidorExistente, setIdDistribuidorExistente] = useState('');
  const [nombreDistribuidorNuevo, setNombreDistribuidorNuevo] = useState('');
  const [cargandoDatosDistribuidor, setCargandoDatosDistribuidor] = useState(false);
  const [clientesExistentes, setClientesExistentes] = useState([]);
  const [mesesExistentes, setMesesExistentes] = useState(new Set());

  // --- Paso 2: reconciliación de clientes ---
  // decisionCliente[claveExcel] = { accion: 'crear'|'usar_existente'|'omitir', idExistente }
  const [decisionCliente, setDecisionCliente] = useState({});

  // --- Paso 3: reconciliación de productos (=Marcas) ---
  const [decisionMarca, setDecisionMarca] = useState({});

  // --- Paso 4: mes/año a mano (solo si el archivo no traía Fecha) ---
  const [mesAnoManual, setMesAnoManual] = useState('');

  // --- Paso 5: conflictos con meses ya importados para este distribuidor ---
  const [decisionConflicto, setDecisionConflicto] = useState({});

  const [importando, setImportando] = useState(false);
  const [resumenFinal, setResumenFinal] = useState(null);

  const mapaMarcasExistentes = new Map((marcasGlobales || []).map(m => [norm(m.nombre_marca), m]));

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
    setDistribuidorFiltroArchivo('');
    setParseando(true);
    try {
      const esTxt = /\.txt$/i.test(file.name);
      let parsed;
      if (esTxt) {
        const texto = await file.text();
        parsed = parseSellOutClientesTxt(texto);
      } else {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
        parsed = parseSellOutClientes(workbook);
      }
      setResultado(parsed);
      setDecisionCliente({});
      setDecisionMarca({});
      setDecisionConflicto({});
      setMesAnoManual('');

      // Si el archivo trae un solo distribuidor (o ninguno indicado), lo
      // preseleccionamos directamente para no obligar a elegir en el paso 0.
      const distintos = [...new Set(parsed.filas.map(f => (f.distribuidor || '').trim()).filter(Boolean))];
      if (distintos.length === 1) setDistribuidorFiltroArchivo(distintos[0]);

      if (parsed.filas.length > 0) {
        // Preselección de marcas (misma lógica que ImportarVentasReales.js)
        const productosExcel = [...new Set(parsed.filas.map(f => f.producto))];
        const nuevaDecisionMarca = {};
        productosExcel.forEach(producto => {
          const exacta = mapaMarcasExistentes.get(norm(producto));
          if (exacta) {
            nuevaDecisionMarca[producto] = { accion: 'usar_existente', idExistente: exacta.id };
            return;
          }
          const candidatas = encontrarSimilares(producto, marcasGlobales || [], 0.5);
          if (candidatas.length > 0 && candidatas[0].score >= 0.85) {
            nuevaDecisionMarca[producto] = { accion: 'usar_existente', idExistente: candidatas[0].marca.id };
          } else {
            nuevaDecisionMarca[producto] = { accion: 'crear', idExistente: null };
          }
        });
        setDecisionMarca(nuevaDecisionMarca);
      }
    } catch (err) {
      console.error(err);
      setError('No se pudo leer el archivo: ' + err.message);
    }
    setParseando(false);
  };

  // --------------------------------------------------------------
  // 2. AL ELEGIR DISTRIBUIDOR, CARGAR SUS CLIENTES Y MESES YA IMPORTADOS
  // --------------------------------------------------------------
  const cargarDatosDistribuidor = async (idDistribuidor) => {
    setClientesExistentes([]);
    setMesesExistentes(new Set());
    setDecisionCliente({});
    setDecisionConflicto({});
    if (!idDistribuidor) return;
    setCargandoDatosDistribuidor(true);
    try {
      const [clientes, movimientos] = await Promise.all([
        getClientesSellOutPorDistribuidor(idUsuario, idDistribuidor),
        getMovimientosSellOutClientesPorDistribuidor(idUsuario, idDistribuidor)
      ]);
      setClientesExistentes(clientes);
      setMesesExistentes(new Set(movimientos.map(m => m.mes_ano).filter(Boolean)));
      preseleccionarClientes(clientes);
    } catch (err) {
      console.error(err);
      alert('No se pudo comprobar los clientes/datos ya guardados de este distribuidor: ' + err.message);
    }
    setCargandoDatosDistribuidor(false);
  };

  const preseleccionarClientes = (clientes) => {
    if (!resultado) return;
    const mapaPorCod = new Map((clientes || []).filter(c => c.cod_cliente_origen).map(c => [c.cod_cliente_origen, c]));
    const mapaPorNombre = new Map((clientes || []).map(c => [norm(c.nombre_cliente), c]));

    // Usa solo las filas del distribuidor elegido en el paso 0 (si el archivo
    // mezclaba varios) — si no, todas las filas del archivo.
    const distintos = [...new Set(resultado.filas.map(f => (f.distribuidor || '').trim()).filter(Boolean))];
    const filasBase = distintos.length > 1
      ? resultado.filas.filter(f => (f.distribuidor || '').trim() === distribuidorFiltroArchivo)
      : resultado.filas;

    const clientesExcel = new Map(); // clave -> fila representativa
    filasBase.forEach(f => {
      const clave = claveClienteExcel(f);
      if (!clientesExcel.has(clave)) clientesExcel.set(clave, f);
    });

    const nuevaDecision = {};
    clientesExcel.forEach((fila, clave) => {
      // 1º: coincidencia exacta por código de cliente
      if (fila.cod_cliente && mapaPorCod.has(fila.cod_cliente)) {
        const c = mapaPorCod.get(fila.cod_cliente);
        nuevaDecision[clave] = { accion: 'usar_existente', idExistente: c.id };
        return;
      }
      // 2º: coincidencia exacta por nombre
      const exacto = mapaPorNombre.get(norm(fila.cliente));
      if (exacto) {
        nuevaDecision[clave] = { accion: 'usar_existente', idExistente: exacto.id };
        return;
      }
      // 3º: parecido por nombre (matching difuso)
      const candidatas = encontrarClientesSimilares(fila.cliente, clientes, 0.5);
      if (candidatas.length > 0 && candidatas[0].score >= 0.85) {
        nuevaDecision[clave] = { accion: 'usar_existente', idExistente: candidatas[0].cliente.id };
      } else {
        nuevaDecision[clave] = { accion: 'crear', idExistente: null };
      }
    });
    setDecisionCliente(nuevaDecision);
  };

  const handleModoDistribuidorChange = (modo, idExistente) => {
    setModoDistribuidor(modo);
    if (modo === 'existente' && idExistente) {
      setIdDistribuidorExistente(idExistente);
      cargarDatosDistribuidor(idExistente);
    } else {
      setIdDistribuidorExistente('');
      setClientesExistentes([]);
      setMesesExistentes(new Set());
      setDecisionCliente({});
    }
  };

  // --------------------------------------------------------------
  // Cálculos derivados
  // --------------------------------------------------------------
  // Distribuidores distintos que trae el archivo en su columna EMPRESA/
  // DISTRIBUIDOR (normalmente vacía — solo la rellena parserSellOutClientes.js
  // cuando detecta esa columna en un Excel que mezcla varios distribuidores).
  const distribuidoresEnArchivo = resultado
    ? [...new Set(resultado.filas.map(f => (f.distribuidor || '').trim()).filter(Boolean))].sort()
    : [];
  const esMultiDistribuidor = distribuidoresEnArchivo.length > 1;
  const filtroListo = !esMultiDistribuidor || !!distribuidorFiltroArchivo;

  // Filas de trabajo: si el archivo mezcla varios distribuidores, solo las
  // del que se ha elegido importar en esta pasada (paso 0); si no, todas.
  const filasFiltradas = resultado
    ? (esMultiDistribuidor
        ? resultado.filas.filter(f => (f.distribuidor || '').trim() === distribuidorFiltroArchivo)
        : resultado.filas)
    : [];

  const productosExcel = [...new Set(filasFiltradas.map(f => f.producto))];

  const clientesExcelMap = new Map();
  filasFiltradas.forEach(f => {
    const clave = claveClienteExcel(f);
    if (!clientesExcelMap.has(clave)) clientesExcelMap.set(clave, f);
  });
  const clientesExcelList = [...clientesExcelMap.entries()]; // [ [clave, filaRepresentativa], ... ]

  // El archivo trae Fecha propia si al menos una fila tiene mesAno resuelto.
  const archivoTraeFecha = filasFiltradas.some(f => f.mesAno);
  const necesitaMesManual = filtroListo && filasFiltradas.length > 0 && !archivoTraeFecha;

  const mesesEnArchivo = filtroListo
    ? (archivoTraeFecha
        ? [...new Set(filasFiltradas.map(f => f.mesAno).filter(Boolean))].sort()
        : (mesAnoManual ? [mesAnoManual] : []))
    : [];

  const mesesConConflicto = mesesEnArchivo.filter(m => mesesExistentes.has(m));

  const totalClientesNuevos = Object.values(decisionCliente).filter(d => d.accion === 'crear').length;
  const totalMarcasNuevas = Object.values(decisionMarca).filter(d => d.accion === 'crear').length;

  const filaValida = (f) => {
    const clave = claveClienteExcel(f);
    const dCliente = decisionCliente[clave];
    const dMarca = decisionMarca[f.producto];
    if (!dCliente || dCliente.accion === 'omitir') return false;
    if (!dMarca || dMarca.accion === 'omitir') return false;
    const mesFila = f.mesAno || mesAnoManual;
    if (!mesFila) return false;
    if (mesesConConflicto.includes(mesFila) && (decisionConflicto[mesFila] || 'omitir') === 'omitir') return false;
    return true;
  };

  const totalFilasAImportar = filasFiltradas.filter(filaValida).length;

  const distribuidorListo = modoDistribuidor === 'nuevo'
    ? nombreDistribuidorNuevo.trim().length > 0
    : !!idDistribuidorExistente;

  // --------------------------------------------------------------
  // 3. CONFIRMAR IMPORTACIÓN
  // --------------------------------------------------------------
  const handleConfirmarImportacion = async () => {
    if (!resultado || filasFiltradas.length === 0) { alert('No hay datos para importar.'); return; }
    if (esMultiDistribuidor && !distribuidorFiltroArchivo) { alert('Elige qué distribuidor del archivo quieres importar en esta pasada.'); return; }
    if (!distribuidorListo) { alert('Elige o escribe el distribuidor al que pertenece este archivo.'); return; }
    if (necesitaMesManual && !mesAnoManual) { alert('Este archivo no trae Fecha: indica a qué mes/año pertenecen estos datos.'); return; }
    if (totalFilasAImportar === 0) { alert('No hay ninguna fila que importar con las decisiones actuales.'); return; }

    if (!window.confirm(
      `Vas a importar ${totalFilasAImportar} fila(s) de Sell-Out por Cliente. ` +
      (modoDistribuidor === 'nuevo' ? `Se creará el distribuidor "${nombreDistribuidorNuevo.trim().toUpperCase()}". ` : '') +
      (totalClientesNuevos > 0 ? `Se crearán ${totalClientesNuevos} cliente(s) nuevo(s). ` : '') +
      (totalMarcasNuevas > 0 ? `Se crearán ${totalMarcasNuevas} marca(s) nueva(s). ` : '') +
      `¿Continuar?`
    )) return;

    setImportando(true);
    try {
      // --- a) Distribuidor ---
      let idDistribuidor = idDistribuidorExistente;
      if (modoDistribuidor === 'nuevo') {
        idDistribuidor = await saveNuevoDistribuidor({
          nombre_distribuidor: nombreDistribuidorNuevo.trim().toUpperCase(),
          id_usuario: idUsuario
        });
      }

      // --- b) Clientes nuevos ---
      const idPorClaveCliente = {};
      const nombrePorClaveCliente = {};
      for (const [clave, filaRep] of clientesExcelList) {
        const decision = decisionCliente[clave];
        if (!decision || decision.accion === 'omitir') continue;
        if (decision.accion === 'usar_existente') {
          idPorClaveCliente[clave] = decision.idExistente;
          const existente = clientesExistentes.find(c => c.id === decision.idExistente);
          nombrePorClaveCliente[clave] = existente ? existente.nombre_cliente : filaRep.cliente;
        } else {
          const nuevoId = await saveNuevoClienteSellOut({
            id_usuario: idUsuario,
            id_distribuidor: idDistribuidor,
            cod_cliente_origen: filaRep.cod_cliente || '',
            nombre_cliente: filaRep.cliente,
            nif_cif: filaRep.nif || ''
          });
          idPorClaveCliente[clave] = nuevoId;
          nombrePorClaveCliente[clave] = filaRep.cliente;
        }
      }

      // --- c) Marcas nuevas ---
      const idPorProducto = {};
      const nombrePorProducto = {};
      for (const producto of productosExcel) {
        const decision = decisionMarca[producto];
        if (!decision || decision.accion === 'omitir') continue;
        if (decision.accion === 'usar_existente') {
          idPorProducto[producto] = decision.idExistente;
          const existente = (marcasGlobales || []).find(m => m.id === decision.idExistente);
          nombrePorProducto[producto] = existente ? existente.nombre_marca : producto;
        } else {
          const nuevoId = await saveNuevaMarca({ nombre_marca: producto, Coste_Unidad: 0, AP_Generado_Por_Unidad: 0 });
          idPorProducto[producto] = nuevoId;
          nombrePorProducto[producto] = producto;
        }
      }

      // --- d) Sobrescribir: borrar meses marcados como "sobrescribir" ---
      const mesesASobrescribir = mesesEnArchivo.filter(m => (decisionConflicto[m] || 'omitir') === 'sobrescribir');
      let borrados = 0;
      if (mesesASobrescribir.length > 0) {
        borrados = await deleteMovimientosPorMeses('movimientosSellOutClientes', idUsuario, idDistribuidor, mesesASobrescribir);
      }

      // --- e) Filas finales ---
      const filasFinal = filasFiltradas.filter(filaValida).map(f => {
        const clave = claveClienteExcel(f);
        return {
          id_cliente: idPorClaveCliente[clave],
          nombre_cliente: nombrePorClaveCliente[clave] || f.cliente,
          id_marca: idPorProducto[f.producto],
          nombre_marca: nombrePorProducto[f.producto] || f.producto,
          fecha: f.fecha,
          mes_ano: f.mesAno || mesAnoManual,
          tipologia: f.tipologia,
          grupo: f.grupo,
          comercial: f.comercial,
          preventista: f.preventista,
          albaran: f.albaran,
          uds_ventas: f.ventas,
          uds_promo: f.promo,
          uds_regalos: f.regalos,
          uds_totales: f.totales,
          dtos1_euros: f.dtos1,
          dtos2_euros: f.dtos2,
          coste_unidad: f.coste,
          precio_unidad: f.precio
        };
      });

      if (filasFinal.length > 0) {
        await saveMovimientosSellOutClientes(idUsuario, idDistribuidor, filasFinal);
      }

      setResumenFinal({
        filasImportadas: filasFinal.length,
        clientesNuevos: totalClientesNuevos,
        marcasNuevas: totalMarcasNuevas,
        borrados
      });

      if (onImportComplete) onImportComplete();
    } catch (err) {
      console.error('Error al importar Sell-Out por Cliente:', err);
      alert('Error al importar: ' + err.message);
    }
    setImportando(false);
  };

  const handleReiniciar = () => {
    setNombreArchivo('');
    setResultado(null);
    setError(null);
    setResumenFinal(null);
    setDistribuidorFiltroArchivo('');
    setModoDistribuidor('nuevo');
    setIdDistribuidorExistente('');
    setNombreDistribuidorNuevo('');
    setClientesExistentes([]);
    setMesesExistentes(new Set());
    setDecisionCliente({});
    setDecisionMarca({});
    setDecisionConflicto({});
    setMesAnoManual('');
  };

  // ================================================================
  // RENDERIZADO
  // ================================================================
  return (
    <div>
      <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">Importar Sell-Out por Cliente Final</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
        Sube el archivo con el detalle de ventas a clientes finales que te manda un distribuidor (Excel o texto de
        ancho fijo). Cada distribuidor manda su propio formato — el importador intenta reconocer las columnas
        automáticamente. Nada se guarda hasta que confirmes en el último paso.
      </p>

      {!resumenFinal && (
        <div className={`${tarjeta} mb-4`}>
          <input type="file" accept=".xlsx,.xls,.txt" onChange={handleArchivoSeleccionado} disabled={parseando || importando} className="text-sm text-slate-700 dark:text-slate-300" />
          {parseando && <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Leyendo archivo...</p>}
          {error && <p className="text-sm text-red-600 dark:text-red-400 mt-2">{error}</p>}
          {resultado && resultado.hojaLeida && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Detectado: <strong>{resultado.hojaLeida}</strong> ({resultado.filas.length} fila(s) de detalle en total).</p>
          )}
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

          {resultado.filas.length > 0 && esMultiDistribuidor && (
            <div className={`${tarjeta} mb-4`}>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">0. Este archivo mezcla varios distribuidores</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                Elige cuál de ellos quieres importar en esta pasada. Las filas de los demás se ignoran ahora —
                repite la importación con el mismo archivo, eligiendo cada uno, para no dejarte ninguno fuera.
              </p>
              <div className="flex flex-col gap-2">
                {distribuidoresEnArchivo.map(nombre => {
                  const numFilas = resultado.filas.filter(f => (f.distribuidor || '').trim() === nombre).length;
                  return (
                    <label key={nombre} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                      <input
                        type="radio"
                        checked={distribuidorFiltroArchivo === nombre}
                        onChange={() => {
                          setDistribuidorFiltroArchivo(nombre);
                          setDecisionCliente({});
                          setModoDistribuidor('nuevo');
                          setIdDistribuidorExistente('');
                          setNombreDistribuidorNuevo(nombre);
                        }}
                      />
                      {nombre} <span className="text-xs text-slate-400">({numFilas} fila(s))</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {resultado.filas.length > 0 && filtroListo && (
            <>
              {/* 1. DISTRIBUIDOR */}
              <div className={`${tarjeta} mb-4`}>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">1. ¿A qué distribuidor pertenece este archivo?</h4>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <input type="radio" checked={modoDistribuidor === 'nuevo'} onChange={() => handleModoDistribuidorChange('nuevo')} />
                    Distribuidor nuevo:
                    <input
                      type="text"
                      value={nombreDistribuidorNuevo}
                      onChange={(e) => { setNombreDistribuidorNuevo(e.target.value); setModoDistribuidor('nuevo'); }}
                      placeholder="Nombre del distribuidor"
                      className={`${inputClasses} flex-1`}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <input type="radio" checked={modoDistribuidor === 'existente'} onChange={() => handleModoDistribuidorChange('existente', idDistribuidorExistente)} />
                    Distribuidor existente:
                    <select
                      value={idDistribuidorExistente}
                      onChange={(e) => handleModoDistribuidorChange('existente', e.target.value)}
                      className={`${inputClasses} flex-1`}
                    >
                      <option value="">-- Elegir --</option>
                      {(listaDistribuidores || []).map(d => (
                        <option key={d.id} value={d.id}>{d.nombre_distribuidor}</option>
                      ))}
                    </select>
                  </label>
                  {cargandoDatosDistribuidor && <p className="text-xs text-slate-500 dark:text-slate-400">Comprobando clientes y meses ya guardados...</p>}
                </div>
              </div>

              {/* 2. CLIENTES */}
              <div className={`${tarjeta} mb-4`}>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">2. Clientes finales ({clientesExcelList.length} en el archivo)</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                  {filasFiltradas.some(f => f.cod_cliente)
                    ? 'La reconciliación usa el código de cliente propio del distribuidor cuando está disponible (más fiable que el nombre).'
                    : 'Este archivo no trae código de cliente: la reconciliación se hace por nombre (parecido difuso).'}
                </p>
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 max-h-96 overflow-y-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead className="sticky top-0">
                      <tr>
                        <th className={thClasses}>Cliente (archivo)</th>
                        <th className={thClasses}>Cod./NIF</th>
                        <th className={thClasses}>Filas</th>
                        <th className={thClasses}>Decisión</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientesExcelList.map(([clave, filaRep]) => {
                        const decision = decisionCliente[clave] || { accion: 'crear', idExistente: null };
                        const numFilas = filasFiltradas.filter(f => claveClienteExcel(f) === clave).length;
                        const candidatas = encontrarClientesSimilares(filaRep.cliente, clientesExistentes, 0.5);
                        return (
                          <tr key={clave}>
                            <td className={tdClasses}>{filaRep.cliente}</td>
                            <td className={tdClasses}>{filaRep.cod_cliente || filaRep.nif || '—'}</td>
                            <td className={`${tdClasses} text-right tabular-nums`}>{numFilas}</td>
                            <td className={tdClasses}>
                              <select
                                value={decision.accion === 'usar_existente' ? `usar:${decision.idExistente}` : decision.accion}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === 'crear' || val === 'omitir') {
                                    setDecisionCliente(prev => ({ ...prev, [clave]: { accion: val, idExistente: null } }));
                                  } else if (val.startsWith('usar:')) {
                                    setDecisionCliente(prev => ({ ...prev, [clave]: { accion: 'usar_existente', idExistente: val.slice(5) } }));
                                  }
                                }}
                                className={`${inputClasses} max-w-xs`}
                              >
                                <option value="crear">Crear como cliente nuevo</option>
                                {candidatas.map(c => (
                                  <option key={c.cliente.id} value={`usar:${c.cliente.id}`}>
                                    Es el mismo que "{c.cliente.nombre_cliente}" ({Math.round(c.score * 100)}% parecido)
                                  </option>
                                ))}
                                {(clientesExistentes || [])
                                  .filter(c => !candidatas.some(cand => cand.cliente.id === c.id))
                                  .map(c => (
                                    <option key={c.id} value={`usar:${c.id}`}>Usar: {c.nombre_cliente}</option>
                                  ))}
                                <option value="omitir">Omitir este cliente (no importar)</option>
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 3. PRODUCTOS (=MARCAS) */}
              <div className={`${tarjeta} mb-4`}>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">3. Productos = Marcas ({productosExcel.length} en el archivo)</h4>
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 max-h-96 overflow-y-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead className="sticky top-0">
                      <tr>
                        <th className={thClasses}>Producto (archivo)</th>
                        <th className={thClasses}>Filas</th>
                        <th className={thClasses}>Decisión</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productosExcel.map(producto => {
                        const decision = decisionMarca[producto] || { accion: 'crear', idExistente: null };
                        const numFilas = filasFiltradas.filter(f => f.producto === producto).length;
                        const candidatas = encontrarSimilares(producto, marcasGlobales || [], 0.5);
                        return (
                          <tr key={producto}>
                            <td className={tdClasses}>{producto}</td>
                            <td className={`${tdClasses} text-right tabular-nums`}>{numFilas}</td>
                            <td className={tdClasses}>
                              <select
                                value={decision.accion === 'usar_existente' ? `usar:${decision.idExistente}` : decision.accion}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === 'crear' || val === 'omitir') {
                                    setDecisionMarca(prev => ({ ...prev, [producto]: { accion: val, idExistente: null } }));
                                  } else if (val.startsWith('usar:')) {
                                    setDecisionMarca(prev => ({ ...prev, [producto]: { accion: 'usar_existente', idExistente: val.slice(5) } }));
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
                                <option value="omitir">Omitir este producto (no importar)</option>
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 4. MES/AÑO MANUAL (solo si el archivo no traía Fecha) */}
              {necesitaMesManual && (
                <div className={`${tarjeta} mb-4`}>
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">4. ¿A qué mes pertenecen estos datos?</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Este archivo no trae columna de Fecha, así que hay que indicarlo a mano (se aplicará a todas las filas).</p>
                  <SelectorMesAno value={mesAnoManual} onChange={setMesAnoManual} />
                </div>
              )}

              {/* 5. CONFLICTOS DE MESES YA IMPORTADOS */}
              {mesesConConflicto.length > 0 && (
                <div className={`${tarjeta} mb-4`}>
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">5. Ya hay datos guardados para este distribuidor en algunos de estos meses</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Decide si sobrescribir (borra lo anterior de ese mes y guarda lo nuevo) u omitir (mantiene lo ya guardado).</p>
                  <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr>
                          <th className={thClasses}>Mes</th>
                          <th className={thClasses}>Decisión</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mesesConConflicto.map(mes => (
                          <tr key={mes}>
                            <td className={tdClasses}>{mes}</td>
                            <td className={tdClasses}>
                              <select
                                value={decisionConflicto[mes] || 'omitir'}
                                onChange={(e) => setDecisionConflicto(prev => ({ ...prev, [mes]: e.target.value }))}
                                className={inputClasses}
                              >
                                <option value="omitir">Ya existe — Omitir (no tocar)</option>
                                <option value="sobrescribir">Ya existe — Sobrescribir</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* CONFIRMAR */}
              <div className={tarjeta}>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Confirmar</h4>
                <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
                  Se importarán <strong>{totalFilasAImportar}</strong> fila(s)
                  {totalClientesNuevos > 0 && <> · {totalClientesNuevos} cliente(s) nuevo(s)</>}
                  {totalMarcasNuevas > 0 && <> · {totalMarcasNuevas} marca(s) nueva(s)</>}.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleConfirmarImportacion}
                    disabled={importando || !distribuidorListo}
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
            <li>{resumenFinal.filasImportadas} fila(s) de Sell-Out por Cliente guardadas</li>
            {resumenFinal.clientesNuevos > 0 && <li>{resumenFinal.clientesNuevos} cliente(s) nuevo(s) creado(s)</li>}
            {resumenFinal.marcasNuevas > 0 && <li>{resumenFinal.marcasNuevas} marca(s) nueva(s) creada(s)</li>}
            {resumenFinal.borrados > 0 && <li>Se sobrescribieron {resumenFinal.borrados} registro(s) antiguo(s)</li>}
          </ul>
          <button onClick={handleReiniciar} className={botonPrimario}>
            Importar otro archivo
          </button>
        </div>
      )}
    </div>
  );
}

export default ImportarSellOutClientes;
