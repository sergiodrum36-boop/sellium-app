/*
 * usePestañasVisitadas.js
 * Hook compartido para dar "memoria" a las pestañas de la app, a petición de
 * Sergio: "si cambias de pestaña y vuelves, los datos/filtros que tenías se
 * han quitado y hay que volver a filtrarlo".
 *
 * Causa raíz: en React, cuando un componente deja de renderizarse su estado
 * interno (useState) se pierde para siempre. La navegación de la app estaba
 * montada así en App.js, PantallaDistribuidor.js y PantallaVentasReales.js:
 * `{condicion && <Componente/>}` — al cambiar de pestaña, la que deja de
 * estar activa se DESMONTA por completo (con sus filtros, selección, etc.),
 * y al volver a ella se vuelve a montar desde cero.
 *
 * Solución elegida (Sergio, entre las dos opciones planteadas): "recordar
 * tras la primera visita". En vez de desmontar/montar según la pestaña
 * activa, cada pestaña que se visita por primera vez se queda montada para
 * siempre (mientras dure la sesión) y solo se OCULTA con CSS (display:none)
 * cuando no es la activa — así conserva su estado interno al volver a ella.
 * Las pestañas que nunca se han visitado NO se montan (no se piden sus
 * datos a Firebase) hasta que el usuario entra en ellas por primera vez,
 * para no disparar todas las cargas de golpe al iniciar sesión.
 *
 * Uso, en un componente contenedor con varias subvistas controladas por un
 * id "activo" (p.ej. pantallaActiva, pestañaActiva, vistaActiva):
 *
 *   const visitadas = usePestañasVisitadas(idActivo);
 *   ...
 *   {visitadas.has(MI_ID) && (
 *     <div style={{ display: idActivo === MI_ID ? 'block' : 'none' }}>
 *       <MiComponente ... />
 *     </div>
 *   )}
 *
 * Nota (gráficos recharts): un componente que estaba oculto con
 * display:none no siempre recalcula bien su ancho al volver a mostrarse
 * (ResponsiveContainer mide 0px la primera vez). Por eso App.js dispara un
 * evento "resize" al cambiar de pantallaActiva — ver comentario allí.
 */
import { useState, useEffect } from 'react';

export default function usePestañasVisitadas(idActivo) {
  const [visitadas, setVisitadas] = useState(() => new Set(idActivo ? [idActivo] : []));

  useEffect(() => {
    if (!idActivo) return;
    setVisitadas(prev => (prev.has(idActivo) ? prev : new Set(prev).add(idActivo)));
  }, [idActivo]);

  return visitadas;
}
