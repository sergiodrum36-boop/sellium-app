/*
 * agregacionSellOutPorPeriodo.js
 * Agregación de movimientos de Sell-Out por Cliente Final comparando dos
 * periodos (el "actual" y el "anterior" que elige PeriodoComparador).
 *
 * Compartido entre DashboardSellOutClientes.js (agrupa por cliente y cuenta
 * marcas distintas) y DashboardSellOutMarcas.js (agrupa por marca y cuenta
 * clientes distintos): hasta ahora cada uno tenía su propia copia casi
 * idéntica de este bucle, y ya se había visto lo que pasa cuando se
 * desincronizan (el bug de julio de 2026 que se describe más abajo se
 * arregló primero solo en Clientes). Mismo motivo por el que en su día se
 * centralizaron formatearPeriodo.js/FilaComparativa.js/uiClasses.js.
 *
 * Función PURA a propósito: ni React ni Firestore, solo datos de entrada y
 * un array de filas de salida — así se puede probar con Jest sin montar
 * nada (ver agregacionSellOutPorPeriodo.test.js).
 *
 * Estados (mismo concepto en las dos pantallas, ver cabecera de cada una):
 *   activo:     hubo actividad en el periodo actual Y en el de comparación.
 *   nuevo:      hay actividad ahora y nunca antes (ni en el de comparación
 *               ni en ningún mes anterior con datos en la app).
 *   recuperado: hay actividad ahora, no en el de comparación, pero sí en
 *               algún mes anterior al inicio del periodo actual.
 *   perdido:    hubo actividad en el de comparación y ninguna ahora.
 * Solo se devuelven entidades con actividad en alguno de los dos periodos:
 * una entidad sin ninguna de las dos no aporta nada a esta comparativa.
 */

/**
 * @param {object} opciones
 * @param {Array}  opciones.movimientos       Movimientos ya filtrados (o no) por quien llama.
 * @param {string} opciones.campoId           Campo por el que agrupar: 'id_cliente' | 'id_marca'.
 * @param {string} opciones.campoNombre       Campo de nombre a copiar a la fila: 'nombre_cliente' | 'nombre_marca'.
 * @param {string} opciones.campoDistinto     Campo de "la otra dimensión" a contar distinta: 'id_marca' | 'id_cliente'.
 * @param {string} opciones.prefijoDistintos  Prefijo de las dos claves de salida de ese conteo
 *                                            ('refs' -> refsActual/refsAnterior en Clientes;
 *                                             'clientes' -> clientesActual/clientesAnterior en Marcas).
 *                                            Es un parámetro y no un nombre fijo porque cada pantalla
 *                                            ya mostraba esas columnas con su propio nombre y este
 *                                            refactor no debe cambiar nada de lo que ve Sergio.
 * @param {Set<string>} opciones.setMesesActual    Meses 'YYYY-MM' del periodo actual.
 * @param {Set<string>} opciones.setMesesAnterior  Meses 'YYYY-MM' del periodo de comparación.
 * @param {string} opciones.inicioPeriodoActual    Mes 'YYYY-MM' más antiguo del periodo actual.
 * @param {string[]} [opciones.camposArrastre]     Campos a arrastrar por "mes_ano más reciente visto".
 * @returns {Array<object>} filas ordenadas por udsActual descendente.
 */
export function agregarSellOutPorPeriodo({
  movimientos,
  campoId,
  campoNombre,
  campoDistinto,
  prefijoDistintos,
  setMesesActual,
  setMesesAnterior,
  inicioPeriodoActual,
  camposArrastre
}) {
  const arrastre = camposArrastre || [];
  const claveDistintosActual = `${prefijoDistintos}Actual`;
  const claveDistintosAnterior = `${prefijoDistintos}Anterior`;

  const porEntidad = new Map(); // valor de campoId -> acumulador

  (movimientos || []).forEach(mv => {
    const idEntidad = mv[campoId];
    if (!idEntidad) return;
    let acc = porEntidad.get(idEntidad);
    if (!acc) {
      acc = {
        id: idEntidad,
        nombre: mv[campoNombre],
        udsActual: 0,
        udsAnterior: 0,
        facturacionActual: 0,
        facturacionAnterior: 0,
        distintosActual: new Set(),
        distintosAnterior: new Set(),
        huboAntes: false, // alguna actividad antes del inicio del periodo actual, fuera del propio periodo de comparación
        ultimaFecha: null,
        mesArrastre: '', // uso interno, ver comentario del bloque de arrastre
        arrastrados: {}
      };
      // Vacío y no undefined: la fila que se pinta espera cadenas (se
      // muestran con `|| '—'`) y los filtros comparan por igualdad exacta.
      arrastre.forEach(campo => { acc.arrastrados[campo] = ''; });
      porEntidad.set(idEntidad, acc);
    }
    if (mv[campoNombre]) acc.nombre = mv[campoNombre];

    const uds = mv.uds_totales || 0;
    const facturacion = mv.facturacion_euros || 0;
    if (setMesesActual.has(mv.mes_ano)) {
      acc.udsActual += uds;
      acc.facturacionActual += facturacion;
      if (uds !== 0 && mv[campoDistinto]) acc.distintosActual.add(mv[campoDistinto]);
    } else if (setMesesAnterior.has(mv.mes_ano)) {
      acc.udsAnterior += uds;
      acc.facturacionAnterior += facturacion;
      if (uds !== 0 && mv[campoDistinto]) acc.distintosAnterior.add(mv[campoDistinto]);
    } else if (mv.mes_ano && inicioPeriodoActual && mv.mes_ano < inicioPeriodoActual) {
      if (uds !== 0) acc.huboAntes = true;
    }

    // Campos "de la entidad" (Zona/Preventista/Tipología en Clientes): se
    // toman del movimiento MÁS RECIENTE de esa entidad, sea del periodo que
    // sea — NO solo del periodo actual (bug corregido 2026-07-19, a raíz de
    // que Sergio detectó que la Facturación total salía en negativo pero
    // cada Zona filtrada por separado salía en positivo). Antes, un cliente
    // "Perdido" — solo tiene movimientos en el periodo ANTERIOR, ninguno en
    // el actual — se quedaba con comercial/preventista en blanco (nunca
    // entraba en la rama de "periodo actual", la única que los rellenaba).
    // Eso hacía que desapareciera de CUALQUIER filtro de Zona/Preventista
    // concreto (comercial === '' no coincide con ningún código), pero SÍ
    // seguía contando en el total sin filtrar — así que los clientes
    // perdidos (que solo restan facturación) quedaban invisibles al mirar
    // zona por zona y el total salía peor que la suma de las zonas. Usar
    // mes_ano (siempre presente) en vez de acc.ultimaFecha evita depender de
    // que el campo fecha esté relleno.
    if (arrastre.length > 0 && mv.mes_ano && mv.mes_ano > acc.mesArrastre) {
      acc.mesArrastre = mv.mes_ano;
      arrastre.forEach(campo => { if (mv[campo]) acc.arrastrados[campo] = mv[campo]; });
    }

    if (mv.fecha && (!acc.ultimaFecha || mv.fecha > acc.ultimaFecha)) acc.ultimaFecha = mv.fecha;
  });

  const filas = [];
  porEntidad.forEach(acc => {
    const huboActual = acc.udsActual > 0;
    const huboPrevio = acc.udsAnterior > 0;
    if (!huboActual && !huboPrevio) return; // sin actividad relevante en ninguno de los dos periodos

    let estado;
    if (huboActual && huboPrevio) estado = 'activo';
    else if (huboActual && !huboPrevio && !acc.huboAntes) estado = 'nuevo';
    else if (huboActual && !huboPrevio && acc.huboAntes) estado = 'recuperado';
    else estado = 'perdido';

    const variacion = acc.udsAnterior > 0
      ? ((acc.udsActual - acc.udsAnterior) / acc.udsAnterior) * 100
      : (acc.udsActual > 0 ? null : 0); // null = "no aplica" (no había base el año pasado)

    const variacionEuros = acc.facturacionAnterior > 0
      ? ((acc.facturacionActual - acc.facturacionAnterior) / acc.facturacionAnterior) * 100
      : (acc.facturacionActual > 0 ? null : 0);

    const fila = {
      [campoId]: acc.id,
      [campoNombre]: acc.nombre,
      udsActual: acc.udsActual,
      udsAnterior: acc.udsAnterior,
      variacion,
      facturacionActual: acc.facturacionActual,
      facturacionAnterior: acc.facturacionAnterior,
      variacionEuros,
      [claveDistintosActual]: acc.distintosActual.size,
      [claveDistintosAnterior]: acc.distintosAnterior.size,
      estado,
      ultimaFecha: acc.ultimaFecha
    };
    arrastre.forEach(campo => { fila[campo] = acc.arrastrados[campo]; });
    filas.push(fila);
  });

  return filas.sort((a, b) => b.udsActual - a.udsActual);
}
