/*
 * geocodificacion.js
 * Geocodificación de direcciones (texto libre) a coordenadas usando
 * Nominatim, el servicio gratuito de búsqueda de OpenStreetMap — no
 * necesita API key ni cuenta de facturación (a diferencia de Google Maps,
 * ver decisión con Sergio 26/07/2026 en project_sellium_crm_bloque_inicio).
 *
 * Uso responsable exigido por Nominatim
 * (https://operations.osmfoundation.org/policies/nominatim/): máximo 1
 * petición por segundo y una sola en curso a la vez. Por eso el importador
 * de direcciones de clientesSellOut (ver ImportarDireccionesClientes.js)
 * SIEMPRE pasa por `geocodificarEnLote`, nunca llama a `geocodificarDireccion`
 * en paralelo para varias direcciones — con cientos de clientes esto puede
 * tardar varios minutos, así que el importador muestra progreso en tiempo
 * real en vez de parecer colgado.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
// Algo más de 1s de margen sobre el límite de Nominatim (1 petición/segundo).
const ESPERA_ENTRE_PETICIONES_MS = 1100;

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Busca una única dirección de texto libre y devuelve { lat, lon } (números)
// o null si Nominatim no encuentra nada. No lanza si la petición de red
// falla (fallo de conexión, límite de tasa, etc.) — lo trata igual que "no
// encontrado" y deja que quien llame decida qué avisar, para no romper todo
// un lote de importación por una sola dirección problemática.
export const geocodificarDireccion = async (texto) => {
  const query = (texto || '').trim();
  if (!query) return null;
  try {
    // countrycodes=es: acota la búsqueda a España. Sin esto, una fila que solo
    // trae población (sin calle, ver parserDireccionesClientes.js — Sergio:
    // "solo tengo el dato del nombre y la población") podría casar con una
    // localidad homónima de otro país y devolver coordenadas completamente
    // erróneas sin que se note en el mapa.
    const url = `${NOMINATIM_URL}?format=json&limit=1&countrycodes=es&q=${encodeURIComponent(query)}`;
    const respuesta = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!respuesta.ok) return null;
    const resultados = await respuesta.json();
    if (!Array.isArray(resultados) || resultados.length === 0) return null;
    const { lat, lon } = resultados[0];
    const latitud = Number(lat);
    const longitud = Number(lon);
    if (!Number.isFinite(latitud) || !Number.isFinite(longitud)) return null;
    return { lat: latitud, lon: longitud };
  } catch (error) {
    console.error('Error geocodificando dirección:', texto, error);
    return null;
  }
};

// Geocodifica una lista de { ...datos, direccion } EN SERIE, respetando el
// límite de 1 petición/segundo de Nominatim. `onProgreso(indiceActual,
// total)` se llama antes de cada petición para poder mostrar una barra de
// progreso (con cientos de clientes esto tarda varios minutos). Devuelve un
// array con el mismo contenido de entrada más `coords: {lat,lon}|null`.
export const geocodificarEnLote = async (entradas, onProgreso) => {
  const resultados = [];
  for (let i = 0; i < entradas.length; i++) {
    if (onProgreso) onProgreso(i, entradas.length);
    const coords = await geocodificarDireccion(entradas[i].direccion);
    resultados.push({ ...entradas[i], coords });
    if (i < entradas.length - 1) await esperar(ESPERA_ENTRE_PETICIONES_MS);
  }
  return resultados;
};
