# Instrucciones del proyecto — Sellium (UNESDI)

Este documento resume el contexto y las reglas fijas del proyecto para que cualquier conversación nueva dentro de este Cowork Project pueda arrancar sin tener que volver a explicarlas. Pégalo (o parte de él) en el campo "Instructions" al crear el proyecto, o simplemente déjalo en la raíz de la carpeta — Claude puede leerlo.

## Qué es esta app

Sellium: aplicación de gestión comercial de UNESDI Premium Wines & Spirits para controlar la relación con sus distribuidores — Sell-In/Sell-Out, presupuesto de A&P, forecast, dashboards y análisis varios. Stack: React 19 + Firebase 12 (Firestore + Auth + Hosting), Tailwind CSS 3, Recharts, jsPDF + jspdf-autotable, xlsx (SheetJS), lucide-react.

Carpeta del proyecto: esta misma carpeta (`mi-app-comercial`), conectada a Cowork.

## Reglas técnicas fijas (no negociables)

1. **Nunca usar `cat`/`cp` de bash para leer o copiar archivos fuente de esta carpeta.** El montaje FUSE del escritorio puede truncar el contenido silenciosamente (confirmado varias veces: un archivo de 460 líneas se copiaba con solo 409). Usar siempre las herramientas Read/Edit/Write para tocar código.
2. **Pipeline seguro para validar sintaxis con esbuild:** Read del archivo real → Write de una copia exacta a la carpeta `outputs/` del proyecto → `cp` desde ahí a `/tmp` (bash) → `npx esbuild archivo.jsx --bundle=false --outfile=...`. Nunca `cp` directo desde la carpeta del proyecto.
3. **Firestore: nunca se usa `update`.** Todas las correcciones de datos son "borrar y volver a crear" (excepción estrecha: la papelera). Está reforzado en `firestore.rules`.
4. **Cambios en `firestore.rules` no se aplican solos** — hay que publicarlos a mano desde la consola de Firebase.
5. **Despliegue:** el enlace web publicado es un build estático, NO se actualiza con `npm start`. El flujo es: Sergio ejecuta `Subir cambios a GitHub.bat` (push a GitHub) → GitHub Actions (`.github/workflows/deploy.yml`) compila y publica solo a Firebase Hosting automáticamente. El sandbox de Cowork no tiene acceso a GitHub (bloqueado por allowlist), así que cualquier acción de git la ejecuta Sergio en local con los `.bat`.
6. **Si algo se ve actualizado en local pero no en el enlace publicado:** casi siempre es caché del navegador (Ctrl+Shift+R) o que aún no se ha hecho el push/deploy — comprobar la pestaña Actions de GitHub antes de investigar nada más.

## Convenciones de estilo ya establecidas

- `src/uiClasses.js`: clases Tailwind compartidas (botones, inputs, tarjetas, KPIs, colores por signo). Reutilizar siempre en vez de repetir clases sueltas.
- `src/pdfExport.js`: helper compartido para exportar PDFs (`crearDocumentoPdf`, `añadirTablaKpis`, `descargarPdf`).
- `src/calculosAP.js`: fórmulas de A&P (Generado/Gastado) compartidas entre pantallas.
- Patrón de modales: overlay `fixed inset-0 z-50 bg-black/40` + caja `bg-white dark:bg-slate-800 rounded-xl` (ver `PantallaDistribuidor.js`, `PantallaAyuda.js`).
- Memoria de pestañas: las pantallas con subvistas no desmontan componentes ya visitados (`display:none` en vez de desmontar), vía `usePestañasVisitadas.js`.

## Funcionalidades ya construidas (para no duplicar ni contradecir)

- Gestión por Distribuidor (Entrada de Datos, Control A&P, Históricos, Herramientas, Importar Excel).
- Dashboards: Gestión, Ventas Sell-In (QlikSense) — con filtros de Distribuidor/Familia/Marca/Tipología.
- Reportes Generales (export a Power BI).
- Presupuesto y Forecast: objetivo anual por distribuidor y marca (baseline recalculada en vivo, nunca guardada).
- Recuperación de Ventas: comparativa mensual (o por rango de meses) contra el mismo periodo del año anterior, con semáforo por distribuidor.
- Alertas proactivas (campana): balance negativo, inactividad, descuadres.
- Roles de manager: "Viendo como" (Mis datos / Todos los usuarios / usuario concreto).
- CI/CD con GitHub Actions ya funcionando end-to-end.
- Logo de Sellium en el pie del menú lateral (ancho completo), junto al de UNESDI en la cabecera.
- Sección de Ayuda actualizada, con descarga en PDF.
- Sell-Out Clientes (2026-07-18, ampliado 2026-07-18): apartado independiente en el Sidebar — se elige un distribuidor y se ve el detalle línea a línea de SUS clientes finales (qué compran, cuánto, referencias trabajadas), con comparativa automática contra el mismo periodo del año anterior (estados Activo/Nuevo/Recuperado/Perdido). Colecciones Firestore: `clientesSellOut` (maestro de clientes por distribuidor, match por código de cliente propio del distribuidor + NIF, fallback nombre difuso) y `movimientosSellOutClientes` (detalle línea a línea, con fecha real tomada del archivo). El importador (`ImportarSellOutClientes.js`) acepta dos formatos, detectados por extensión: Excel (`parserSellOutClientes.js` — prueba todas las hojas y se queda con la que más filas de detalle produce, reconoce columnas por alias flexibles, y detecta si el archivo mezcla varios distribuidores en la columna EMPRESA/DISTRIBUIDOR) y texto de ancho fijo tipo AS/400 "Liquidación de Promociones" (`parserSellOutClientesTxt.js` — calcula las posiciones de columna a partir de la propia cabecera del informe). Si un Excel trae varios distribuidores mezclados, el importador pide primero elegir cuál de ellos se importa en esa pasada (paso 0) y hay que repetir la importación por cada uno. PDF queda descartado (Sergio prefiere reconvertir esos archivos a Excel él mismo). KPI de volumen = unidades (Ventas+Promo+Regalos); no se calcula ningún importe todavía (decisión explícita de Sergio). Memoria de reconciliación de Productos (colección `aliasProductosSellOut`, mismo patrón "borrar+crear" que `tipologiasMarca`): cada decisión producto->marca confirmada al importar se guarda por distribuidor, así la siguiente importación del MISMO distribuidor reconoce el texto exacto del producto y preselecciona la marca sola, sin tener que volver a ajustarlo a mano cada periodo. Comparativa del Dashboard (rediseñada 2026-07-18, dos vueltas): usa el mismo componente `PeriodoComparador.js` que ya comparten Dashboard de Ventas Reales y Dashboard de Gestión (Mes/Trimestre/Semestre/Año completo/Varios meses + "qué años comparar" con cualquier combinación real) — se descartó una primera versión con un selector Mes/Trimestre/Año hecho a medida porque no cuadraba con el resto de la app. El año más reciente marcado es el periodo "actual" y el segundo más reciente marcado el "anterior" (mismo patrón anioBase/anioComparacion que DashboardVentasReales.js). También incluye un aviso de "posibles clientes duplicados" en el maestro `clientesSellOut` del distribuidor (mismo código en 2 documentos, o mismo nombre con código distinto) — solo avisa, nunca fusiona nada automáticamente. Pestaña "Por Marca" (`DashboardSellOutMarcas.js`, 2026-07-18): mismo dato base que la pestaña Clientes pero agregado por Marca — unidades, nº de clientes distintos que la compran, y estado Activa/Nueva/Recuperada/Perdida análogo al de clientes, con el mismo PeriodoComparador. Incluye botón "Corregir marca" por fila (2026-07-18) para arreglar movimientos mal asignados a una marca equivocada (p.ej. un producto reconciliado a la marca incorrecta en una importación anterior): abre un modal donde se elige la marca correcta de destino, se marcan los meses concretos a mover (no borra ninguna de las dos marcas, ambas pueden ser reales), y si hay un alias guardado en `aliasProductosSellOut` apuntando a la marca equivocada se ofrece borrarlo también para que la importación del próximo periodo no repita el mismo error. Usa `reasignarMarcaSellOutClientesPorMeses` en `firebaseApi.js` (patrón borrar+crear, igual que `corregirAnioMovimientos`). Pendiente (mencionado por Sergio, no confirmado si hace falta): cruce Cliente×Marca — cuánto compra cada cliente de cada marca concreta.

## Cómo trabajar de forma eficiente en este proyecto

- Usa este mismo Cowork Project (no chats sueltos) para cualquier cambio en Sellium — así la memoria del proyecto conserva el contexto sin tener que repetirlo.
- Para preguntas rápidas que no tocan archivos, usa Chat normal en vez de Cowork (Cowork consume más cuota por sesión).
- Agrupa varios cambios pequeños relacionados en una misma conversación en vez de abrir una conversación nueva por cada micro-ajuste.
- Actualiza este archivo cuando se añadan reglas o convenciones nuevas importantes.
