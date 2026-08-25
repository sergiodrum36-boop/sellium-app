/*
 * avisosConsumoClientes.js
 * Lógica pura de "Avisos de Consumo" (26/07/2026, a petición de Sergio,
 * segundo punto del roadmap "Avisos de consumo/Acuerdos con clientes"): tres
 * comprobaciones proactivas sobre CLIENTES FINALES (`movimientosSellOutClientes`),
 * para detectar quién está comprando menos o ha dejado de comprar y así
 * poder "hablar con el comercial para ver qué está pasando" (palabras de
 * Sergio) — por eso cada fila arrastra el Preventista/comercial que gestiona
 * ese cliente, no solo el nombre.
 *
 * Confirmado con Sergio:
 *  - Ventana de análisis configurable: cada 3 O 6 meses (nunca fija).
 *  - "Perdido" y "Caída de consumo" reutilizan la MISMA comparación año vs
 *    año anterior que ya usa el Dashboard Sell-Out Clientes (respeta la
 *    estacionalidad, igual que Recuperación de Ventas) — de hecho reutilizan
 *    literalmente `agregarSellOutPorPeriodo` (agregacionSellOutPorPeriodo.js),
 *    no una copia.
 *  - "Sin compras desde hace N meses" NO depende de la comparación año vs
 *    año: es el último mes con alguna compra de ESE cliente concreto,
 *    igual que ya existe para distribuidores en alertas.js — un cliente que
 *    nunca compró nada no cuenta aquí (no se avisa de la ausencia de algo
 *    que nunca existió).
 *  - Umbral de caída: 30% (mismo nivel "rojo" que ya usa Recuperación de
 *    Ventas, para no introducir un tercer criterio de "caída fuerte" en la
 *    app).
 *  - Métrica: UNIDADES (uds_totales), no €, porque no todos los movimientos
 *    antiguos tienen facturación en € (ver Facturación por Cliente Final).
 */

import { agregarSellOutPorPeriodo } from './agregacionSellOutPorPeriodo';

export const UMBRAL_CAIDA_PCT_DEFECTO = 30;

// Genera `cantidad` meses 'YYYY-MM' terminando en `mesFinal` (incluido),
// del más reciente al más antiguo — ej. generarVentanaMeses('2026-06', 3) =
// ['2026-06', '2026-05', '2026-04'].
export function generarVentanaMeses(mesFinal, cantidad) {
  const [yFinal, mFinal] = mesFinal.split('-').map(Number);
  const meses = [];
  for (let i = 0; i < cantidad; i++) {
    const totalMeses = (yFinal * 12 + (mFinal - 1)) - i;
    const y = Math.floor(totalMeses / 12);
    const m = (totalMeses % 12) + 1;
    meses.push(`${y}-${String(m).padStart(2, '0')}`);
  }
  return meses;
}

// El mismo mes 'YYYY-MM' pero un año antes.
export function mesUnAnioAntes(mesAno) {
  const [y, m] = mesAno.split('-').map(Number);
  return `${y - 1}-${String(m).padStart(2, '0')}`;
}

// Nº de meses transcurridos desde `mesAno` ('YYYY-MM') hasta `hoy` (0 = mes
// actual). Mismo cálculo que `mesesDesde` de alertas.js (distribuidores),
// aquí para clientes finales.
function mesesTranscurridosDesde(mesAno, hoy) {
  const [y, m] = mesAno.split('-').map(Number);
  return (hoy.getFullYear() - y) * 12 + (hoy.getMonth() + 1 - m);
}

// Marcas que cada cliente ha comprado alguna vez (uds_totales > 0), en TODO
// su histórico — responde a "qué compra este cliente y cuánto", no solo a
// la ventana analizada, porque un cliente perdido/en caída suele seguir
// siendo reconocible por su cartera habitual de marcas. Devuelve un Map
// id_cliente -> array de {nombre, uds} (uds = total histórico de esa marca
// para ese cliente), ordenado de más a menos comprada — a petición de
// Sergio: "es necesario que ponga el total por cada marca".
function construirMapaMarcasPorCliente(movimientos) {
  const mapa = new Map(); // id_cliente -> Map(id_marca -> {nombre, uds})
  (movimientos || []).forEach((mv) => {
    if (!mv.id_cliente || !mv.id_marca || (mv.uds_totales || 0) <= 0) return;
    let porMarca = mapa.get(mv.id_cliente);
    if (!porMarca) { porMarca = new Map(); mapa.set(mv.id_cliente, porMarca); }
    let acc = porMarca.get(mv.id_marca);
    if (!acc) { acc = { nombre: mv.nombre_marca || mv.id_marca, uds: 0 }; porMarca.set(mv.id_marca, acc); }
    if (mv.nombre_marca) acc.nombre = mv.nombre_marca;
    acc.uds += mv.uds_totales || 0;
  });
  const resultado = new Map();
  mapa.forEach((porMarca, idCliente) => {
    resultado.set(idCliente, Array.from(porMarca.values()).sort((a, b) => b.uds - a.uds));
  });
  return resultado;
}

// Clientes sin ninguna compra (uds_totales > 0) desde hace `umbralMeses` o
// más. Arrastra comercial/preventista del movimiento MÁS RECIENTE de ese
// cliente (sea o no el que tuvo la última compra: un cliente puede cambiar
// de preventista en un mes sin pedido), igual que hace
// `agregarSellOutPorPeriodo` con Zona/Preventista/Tipología. Un cliente sin
// NINGUNA compra en todo su histórico no se incluye (no hay "desde cuándo"
// que avisar).
export function detectarClientesInactivos(movimientos, umbralMeses, hoy = new Date()) {
  const porCliente = new Map();
  (movimientos || []).forEach((mv) => {
    if (!mv.id_cliente) return;
    let acc = porCliente.get(mv.id_cliente);
    if (!acc) {
      acc = {
        id_cliente: mv.id_cliente, nombre_cliente: mv.nombre_cliente || '',
        id_distribuidor: mv.id_distribuidor || '', comercial: '', preventista: '',
        ultimoMesConCompra: null, mesArrastre: '',
      };
      porCliente.set(mv.id_cliente, acc);
    }
    if (mv.nombre_cliente) acc.nombre_cliente = mv.nombre_cliente;
    if ((mv.uds_totales || 0) > 0 && (!acc.ultimoMesConCompra || mv.mes_ano > acc.ultimoMesConCompra)) {
      acc.ultimoMesConCompra = mv.mes_ano;
    }
    if (mv.mes_ano && mv.mes_ano > acc.mesArrastre) {
      acc.mesArrastre = mv.mes_ano;
      if (mv.comercial) acc.comercial = mv.comercial;
      if (mv.preventista) acc.preventista = mv.preventista;
    }
  });

  const resultado = [];
  porCliente.forEach((acc) => {
    if (!acc.ultimoMesConCompra) return;
    const mesesSinComprar = mesesTranscurridosDesde(acc.ultimoMesConCompra, hoy);
    if (mesesSinComprar >= umbralMeses) {
      resultado.push({ ...acc, mesesSinComprar });
    }
  });
  return resultado.sort((a, b) => b.mesesSinComprar - a.mesesSinComprar);
}

// Cálculo completo de los 3 avisos para una ventana de `ventanaMeses` (3 o
// 6) terminando en `mesMasReciente` ('YYYY-MM', normalmente el mes más
// reciente con datos en `movimientos`). Devuelve { perdidos, caidas,
// inactivos } — cada fila incluye `comercial`/`preventista`/`id_distribuidor`
// (arrastrados) para poder "hablar con el comercial" sin tener que cruzar
// datos en otra pantalla.
export function calcularAvisosConsumo({ movimientos, ventanaMeses, mesMasReciente, umbralCaidaPct = UMBRAL_CAIDA_PCT_DEFECTO, hoy = new Date() }) {
  if (!mesMasReciente) return { perdidos: [], caidas: [], inactivos: [] };

  const mesesActual = generarVentanaMeses(mesMasReciente, ventanaMeses);
  const setMesesActual = new Set(mesesActual);
  const inicioPeriodoActual = mesesActual[mesesActual.length - 1];
  const setMesesAnterior = new Set(mesesActual.map(mesUnAnioAntes));

  const filas = agregarSellOutPorPeriodo({
    movimientos,
    campoId: 'id_cliente',
    campoNombre: 'nombre_cliente',
    campoDistinto: 'id_marca',
    prefijoDistintos: 'refs',
    setMesesActual,
    setMesesAnterior,
    inicioPeriodoActual,
    camposArrastre: ['comercial', 'preventista', 'id_distribuidor'],
  });

  const mapaMarcas = construirMapaMarcasPorCliente(movimientos);
  const conMarcas = (fila) => ({ ...fila, marcas: mapaMarcas.get(fila.id_cliente) || [] });

  const perdidos = filas.filter((f) => f.estado === 'perdido').map(conMarcas);
  const caidas = filas.filter((f) => f.estado === 'activo' && f.variacion !== null && f.variacion <= -umbralCaidaPct).map(conMarcas);
  const inactivos = detectarClientesInactivos(movimientos, ventanaMeses, hoy).map(conMarcas);

  return { perdidos, caidas, inactivos };
}
