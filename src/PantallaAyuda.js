/*
 * PantallaAyuda.js (Versión 2.0 — actualizada, a petición de Sergio)
 * El contenido anterior describía una versión muy antigua de la app (sin
 * Presupuesto y Forecast, Recuperación de Ventas, Dashboards, Tipología,
 * Alertas, roles de manager, modo oscuro...) y usaba un modal con estilos
 * en línea (inline styles) que no respetaba el modo oscuro ni el resto de
 * la identidad visual (Tailwind) del rediseño. Se rehace por completo:
 *  - Contenido reorganizado en secciones que reflejan el menú actual tal
 *    cual está en Layout.js (mismo orden: accesos de nivel superior, grupo
 *    "Gestión por Distribuidor" con sus 4 subcategorías, grupo "Dashboard").
 *  - Modal reconstruido con las mismas clases Tailwind que el resto de
 *    modales de la app (ver el patrón en PantallaDistribuidor.js: overlay
 *    "fixed inset-0 z-50 bg-black/40" + caja "bg-white dark:bg-slate-800
 *    rounded-xl"), así que ahora sí respeta el modo oscuro.
 *  - Nuevo: botón "Descargar en PDF" (a petición de Sergio: "con formato
 *    para descarga") que genera un PDF con el mismo contenido, para poder
 *    guardarlo o compartirlo fuera de la app. Reutiliza crearDocumentoPdf/
 *    descargarPdf de pdfExport.js para la cabecera (título + fecha) y el
 *    mismo estilo de color que el resto de PDFs de la app; el cuerpo (texto
 *    con párrafos y listas) se maqueta a mano con jsPDF porque no es una
 *    tabla de KPIs como el resto de exportaciones a PDF existentes.
 */

import React from 'react';
import { X, Download } from 'lucide-react';
import { botonSecundario } from './uiClasses';
import { crearDocumentoPdf, descargarPdf } from './pdfExport';

// Contenido único, compartido entre lo que se ve en pantalla y lo que se
// exporta a PDF — así nunca pueden quedar desincronizados entre sí.
// Cada sección: título + una lista de bloques, donde cada bloque es texto
// normal (string) o una lista (con `ordenada: true/false` y `items`).
const SECCIONES = [
  {
    titulo: 'Qué es Sellium',
    bloques: [
      'Sellium es la aplicación de gestión comercial de UNESDI Premium Wines & Spirits para controlar la relación con sus distribuidores: compras (Sell-In), ventas (Sell-Out), presupuesto de A&P, forecast anual y varios análisis e informes.',
      'El menú de la izquierda se organiza en accesos sueltos (arriba) y dos grupos desplegables: "Gestión por Distribuidor" y "Dashboard". Las secciones siguientes siguen ese mismo orden.',
    ],
  },
  {
    titulo: 'Gestión por Distribuidor',
    bloques: [
      'Es la pantalla de trabajo diario: introducir movimientos y consultar la situación de UN distribuidor concreto (elegido en el selector de la parte superior). Se organiza en 4 subcategorías desplegables, más "Importar Excel" suelto:',
      {
        ordenada: false,
        items: [
          '"Entrada de Datos" → "Ventas y A&P": registrar cada venta (Sell-Out) mes a mes por marca, junto con lo regalado, las muestras o la aportación de A&P de ese movimiento.',
          '"Entrada de Datos" → "Compras": registrar las compras del distribuidor (Sell-In) mes a mes por marca.',
          '"Control A&P" → "Control A&P": balance de A&P Generado (por las compras) frente a A&P Gastado (por las salidas), de ese distribuidor.',
          '"Control A&P" → "Stock": inventario teórico del distribuidor (Stock Inicial + Compras − Salidas).',
          '"Históricos" → "Histórico Sell-Out" / "Histórico Sell-In": el listado completo de todos los movimientos, con filtros por fecha y marca y exportación a Excel.',
          '"Herramientas" → "Fusionar Marcas", "Corregir Año", "Mantenimiento", "Papelera" y "Auditoría": utilidades de mantenimiento de datos (ver aviso de corrección de errores más abajo).',
          '"Importar Excel": para cargar movimientos masivos de un distribuidor desde un archivo.',
        ],
      },
    ],
  },
  {
    titulo: 'Dashboard',
    bloques: [
      'Grupo con dos vistas de análisis agregadas (no de un solo distribuidor, sino de todos a la vez):',
      {
        ordenada: false,
        items: [
          '"Gestión": KPIs y gráficos de A&P Generado (Compras + Stock Inicial) vs. Gastado, con filtros de distribuidor, marca y periodo.',
          '"Ventas Sell-In (QlikSense)": KPIs y gráficos de las Ventas Reales importadas desde QlikSense, con filtros de Distribuidor, Familia, Subfamilia (Marca) y Tipología, y comparativa entre dos años.',
        ],
      },
    ],
  },
  {
    titulo: 'Importar Sell-In (QlikSense) y Tipología (bebidas)',
    bloques: [
      'Dos accesos ligados al mismo dataset de "Ventas Reales" (los datos que llegan cada mes desde QlikSense, con TODOS los distribuidores juntos):',
      {
        ordenada: false,
        items: [
          '"Importar Sell-In (QlikSense)": sube el Excel mensual con las compras reales de todos los distribuidores.',
          '"Tipología (bebidas)": pantalla de mantenimiento para clasificar cada marca como Vino, Licor o Coctelería — ese dato alimenta los KPIs y gráficos de tipología del Dashboard de Ventas Sell-In.',
        ],
      },
    ],
  },
  {
    titulo: 'Reportes Generales',
    bloques: [
      'Pantalla dedicada a exportar datos brutos (totales por rango de fechas) para su análisis externo en Power BI: un botón para Compras (Sell-In) y otro para Ventas y Gastos (Sell-Out).',
    ],
  },
  {
    titulo: 'Presupuesto y Forecast',
    bloques: [
      'Define el objetivo anual del año siguiente, por distribuidor y por marca, y compara en tiempo real cómo va el año en curso frente a ese objetivo:',
      {
        ordenada: true,
        items: [
          '"Objetivo Anual": para cada distribuidor, se ve la Facturación y el A&P Gastado del año anterior por marca (calculados en vivo desde el histórico, nunca guardados aparte) y se introduce un % de crecimiento por marca — el objetivo se calcula automáticamente.',
          '"Forecast": compara el objetivo guardado (sumado de todos los distribuidores) contra lo real acumulado en el año elegido, con el % cumplido y una proyección a fin de año.',
        ],
      },
    ],
  },
  {
    titulo: 'Recuperación de Ventas',
    bloques: [
      'Informe mensual para saber a qué distribuidores hay que prestar atención y qué venderles: compara, por distribuidor y por marca, lo comprado en un mes (o un rango de varios meses seguidos, con "Desde"/"Hasta") contra el mismo periodo del año anterior.',
      {
        ordenada: false,
        items: [
          'Cada distribuidor recibe un semáforo: Atención (cae 30% o más), Vigilar (cae entre 10% y 30%), Bien (estable o crece), o Sin histórico (si el año pasado facturó muy poco como para comparar de forma fiable).',
          'Al seleccionar un distribuidor, se ve el detalle por marca de cuántas cajas y cuánto importe le faltan para igualar el año anterior — ordenado de mayor a menor oportunidad.',
          'Exportable a Excel y a PDF con los botones de la parte superior.',
        ],
      },
    ],
  },
  {
    titulo: 'Alertas proactivas',
    bloques: [
      'La campana del pie del menú avisa automáticamente de situaciones que conviene revisar: distribuidores con balance de A&P negativo, sin actividad reciente (3 meses o más) o con descuadres entre categorías de datos.',
    ],
  },
  {
    titulo: 'Corrección de errores: nunca se edita, se borra y se vuelve a crear',
    bloques: [
      'Por diseño, esta aplicación NO permite editar un movimiento ya guardado (venta, compra, etc.). Si algo se introdujo mal, la forma de corregirlo es borrar ese movimiento (desde el histórico correspondiente) y volver a crearlo con el dato correcto. Esto es intencionado: mantiene un rastro claro de qué se cambió y cuándo.',
    ],
  },
  {
    titulo: 'Otras opciones del menú',
    bloques: [
      {
        ordenada: false,
        items: [
          '"Modo claro/oscuro": cambia el tema visual de toda la app.',
          'Flecha de contraer/expandir (arriba, junto al logo): reduce el menú a solo iconos, útil en pantallas con tablas anchas.',
          '"Viendo como" (solo visible para usuarios manager): permite consultar los datos de "Mis datos", de "Todos los usuarios" (agregado) o de un usuario concreto, sin cambiar de pantalla.',
        ],
      },
    ],
  },
];

// Recibe la función 'onClose' desde App.js
function PantallaAyuda({ onClose }) {

  // Genera el mismo contenido de SECCIONES como PDF descargable, a petición
  // de Sergio. jsPDF no entiende HTML: el texto se envuelve a mano con
  // splitTextToSize y se va escribiendo línea a línea, controlando la
  // posición Y y añadiendo una página nueva cuando no queda hueco.
  const handleDescargarPdf = () => {
    const doc = crearDocumentoPdf('Instrucciones de Uso — Sellium');
    const margenIzq = 14;
    const anchoUtil = 182; // A4 (210mm) menos márgenes izq/dcha
    const altoPagina = 297;
    const margenInferior = 15;
    let y = 32;

    const asegurarEspacio = (lineasNecesarias, alturaLinea = 5) => {
      if (y + lineasNecesarias * alturaLinea > altoPagina - margenInferior) {
        doc.addPage();
        y = 20;
      }
    };

    SECCIONES.forEach((seccion) => {
      asegurarEspacio(3, 6);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(30, 41, 59);
      doc.text(seccion.titulo, margenIzq, y);
      y += 7;

      seccion.bloques.forEach((bloque) => {
        if (typeof bloque === 'string') {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          doc.setTextColor(51, 65, 85);
          const lineas = doc.splitTextToSize(bloque, anchoUtil);
          asegurarEspacio(lineas.length + 1);
          doc.text(lineas, margenIzq, y);
          y += lineas.length * 5 + 3;
        } else {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          doc.setTextColor(51, 65, 85);
          bloque.items.forEach((item, i) => {
            const prefijo = bloque.ordenada ? `${i + 1}. ` : '• ';
            const lineas = doc.splitTextToSize(prefijo + item, anchoUtil - 4);
            asegurarEspacio(lineas.length + 1);
            doc.text(lineas, margenIzq + 4, y);
            y += lineas.length * 5 + 1.5;
          });
          y += 2;
        }
      });
      y += 3;
    });

    descargarPdf(doc, 'Sellium_Instrucciones_de_Uso.pdf');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl max-h-[85vh] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg flex flex-col">

        {/* Encabezado del Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Instrucciones de Uso</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDescargarPdf}
              className={`${botonSecundario} !flex !items-center !gap-1.5`}
              title="Descargar estas instrucciones en PDF"
            >
              <Download size={15} /> Descargar en PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="!border-0 !bg-transparent !text-slate-400 hover:!bg-slate-100 hover:!text-slate-900 dark:hover:!bg-slate-700 dark:hover:!text-white rounded-md p-1.5"
              title="Cerrar"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Contenido (con scroll si es muy largo) */}
        <div className="px-6 py-4 overflow-y-auto space-y-5">
          {SECCIONES.map((seccion) => (
            <div key={seccion.titulo}>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-1.5">{seccion.titulo}</h4>
              <div className="space-y-2">
                {seccion.bloques.map((bloque, i) =>
                  typeof bloque === 'string' ? (
                    <p key={i} className="text-sm text-slate-600 dark:text-slate-300">{bloque}</p>
                  ) : bloque.ordenada ? (
                    <ol key={i} className="list-decimal list-inside text-sm text-slate-600 dark:text-slate-300 space-y-1">
                      {bloque.items.map((item, j) => <li key={j}>{item}</li>)}
                    </ol>
                  ) : (
                    <ul key={i} className="list-disc list-inside text-sm text-slate-600 dark:text-slate-300 space-y-1">
                      {bloque.items.map((item, j) => <li key={j}>{item}</li>)}
                    </ul>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default PantallaAyuda;
