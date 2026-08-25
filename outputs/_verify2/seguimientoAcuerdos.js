/*
 * seguimientoAcuerdos.js
 * Lógica pura de "Acuerdos con Clientes" (27/07/2026): cruza cada acuerdo
 * (colección `acuerdosClientes`, ver firebaseApi/acuerdosClientes.js) con el
 * consumo real del cliente (`movimientosSellOutClientes`) para saber cuántas
 * botellas lleva consumidas frente al volumen pactado.
 *
 * Reglas confirmadas con Sergio (a partir de sus 6 acuerdos reales de
 * ejemplo):
 *  - El volumen pactado es COMPARTIDO entre TODAS las referencias del
 *    acuerdo (se suman) — no hay un objetivo por marca, solo el total. Por
 *    eso `calcularConsumoAcuerdo` filtra movimientos por
 *    id_cliente + (id_marca esté entre las referencias del acuerdo) y suma
 *    TODO junto, aunque también devuelve el desglose por marca para que la
 *    pantalla pueda mostrarlo (útil para ver qué marca está tirando del
 *    consumo y cuál no).
 *  - Solo cuentan movimientos DENTRO de la vigencia del acuerdo (fecha real
 *    de la línea, no el mes de importación) — igual que el resto de
 *    comparativas de la app, se usa `mv.fecha` si existe y si no se cae a
 *    "primer día del mes" de `mv.mes_ano`.
 *  - Un acuerdo sin `id_cliente` (cliente nuevo, aún sin histórico
 *    importado) no tiene seguimiento automático — `vinculado: false`, la
 *    pantalla debe explicarlo en vez de mostrar 0% engañoso.
 */

// 'YYYY-MM-DD' de un objeto Date, en horario local (no UTC) — mismo criterio
// que el resto de la app para fechas sueltas (sin componente de hora).
export function fechaISO(fecha) {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Fecha 'YYYY-MM-DD' que representa a un movimiento de Sell-Out Clientes:
// la fecha real de la línea si el archivo la traía, o el primer día del mes
// elegido a mano si no.
export function fechaEfectivaMovimiento(mv) {
  if (mv?.fecha) return mv.fecha;
  if (mv?.mes_ano) return `${mv.mes_ano}-01`;
  return null;
}

// Compara strings 'YYYY-MM-DD' directamente (funciona por ser formato ISO):
// dentro de [inicio, fin], con extremos abiertos si el acuerdo no los trae.
export function estaDentroDeVigencia(fechaEfectiva, inicio, fin) {
  if (!fechaEfectiva) return false;
  if (inicio && fechaEfectiva < inicio) return false;
  if (fin && fechaEfectiva > fin) return false;
  return true;
}

// Consumo real de UN acuerdo, cruzando sus referencias + vigencia contra el
// histórico completo de movimientos (ya se filtra aquí, no hace falta que
// quien llama pre-filtre por cliente). `movimientos` puede venir con
// clientes/marcas distintas del acuerdo sin problema, se ignoran.
export function calcularConsumoAcuerdo({ acuerdo, movimientos }) {
  const idsMarca = new Set((acuerdo?.referencias || []).map((r) => r.id_marca).filter(Boolean));
  const objetivo = Number(acuerdo?.volumen_objetivo_botellas) || 0;

  if (!acuerdo?.id_cliente || idsMarca.size === 0) {
    return {
      vinculado: !!acuerdo?.id_cliente,
      totalConsumido: 0,
      objetivo,
      pctCumplimiento: null,
      cumplido: false,
      porMarca: [],
    };
  }

  const porMarca = new Map(); // id_marca -> { id_marca, nombre_marca, uds }
  let totalConsumido = 0;

  (movimientos || []).forEach((mv) => {
    if (mv.id_cliente !== acuerdo.id_cliente) return;
    if (!idsMarca.has(mv.id_marca)) return;
    const fechaEfectiva = fechaEfectivaMovimiento(mv);
    if (!estaDentroDeVigencia(fechaEfectiva, acuerdo.vigencia_inicio, acuerdo.vigencia_fin)) return;

    const uds = mv.uds_totales || 0;
    totalConsumido += uds;
    let acc = porMarca.get(mv.id_marca);
    if (!acc) {
      acc = { id_marca: mv.id_marca, nombre_marca: mv.nombre_marca || mv.id_marca, uds: 0 };
      porMarca.set(mv.id_marca, acc);
    }
    if (mv.nombre_marca) acc.nombre_marca = mv.nombre_marca;
    acc.uds += uds;
  });

  const pctCumplimiento = objetivo > 0 ? (totalConsumido / objetivo) * 100 : null;
  const cumplido = objetivo > 0 && totalConsumido >= objetivo;

  return {
    vinculado: true,
    totalConsumido,
    objetivo,
    pctCumplimiento,
    cumplido,
    porMarca: Array.from(porMarca.values()).sort((a, b) => b.uds - a.uds),
  };
}

// Estado temporal del acuerdo respecto a hoy: 'proximo' (aún no ha empezado),
// 'vigente' o 'finalizado'. Extremos vacíos se tratan como abiertos (un
// acuerdo sin fecha de fin nunca "finaliza" solo).
export function calcularEstadoVigencia(acuerdo, hoy = new Date()) {
  const hoyStr = fechaISO(hoy);
  const inicio = acuerdo?.vigencia_inicio || '';
  const fin = acuerdo?.vigencia_fin || '';
  if (inicio && hoyStr < inicio) return 'proximo';
  if (fin && hoyStr > fin) return 'finalizado';
  return 'vigente';
}

// Días naturales que quedan hasta el fin de vigencia (negativo si ya pasó).
// null si el acuerdo no tiene fecha de fin.
export function diasHastaFin(acuerdo, hoy = new Date()) {
  if (!acuerdo?.vigencia_fin) return null;
  const fin = new Date(`${acuerdo.vigencia_fin}T00:00:00`);
  const inicioDelDia = new Date(fechaISO(hoy) + 'T00:00:00');
  return Math.round((fin.getTime() - inicioDelDia.getTime()) / 86400000);
}
