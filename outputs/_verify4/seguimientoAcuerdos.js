export function fechaISO(fecha) {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
export function fechaEfectivaMovimiento(mv) {
  if (mv?.fecha) return mv.fecha;
  if (mv?.mes_ano) return `${mv.mes_ano}-01`;
  return null;
}
export function estaDentroDeVigencia(fechaEfectiva, inicio, fin) {
  if (!fechaEfectiva) return false;
  if (inicio && fechaEfectiva < inicio) return false;
  if (fin && fechaEfectiva > fin) return false;
  return true;
}
export function calcularConsumoAcuerdo({ acuerdo, movimientos }) {
  const idsMarca = new Set((acuerdo?.referencias || []).map((r) => r.id_marca).filter(Boolean));
  const objetivo = Number(acuerdo?.volumen_objetivo_botellas) || 0;
  if (!acuerdo?.id_cliente || idsMarca.size === 0) {
    return { vinculado: !!acuerdo?.id_cliente, totalConsumido: 0, objetivo, pctCumplimiento: null, cumplido: false, porMarca: [] };
  }
  const porMarca = new Map();
  let totalConsumido = 0;
  (movimientos || []).forEach((mv) => {
    if (mv.id_cliente !== acuerdo.id_cliente) return;
    if (!idsMarca.has(mv.id_marca)) return;
    const fechaEfectiva = fechaEfectivaMovimiento(mv);
    if (!estaDentroDeVigencia(fechaEfectiva, acuerdo.vigencia_inicio, acuerdo.vigencia_fin)) return;
    const uds = mv.uds_totales || 0;
    totalConsumido += uds;
    let acc = porMarca.get(mv.id_marca);
    if (!acc) { acc = { id_marca: mv.id_marca, nombre_marca: mv.nombre_marca || mv.id_marca, uds: 0 }; porMarca.set(mv.id_marca, acc); }
    if (mv.nombre_marca) acc.nombre_marca = mv.nombre_marca;
    acc.uds += uds;
  });
  const pctCumplimiento = objetivo > 0 ? (totalConsumido / objetivo) * 100 : null;
  const cumplido = objetivo > 0 && totalConsumido >= objetivo;
  return { vinculado: true, totalConsumido, objetivo, pctCumplimiento, cumplido, porMarca: Array.from(porMarca.values()).sort((a, b) => b.uds - a.uds) };
}
export function calcularEstadoVigencia(acuerdo, hoy = new Date()) {
  const hoyStr = fechaISO(hoy);
  const inicio = acuerdo?.vigencia_inicio || '';
  const fin = acuerdo?.vigencia_fin || '';
  if (inicio && hoyStr < inicio) return 'proximo';
  if (fin && hoyStr > fin) return 'finalizado';
  return 'vigente';
}
export function diasHastaFin(acuerdo, hoy = new Date()) {
  if (!acuerdo?.vigencia_fin) return null;
  const fin = new Date(`${acuerdo.vigencia_fin}T00:00:00`);
  const inicioDelDia = new Date(fechaISO(hoy) + 'T00:00:00');
  return Math.round((fin.getTime() - inicioDelDia.getTime()) / 86400000);
}
export function calcularSiguienteNumeroPropuesta(acuerdos, anio) {
  let max = 0;
  (acuerdos || []).forEach((a) => {
    const partes = String(a?.numero || '').split('/');
    if (partes.length === 2 && Number(partes[1]) === anio) {
      const n = parseInt(partes[0], 10);
      if (!isNaN(n) && n > max) max = n;
    }
  });
  return `${String(max + 1).padStart(3, '0')}/${anio}`;
}
