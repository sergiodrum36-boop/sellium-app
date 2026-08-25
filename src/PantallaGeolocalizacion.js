/*
 * PantallaGeolocalizacion.js
 * "Geolocalización" — quinta pieza del bloque CRM y Comercial (26/07/2026, a
 * petición de Sergio: "la idea de este proyecto es tener visualización de
 * mancha de aceite con clientes por zonas"). Mapa de los CLIENTES FINALES
 * (los que compran a los distribuidores, colección `clientesSellOut`) que ya
 * tienen dirección geolocalizada — ver ImportarDireccionesClientes.js para
 * cómo se cargan esas coordenadas (Nominatim/OpenStreetMap, sin API key).
 *
 * Confirmado con Sergio (AskUserQuestion, mismo día):
 *  - Mapa gratuito (OpenStreetMap vía Leaflet), no Google Maps — evita
 *    depender de una API key/cuenta de facturación que todavía no está
 *    confirmada. Si más adelante consigue la key, se puede cambiar el
 *    proveedor del mapa sin tocar el resto de esta pantalla (los datos que
 *    se pintan —lat/lon por cliente— son independientes del proveedor).
 *  - Cada cliente se asigna a una zona A MANO (las mismas "zonas" de
 *    Estructura Comercial) — ver ImportarDireccionesClientes.js — en vez de
 *    que el mapa las agrupe solo por cercanía.
 *  - Alcance inicial: mapa de clientes coloreado por zona, con una capa de
 *    calor ("mancha de aceite") activable para ver la concentración/
 *    cobertura, filtrable por distribuidor y zona.
 *
 * Los clientes sin dirección geolocalizada NUNCA se ocultan en silencio: se
 * cuentan aparte para que Sergio sepa cuántos le faltan por importar (mismo
 * principio de transparencia que el resto de la app).
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from './leafletHeatSetup';
import { MapPin, Flame } from 'lucide-react';
import { getDistribuidoresPorUsuario, getClientesSellOutGeneral, getZonasPorUsuario } from './firebaseApi';
import { tarjeta, tituloPantalla, subtitulo, inputClasses, etiqueta, botonPrimario, botonSecundario } from './uiClasses';

export const PANTALLA_GEOLOCALIZACION = 'GEOLOCALIZACION';

// Paleta fija de colores distinguibles para las zonas (se asigna por orden,
// no por nombre, así que la misma zona puede cambiar de color si se borran
// zonas anteriores — aceptable para una simple leyenda visual, no es una
// codificación que se persista en ningún sitio).
const PALETA_ZONAS = ['#4F46E5', '#059669', '#DC2626', '#D97706', '#0891B2', '#DB2777', '#65A30D', '#7C3AED', '#EA580C', '#0D9488'];
const COLOR_SIN_ZONA = '#94A3B8'; // slate-400

const CENTRO_ESPANA = [40.4168, -3.7038];

// Capa de calor ("mancha de aceite") — componente interno que solo pinta un
// <L.heatLayer> sobre el mapa ya montado (useMap de react-leaflet), añadido/
// quitado según `activa` y redibujado si cambian los puntos.
function CapaCalor({ puntos, activa }) {
  const map = useMap();
  useEffect(() => {
    if (!activa || puntos.length === 0) return undefined;
    const capa = L.heatLayer(puntos, { radius: 30, blur: 20, maxZoom: 12 });
    capa.addTo(map);
    return () => { map.removeLayer(capa); };
  }, [map, puntos, activa]);
  return null;
}

function PantallaGeolocalizacion({ idUsuario, bloqueadoPorTodos = false }) {
  const [distribuidores, setDistribuidores] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [zonas, setZonas] = useState([]);
  const [cargando, setCargando] = useState(true);

  const [idDistribuidorFiltro, setIdDistribuidorFiltro] = useState('');
  const [idZonaFiltro, setIdZonaFiltro] = useState('');
  const [mostrarCalor, setMostrarCalor] = useState(false);

  const cargarTodo = useCallback(async () => {
    if (!idUsuario) { setDistribuidores([]); setClientes([]); setZonas([]); setCargando(false); return; }
    setCargando(true);
    try {
      const [dist, cli, zon] = await Promise.all([
        getDistribuidoresPorUsuario(idUsuario),
        getClientesSellOutGeneral(idUsuario),
        getZonasPorUsuario(idUsuario),
      ]);
      setDistribuidores(dist.sort((a, b) => (a.nombre_distribuidor || '').localeCompare(b.nombre_distribuidor || '', 'es')));
      setClientes(cli);
      setZonas(zon.sort((a, b) => (a.nombre_zona || '').localeCompare(b.nombre_zona || '', 'es')));
    } catch (error) {
      console.error('Error cargando Geolocalización:', error);
      alert('Error al cargar los datos: ' + error.message);
    }
    setCargando(false);
  }, [idUsuario]);

  useEffect(() => { cargarTodo(); }, [cargarTodo]);

  const mapaDistribuidores = useMemo(() => new Map(distribuidores.map((d) => [d.id, d.nombre_distribuidor])), [distribuidores]);
  const mapaColorPorZona = useMemo(() => {
    const mapa = new Map();
    zonas.forEach((z, i) => mapa.set(z.id, PALETA_ZONAS[i % PALETA_ZONAS.length]));
    return mapa;
  }, [zonas]);
  const mapaZonas = useMemo(() => new Map(zonas.map((z) => [z.id, z])), [zonas]);

  const clientesFiltrados = useMemo(() => clientes.filter((c) => {
    if (idDistribuidorFiltro && c.id_distribuidor !== idDistribuidorFiltro) return false;
    if (idZonaFiltro && c.id_zona !== idZonaFiltro) return false;
    return true;
  }), [clientes, idDistribuidorFiltro, idZonaFiltro]);

  const clientesGeolocalizados = useMemo(
    () => clientesFiltrados.filter((c) => Number.isFinite(c.latitud) && Number.isFinite(c.longitud)),
    [clientesFiltrados]
  );
  const clientesSinGeolocalizar = clientesFiltrados.length - clientesGeolocalizados.length;

  const puntosCalor = useMemo(() => clientesGeolocalizados.map((c) => [c.latitud, c.longitud, 1]), [clientesGeolocalizados]);

  const centroMapa = useMemo(() => {
    if (clientesGeolocalizados.length === 0) return CENTRO_ESPANA;
    const suma = clientesGeolocalizados.reduce((acc, c) => [acc[0] + c.latitud, acc[1] + c.longitud], [0, 0]);
    return [suma[0] / clientesGeolocalizados.length, suma[1] / clientesGeolocalizados.length];
  }, [clientesGeolocalizados]);

  if (bloqueadoPorTodos) {
    return (
      <div className={tarjeta}>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          "Geolocalización" no está disponible en modo "Todos los usuarios" — es de una cuenta concreta. Elige "Mis datos" o un usuario del selector "Viendo como" (barra lateral) para usar esta pantalla.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className={tituloPantalla}>Geolocalización</h1>
      <p className={subtitulo}>
        Mapa de clientes finales geolocalizados, coloreados por zona — activa la "mancha de aceite" para ver la concentración de cobertura. Ver "Direcciones de Clientes" (Sell-Out Clientes) para importar direcciones nuevas.
      </p>

      {cargando ? (
        <div className="text-slate-500 dark:text-slate-400">Cargando datos...</div>
      ) : (
        <>
          <div className={`${tarjeta} mb-4 flex flex-wrap items-end gap-3`}>
            <div className="min-w-[200px]">
              <label className={`${etiqueta} block mb-1`}>Distribuidor</label>
              <select value={idDistribuidorFiltro} onChange={(e) => setIdDistribuidorFiltro(e.target.value)} className={`${inputClasses} w-full`}>
                <option value="">Todos</option>
                {distribuidores.map((d) => <option key={d.id} value={d.id}>{d.nombre_distribuidor}</option>)}
              </select>
            </div>
            <div className="min-w-[200px]">
              <label className={`${etiqueta} block mb-1`}>Zona</label>
              <select value={idZonaFiltro} onChange={(e) => setIdZonaFiltro(e.target.value)} className={`${inputClasses} w-full`}>
                <option value="">Todas</option>
                {zonas.map((z) => <option key={z.id} value={z.id}>{z.nombre_zona}</option>)}
              </select>
            </div>
            <button
              type="button"
              onClick={() => setMostrarCalor((v) => !v)}
              className={mostrarCalor ? botonPrimario : botonSecundario}
            >
              <span className="inline-flex items-center gap-1.5"><Flame size={14} />{mostrarCalor ? 'Ocultar mancha de aceite' : 'Ver mancha de aceite'}</span>
            </button>
            <span className="text-xs text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5">
              <MapPin size={13} />{clientesGeolocalizados.length} cliente(s) en el mapa
              {clientesSinGeolocalizar > 0 && ` · ${clientesSinGeolocalizar} sin geolocalizar todavía`}
            </span>
          </div>

          {zonas.length > 0 && (
            <div className="flex flex-wrap gap-3 mb-3">
              {zonas.map((z) => (
                <span key={z.id} className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: mapaColorPorZona.get(z.id) }} />
                  {z.nombre_zona}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLOR_SIN_ZONA }} />
                Sin zona
              </span>
            </div>
          )}

          <div className={`${tarjeta} p-0 overflow-hidden`}>
            <MapContainer center={centroMapa} zoom={clientesGeolocalizados.length > 0 ? 9 : 6} style={{ height: '600px', width: '100%' }}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {clientesGeolocalizados.map((c) => (
                <CircleMarker
                  key={c.id}
                  center={[c.latitud, c.longitud]}
                  radius={7}
                  pathOptions={{
                    color: c.id_zona ? (mapaColorPorZona.get(c.id_zona) || COLOR_SIN_ZONA) : COLOR_SIN_ZONA,
                    fillColor: c.id_zona ? (mapaColorPorZona.get(c.id_zona) || COLOR_SIN_ZONA) : COLOR_SIN_ZONA,
                    fillOpacity: 0.75,
                    weight: 1,
                  }}
                >
                  <Popup>
                    <strong>{c.nombre_cliente}</strong><br />
                    {c.direccion || 'Sin dirección'}<br />
                    Distribuidor: {mapaDistribuidores.get(c.id_distribuidor) || c.id_distribuidor}<br />
                    Zona: {c.id_zona ? (mapaZonas.get(c.id_zona)?.nombre_zona || '—') : 'Sin zona'}
                  </Popup>
                </CircleMarker>
              ))}
              <CapaCalor puntos={puntosCalor} activa={mostrarCalor} />
            </MapContainer>
          </div>
        </>
      )}
    </div>
  );
}

export default PantallaGeolocalizacion;
