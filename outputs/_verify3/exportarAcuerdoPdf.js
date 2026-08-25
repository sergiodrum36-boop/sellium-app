/*
 * exportarAcuerdoPdf.js
 * Fase 2 de "Acuerdos con Clientes" (27/07/2026, a petición de Sergio):
 * genera el PDF de UN acuerdo con el mismo formato que sus propuestas
 * reales (RTE Malquerida, RTE Noema, Chiringuito Las Dunas, La Plaza
 * Aguamarga, RTE Casablanca, Chiringuito La Mamola) — cabecera de datos del
 * cliente/vigencia, tabla de referencias con su condición, aportaciones
 * adicionales, acciones de exposición y firmas.
 *
 * Deliberadamente un módulo aparte de pdfExport.js: ese helper está pensado
 * para PDFs de RESUMEN de KPIs de un dashboard (título + tabla de KPIs), con
 * un layout fijo que no encaja con el de un documento contractual con
 * cabecera de campos en dos columnas + varias secciones de texto libre. Se
 * reutiliza jsPDF/jspdf-autotable directamente, con la misma paleta de
 * grises que ya usa pdfExport.js para que el PDF se sienta de la misma
 * familia visual que el resto de exportaciones de la app.
 *
 * "Responsable Unesdi" sale fijo como "SERGIO DIAZ" (así aparece en los 6
 * ejemplos reales que compartió — Sergio es el único usuario de esta cuenta,
 * no hace falta un campo nuevo en el modelo de datos para esto).
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const COLOR_TITULO = [30, 41, 59];   // slate-800
const COLOR_TEXTO = [51, 65, 85];    // slate-700
const COLOR_SECUNDARIO = [100, 116, 139]; // slate-500
const COLOR_CABECERA_TABLA = [71, 85, 105]; // slate-600, igual que pdfExport.js

const ETIQUETA_TIPO_APORTACION = {
  rapel_volumen: 'Rapel por volumen',
  aportacion_fija_botella: 'Aportación fija €/botella',
  valor_añadido: 'Valor añadido',
};

// 'YYYY-MM-DD' -> 'DD-MM-YYYY' (formato de fecha que usan sus propuestas
// reales). Cadena vacía si no hay fecha o no tiene el formato esperado.
function formatearFechaEs(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '';
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

function condicionTexto(referencia) {
  if (referencia.tipo_condicion === 'promocion_cajas') return referencia.promocion_texto || '—';
  const pct = referencia.descuento_pct;
  return pct !== '' && pct !== null && pct !== undefined ? `${pct}% dto` : '—';
}

// Escribe "Label: valor" en (x, y) y devuelve el ancho ocupado (por si se
// quisiera encadenar algo a continuación en la misma línea).
function escribirCampo(doc, label, valor, x, y) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...COLOR_TEXTO);
  doc.text(`${label}: ${valor || ''}`, x, y);
}

// Añade una nueva página si no queda sitio suficiente antes del pie de
// página (297mm de alto en A4, margen inferior de 20mm) — se llama antes de
// cada bloque que puede ser largo (texto libre, firmas).
function asegurarEspacio(doc, y, necesario) {
  if (y + necesario > 277) {
    doc.addPage();
    return 16;
  }
  return y;
}

// Construye el documento jsPDF completo de un acuerdo. `nombreDistribuidor`
// se resuelve fuera (la pantalla ya tiene el mapa id->nombre cargado).
export function generarPdfAcuerdo(acuerdo, { nombreDistribuidor } = {}) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const xIzq = 14;
  const xDer = 110;
  let y = 16;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...COLOR_TITULO);
  doc.text(`PROPUESTA DE ACUERDO COMERCIAL${acuerdo.numero ? ` Nº ${acuerdo.numero}` : ''}`, xIzq, y);
  y += 9;

  escribirCampo(doc, 'Responsable Unesdi', 'SERGIO DIAZ', xIzq, y);
  escribirCampo(doc, 'Fecha de la propuesta', formatearFechaEs(acuerdo.fecha_propuesta), xDer, y);
  y += 6;
  escribirCampo(doc, 'Nombre del cliente', acuerdo.nombre_cliente, xIzq, y);
  escribirCampo(doc, 'Tipo de negocio', acuerdo.tipo_negocio, xDer, y);
  y += 6;
  escribirCampo(doc, 'Dirección', acuerdo.direccion, xIzq, y);
  escribirCampo(doc, 'Responsable negocio', acuerdo.responsable_negocio, xDer, y);
  y += 6;
  escribirCampo(doc, 'Localidad', acuerdo.localidad, xIzq, y);
  escribirCampo(doc, 'Teléfono contacto', acuerdo.telefono_contacto, xDer, y);
  y += 6;
  escribirCampo(doc, 'NIF', acuerdo.nif, xIzq, y);
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...COLOR_TEXTO);
  doc.text(`COLABORADOR AL QUE TIENEN QUE REALIZAR LAS COMPRAS: ${nombreDistribuidor || '—'}`, xIzq, y);
  y += 9;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...COLOR_TITULO);
  doc.text('VIGENCIA DEL ACUERDO', xIzq, y);
  y += 5.5;
  escribirCampo(doc, '', `Desde ${formatearFechaEs(acuerdo.vigencia_inicio) || '?'} a ${formatearFechaEs(acuerdo.vigencia_fin) || '?'}`, xIzq, y);
  y += 9;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLOR_TITULO);
  doc.text('DETALLE DEL ACUERDO DEL CLIENTE', xIzq, y);
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('COMPROMISO DE VOLUMEN', xIzq, y);
  y += 5.5;
  escribirCampo(doc, 'Volumen objetivo', `${acuerdo.volumen_objetivo_botellas || 0} botellas/año (compartido entre todas las referencias)`, xIzq, y);
  y += 6;

  const referencias = acuerdo.referencias || [];
  autoTable(doc, {
    startY: y,
    head: [['Referencia', 'Formato', 'PVP+IVA', 'Condición', 'PVP Neto']],
    body: referencias.map((r) => [
      r.nombre_marca || '—',
      r.formato || '—',
      r.pvp_iva !== '' && r.pvp_iva != null ? `${r.pvp_iva} €` : '—',
      condicionTexto(r),
      r.pvp_neto !== '' && r.pvp_neto != null ? `${r.pvp_neto} €` : '—',
    ]),
    theme: 'grid',
    headStyles: { fillColor: COLOR_CABECERA_TABLA, fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 2.5 },
  });
  y = doc.lastAutoTable.finalY + 8;

  const aportaciones = acuerdo.aportaciones || [];
  if (aportaciones.length > 0) {
    y = asegurarEspacio(doc, y, 14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...COLOR_TITULO);
    doc.text('ACCIONES A DESARROLLAR PARA INCREMENTAR LA ROTACIÓN', xIzq, y);
    y += 6;
    doc.setFontSize(9);
    aportaciones.forEach((a) => {
      const etiqueta = ETIQUETA_TIPO_APORTACION[a.tipo] || a.tipo;
      const lineas = doc.splitTextToSize(`${etiqueta}: ${a.descripcion || ''}`, 182);
      y = asegurarEspacio(doc, y, lineas.length * 4.5 + 2);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...COLOR_TEXTO);
      doc.text(lineas, xIzq, y);
      y += lineas.length * 4.5 + 2;
    });
    y += 2;
  }

  if (acuerdo.acciones_exposicion) {
    y = asegurarEspacio(doc, y, 14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...COLOR_TITULO);
    doc.text('ACCIONES PARA EXPOSICIÓN', xIzq, y);
    y += 6;
    const lineas = doc.splitTextToSize(acuerdo.acciones_exposicion, 182);
    y = asegurarEspacio(doc, y, lineas.length * 4.5 + 2);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...COLOR_TEXTO);
    doc.text(lineas, xIzq, y);
    y += lineas.length * 4.5 + 8;
  }

  if (acuerdo.observaciones) {
    y = asegurarEspacio(doc, y, 14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...COLOR_TITULO);
    doc.text('OBSERVACIONES', xIzq, y);
    y += 6;
    const lineas = doc.splitTextToSize(acuerdo.observaciones, 182);
    y = asegurarEspacio(doc, y, lineas.length * 4.5 + 2);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...COLOR_TEXTO);
    doc.text(lineas, xIzq, y);
    y += lineas.length * 4.5 + 8;
  }

  y = asegurarEspacio(doc, y, 10);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(...COLOR_SECUNDARIO);
  doc.text('Cualquier cambio en el tipo impositivo y/o tarifa se aplicará desde la fecha de entrada en vigor del mismo.', xIzq, y);
  y += 14;

  y = asegurarEspacio(doc, y, 24);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...COLOR_TEXTO);
  doc.text('FIRMA DEL RESPONSABLE DEL LOCAL', xIzq, y);
  doc.text(`FIRMA DE UNESDI Y ${(nombreDistribuidor || '').toUpperCase()}`, xDer, y);
  y += 14;
  doc.line(xIzq, y, xIzq + 75, y);
  doc.line(xDer, y, xDer + 75, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Nombre:', xIzq, y);
  doc.text('Nombre: SERGIO DIAZ', xDer, y);

  return doc;
}

// Dispara la descarga del PDF con un nombre de archivo derivado del cliente
// y del número de propuesta (si lo tiene).
export function descargarPdfAcuerdo(acuerdo, { nombreDistribuidor } = {}) {
  const doc = generarPdfAcuerdo(acuerdo, { nombreDistribuidor });
  const clienteSlug = (acuerdo.nombre_cliente || 'cliente').trim().replace(/\s+/g, '_');
  const numeroSlug = acuerdo.numero ? `_${acuerdo.numero.replace(/[\\/]/g, '-')}` : '';
  doc.save(`Acuerdo_${clienteSlug}${numeroSlug}.pdf`);
}
