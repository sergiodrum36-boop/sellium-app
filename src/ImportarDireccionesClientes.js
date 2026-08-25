/*
 * ImportarDireccionesClientes.js
 * Importador de direcciones de clientes finales — primer paso de
 * "Geolocalización" (26/07/2026, a petición de Sergio: "visión de mancha de
 * aceite con clientes por zonas"). Los clientes finales ya existen en
 * `clientesSellOut` (importados desde Sell-Out por Cliente Final) pero no
 * tienen dirección ni coordenadas — este importador NO da de alta clientes
 * nuevos, solo añade dirección/zona a los que ya están, casando por su
 * código de cliente propio del distribuidor (cod_cliente_origen).
 *
 * Pasos: elegir distribuidor -> subir Excel (código cliente + Dirección y/o
 * Población + zona opcional, ver parserDireccionesClientes.js) -> revisar
 * qué filas casan con un cliente ya existente y qué zona se reconoce ->
 * geocodificar cada dirección con Nominatim (gratuito, sin API key, EN SERIE
 * por su límite de 1 petición/segundo — ver geocodificacion.js, por eso se
 * muestra una barra de progreso) -> guardar dirección + coordenadas + zona en
 * cada cliente (edición IN-PLACE, ver actualizarClienteSellOut en
 * firebaseApi/sellOutClientes.js — nunca borrar+crear aquí, porque
 * movimientosSellOutClientes referencia al cliente por id).
 *
 * AMPLIACIÓN (26/07/2026, a petición de Sergio: "solo tengo el dato del
 * nombre y la población pero no la dirección"): no hace falta tener la calle
 * de cada cliente — basta con la Población (+ Provincia opcional, para
 * desambiguar). Esas filas se marcan como `esSoloPoblacion` y se avisa en la
 * tabla previa de que el punto quedará en el centro de la localidad, no en
 * el portal exacto — de sobra para la vista de "mancha de aceite" por zonas.
 *
 * Ninguna fila se descarta en silencio: las que no casan con ningún cliente,
 * las que traen una zona que no existe en Estructura Comercial, y las
 * direcciones que Nominatim no consigue localizar se listan aparte en el
 * resumen final — mismo principio de transparencia que el resto de la app.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { UploadCloud, MapPin, AlertTriangle } from 'lucide-react';
import { getClientesSellOutPorDistribuidor, getZonasPorUsuario, actualizarClienteSellOut } from './firebaseApi';
import { parseDireccionesClientes } from './parserDireccionesClientes';
import { geocodificarEnLote } from './geocodificacion';
import { tarjeta, inputClasses, etiqueta, botonPrimario, botonSecundario } from './uiClasses';
import TablaOrdenable from './TablaOrdenable';

const norm = (s) => String(s || '').trim().toUpperCase();

function ImportarDireccionesClientes({ idUsuario, listaDistribuidores = [] }) {
  const [idDistribuidor, setIdDistribuidor] = useState('');
  const [clientesExistentes, setClientesExistentes] = useState([]);
  const [zonas, setZonas] = useState([]);
  const [cargandoDistribuidor, setCargandoDistribuidor] = useState(false);

  const [nombreArchivo, setNombreArchivo] = useState('');
  const [parseando, setParseando] = useState(false);
  const [resultado, setResultado] = useState(null); // { filas, avisos }

  const [importando, setImportando] = useState(false);
  const [progreso, setProgreso] = useState(null); // { actual, total }
  const [resumenFinal, setResumenFinal] = useState(null);

  useEffect(() => {
    if (!idDistribuidor) { setClientesExistentes([]); setZonas([]); return; }
    setCargandoDistribuidor(true);
    setResultado(null);
    setResumenFinal(null);
    Promise.all([
      getClientesSellOutPorDistribuidor(idUsuario, idDistribuidor),
      getZonasPorUsuario(idUsuario),
    ]).then(([clientes, listaZonas]) => {
      setClientesExistentes(clientes);
      setZonas(listaZonas);
    }).catch((error) => {
      console.error('Error cargando clientes/zonas:', error);
      alert('Error al cargar los datos del distribuidor: ' + error.message);
    }).finally(() => setCargandoDistribuidor(false));
  }, [idUsuario, idDistribuidor]);

  const mapaClientesPorCodigo = useMemo(
    () => new Map(clientesExistentes.filter((c) => c.cod_cliente_origen).map((c) => [c.cod_cliente_origen, c])),
    [clientesExistentes]
  );
  const mapaZonasPorNombre = useMemo(
    () => new Map(zonas.map((z) => [norm(z.nombre_zona), z])),
    [zonas]
  );

  // Cada fila del Excel, enriquecida con si casa con un cliente existente y
  // si su zona (si trae una) se reconoce — para mostrarlo ANTES de importar,
  // nunca sorprender con el resumen al final.
  const filasRevisadas = useMemo(() => {
    if (!resultado) return [];
    return resultado.filas.map((fila) => {
      const cliente = mapaClientesPorCodigo.get(fila.cod_cliente) || null;
      const zona = fila.zona ? mapaZonasPorNombre.get(norm(fila.zona)) || null : null;
      return { ...fila, cliente, zonaReconocida: zona };
    });
  }, [resultado, mapaClientesPorCodigo, mapaZonasPorNombre]);

  const filasImportables = useMemo(() => filasRevisadas.filter((f) => f.cliente), [filasRevisadas]);
  const filasSinCliente = useMemo(() => filasRevisadas.filter((f) => !f.cliente), [filasRevisadas]);
  const filasConZonaSinReconocer = useMemo(() => filasRevisadas.filter((f) => f.zona && !f.zonaReconocida), [filasRevisadas]);
  // Filas sin calle (solo Población/Provincia) que sí se van a importar —
  // se avisa aparte porque el punto en el mapa será menos preciso (centro de
  // la localidad, no el portal exacto), ver cabecera del archivo.
  const filasSoloPoblacion = useMemo(() => filasImportables.filter((f) => f.esSoloPoblacion), [filasImportables]);

  const handleArchivoSeleccionado = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setNombreArchivo(file.name);
    setResultado(null);
    setResumenFinal(null);
    setParseando(true);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseDireccionesClientes(buffer);
      setResultado(parsed);
    } catch (error) {
      console.error('Error leyendo el Excel de direcciones:', error);
      alert('Error al leer el archivo: ' + error.message);
    }
    setParseando(false);
  };

  const handleImportar = async () => {
    if (filasImportables.length === 0) return;
    if (!window.confirm(`¿Geolocalizar ${filasImportables.length} cliente(s)? Nominatim solo admite 1 dirección por segundo, así que esto puede tardar varios minutos — no cierres esta pantalla mientras tanto.`)) return;
    setImportando(true);
    setProgreso({ actual: 0, total: filasImportables.length });
    try {
      const entradas = filasImportables.map((f) => ({ ...f }));
      const geocodificadas = await geocodificarEnLote(entradas, (actual, total) => setProgreso({ actual, total }));

      let actualizados = 0;
      let sinGeocodificar = 0;
      for (const fila of geocodificadas) {
        const cambios = { direccion: fila.direccion };
        if (fila.coords) { cambios.latitud = fila.coords.lat; cambios.longitud = fila.coords.lon; } else { sinGeocodificar += 1; }
        if (fila.zonaReconocida) cambios.id_zona = fila.zonaReconocida.id;
        await actualizarClienteSellOut(idUsuario, idDistribuidor, fila.cliente.id, cambios);
        actualizados += 1;
      }

      setResumenFinal({
        actualizados,
        sinGeocodificar,
        sinCliente: filasSinCliente.length,
        conZonaSinReconocer: filasConZonaSinReconocer.length,
      });
      setResultado(null);
      setNombreArchivo('');
      // Recarga los clientes del distribuidor para reflejar los cambios si
      // se vuelve a importar otro archivo en la misma sesión.
      const clientesActualizados = await getClientesSellOutPorDistribuidor(idUsuario, idDistribuidor);
      setClientesExistentes(clientesActualizados);
    } catch (error) {
      console.error('Error importando direcciones:', error);
      alert('Error al importar: ' + error.message);
    }
    setImportando(false);
    setProgreso(null);
  };

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="min-w-[240px]">
          <label className={`${etiqueta} block mb-1`}>Distribuidor</label>
          <select value={idDistribuidor} onChange={(e) => setIdDistribuidor(e.target.value)} className={`${inputClasses} w-full`}>
            <option value="">Selecciona un distribuidor...</option>
            {listaDistribuidores.map((d) => (
              <option key={d.id} value={d.id}>{d.nombre_distribuidor}</option>
            ))}
          </select>
        </div>
        {idDistribuidor && !cargandoDistribuidor && (
          <label className={`${botonSecundario} cursor-pointer inline-flex items-center gap-1.5`}>
            <UploadCloud size={14} />
            {nombreArchivo || 'Subir Excel de direcciones'}
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleArchivoSeleccionado} disabled={parseando} />
          </label>
        )}
      </div>

      {!idDistribuidor && (
        <p className="text-sm text-slate-500 dark:text-slate-400">Elige primero un distribuidor para saber a qué clientes casar las direcciones.</p>
      )}

      {cargandoDistribuidor && <div className="text-slate-500 dark:text-slate-400 text-sm">Cargando clientes...</div>}

      {parseando && <div className="text-slate-500 dark:text-slate-400 text-sm">Leyendo archivo...</div>}

      {resultado && resultado.avisos.length > 0 && (
        <div className={`${tarjeta} mb-4 border-amber-200 dark:border-amber-500/30`}>
          <h4 className="text-sm font-medium text-slate-900 dark:text-white mb-2 inline-flex items-center gap-1.5"><AlertTriangle size={15} className="text-amber-500" />Avisos del archivo</h4>
          <ul className="text-xs text-slate-600 dark:text-slate-300 list-disc pl-5 space-y-0.5">
            {resultado.avisos.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </div>
      )}

      {resultado && resultado.filas.length > 0 && (
        <>
          <div className={`${tarjeta} mb-4`}>
            <p className="text-sm text-slate-700 dark:text-slate-300 mb-1">
              {filasImportables.length} de {resultado.filas.length} fila(s) casan con un cliente ya existente y se pueden geolocalizar.
            </p>
            {filasSinCliente.length > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {filasSinCliente.length} código(s) no encontrado(s) en este distribuidor: {filasSinCliente.slice(0, 8).map((f) => f.cod_cliente).join(', ')}{filasSinCliente.length > 8 ? '...' : ''}
              </p>
            )}
            {filasConZonaSinReconocer.length > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {filasConZonaSinReconocer.length} fila(s) traen una zona que no existe en Estructura Comercial (se geolocalizan igual, solo sin zona asignada): {[...new Set(filasConZonaSinReconocer.map((f) => f.zona))].join(', ')}
              </p>
            )}
            {filasSoloPoblacion.length > 0 && (
              <p className="text-xs text-sky-600 dark:text-sky-400">
                {filasSoloPoblacion.length} fila(s) sin calle, se geolocalizan solo por población: el punto en el mapa quedará en el centro de la localidad, no en el domicilio exacto (suficiente para la vista por zonas).
              </p>
            )}
          </div>

          <div className="mb-4">
            <TablaOrdenable
              filas={filasRevisadas.slice(0, 50)}
              keyExtractor={(f, i) => i}
              columnas={[
                { titulo: 'Código', valor: f => f.cod_cliente || '', render: f => f.cod_cliente },
                {
                  titulo: 'Cliente', valor: f => f.cliente ? f.cliente.nombre_cliente : '', render: f => (
                    f.cliente ? f.cliente.nombre_cliente : <span className="text-amber-600 dark:text-amber-400">no encontrado</span>
                  ),
                },
                {
                  titulo: 'Dirección', valor: f => f.direccion || '', render: f => (
                    <>
                      {f.direccion}
                      {f.esSoloPoblacion && <span className="text-sky-500 dark:text-sky-400" title="Sin calle: se geolocaliza por población"> (solo población)</span>}
                    </>
                  ),
                },
                {
                  titulo: 'Zona', valor: f => f.zona || '', render: f => (
                    f.zona ? (f.zonaReconocida ? f.zonaReconocida.nombre_zona : <span className="text-amber-600 dark:text-amber-400">"{f.zona}" no existe</span>) : '—'
                  ),
                },
                { titulo: 'Estado', valor: f => f.cliente ? 'Se geolocalizará' : 'Se ignora', render: f => f.cliente ? 'Se geolocalizará' : 'Se ignora' },
              ]}
            />
            {filasRevisadas.length > 50 && (
              <p className="text-xs text-slate-400 mt-1">Mostrando las primeras 50 de {filasRevisadas.length} filas.</p>
            )}
          </div>

          <button type="button" className={botonPrimario} disabled={importando || filasImportables.length === 0} onClick={handleImportar}>
            <span className="inline-flex items-center gap-1.5">
              <MapPin size={14} />
              {importando
                ? `Geolocalizando... ${progreso ? `${progreso.actual}/${progreso.total}` : ''}`
                : `Geolocalizar ${filasImportables.length} cliente(s)`}
            </span>
          </button>
        </>
      )}

      {resumenFinal && (
        <div className={`${tarjeta} mt-4 border-emerald-200 dark:border-emerald-500/30`}>
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {resumenFinal.actualizados} cliente(s) actualizado(s)
            {resumenFinal.sinGeocodificar > 0 && ` (${resumenFinal.sinGeocodificar} sin coordenadas — Nominatim no reconoció esa dirección; la dirección en texto se guardó igual, puedes corregirla y reimportar)`}.
            {resumenFinal.sinCliente > 0 && ` ${resumenFinal.sinCliente} código(s) no encontrado(s), ignorado(s).`}
            {resumenFinal.conZonaSinReconocer > 0 && ` ${resumenFinal.conZonaSinReconocer} fila(s) con zona no reconocida.`}
          </p>
        </div>
      )}
    </div>
  );
}

export default ImportarDireccionesClientes;
