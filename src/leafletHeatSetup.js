/*
 * leafletHeatSetup.js
 * `leaflet.heat` (el plugin que dibuja la "mancha de aceite" de calor) está
 * escrito como un script clásico que espera encontrar `L` como variable
 * GLOBAL (`L.HeatLayer = ...`), no como un módulo que importe "leaflet" por
 * su cuenta — funciona bien con una etiqueta <script> suelta, pero con un
 * bundler (webpack, vía react-scripts) `import 'leaflet'` NO deja `L` en
 * `window` automáticamente. Sin este archivo, `import 'leaflet.heat'`
 * lanzaría "L is not defined" en cuanto se cargara.
 *
 * Fix estándar para este problema conocido de leaflet.heat + bundlers:
 * importar leaflet, colgarlo a propósito de `window.L`, y SOLO ENTONCES
 * cargar leaflet.heat. Se aísla aquí en su propio archivo para que el
 * porqué de este hack esté en un único sitio, en vez de repetido en
 * PantallaGeolocalizacion.js.
 *
 * Nota técnica: leaflet.heat se carga con `require(...)`, no con un segundo
 * `import`. Un `import` se "iza" (hoist) al principio del archivo aunque se
 * escriba más abajo, así que un segundo import se ejecutaría ANTES de la
 * línea `window.L = L` y volveríamos a tener "L is not defined" — además de
 * que ESLint (regla import/first) directamente rechaza tener código entre
 * dos imports, lo cual rompía el build (`npm run build` fallaba con "Failed
 * to compile"). `require(...)` no se iza: se ejecuta exactamente en el
 * orden en que aparece, así que aquí sí ocurre después de fijar `window.L`.
 */

import L from 'leaflet';

if (typeof window !== 'undefined' && !window.L) {
  window.L = L;
}

require('leaflet.heat');

export default L;
