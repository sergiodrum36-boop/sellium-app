/*
 * matching.js
 * Utilidades para detectar marcas con nombres parecidos (posibles duplicados)
 * escritas de formas ligeramente distintas: mayúsculas/minúsculas, con o sin
 * el año entre paréntesis, con o sin punto final, etc.
 *
 * IMPORTANTE: esto solo SUGIERE candidatos. Nunca fusiona nada automáticamente
 * — dos marcas parecidas pueden ser productos distintos (p.ej. "Palomo Cojo"
 * vs "Palomo Cojo Semi Dulce"), así que la decisión final siempre es humana.
 */

// Normaliza un nombre para comparar: mayúsculas, sin acentos, sin lo que va
// entre paréntesis (años, ediciones...), sin puntuación, espacios colapsados.
export function normalizarParaComparar(nombre) {
  return String(nombre || '')
    .toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita acentos
    .replace(/\([^)]*\)/g, ' ')  // quita "(2023)", "(2021)"...
    .replace(/&/g, ' Y ')        // "Castro&Sil" debe compararse como "Castro Y Sil"
    .replace(/[.,;:'"´`]/g, ' ') // quita puntuación
    .replace(/\s+/g, ' ')
    .trim();
}

// Similitud por tokens (Jaccard): cuántas palabras comparten sobre el total de palabras distintas
function similitudTokens(a, b) {
  const tokensA = new Set(a.split(' ').filter(Boolean));
  const tokensB = new Set(b.split(' ').filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let interseccion = 0;
  tokensA.forEach(t => { if (tokensB.has(t)) interseccion++; });
  const union = new Set([...tokensA, ...tokensB]).size;
  return interseccion / union;
}

/**
 * Calcula una puntuación de similitud (0 a 1) entre dos nombres de marca.
 * 1 = idénticos tras normalizar. >0.8 = muy probablemente la misma marca.
 */
export function similitud(nombreA, nombreB) {
  const a = normalizarParaComparar(nombreA);
  const b = normalizarParaComparar(nombreB);
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  // Si una es prefijo/contenida en la otra casi entera, puntuación alta
  if (a.includes(b) || b.includes(a)) {
    const corta = Math.min(a.length, b.length);
    const larga = Math.max(a.length, b.length);
    return 0.75 + 0.2 * (corta / larga);
  }

  return similitudTokens(a, b);
}

/**
 * Dado un nombre y una lista de marcas existentes, devuelve las candidatas
 * a ser la misma marca, ordenadas de más a menos parecida.
 */
export function encontrarSimilares(nombre, listaMarcas, umbralMinimo = 0.5) {
  // NOTA: antes se excluían aquí los candidatos con score === 1 (asumiendo que
  // ya se habían tratado como "ya existe" en otro sitio). Pero el score puede
  // llegar a 1 solo por la normalización (p.ej. "PALOMO COJO (2023) DO RUEDA"
  // normaliza igual que "PALOMO COJO DO RUEDA" al quitar el año entre
  // paréntesis), aunque el nombre tal cual del Excel sea distinto del nombre
  // ya guardado. Si se excluía aquí, la mejor coincidencia (la que sí es la
  // misma marca) desaparecía de la lista y solo se veían coincidencias
  // peores. La comprobación de "ya existe con nombre EXACTO" se hace antes de
  // llamar a esta función (con norm() simple), así que aquí no hace falta
  // volver a excluir el score 1.
  return listaMarcas
    .map(m => ({ marca: m, score: similitud(nombre, m.nombre_marca) }))
    .filter(r => r.score >= umbralMinimo)
    .sort((a, b) => b.score - a.score);
}

/**
 * Agrupa una lista de marcas en "clusters" de posibles duplicados.
 * Devuelve solo los clusters con más de 1 marca.
 */
export function agruparPosiblesDuplicados(listaMarcas, umbralMinimo = 0.6) {
  const visitado = new Set();
  const clusters = [];

  for (let i = 0; i < listaMarcas.length; i++) {
    if (visitado.has(listaMarcas[i].id)) continue;
    const cluster = [listaMarcas[i]];
    visitado.add(listaMarcas[i].id);

    for (let j = i + 1; j < listaMarcas.length; j++) {
      if (visitado.has(listaMarcas[j].id)) continue;
      const score = similitud(listaMarcas[i].nombre_marca, listaMarcas[j].nombre_marca);
      if (score >= umbralMinimo) {
        cluster.push(listaMarcas[j]);
        visitado.add(listaMarcas[j].id);
      }
    }

    if (cluster.length > 1) clusters.push(cluster);
  }

  return clusters;
}
