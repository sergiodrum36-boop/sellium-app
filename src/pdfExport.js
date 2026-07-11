/*
 * pdfExport.js
 * Helper compartido para generar PDFs de RESUMEN EJECUTIVO desde los
 * dashboards (Dashboard de Gestión, Dashboard A&P Visión Compañía,
 * Dashboard de Ventas Reales), a petición de Sergio. jsPDF y
 * jspdf-autotable ya estaban instalados como dependencias del proyecto
 * pero sin usarse en ningún sitio.
 *
 * A diferencia de las exportaciones a Excel que ya existían en la app
 * (todas vuelcan el detalle línea a línea del histórico filtrado — ver
 * handleExportarExcel en Historico.js, HistoricoSellIn.js, ControlAP.js,
 * ControlAPVisionComercial.js, DashboardVentasReales.js), estos PDFs son
 * un resumen: la misma tabla de KPIs que ya se ve en pantalla, no un
 * volcado de todo el histórico — para eso ya está "Exportar a Excel" en
 * las pantallas que lo tienen.
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
  if (subtitulo) {
    doc.text(subtitulo, 14, y);
    y += 5;
  }
  doc.text(`Generado: ${fecha}`, 14, y);
  doc.setTextColor(0, 0, 0);

  return doc;
}

// Tabla de KPIs. Cada elemento de `kpis`: { label, valorBase, valorComparacion
// (opcional), delta (opcional, número en % o null/undefined si no aplica) }.
// Si NINGÚN kpi trae valorComparacion, la tabla sale con 2 columnas simples
// (KPI/Valor) — caso de Dashboard y Dashboard A&P Compañía, que no comparan
// años. Si AL MENOS uno la trae (caso de Dashboard de Ventas Reales, que sí
// compara año base vs. año de comparación), se añaden columnas de
// comparación y variación para todos los KPIs, con "—" donde no aplique,
// para que la tabla no quede irregular entre filas.
export function añadirTablaKpis(doc, kpis, { startY = 36, anioBase, anioComparacion } = {}) {
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
    startY,
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
