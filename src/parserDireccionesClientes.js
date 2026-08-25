/*
 * parserDireccionesClientes.js
 * Parser del Excel de direcciones de clientes finales, para geolocalizarlos
 * (26/07/2026, a petición de Sergio: "visión de mancha de aceite con
 * clientes por zonas" — ver ImportarDireccionesClientes.js).
 *
 * Es SIEMPRE de UN distribuidor concreto (igual que el resto de importadores
 * de esta app) y casa cada fila con un cliente YA EXISTENTE en
 * `clientesSellOut` por su código de cliente propio del distribuidor
 * (cod_cliente_origen) — este importador NO da de alta clientes nuevos, solo
 * añade dirección/zona a los que ya se importaron desde Sell-Out por
 * Cliente Final.
 *
 * AMPLIACIÓN (26/07/2026, a petición de Sergio: "solo tengo el dato del
 * nombre y la población pero no la dirección" — muchos clientes finales no
 * tienen calle/número registrados, solo su localidad): la columna de calle ya
 * NO es obligatoria por sí sola. Basta con traer Dirección (calle) O Población
 * (+ Provincia opcional, recomendable para desambiguar localidades con el
 * mismo nombre en distintas provincias) — se exige que al menos UNA de las
 * dos esté rellena por fila. Cuando no hay calle, se geolocaliza a nivel de
 * población (el marcador cae en el centro de la localidad, no en el portal
 * exacto) — precisión de sobra para una vista de "mancha de aceite" por
 * zonas, aunque no sirva para ver el edificio exacto del cliente.
 */

import * as XLSX from 'xlsx';

const quitarAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const normalizarCabecera = (s) => quitarAcentos(s).toUpperCase().trim();
const esVacio = (v) => v === null || v === undefined || String(v).trim() === '';

const ALIAS_COLUMNAS = {
  cod_cliente: ['COD. CLIENTE', 'COD CLIENTE', 'CODIGO CLIENTE', 'CODCLIENTE', 'COD.CLIENTE', 'Nº CLIENTE', 'N CLIENTE', 'NUMERO CLIENTE'],
  direccion: ['DIRECCION', 'DOMICILIO', 'CALLE'],
  poblacion: ['POBLACION', 'LOCALIDAD', 'MUNICIPIO', 'CIUDAD'],
  provincia: ['PROVINCIA'],
  zona: ['ZONA'],
};
// Orden de detección: cod_cliente antes que el resto no importa aquí
// (a diferencia de parserSellOutClientes.js, ningún alias es substring de otro).
const ORDEN_DETECCION = ['cod_cliente', 'direccion', 'poblacion', 'provincia', 'zona'];

const detectarColumna = (cabeceraNormalizada, yaAsignadas) => {
  for (const campo of ORDEN_DETECCION) {
    if (yaAsignadas.has(campo)) continue;
    if (ALIAS_COLUMNAS[campo].some((alias) => cabeceraNormalizada.includes(alias))) return campo;
  }
  return null;
};

// Parsea el libro Excel y devuelve { filas, avisos }. `filas` = array de
// { cod_cliente, direccion, esSoloPoblacion, zona } (zona puede ser '').
// `direccion` es el texto final a geolocalizar/guardar: si la fila trae
// calle, se usa tal cual; si no, se construye a partir de Población (+
// Provincia) — `esSoloPoblacion` marca ese caso para que el importador pueda
// avisar de la menor precisión. `avisos` lista problemas de estructura
// (columnas obligatorias no encontradas) — nunca lanza una excepción por un
// archivo con formato inesperado, para que el importador pueda mostrar el
// aviso en vez de un error genérico.
export const parseDireccionesClientes = (arrayBuffer) => {
  const avisos = [];
  const libro = XLSX.read(arrayBuffer, { type: 'array' });
  const nombreHoja = libro.SheetNames[0];
  if (!nombreHoja) {
    return { filas: [], avisos: ['El archivo no tiene ninguna hoja.'] };
  }
  const hoja = libro.Sheets[nombreHoja];
  const filasCrudas = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: false, defval: '' });
  if (filasCrudas.length < 2) {
    return { filas: [], avisos: ['La hoja no tiene filas de datos (solo cabecera, o está vacía).'] };
  }

  const cabecera = filasCrudas[0];
  const indicePorCampo = {};
  const yaAsignadas = new Set();
  cabecera.forEach((valorCabecera, indice) => {
    const normalizada = normalizarCabecera(valorCabecera);
    const campo = detectarColumna(normalizada, yaAsignadas);
    if (campo) {
      indicePorCampo[campo] = indice;
      yaAsignadas.add(campo);
    }
  });

  if (indicePorCampo.cod_cliente === undefined) {
    avisos.push('No se encontró la columna de "Código de Cliente" — revisa que el Excel tenga una columna con ese nombre (o "Nº Cliente").');
  }
  if (indicePorCampo.direccion === undefined && indicePorCampo.poblacion === undefined) {
    avisos.push('No se encontró ni columna de "Dirección" ni de "Población" — hace falta al menos una de las dos para poder geolocalizar (Dirección/Domicilio/Calle, o Población/Localidad/Municipio).');
  }
  if (indicePorCampo.cod_cliente === undefined || (indicePorCampo.direccion === undefined && indicePorCampo.poblacion === undefined)) {
    return { filas: [], avisos };
  }

  const filas = [];
  for (let i = 1; i < filasCrudas.length; i++) {
    const filaCruda = filasCrudas[i];
    const codCliente = String(filaCruda[indicePorCampo.cod_cliente] ?? '').trim();
    const direccionCalle = indicePorCampo.direccion !== undefined ? String(filaCruda[indicePorCampo.direccion] ?? '').trim() : '';
    const poblacion = indicePorCampo.poblacion !== undefined ? String(filaCruda[indicePorCampo.poblacion] ?? '').trim() : '';
    const provincia = indicePorCampo.provincia !== undefined ? String(filaCruda[indicePorCampo.provincia] ?? '').trim() : '';
    const zona = indicePorCampo.zona !== undefined ? String(filaCruda[indicePorCampo.zona] ?? '').trim() : '';

    if (esVacio(codCliente) && esVacio(direccionCalle) && esVacio(poblacion)) continue; // fila en blanco, se ignora sin avisar
    if (esVacio(codCliente)) {
      avisos.push(`Fila ${i + 1}: sin código de cliente, se ignora.`);
      continue;
    }
    if (esVacio(direccionCalle) && esVacio(poblacion)) {
      avisos.push(`Fila ${i + 1} (cliente ${codCliente}): sin dirección ni población, se ignora.`);
      continue;
    }

    // Si hay calle, se usa tal cual (añadiendo población/provincia si vienen,
    // ayuda a Nominatim a desambiguar). Si NO hay calle, la "dirección" que
    // se guarda y se geolocaliza es directamente población (+ provincia).
    let direccion;
    let esSoloPoblacion;
    if (!esVacio(direccionCalle)) {
      direccion = [direccionCalle, poblacion, provincia].filter((p) => !esVacio(p)).join(', ');
      esSoloPoblacion = false;
    } else {
      direccion = [poblacion, provincia].filter((p) => !esVacio(p)).join(', ');
      esSoloPoblacion = true;
    }

    filas.push({ cod_cliente: codCliente, direccion, esSoloPoblacion, zona });
  }

  return { filas, avisos };
};
