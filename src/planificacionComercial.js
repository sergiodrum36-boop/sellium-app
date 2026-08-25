/*
 * planificacionComercial.js
 * Lógica pura de "Planificación Comercial" — el módulo que Sergio pidió justo
 * después de terminar la Estructura Comercial: "una vez asignado comercial y
 * criterio de cada distribuidor, debería tener una opción de crear calendario
 * de visitas según criterio" (26/07/2026).
 *
 * Decisiones confirmadas con Sergio (AskUserQuestion, mismo día):
 *  - El trimestre es SIEMPRE trimestre natural (Q1 ene-mar, Q2 abr-jun,
 *    Q3 jul-sep, Q4 oct-dic), no un trimestre "móvil" desde la fecha de hoy.
 *  - Por ahora son días sueltos: cada visita ocupa un día, sin agrupar por
 *    ruta/zona ni reservar varios días seguidos para un mismo distribuidor.
 *  - Solo días laborables de lunes a viernes (fines de semana nunca se
 *    proponen).
 *  - Un mismo comercial nunca tiene dos visitas el mismo día (no hay reparto
 *    de "rutas" todavía); pero SÍ pueden coincidir en la misma fecha dos
 *    comerciales distintos, cada uno con su propio distribuidor — no hay
 *    ningún recurso compartido entre comerciales en este modelo.
 *
 * CAMBIO DE MODELO (26/07/2026, mismo día, tras verlo fallar con datos
 * reales): la primera versión calculaba el nº de visitas de CADA
 * distribuidor de forma aislada, a partir de un "frecuencia_dias" (días
 * entre visitas) fijo de su criterio — round(diasTrimestre / frecuencia).
 * Esto se rompía en cuanto pocos distribuidores compartían un criterio con
 * una frecuencia agresiva: cada uno pedía igualmente muchas visitas SIN
 * enterarse de que había pocos compañeros de criterio, y entre 2-3
 * distribuidores acababan acaparando el trimestre entero (Sergio lo detectó
 * con capturas reales: 2 distribuidores en criterio "C" ocupando TODOS los
 * días laborables de julio, alternándose).
 *
 * El modelo nuevo, confirmado con Sergio: cada criterio tiene un
 * `porcentaje_trimestre` — el % de los días laborables del trimestre que le
 * corresponde a ESE criterio dentro de la cartera de un comercial. Ese
 * "presupuesto de días" se calcula UNA VEZ por criterio (no por
 * distribuidor) y se reparte entre TODOS los distribuidores que lo tengan
 * asignado, proporcional a su peso de facturación (importe) dentro de ese
 * mismo grupo — si nadie del grupo factura nada (importe 0 para todos), se
 * reparte a partes iguales. Así, tener más distribuidores en un mismo
 * criterio no aumenta el total de días que le tocan a ese criterio, solo
 * afina cómo se reparten entre ellos.
 *
 * CAMBIO 2 (mismo día, 26/07/2026, a petición de Sergio): "necesito que cada
 * distribuidor se agrege por semana en dias seguidos y que pueda
 * seleccionarlo todo por si lo tengo que mover de una semana a la otra." La
 * decisión de "días sueltos" de más arriba queda SUSTITUIDA: los días
 * totales de un distribuidor ya no se reparten uno a uno por todo el
 * trimestre, se agrupan en BLOQUES de días laborables CONSECUTIVOS (máximo
 * `MAX_DIAS_POR_BLOQUE` = 5, una semana laboral completa como mucho —
 * confirmado con Sergio vía AskUserQuestion) y esos bloques sí se reparten
 * uniformemente a lo largo del trimestre (mismo espíritu de reparto uniforme
 * que antes, pero por bloque en vez de por día suelto). Cada visita generada
 * lleva un `id_bloque` común a todos los días de su mismo bloque — la
 * pantalla lo usa para resaltar el bloque entero al hacer clic en cualquiera
 * de sus días y para moverlos TODOS juntos (mismo desplazamiento, en
 * múltiplos de 7 días para no salirse de días laborables) cuando se arrastra
 * uno de ellos a otra semana (ver CalendarioVisitas.js y
 * firebaseApi/planificacionComercial.js → moverBloqueVisitas).
 *
 * Esto es una PROPUESTA de calendario, no una reserva definitiva: la
 * pantalla permite regenerar y luego "cerrar" cada visita (fecha real,
 * hecha/pendiente, nota) — ver PantallaPlanificacionComercial.js.
 */

// Trimestre natural: 1=ene-mar, 2=abr-jun, 3=jul-sep, 4=oct-dic.
// Devuelve fechas en UTC a medianoche para evitar líos de huso horario al
// comparar/iterar días.
export const obtenerRangoTrimestreNatural = (anio, trimestre) => {
  const anioNum = Number(anio);
  const trimestreNum = Number(trimestre);
  if (![1, 2, 3, 4].includes(trimestreNum)) {
    throw new Error(`Trimestre inválido: ${trimestre}. Debe ser 1, 2, 3 o 4.`);
  }
  const mesInicio = (trimestreNum - 1) * 3;
  const inicio = new Date(Date.UTC(anioNum, mesInicio, 1));
  // Día 0 del mes siguiente al último del trimestre = último día del trimestre.
  const fin = new Date(Date.UTC(anioNum, mesInicio + 3, 0));
  return { inicio, fin };
};

// Lista de días laborables (lunes a viernes) entre dos fechas, ambas
// incluidas. Devuelve objetos Date nuevos (no reutiliza el cursor interno).
export const diasHabilesEntre = (inicio, fin) => {
  const dias = [];
  if (!inicio || !fin || inicio > fin) return dias;
  const cursor = new Date(inicio);
  while (cursor <= fin) {
    const diaSemana = cursor.getUTCDay(); // 0=domingo, 6=sábado
    if (diaSemana !== 0 && diaSemana !== 6) {
      dias.push(new Date(cursor));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dias;
};

// Tamaño máximo de un bloque de días consecutivos para un mismo distribuidor
// (26/07/2026, confirmado con Sergio: "bloques de hasta 5 días seguidos" —
// una semana laboral completa como mucho).
export const MAX_DIAS_POR_BLOQUE = 5;

// Reparte `totalDias` en bloques lo más equilibrados posible, cada uno de
// como mucho `maxBloque` días — p.ej. dividirEnBloques(26, 5) -> [5,5,4,4,4,4]
// (nunca [5,5,5,5,5,1]: un bloque de 1 día suelto al final no cumple "días
// seguidos" de forma útil). Si totalDias cabe entero en un solo bloque
// (<= maxBloque), devuelve un único bloque sin fragmentar innecesariamente.
export const dividirEnBloques = (totalDias, maxBloque = MAX_DIAS_POR_BLOQUE) => {
  if (!totalDias || totalDias <= 0) return [];
  const limite = Math.max(1, maxBloque);
  const numBloques = Math.ceil(totalDias / limite);
  const base = Math.floor(totalDias / numBloques);
  const resto = totalDias % numBloques;
  const bloques = [];
  for (let i = 0; i < numBloques; i++) {
    bloques.push(base + (i < resto ? 1 : 0));
  }
  return bloques;
};

// Busca el hueco de `longitud` índices CONSECUTIVOS y libres más cercano a
// `posicionIdeal` (el índice de inicio del bloque), explorando hacia ambos
// lados igual que buscarIndiceLibreMasCercano. Devuelve -1 si no cabe ningún
// bloque de esa longitud en todo el rango.
const buscarBloqueLibreMasCercano = (posicionIdeal, ocupados, total, longitud) => {
  if (total <= 0 || longitud <= 0 || longitud > total) return -1;
  const maxInicio = total - longitud;
  let base = posicionIdeal;
  if (base > maxInicio) base = maxInicio;
  if (base < 0) base = 0;
  const bloqueLibre = (inicio) => {
    for (let k = 0; k < longitud; k++) {
      if (ocupados.has(inicio + k)) return false;
    }
    return true;
  };
  if (bloqueLibre(base)) return base;
  for (let delta = 1; delta <= maxInicio; delta++) {
    const derecha = base + delta;
    const izquierda = base - delta;
    if (derecha <= maxInicio && bloqueLibre(derecha)) return derecha;
    if (izquierda >= 0 && bloqueLibre(izquierda)) return izquierda;
  }
  return -1;
};

// Nº de días laborables del trimestre que le corresponden a un criterio,
// a partir de su porcentaje_trimestre (0-100). Es el "presupuesto de días"
// que luego se reparte entre TODOS los distribuidores de ese criterio (ver
// repartirVisitasPorImporte) — no es el número de visitas de nadie en
// particular todavía.
export const calcularDiasDelCriterio = (porcentajeTrimestre, totalDiasHabiles) => {
  if (!porcentajeTrimestre || porcentajeTrimestre <= 0 || !totalDiasHabiles) return 0;
  return Math.max(0, Math.round((totalDiasHabiles * porcentajeTrimestre) / 100));
};

// Reparte el "presupuesto de días" de un criterio (diasDelCriterio) entre
// los distribuidores que lo tienen (todos del MISMO comercial y MISMO
// criterio), proporcional a su `importe` — si ninguno factura nada (o no se
// pasó `importe`), se reparte a partes iguales en vez de dar 0 a todos.
// Devuelve el mismo array con `numVisitas` añadido (redondeado, puede ser 0
// si el reparto le toca una fracción muy pequeña — se filtra fuera por
// quien llame).
export const repartirVisitasPorImporte = (distribuidores, diasDelCriterio) => {
  const lista = distribuidores || [];
  if (lista.length === 0 || !diasDelCriterio || diasDelCriterio <= 0) {
    return lista.map((d) => ({ ...d, numVisitas: 0 }));
  }
  const totalImporte = lista.reduce((suma, d) => suma + (d.importe || 0), 0);
  return lista.map((d) => {
    const peso = totalImporte > 0 ? (d.importe || 0) / totalImporte : 1 / lista.length;
    return { ...d, numVisitas: Math.max(0, Math.round(diasDelCriterio * peso)) };
  });
};

// Calcula, PARA CADA DISTRIBUIDOR, cuántos días de visita le corresponden en
// el trimestre según su criterio (% compartido) e importe — el mismo cálculo
// que hace generarCalendarioVisitas antes de colocar los días en el
// calendario, pero sin colocar nada: solo el número "teórico" objetivo.
// 26/07/2026, a petición de Sergio ("Agenda Comercial" independiente del
// generador automático, con una tabla de "% de acierto" al lado del
// calendario): necesita el objetivo de cada distribuidor para compararlo con
// lo que realmente ha metido a mano en la Agenda. Misma agrupación por
// (comercial, criterio) que generarCalendarioVisitas — si esa lógica cambia,
// mantener las dos en sincronía. Devuelve Map(id_distribuidor -> numVisitas).
export const calcularDiasTeoricosPorDistribuidor = (asignaciones, criteriosPorId, totalDiasHabiles) => {
  const grupos = new Map(); // clave "idComercial idCriterio" -> asignaciones[]
  (asignaciones || []).forEach((a) => {
    if (!a || !a.id_criterio) return;
    const criterio = criteriosPorId ? criteriosPorId.get(a.id_criterio) : null;
    if (!criterio || criterio.sin_visita || !criterio.porcentaje_trimestre) return;
    const clave = `${a.id_comercial} ${a.id_criterio}`;
    const lista = grupos.get(clave) || [];
    lista.push({ ...a, porcentaje_trimestre: criterio.porcentaje_trimestre });
    grupos.set(clave, lista);
  });

  const resultado = new Map();
  grupos.forEach((distribuidoresDelGrupo) => {
    const diasDelCriterio = calcularDiasDelCriterio(distribuidoresDelGrupo[0].porcentaje_trimestre, totalDiasHabiles);
    repartirVisitasPorImporte(distribuidoresDelGrupo, diasDelCriterio).forEach((d) => {
      resultado.set(d.id_distribuidor, d.numVisitas);
    });
  });
  return resultado;
};

// Genera `cantidadDias` fechas de días LABORABLES consecutivos empezando en
// `fechaInicioTexto` ("YYYY-MM-DD") — para la alta manual de visitas en
// Agenda Comercial (Sergio, 26/07/2026: "poder seleccionar el distribuidor y
// ponerle los días que yo seleccione", independiente del generador
// automático). Si `fechaInicioTexto` cae en fin de semana, empieza a contar
// desde el primer día laborable siguiente (no lanza error: el formulario que
// llama a esto ya avisa antes de intentarlo, pero esta función nunca rompe).
export const generarDiasHabilesConsecutivosDesde = (fechaInicioTexto, cantidadDias) => {
  const dias = [];
  if (!fechaInicioTexto || !cantidadDias || cantidadDias <= 0) return dias;
  const cursor = new Date(`${fechaInicioTexto}T00:00:00Z`);
  // Límite de seguridad generoso (nunca hacen falta más de unas pocas
  // semanas de margen para encontrar N días laborables) para que un valor
  // raro de entrada no deje esto en un bucle infinito.
  let intentos = 0;
  while (dias.length < cantidadDias && intentos < cantidadDias * 3 + 14) {
    const diaSemana = cursor.getUTCDay();
    if (diaSemana !== 0 && diaSemana !== 6) dias.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    intentos += 1;
  }
  return dias;
};

/*
 * Genera el calendario de visitas propuesto para un trimestre natural.
 *
 * asignaciones: array de { id_comercial, id_distribuidor, id_criterio,
 *   importe } — el `importe` (facturación/peso dentro de la cartera, ver
 *   calcularCarteraComercial en clasificacionComercial.js) es opcional pero
 *   MUY recomendable: sin él, todos los distribuidores de un mismo criterio
 *   se reparten sus días a partes iguales. Las asignaciones sin id_criterio
 *   (todavía sin clasificar) se ignoran silenciosamente.
 * criteriosPorId: Map(id_criterio -> { porcentaje_trimestre, sin_visita }) —
 *   construir con `new Map(criterios.map(c => [c.id, c]))` antes de llamar.
 *   Un criterio con `sin_visita: true` (26/07/2026, criterio "F" de Sergio:
 *   distribuidores gestionados solo por teléfono/promoción, nunca con
 *   visita física) se excluye SIEMPRE de la planificación, tenga o no
 *   `porcentaje_trimestre` — no es un caso de "criterio incompleto", es una
 *   categoría legítima de "no le toca calendario".
 * anio, trimestre: 1-4, ver obtenerRangoTrimestreNatural.
 *
 * Algoritmo (determinista):
 *  1. Calcula los días laborables del trimestre (compartidos por todos los
 *     comerciales, cada uno lleva su propia ocupación).
 *  2. Agrupa las asignaciones por (comercial, criterio). Para cada grupo,
 *     calcula el "presupuesto de días" del criterio (calcularDiasDelCriterio)
 *     y lo reparte entre los distribuidores de ESE grupo según su importe
 *     (repartirVisitasPorImporte) — este es el paso que evita que pocos
 *     distribuidores de un criterio "agresivo" acaparen el trimestre: el
 *     presupuesto total no cambia aunque haya 2 o 20 distribuidores en el
 *     mismo criterio, solo cambia cómo se reparte entre ellos.
 *  3. Para cada comercial, junta los distribuidores de TODOS sus grupos de
 *     criterio y los procesa en orden de MÁS días totales a MENOS (los que
 *     necesitan más huecos son los más restringidos, van primero).
 *  4. El total de días de cada distribuidor se divide en BLOQUES de días
 *     consecutivos (dividirEnBloques, máximo MAX_DIAS_POR_BLOQUE = 5 — una
 *     semana laboral completa como mucho). Cada bloque j (0-indexed) de N
 *     bloques totales se coloca en torno a una posición ideal repartida
 *     uniformemente en el trimestre: round((j + 0.5) * totalDiasHabiles / N).
 *  5. Busca el primer hueco de días CONSECUTIVOS libres (que ese comercial no
 *     tenga ya ocupados) más cercano a esa posición ideal. Si el bloque
 *     completo no cabe en ningún sitio, se reintenta con un bloque más
 *     pequeño (longitud-1, longitud-2, ... hasta 1 día) antes de descartarlo
 *     del todo — así un trimestre muy apretado degrada el tamaño del bloque
 *     en vez de perder la visita entera.
 *  6. Todos los días de un mismo bloque comparten `id_bloque` (para que la
 *     pantalla los seleccione/mueva juntos) y llevan `dia_bloque`/
 *     `longitud_bloque` (posición dentro del bloque y tamaño total).
 *
 * Devuelve un array ordenado por fecha (y luego por id_comercial) de:
 *   { id_comercial, id_distribuidor, id_criterio, fecha (Date), numero_visita,
 *     id_bloque, dia_bloque, longitud_bloque }
 */
export const generarCalendarioVisitas = (asignaciones, criteriosPorId, anio, trimestre) => {
  const { inicio, fin } = obtenerRangoTrimestreNatural(anio, trimestre);
  const diasHabiles = diasHabilesEntre(inicio, fin);

  // Agrupar por (comercial, criterio) — el presupuesto de días de un
  // criterio se calcula y reparte DENTRO de cada comercial por separado,
  // igual que la participación/cartera (nunca se mezcla entre comerciales).
  const grupos = new Map(); // clave "idComercial idCriterio" -> asignaciones[]
  (asignaciones || []).forEach((a) => {
    if (!a || !a.id_criterio) return;
    const criterio = criteriosPorId ? criteriosPorId.get(a.id_criterio) : null;
    if (!criterio || criterio.sin_visita || !criterio.porcentaje_trimestre) return;
    const clave = `${a.id_comercial} ${a.id_criterio}`;
    const lista = grupos.get(clave) || [];
    lista.push({ ...a, porcentaje_trimestre: criterio.porcentaje_trimestre });
    grupos.set(clave, lista);
  });

  const porComercial = new Map(); // idComercial -> distribuidores[] (con numVisitas ya calculado)
  grupos.forEach((distribuidoresDelGrupo, clave) => {
    const idComercial = clave.split(' ')[0];
    const diasDelCriterio = calcularDiasDelCriterio(distribuidoresDelGrupo[0].porcentaje_trimestre, diasHabiles.length);
    const conVisitas = repartirVisitasPorImporte(distribuidoresDelGrupo, diasDelCriterio).filter((d) => d.numVisitas > 0);
    const listaComercial = porComercial.get(idComercial) || [];
    porComercial.set(idComercial, listaComercial.concat(conVisitas));
  });

  const resultado = [];

  porComercial.forEach((distribuidores, idComercial) => {
    const ocupados = new Set(); // índices de diasHabiles ya usados por ESTE comercial
    const ordenados = [...distribuidores].sort((a, b) => b.numVisitas - a.numVisitas);

    ordenados.forEach((d) => {
      const bloques = dividirEnBloques(d.numVisitas, MAX_DIAS_POR_BLOQUE);
      let numeroVisita = 0;

      bloques.forEach((longitudBloque, j) => {
        const centroIdeal = Math.round(((j + 0.5) * diasHabiles.length) / bloques.length);

        // Degradación gradual: si el bloque completo no cabe en ningún
        // hueco libre, se reintenta con un bloque un día más corto (sigue
        // siendo "días seguidos", solo más pequeño) antes de descartarlo.
        let inicio = -1;
        let longitudColocada = 0;
        for (let intento = longitudBloque; intento >= 1; intento--) {
          const inicioIdeal = centroIdeal - Math.floor(intento / 2);
          const candidato = buscarBloqueLibreMasCercano(inicioIdeal, ocupados, diasHabiles.length, intento);
          if (candidato !== -1) {
            inicio = candidato;
            longitudColocada = intento;
            break;
          }
        }
        if (inicio === -1) return; // ni siquiera cabe 1 día suelto: se descarta este bloque

        const idBloque = `${idComercial}_${d.id_distribuidor}_${j}`;
        for (let k = 0; k < longitudColocada; k++) {
          const indice = inicio + k;
          ocupados.add(indice);
          numeroVisita += 1;
          resultado.push({
            id_comercial: idComercial,
            id_distribuidor: d.id_distribuidor,
            id_criterio: d.id_criterio,
            fecha: diasHabiles[indice],
            numero_visita: numeroVisita,
            id_bloque: idBloque,
            dia_bloque: k + 1,
            longitud_bloque: longitudColocada,
          });
        }
      });
    });
  });

  resultado.sort((a, b) => {
    const porFecha = a.fecha.getTime() - b.fecha.getTime();
    if (porFecha !== 0) return porFecha;
    return String(a.id_comercial).localeCompare(String(b.id_comercial));
  });

  return resultado;
};
