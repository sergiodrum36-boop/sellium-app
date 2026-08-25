# Sellium — Diagnóstico y hoja de ruta hacia nivel profesional

_Revisión completa del proyecto (25 julio 2026): ~18.500 líneas en `src/`, React 19 + Firebase 12 (Firestore/Auth/Hosting), Tailwind 3, CI/CD con GitHub Actions._

_Actualizado 26 julio 2026: Bloques 1, 2 y 4 completados; Bloque 3 completado en versión acotada. Además, tras cerrar esta hoja de ruta, Sergio pidió una segunda ronda de mejoras de navegación y un rediseño visual completo (estilo Dynamics 365/Power BI/HubSpot) — ver sección 6, al final de este documento, para el detalle de ese trabajo adicional._

## 1. Punto de partida: más sólido de lo que parece

Antes de la lista de mejoras, vale la pena decir lo que ya está bien hecho, porque condiciona cómo abordar el resto:

- **Permisos y roles reales**: reglas de Firestore (`firestore.rules`) bien razonadas, con rol `manager` que solo se concede fuera de la app (`setManagerRole.js`), nunca desde el cliente.
- **Papelera + auditoría inmutable**: borrado suave acotado por regla (`esSoloCambioPapelera()`) y registro de quién borró/restauró qué, que nadie puede editar ni siquiera un manager.
- **Resiliencia**: cada sección principal tiene su propio Error Boundary — un fallo de render en un dashboard ya no tumba toda la app.
- **CI/CD funcionando de punta a punta**: push a GitHub → build → deploy a Firebase Hosting automático (`.github/workflows/deploy.yml`).
- **Sistema de diseño incipiente y ya reutilizado**: `uiClasses.js` (colores por signo, botones, tarjetas) y `KpiCard.js` documentan explícitamente por qué se comparten pese a la convención general del proyecto de "un componente por archivo, sin compartir".

Esa última nota es importante: la duplicación que se señala en el punto 2 **no es un despiste** — es una convención deliberada ("cada pantalla autocontenida, más fácil de razonar de una en una"). Lo que ha cambiado es que el proyecto ya tiene tamaño suficiente para que esa convención empiece a costar caro en un sitio muy concreto: la lógica de datos, no la de presentación.

## 2. Qué frena el salto a "nivel profesional"

1. **Lógica de negocio duplicada entre dashboards paralelos, con arquitecturas distintas para el mismo concepto.** Clientes, Marcas, Ventas Reales y AP Compañía reimplementan cada uno su propio cálculo de zona/preventista, comparativa de periodo y filtros — y no siempre de la misma forma. Corrección tras revisar el código a fondo (25 julio): en `DashboardSellOutClientes.js` la zona/preventista se filtra sobre una entidad agregada por cliente, con "arrastre" del valor del movimiento más reciente (el bug ya corregido el 19/07: un cliente sin compras en el periodo actual se quedaba con zona en blanco y desaparecía de cualquier filtro concreto). En `DashboardSellOutMarcas.js`, en cambio, el filtro de zona/preventista se aplica directamente sobre cada línea de movimiento antes de agregar por marca — cada línea ya trae su propio código de comercial de esa transacción, así que **no sufre ese mismo bug** (no hay ninguna corrección pendiente ahí, contrario a lo que decía la nota anterior). El problema real no es un bug pendiente sino que ambas pantallas resuelven "¿qué zona tiene esta fila?" con dos mecanismos distintos — lo que hace más lento verificar que un ajuste en una también vale para la otra, y es el motivo de fondo por el que conviene una única función compartida.
2. **Archivos monolito.** `firebaseApi.js` reúne ~30 funciones de las 12 colecciones en 1.167 líneas; varios dashboards pasan de 700-1.400 líneas (`DashboardVentasReales.js` 1.400, `PantallaPresupuesto.js` 902, `ImportarSellOutClientes.js` 811, `DashboardSellOutClientes.js` 818). Son difíciles de auditar de un vistazo y cualquier cambio tarda más en verificarse.
3. ~~**Cero tests automatizados de la lógica crítica.**~~ **RESUELTO (Bloque 2, 26/07)**: `calculosAP.js`, `matching.js`, los parsers de importación y `alertas.js` ya tienen tests unitarios con Jest.
4. ~~**El CI compila pero no bloquea nada.**~~ **RESUELTO (Bloque 2, 26/07)**: se añadió un gate real de lint/test en CI para que un error real no llegue disfrazado de warning. (El build local de `Publicar App.bat` sigue tratando `no-undef` como error duro, como quedó demostrado el 26/07 con el bug de `colorEje`/`colorGrid` en `PantallaPresupuesto.js` — ver sección 6.)
5. ~~**Dos sistemas de estilos conviviendo.**~~ **RESUELTO (Bloque 4 + rediseño Fase 8, 26/07)**: `index.css` ya no compite con Tailwind, y el sistema visual quedó unificado bajo un único color corporativo indigo (`#4F46E5`) — ver sección 6 para el detalle completo, que sustituye lo descrito originalmente en el Bloque 4 de abajo (los tokens `wine`/`gold` NO se aprovecharon más, se retiraron).
6. **Todo el cálculo vive en el cliente, sobre el histórico completo.** Los dashboards descargan con `getDocs` todos los documentos filtrados por usuario y agregan en JavaScript en el navegador — sin paginación ni agregación en servidor. Funciona bien con el volumen actual, pero cada mes que se reimporta crece la factura de lecturas de Firestore (Blaze es de pago por uso) y el tiempo de carga.
7. **PWA todavía básica.** Hay `manifest.json` pero no service worker (sin caché offline) ni icono `apple-touch-icon` — pese a que la usas como acceso directo instalado.
8. **Sin tipos.** Sin TypeScript ni JSDoc de formas de datos: con ~12 colecciones y transformaciones complejas (parsers, matching difuso, reconciliación de alias producto→marca), el único "contrato" de la forma de un dato vive en la cabeza de quien escribió esa función.

## 3. ¿Sonnet 5 o cambiar de modelo?

Sonnet 5 (el modelo con el que trabajamos ahora) es el adecuado para el ritmo que ha tenido el proyecto hasta hoy: features puntuales, arreglos acotados, pantallas nuevas siguiendo un patrón ya existente. Es rápido y ha dado buenos resultados — la disciplina de comentarios "por qué" en el código lo demuestra.

Para el tipo de trabajo que describes ahora — tocar muchos archivos a la vez con consistencia (partir `firebaseApi.js`, unificar la lógica repetida entre dashboards, introducir tests), donde hay que sostener en la cabeza el proyecto entero y decidir entre trade-offs no obvios — **Opus** razona mejor en tareas largas con muchas piezas moviéndose a la vez. No hace falta cambiar de modelo para todo el trabajo diario: lo más práctico es seguir en Sonnet 5 por defecto y pedir Opus específicamente para los bloques 1 y 2 de la hoja de ruta de abajo, que son los de mayor riesgo de "romper algo en un sitio al arreglarlo en otro".

## 4. Hoja de ruta propuesta

**Bloque 1 — Consolidar la capa de datos (una sola forma de resolver "qué zona tiene esto") — ✅ HECHO (26/07)**
Extraer a un módulo único el cálculo de "zona/preventista/tipología con arrastre del último valor conocido" que hoy solo vive en `DashboardSellOutClientes.js`, para que cualquier pantalla futura que agregue por entidad (no por línea suelta, como hace hoy Marcas) lo reutilice en vez de reinventarlo — y añadir una comprobación de seguridad reutilizable (total sin filtrar == suma de cada zona) como red de alambre para detectar a tiempo si vuelve a pasar algo parecido al bug de julio, en cualquier pantalla. Comparativa de periodo y deduplicación de referencias, mismo tratamiento. Partir `firebaseApi.js` en módulos por dominio (usuarios, distribuidores, sellIn, sellOut, sellOutClientes, presupuestos, auditoría) sin cambiar ninguna firma pública — refactor mecánico, bajo riesgo.

**Bloque 2 — Tests de la lógica que no puede fallar en silencio — ✅ HECHO (26/07)**
Jest ya viene con Create React App. Tests unitarios para `calculosAP.js`, `matching.js`, los parsers y `alertas.js`. Activar el lint como gate real en CI para que un error real no se cuele disfrazado de warning.

**Bloque 3 — Rendimiento y coste a futuro — ⚠️ PARCIAL (26/07)**
Documentos de resumen precalculados (totales por usuario/mes, escritos en el momento de importar) para los KPI de cabecera, dejando el detalle línea a línea solo donde de verdad hace falta. Reduce lecturas de Firestore y tiempo de carga a medida que crece el histórico. Lo que se hizo: caché acotada para las lecturas de Sell-Out Clientes/Marcas. Lo que queda pendiente: los documentos de resumen precalculados por usuario/mes no se han construido todavía — sigue siendo válido como mejora futura si el histórico sigue creciendo.

**Bloque 4 — Sistema visual unificado — ✅ HECHO, pero por un camino distinto al descrito aquí (26/07)**
~~Retirar las reglas globales de `index.css` que compiten con Tailwind; todo pasa por `uiClasses.js` + los tokens de `tailwind.config.js` (ya existen `wine`/`gold`, aprovecharlos más).~~ Esto se hizo, pero en vez de reforzar `wine`/`gold`, Sergio pidió después un rediseño completo estilo Dynamics 365/Power BI que sustituyó ese sistema de color por indigo corporativo — ver sección 6. Auditar que las pantallas más antiguas (Compras, StockDistribuidor, TipologiaReferencias) tienen el mismo soporte de modo oscuro que las últimas: hecho para las pantallas tocadas en el rediseño; no se ha auditado exhaustivamente el resto. Pulir estados vacíos y de carga (skeletons en vez de "Cargando..."): **sigue pendiente** — 124 sitios en 26 archivos, decisión aplazada a petición de Sergio (recordárselo en una futura conversación).

**Bloque 5 — PWA real — NO iniciado**
Service worker con caché básica, iconos para instalación en iOS, prompt de instalación — coherente con que ya la usas como PWA de escritorio.

**Bloque 6 (opcional, más ambicioso) — Tipado gradual — NO iniciado**
Migrar progresivamente a TypeScript empezando por los módulos de datos (`firebaseApi`, parsers, `calculosAP`), donde un error de forma de dato sale más caro. No hace falta convertir toda la app de golpe.

## 5. Cómo lo planteé

Empecé por el Bloque 1 (arregló el pendiente de paridad Marcas/Clientes) seguido del Bloque 2 (para que ese tipo de bug no vuelva a pasar desapercibido), y de ahí pasé a una versión acotada del Bloque 3 y al Bloque 4 completo. Tras cerrar esos cuatro bloques, Sergio pidió una ronda adicional de mejoras de navegación y un rediseño visual completo — no estaba prevista en esta hoja de ruta original, se documenta en la sección 6. Los Bloques 5 (PWA) y 6 (TypeScript, opcional) siguen sin empezar y se pueden planificar por separado cuando convenga.

## 6. Trabajo adicional realizado tras esta hoja de ruta (26/07/2026)

Con los Bloques 1, 2, 4 (y la parte acotada del 3) ya cerrados, Sergio pidió dos rondas más de mejora que no estaban previstas en el plan original:

**A. Navegación e información (antes del rediseño visual)**
- Reclasificación: Sell-Out Clientes y Sell-Out Marcas pasaron del grupo de entrada de datos al grupo de Análisis, donde encajan mejor conceptualmente; el importador se movió a su propia subcategoría de Importaciones.
- Migas de pan (breadcrumbs) en `Layout.js`, construidas desde un índice de navegación (`INDICE_BUSQUEDA`, exportado desde `Layout.js`) que también alimenta la búsqueda rápida y el listado de "últimos módulos utilizados".
- Selector de distribuidor global: antes había 3 selectores independientes (uno por pantalla); ahora el estado vive una sola vez en `App.js` y se muestra como un único selector en `Layout.js`, evitando que cada pantalla pierda de vista qué distribuidor tenía seleccionado el usuario al cambiar de pantalla.
- Buscador rápido (Ctrl+K): paleta de comandos que filtra el mismo índice de navegación, con navegación por teclado.
- Sidebar aplanado: cada grupo pasó a ser una única fila que lleva directamente a su pantalla de grupo, en vez de un árbol expandible — resolvía la queja de Sergio de que el menú lateral duplicaba la navegación que ya existía en la página de inicio.

**B. Rediseño visual completo — "Fase 8" (estilo Dynamics 365/Power BI/HubSpot)**
Sergio pidió un salto de calidad visual serio tras rechazar dos propuestas más genéricas mías, y dio una especificación muy detallada (colores hex exactos, escala tipográfica, radios, sombras, espaciados). Resumen de lo aplicado (detalle completo en la memoria del proyecto, `project_sellium_fase8_rediseno_visual.md`):
- Fondo oscuro `#0B1220`, sidebar `#111827`, tarjetas `#1E293B`, un único color corporativo indigo `#4F46E5` que sustituyó por completo al sistema "wine/gold" (vino/dorado) de la identidad "Sellium" anterior en todos los estados activos/seleccionados de la interfaz. Los tokens `wine`/`gold` siguen definidos en `tailwind.config.js` por si hicieran falta en el futuro, pero ya no se usan en ningún componente activo — cualquier estado "activo/seleccionado" nuevo debe usar indigo-600, no wine/gold.
- Tipografía Inter, radios más generosos (16px en tarjetas), sombras suaves, sidebar recompactado (menor padding, iconos más pequeños).
- Página de Inicio rediseñada: tarjetas más compactas alineadas a la izquierda, y una nueva sección "Últimos módulos utilizados" con seguimiento real de navegación (persistido en `localStorage` por usuario).
- Consistencia de KPI, gráficos y filtros: patrón `colorEje`/`colorGrid` sensible al modo oscuro aplicado de forma consistente en todos los gráficos Recharts tocados.
- **Bug encontrado y corregido**: al aplicar el patrón `colorEje`/`colorGrid` a `PantallaPresupuesto.js`, esas variables quedaron declaradas en el componente equivocado (`PantallaPresupuesto` en vez de `PestañaForecast`, que es donde se usan realmente) — esto rompió el build local (`Publicar App.bat`) con errores `no-undef` de ESLint. Corregido moviendo la declaración a `PestañaForecast` y verificado con un comprobador de scope a medida sobre los 19 archivos tocados en el rediseño (0 problemas encontrados). Sergio confirmó que tras el fix "parece que mejora".

**Pendiente explícito para una futura conversación**: pulido de estados de carga ("Cargando..." → skeletons, 124 sitios en 26 archivos) — aplazado a petición de Sergio, recordárselo cuando retome el trabajo visual.
