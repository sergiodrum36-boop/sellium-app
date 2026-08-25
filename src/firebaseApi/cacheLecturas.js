/*
 * firebaseApi/cacheLecturas.js
 * Caché de lecturas EN MEMORIA, de alcance "sesión de la pestaña".
 *
 * --- POR QUÉ EXISTE ESTE MÓDULO ---
 * DashboardSellOutClientes.js y DashboardSellOutMarcas.js son pestañas
 * hermanas dentro de PantallaSellOutClientes.js, y cada una tiene su PROPIO
 * selector de distribuidor (a propósito: el usuario puede estar mirando un
 * distribuidor en una pestaña y otro distinto en la otra — eso no se toca).
 * Pero cuando ambas tienen seleccionado el MISMO distribuidor, cada una
 * lanzaba por su cuenta la misma consulta a Firestore
 * (getMovimientosSellOutClientesPorDistribuidor, y además
 * getClientesSellOutPorDistribuidor en la de Clientes): una lectura duplicada
 * real e innecesaria de la misma colección, que se paga dos veces en cuota de
 * Firestore y en tiempo de carga.
 *
 * --- ALCANCE DELIBERADAMENTE PEQUEÑO ---
 * Se descartó la alternativa más agresiva (guardar en Firestore un resumen
 * precalculado): habría exigido reglas nuevas que Sergio tendría que publicar
 * a mano, y sobre todo abría el riesgo de que ese resumen se desincronizara
 * del detalle real sin que nadie se diera cuenta. Aquí, en cambio:
 *  - No se toca Firestore ni firestore.rules: NADA de esto se persiste.
 *  - El Map vive mientras dura la sesión de la pestaña del navegador. Al
 *    recargar la página (F5) se pierde entero, así que es imposible quedarse
 *    "cacheado para siempre" — en el peor caso imaginable, recargar arregla
 *    cualquier problema.
 *  - Toda función que ESCRIBE en estas colecciones invalida su clave justo
 *    después de escribir (ver sellOutClientes.js y auditoria.js). Invalidar
 *    de más nunca es un bug: solo provoca una relectura extra.
 *
 * Se guarda la PROMESA, no el resultado ya resuelto: así, si las dos pestañas
 * piden lo mismo casi a la vez (antes de que la primera petición haya
 * terminado), la segunda se engancha a la petición ya en vuelo en vez de
 * lanzar una segunda — deduplicación de carreras, no solo de repeticiones.
 */

// clave (string) -> Promesa de la lectura. Module-level: una sola instancia
// por sesión de pestaña, sin persistencia de ningún tipo.
const cache = new Map();

// Cada consumidor recibe su propia copia del array (los objetos de dentro sí
// se comparten, igual que comparten datos dos lecturas seguidas de Firestore).
// Así, si un dashboard ordena la lista en el sitio (.sort()), no le cambia la
// lista por debajo al otro dashboard, que es exactamente cómo se comportaba
// esto antes de existir la caché.
const copiaSuperficial = (resultado) => (Array.isArray(resultado) ? resultado.slice() : resultado);

/*
 * leerConCache(clave, funcionCarga)
 * Devuelve siempre una promesa. Si `clave` ya tiene una entrada (resuelta o
 * todavía en vuelo) se reutiliza y NO se llama a funcionCarga. Si la promesa
 * acaba rechazada (p.ej. corte de red), se borra la entrada antes de relanzar
 * el error: nunca se queda un fallo cacheado, el siguiente intento reintenta
 * de verdad.
 */
export const leerConCache = (clave, funcionCarga) => {
  let promesa = cache.get(clave);

  if (!promesa) {
    let enVuelo;
    try {
      enVuelo = Promise.resolve(funcionCarga());
    } catch (err) {
      // funcionCarga falló de forma síncrona: no se cachea nada.
      return Promise.reject(err);
    }

    const registrada = enVuelo.catch((err) => {
      // Solo se borra si la entrada del mapa sigue siendo ESTA (podría
      // haberla reemplazado ya una invalidación + relectura posterior).
      if (cache.get(clave) === registrada) cache.delete(clave);
      throw err;
    });

    cache.set(clave, registrada);
    promesa = registrada;
  }

  return promesa.then(copiaSuperficial);
};

/*
 * invalidarPorPrefijo(prefijo)
 * Borra todas las claves que EMPIEZAN por ese prefijo (comparación de string
 * literal con startsWith, no una expresión regular). Pasar una clave completa
 * también vale: una clave es prefijo de sí misma. Devuelve cuántas entradas se
 * borraron (útil para depurar; nadie depende de ese número).
 */
export const invalidarPorPrefijo = (prefijo) => {
  if (!prefijo) return 0;
  let borradas = 0;
  for (const clave of Array.from(cache.keys())) {
    if (clave.startsWith(prefijo)) {
      cache.delete(clave);
      borradas += 1;
    }
  }
  return borradas;
};

/*
 * --- CONSTRUCTORES DE CLAVE (fuente única de verdad) ---
 * Viven aquí, y no en sellOutClientes.js, porque auditoria.js también los
 * necesita para invalidar y sellOutClientes.js ya importa de auditoria.js
 * (importar en sentido contrario crearía un ciclo). Este módulo no importa
 * nada, así que puede importarlo cualquiera sin riesgo.
 *
 * Formato: `dominio:idUsuario:idDistribuidor`. El orden importa: al poner el
 * usuario antes que el distribuidor, `dominio:idUsuario:` es un prefijo válido
 * para "todo lo de este usuario", que es justo lo que necesitan los borrados
 * masivos y la papelera (que no conocen el distribuidor concreto).
 */
export const claveMovimientosSellOutClientes = (idUsuario, idDistribuidor) =>
  `movsSOC:${idUsuario}:${idDistribuidor}`;

export const claveClientesSellOut = (idUsuario, idDistribuidor) =>
  `clientesSOC:${idUsuario}:${idDistribuidor}`;

// Prefijos "anchos": todo lo de un usuario, sea cual sea el distribuidor.
export const prefijoMovimientosSellOutClientes = (idUsuario) => `movsSOC:${idUsuario}:`;
export const prefijoClientesSellOut = (idUsuario) => `clientesSOC:${idUsuario}:`;
