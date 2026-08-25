/*
 * estructuraComercial.js
 * Lógica pura (sin Firestore) de "Estructura Comercial" — primer bloque del
 * nuevo apartado "CRM y Comercial" de la app (a petición de Sergio,
 * 26/07/2026: además del análisis de ventas que ya existía, la app va a
 * cubrir también CRM, planificación comercial, estructura comercial,
 * acuerdos con clientes, geolocalización y avisos de consumo). Se empieza
 * por Estructura Comercial porque hoy "preventista"/"comercial" son solo
 * texto suelto en cada línea de movimiento de Sell-Out por Cliente (ver
 * firebaseApi/sellOutClientes.js) — sin esto como entidad real, con zona y
 * jerarquía propias, los próximos bloques (acuerdos, visitas, avisos) no
 * tienen a quién colgarse.
 *
 * Mismo criterio que calculosAP.js/matching.js/alertas.js: funciones puras,
 * sin peticiones a Firestore (eso vive en firebaseApi/estructuraComercial.js),
 * fáciles de testear con datos ya cargados.
 */

import { normalizarParaComparar } from './matching';

// --- JERARQUÍA (árbol de comerciales por supervisor) ---
// Recibe la lista plana de comerciales (cada uno con `id` e `id_supervisor`,
// que puede ser null/vacío o apuntar a otro comercial de la misma lista) y
// devuelve un árbol: array de nodos raíz, cada uno con `children` anidados.
//
// Casos borde que NO deben romper el render (de ahí que esto tenga tests
// propios, ver estructuraComercial.test.js):
//  - id_supervisor vacío o que no existe en la lista -> el nodo es raíz.
//  - un comercial que se referencia a sí mismo como supervisor -> raíz.
//  - un ciclo entre dos o más comerciales (A supervisa a B, B supervisa a
//    A) -> en vez de recursión infinita, se corta el ciclo tratando como
//    raíz al primer nodo que lo detecta; los demás implicados sí cuelgan
//    normalmente de él si no forman parte del propio ciclo.
export function construirJerarquiaComerciales(comerciales) {
  const lista = comerciales || [];
  const mapa = new Map(lista.map((c) => [c.id, { ...c, children: [] }]));

  const creaCiclo = (idNodo, idSupervisorInicial) => {
    let actual = idSupervisorInicial;
    const visitados = new Set();
    while (actual) {
      if (actual === idNodo) return true;
      if (visitados.has(actual)) return true; // ciclo entre otros nodos, no forma bucle infinito pero tampoco es un camino válido hacia una raíz
      visitados.add(actual);
      const siguiente = mapa.get(actual);
      actual = siguiente ? siguiente.id_supervisor : null;
    }
    return false;
  };

  const raices = [];
  mapa.forEach((nodo) => {
    const idSup = nodo.id_supervisor;
    if (!idSup || !mapa.has(idSup) || idSup === nodo.id || creaCiclo(nodo.id, idSup)) {
      raices.push(nodo);
    } else {
      mapa.get(idSup).children.push(nodo);
    }
  });

  const ordenarRecursivo = (nodos) => {
    nodos.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
    nodos.forEach((n) => ordenarRecursivo(n.children));
  };
  ordenarRecursivo(raices);

  return raices;
}

// --- PREVENTISTAS/COMERCIALES SIN VINCULAR ---
// Compara el texto libre del campo `preventista` de los movimientos de
// Sell-Out por Cliente Final (ver firebaseApi/sellOutClientes.js) contra los
// nombres de los comerciales ya dados de alta en Estructura Comercial, y
// devuelve los textos que NO coinciden con ninguno — candidatos a crear como
// comercial nuevo o a los que les falta el alta. Usa la misma normalización
// que ya usa el proyecto para detectar duplicados de Marca (matching.js:
// mayúsculas, sin acentos, sin puntuación) para que variantes de escritura
// menores ("Manuel Claro Romero" vs "MANUEL CLARO ROMERO.") no cuenten como
// "sin vincular" si el comercial ya existe con ese mismo nombre.
export function getPreventistasSinVincular(movimientos, comerciales) {
  const normalizadosExistentes = new Set(
    (comerciales || []).map((c) => normalizarParaComparar(c.nombre)).filter(Boolean)
  );

  const conteo = new Map(); // texto normalizado -> { texto (primera aparición tal cual), count }
  (movimientos || []).forEach((m) => {
    const texto = String(m?.preventista || '').trim();
    if (!texto) return;
    const norm = normalizarParaComparar(texto);
    if (!norm || normalizadosExistentes.has(norm)) return;
    const actual = conteo.get(norm) || { texto, count: 0 };
    actual.count += 1;
    conteo.set(norm, actual);
  });

  return Array.from(conteo.values()).sort(
    (a, b) => b.count - a.count || a.texto.localeCompare(b.texto, 'es')
  );
}
