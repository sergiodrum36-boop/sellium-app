/*
 * formatearPeriodo.js
 * Compartido entre DashboardSellOutClientes.js y DashboardSellOutMarcas.js
 * (antes cada uno tenía su propia copia de esto — se centraliza para que no
 * puedan volver a desincronizarse, mismo motivo que uiClasses.js/estilosArea.js).
 *
 * Convierte una entrada de PeriodoComparador ({ anio, meses: [0-11,...] })
 * en una etiqueta legible. PeriodoComparador solo entrega la lista de
 * meses, no el "tipo" que eligió el usuario (Mes/Trimestre/Semestre/Año
 * completo/Varios meses no viaja fuera de ese componente) — así que aquí se
 * RECONOCE si esos meses coinciden exactamente con un trimestre o semestre
 * natural (Ene-Mar, Abr-Jun...) para mostrar "1er Trimestre 2026" en vez de
 * listar sus 3 meses (a petición de Sergio, 2026-07-19). Si la selección no
 * coincide con ningún bloque natural (p.ej. "Varios meses" sueltos, o dos
 * trimestres marcados a la vez), se listan los meses como hasta ahora.
 */
export const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const BLOQUES_TRIMESTRE = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11]];
const ETIQUETA_TRIMESTRE = ['1er Trimestre', '2º Trimestre', '3er Trimestre', '4º Trimestre'];
const BLOQUES_SEMESTRE = [[0, 1, 2, 3, 4, 5], [6, 7, 8, 9, 10, 11]];
const ETIQUETA_SEMESTRE = ['1er Semestre', '2º Semestre'];

export function formatearPeriodo(entry) {
  if (!entry) return '—';
  const ordenados = [...entry.meses].sort((a, b) => a - b);
  if (ordenados.length === 12) return String(entry.anio);
  const clave = ordenados.join(',');
  const iTrimestre = BLOQUES_TRIMESTRE.findIndex(b => b.join(',') === clave);
  if (iTrimestre !== -1) return `${ETIQUETA_TRIMESTRE[iTrimestre]} ${entry.anio}`;
  const iSemestre = BLOQUES_SEMESTRE.findIndex(b => b.join(',') === clave);
  if (iSemestre !== -1) return `${ETIQUETA_SEMESTRE[iSemestre]} ${entry.anio}`;
  return `${ordenados.map(m => MESES_CORTOS[m]).join(', ')} ${entry.anio}`;
}

// { anio, meses: [0-11,...] } -> lista de 'YYYY-MM'. También compartido
// (idéntico en ambos dashboards antes de esto).
const pad2 = (n) => String(n).padStart(2, '0');
export const entradaAMesesAno = (entry) => (entry ? entry.meses.map(m => `${entry.anio}-${pad2(m + 1)}`) : []);
