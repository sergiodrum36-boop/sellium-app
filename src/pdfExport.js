/*
 * pdfExport.js
 * Helper compartido para generar PDFs desde los dashboards (Dashboard de
 * Gestión, Dashboard A&P Visión Compañía, Dashboard de Ventas Reales), a
 * petición de Sergio. jsPDF y jspdf-autotable ya estaban instalados como
 * dependencias del proyecto pero sin usarse en ningún sitio.
 *
 * A diferencia de las exportaciones a Excel que ya existían en la app
 * (todas vuelcan el detalle línea a línea del histórico filtrado — ver
 * handleExportarExcel en Historico.js, HistoricoSellIn.js, ControlAP.js,
 * ControlAPVisionComercial.js, DashboardVentasReales.js), estos PDFs no
 * son un volcado línea a línea (para eso ya está "Exportar a Excel" en
 * las pantallas que lo tienen) — son un INFORME de las mismas tablas y
 * desgloses que ya se ven en pantalla (KPIs + por Marca + composición del
 * gasto + por Distribuidor + evolución mensual, según la pantalla).
 *
 * CAMBIO (2026-08-26, a petición de Sergio: "la exportación debería ser
 * mucho más detallada... como un pequeño informe, con sus tablas donde se
 * vea realmente lo que se ha exportado"): el PDF de
 * PantallaDashboardAPCompania.js era solo la tabla de 6 KPIs, sin ningún
 * desglose ni indicación de qué Distribuidor/Marca/Periodo estaba
 * filtrado — si Sergio lo exportaba con una marca concreta seleccionada
 * (p.ej. para mandarle un resumen a alguien sobre ESA marca), el PDF no
 * lo reflejaba en ningún sitio. Se añaden aquí los helpers genéricos para
 * que cualquier dashboard pueda construir un informe multi-sección:
 * `añadirTituloSeccion` (título de tabla, con salto de página si no cabe),
 * `añadirTablaGenerica` (tabla de cabecera+cuerpo ya formateados, mismo
 * estilo visual que `añadirTablaKpis`) y `describirPeriodo` (traduce
 * `rangosPorAnio` de PeriodoComparador.js a texto legible). `crearDocumentoPdf`
 * ahora acepta un array de líneas de subtítulo (Distribuidor/Marca/Periodo)
 * en vez de una sola cadena, sin romper a los llamantes existentes que
 * pasan una cadena.
 *
 * Deliberadamente sin logo de empresa: los imports de imagen de Create
 * React App no siempre devuelven datos embebibles directamente (a veces
 * son solo una URL que jsPDF no puede cargar sin una vuelta adicional
 * asíncrona), y añadir esa complejidad no compensaba para un PDF de uso
 * interno — solo encabezado de texto (título, subtítulo con el periodo/
 * filtro activo, y fecha de generación).
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Mismo gris (slate-600) que usa el resto de tablas de la app para las
// cabeceras — coherencia visual con el estilo ya establecido.
const COLOR_CABECERA = [71, 85, 105];

// Crea un documento A4 en vertical con un encabezado de texto: título,
// subtítulo opcional (p.ej. el periodo/año filtrado) y la fecha de
// generación. Devuelve el documento listo para añadirle tablas.
//
// `subtitulo` acepta una cadena (comportamiento original, una sola línea)
// O un array de cadenas (una línea por elemento — p.ej. ["Distribuidor:
// EXCLUSIVAS DYEXCO SL", "Marca: Palomo Cojo DO Rueda", "Periodo: 2026
// (Año completo)"]), para poder dejar constancia en el PDF de qué filtros
// estaban activos al exportar. El Y final tras el encabezado se guarda en
// `doc.__proximoY` para que `añadirTablaKpis`/`añadirTituloSeccion` puedan
// arrancar justo debajo sin que el llamante tenga que calcularlo a mano
// (importante ahora que el número de líneas de subtítulo varía).
export function crearDocumentoPdf(titulo, subtitulo) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const fecha = new Date().toLocaleString('es-ES');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(30, 41, 59); // slate-800
  doc.text(titulo, 14, 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139); // slate-500
  let y = 25;
  const lineasSubtitulo = Array.isArray(subtitulo) ? subtitulo.filter(Boolean) : (subtitulo ? [subtitulo] : []);
  lineasSubtitulo.forEach(linea => {
    doc.text(linea, 14, y);
    y += 5;
  });
  doc.text(`Generado: ${fecha}`, 14, y);
  doc.setTextColor(0, 0, 0);

  doc.__proximoY = y + 7;

  return doc;
}

// Alto útil de una página A4 en mm, con margen de seguridad para no cortar
// un título o el borde inferior de una tabla justo al filo de la página.
const ALTO_PAGINA_UTIL = 297 - 15;

// Añade el título de una sección del informe (p.ej. "Desglose por Marca")
// en la posición Y dada. Si no queda espacio razonable antes del pie de
// página, salta a una página nueva primero — así el título nunca se queda
// "huérfano" al final de una página con su tabla ya en la siguiente.
// Devuelve el Y sugerido para pasarle como `startY` a la tabla que sigue.
export function añadirTituloSeccion(doc, texto, y) {
  let yFinal = y;
  if (yFinal > ALTO_PAGINA_UTIL - 20) {
    doc.addPage();
    yFinal = 18;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59); // slate-800
  doc.text(texto, 14, yFinal);
  doc.setTextColor(0, 0, 0);
  return yFinal + 5;
}

// Tabla genérica de cabecera + cuerpo ya formateados a texto (mismo estilo
// visual que añadirTablaKpis, para que todas las tablas del informe se
// vean como parte del mismo documento). `head` es un array de strings
// (una fila de cabecera); `body` un array de arrays de strings.
export function añadirTablaGenerica(doc, head, body, startY) {
  autoTable(doc, {
    startY,
    head: [head],
    body,
    theme: 'grid',
    headStyles: { fillColor: COLOR_CABECERA, fontSize: 9 },
    styles: { fontSize: 8.5, cellPadding: 2.2 },
  });
  return doc.lastAutoTable.finalY;
}

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// Traduce `rangosPorAnio` (el valor que entrega PeriodoComparador.js —
// [{ anio, meses }], meses = índices 0-11) a una línea de texto legible
// para el subtítulo del PDF, p.ej. "2026 (Año completo)" o
// "2025 (Ene-Jun), 2026 (Ene, Mar, Jul)".
export function describirPeriodo(rangosPorAnio) {
  if (!rangosPorAnio || rangosPorAnio.length === 0) return null;
  return rangosPorAnio.map(r => {
    if (!r.meses || r.meses.length === 0) return `${r.anio} (sin meses)`;
    if (r.meses.length === 12) return `${r.anio} (Año completo)`;
    const nombres = [...r.meses].sort((a, b) => a - b).map(m => MESES_CORTOS[m]);
    return `${r.anio} (${nombres.join(', ')})`;
  }).join(' · ');
}

// Tabla de KPIs. Cada elemento de `kpis`: { label, valorBase, valorComparacion
// (opcional), delta (opcional, número en % o null/undefined si no aplica) }.
// Si NINGÚN kpi trae valorComparacion, la tabla sale con 2 columnas simples
// (KPI/Valor) — caso de Dashboard y Dashboard A&P Compañía, que no comparan
// años. Si AL MENOS uno la trae (caso de Dashboard de Ventas Reales, que sí
// compara año base vs. año de comparación), se añaden columnas de
// comparación y variación para todos los KPIs, con "—" donde no aplique,
// para que la tabla no quede irregular entre filas.
export function añadirTablaKpis(doc, kpis, { startY, anioBase, anioComparacion } = {}) {
  const startYFinal = startY ?? doc.__proximoY ?? 36;
  const hayComparacion = kpis.some(k => k.valorComparacion !== undefined && k.valorComparacion !== null);

  const head = hayComparacion
    ? [['KPI', anioBase ? String(anioBase) : 'Valor', anioComparacion ? String(anioComparacion) : 'Comparación', 'Variación']]
    : [['KPI', 'Valor']];

  const body = kpis.map(k => {
    if (!hayComparacion) return [k.label, String(k.valorBase)];
    // Sin caracteres ▲/▼ aquí a propósito: la fuente por defecto de jsPDF
    // (helvetica) no incluye esos glifos y saldrían como huecos en el PDF —
    // a diferencia de la pantalla, que sí los renderiza bien vía el navegador.
    const deltaTexto = (k.delta === null || k.delta === undefined)
      ? '—'
      : `${k.delta >= 0 ? '+' : ''}${k.delta.toFixed(1)}%`;
    return [k.label, String(k.valorBase), k.valorComparacion != null ? String(k.valorComparacion) : '—', deltaTexto];
  });

  autoTable(doc, {
    startY: startYFinal,
    head,
    body,
    theme: 'grid',
    headStyles: { fillColor: COLOR_CABECERA, fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 2.5 },
  });

  return doc.lastAutoTable.finalY;
}

// Dispara la descarga del PDF con el nombre dado.
export function descargarPdf(doc, nombreArchivo) {
  doc.save(nombreArchivo);
}
