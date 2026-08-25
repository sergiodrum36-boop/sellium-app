function normalizarParaComparar(nombre) {
  return String(nombre || '')
    .toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/&/g, ' Y ')
    .replace(/[.,;:'"´`#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function similitudTokens(a, b) {
  const tokensA = new Set(a.split(' ').filter(Boolean));
  const tokensB = new Set(b.split(' ').filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let interseccion = 0;
  tokensA.forEach((t) => { if (tokensB.has(t)) interseccion++; });
  const union = new Set([...tokensA, ...tokensB]).size;
  return interseccion / union;
}
function similitud(nombreA, nombreB) {
  const a = normalizarParaComparar(nombreA);
  const b = normalizarParaComparar(nombreB);
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  if (a.includes(b) || b.includes(a)) {
    const corta = Math.min(a.length, b.length);
    const larga = Math.max(a.length, b.length);
    return 0.75 + 0.2 * (corta / larga);
  }
  return similitudTokens(a, b);
}
module.exports = { normalizarParaComparar, similitud };
