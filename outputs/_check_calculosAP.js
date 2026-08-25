/*
 * calculosAP.js
 * Fórmulas centralizadas para el cálculo de A&P (Aportación y Publicidad)
 * a partir de un movimiento de Histórico Sell-Out.
 *
 * Se centralizan aquí para que ControlAP, Historico, StockDistribuidor y
 * Dashboard usen siempre la MISMA definición y no diverjan con el tiempo.
 *
 * Compatibilidad: los registros antiguos (creados antes de añadir las
 * categorías "Acuerdo" y los valores en euros de regaladas/muestras) no
 * tienen estos campos. Se recalculan a partir de unidades x coste_unidad
 * como hacía la versión anterior de la app, para no perder ni alterar
 * datos históricos ya guardados.
 */

// Convierte a número de forma segura: si el campo viene como texto (p.ej.
// una celda de Excel formateada como texto, o un dato antiguo guardado con
// otro tipo), o directamente no es un número válido, devuelve 0 en vez de
// arrastrar un NaN o una concatenación de texto silenciosa por los sumatorios
// (eso es lo que puede romper los totales de los gráficos sin dar ningún error).
const numSeguro = (v) => {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

// Valor en euros de las botellas regaladas (sin cargo)
export const valorRegaladas = (mov) => {
  if (mov.valor_regaladas_euros !== undefined && mov.valor_regaladas_euros !== null) {
    return numSeguro(mov.valor_regaladas_euros);
  }
  return numSeguro(mov.regaladas_uds) * numSeguro(mov.coste_unidad);
};

// Valor en euros de las muestras
export const valorMuestras = (mov) => {
  if (mov.valor_muestras_euros !== undefined && mov.valor_muestras_euros !== null) {
    return numSeguro(mov.valor_muestras_euros);
  }
  return numSeguro(mov.muestras_uds) * numSeguro(mov.coste_unidad);
};

// Valor en euros de las botellas a precio de Acuerdo especial
export const valorAcuerdo = (mov) => numSeguro(mov.valor_acuerdo_euros);

// Unidades de Acuerdo (0 en registros antiguos que no tenían esta categoría)
export const unidadesAcuerdo = (mov) => numSeguro(mov.unidades_acuerdo);

// Aportación manual (0 si no se rellenó)
export const valorAportacionManual = (mov) => numSeguro(mov.aportacion_euros);

// A&P GASTADO total de un movimiento (regaladas + muestras + acuerdo + aportación manual)
export const gastoTotal = (mov) => {
  return valorRegaladas(mov) + valorMuestras(mov) + valorAcuerdo(mov) + valorAportacionManual(mov);
};

// Unidades totales movidas (para calcular medias y para el cálculo de stock/salidas)
export const unidadesMovidas = (mov) => {
  return numSeguro(mov.ventas_uds) + numSeguro(mov.regaladas_uds) + numSeguro(mov.muestras_uds) + unidadesAcuerdo(mov);
};

// A&P GENERADO de un movimiento de Sell-In (compra)
export const generadoSellIn = (mov) => numSeguro(mov.unidades_compradas) * numSeguro(mov.ap_por_unidad);
