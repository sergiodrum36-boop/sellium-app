/*
 * PantallaInicio.js (Rediseño visual, Fase 6 — "Pantalla de inicio", a
 * petición de Sergio: "el sidebar se ve todo cargado, cuesta trabajo saber
 * qué es cada cosa").
 *
 * Antes la app arrancaba directo en "Ventas y A&P" (dentro de Gestión por
 * Distribuidor) — no había ningún punto de entrada neutral que explicara
 * qué hay en cada apartado. Esta pantalla es ese punto de entrada: un id de
 * nivel superior más (PANTALLA_INICIO, definido en Layout.js igual que
 * PANTALLA_REPORTES/PANTALLA_DASHBOARD, porque como esos dos no es un
 * componente con lógica propia — es un id "genérico" del cascarón de
 * navegación) que App.js pone como pantalla por defecto tanto al cargar la
 * app como justo después de iniciar sesión.
 *
 * 4 tarjetas grandes, una por área (Ventas y Datos / Análisis / Presupuesto
 * y Forecast / Administración — ver GROUPS en Layout.js para las 3
 * primeras, la de Presupuesto es un acceso suelto sin grupo propio).
 *
 * Cambio v2 (a petición de Sergio: "no me gusta del todo, los títulos más
 * grandes y en mayúsculas"): de una fila de 5-6 chips por tarjeta a un
 * único botón "Entrar", fondo de color propio por tarjeta y título en
 * mayúsculas más grande.
 *
 * Cambio v3 — Fase 7 (a petición de Sergio: "al pulsar cualquier tarjeta
 * debería enviar a otra pantalla donde se aprecie cada menú, ahora hay que
 * irse al sidebar"; "los textos deberían estar centrados"; "la columna de
 * alerta no me gusta y tampoco que aparezcan los mensajes"):
 *  - El botón "Entrar" de Ventas y Datos/Análisis/Administración ya NO
 *    lleva directo a una pantalla de trabajo — lleva al "menú" de esa área
 *    (ver PantallaGrupo.js), que enseña TODOS sus accesos como tarjetas,
 *    sin tener que abrir el Sidebar. Presupuesto y Forecast es la única
 *    excepción: al ser un único acceso (no un grupo, ver TOP_ITEMS en
 *    Layout.js) sigue entrando directo — no hay "menú" que enseñar con un
 *    solo destino.
 *  - Contenido de cada tarjeta centrado (icono, título, descripción y
 *    botón), no alineado a la izquierda.
 *  - Se quita por completo el bloque de alertas de esta pantalla (la cifra
 *    grande + el listado de mensajes de la v2): a Sergio no le convencía
 *    ni el bloque ni ver los mensajes aquí. Las alertas se siguen viendo
 *    igual que siempre en la campana del pie del Sidebar (AlertasBell.js) —
 *    no se ha tocado esa parte, solo se ha quitado la duplicación en Inicio.
 *  - Los datos de las 3 tarjetas de grupo (título/icono/color/descripción)
 *    ahora se leen de GROUPS (Layout.js) en vez de estar duplicados aquí,
 *    para que no puedan desincronizarse del Sidebar/PantallaGrupo.
 *
 * Cambio v4 — Fase 8 ("salto de calidad visual", especificación detallada de
 * Sergio: estilo Dynamics 365/Power BI/HubSpot — "la Home no debe parecer un
 * menú gigante, debe parecer una zona de acceso profesional"):
 *  - Las tarjetas dejan de estar centradas y en mayúsculas: ahora son
 *    tarjetas compactas alineadas a la izquierda (icono + título en formato
 *    normal, descripción breve, "Acceder →" como enlace de texto en vez de
 *    botón con borde) — icono/título en la misma línea, altura y márgenes
 *    internos reducidos para que las 4 quepan en dos filas sin dominar toda
 *    la pantalla.
 *  - Nueva sección "Últimos módulos utilizados" debajo de las tarjetas: lee
 *    `historialReciente` (prop, ids de pantalla en orden de uso más
 *    reciente — lo calcula y persiste App.js en localStorage, ver cabecera
 *    de ese archivo) y resuelve cada id a su {label, icon} vía
 *    INDICE_BUSQUEDA (Layout.js, la misma fuente que ya usa el buscador
 *    Ctrl+K) — así nunca puede desincronizarse de los nombres/iconos reales.
 *    Si todavía no hay historial (usuario recién logueado), la sección
 *    simplemente no se muestra — nada de placeholders vacíos.
 */

import React from 'react';
import { Target, ArrowRight } from 'lucide-react';
import { tituloPantalla, subtitulo } from './uiClasses';
import { GROUPS, INDICE_BUSQUEDA } from './Layout';
import { PANTALLA_PRESUPUESTO } from './PantallaPresupuesto';
import { ESTILOS_COLOR } from './estilosArea';

// Presupuesto y Forecast no es un grupo (no tiene sub-items, ver TOP_ITEMS
// en Layout.js) así que no sale de GROUPS — se define aquí como una
// tarjeta más, con la misma forma que un grupo para poder tratarlas todas
// igual al pintar.
const TARJETA_PRESUPUESTO = {
  id: 'presupuesto',
  label: 'Presupuesto y Forecast',
  icon: Target,
  color: 'amber',
  descripcion: 'Planificación del objetivo anual. Se usa solo una o dos veces al año, por eso tiene hueco propio.',
  idDestino: PANTALLA_PRESUPUESTO,
};

function nombreDesdeEmail(email) {
  if (!email) return '';
  const usuario = email.split('@')[0] || '';
  if (!usuario) return '';
  return usuario.charAt(0).toUpperCase() + usuario.slice(1);
}

function PantallaInicio({ onNavigate, userEmail, historialReciente = [] }) {
  const nombre = nombreDesdeEmail(userEmail);

  // Las 3 tarjetas de grupo navegan a su pantalla de menú (PantallaGrupo.js,
  // vía el propio id del grupo); Presupuesto navega directo a su pantalla
  // de trabajo, ver cabecera del archivo.
  const tarjetas = [
    ...GROUPS.map(g => ({ ...g, idDestino: g.id })),
    TARJETA_PRESUPUESTO,
  ];

  // Últimos módulos: resuelve cada id guardado a su entrada real del índice
  // de navegación — si un id quedara obsoleto (pantalla renombrada/quitada),
  // simplemente se descarta en vez de romper el render.
  const recientesResueltos = historialReciente
    .map((id) => INDICE_BUSQUEDA.find((e) => e.id === id))
    .filter(Boolean);

  return (
    <div>
      <h1 className={tituloPantalla}>{nombre ? `Hola, ${nombre}` : 'Inicio'}</h1>
      <p className={subtitulo}>Elige dónde quieres trabajar.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {tarjetas.map(tarjeta => {
          const Icon = tarjeta.icon;
          const estilos = ESTILOS_COLOR[tarjeta.color];
          return (
            <div
              key={tarjeta.id}
              className={'rounded-2xl p-4 border ' + estilos.fondo + ' ' + estilos.borde}
            >
              <div className="flex items-center gap-2.5 mb-1.5">
                <span className={'shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ' + estilos.icono}>
                  <Icon size={16} />
                </span>
                <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  {tarjeta.label}
                </h2>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mb-2.5 max-w-sm">
                {tarjeta.descripcion}
              </p>
              <button
                type="button"
                onClick={() => onNavigate(tarjeta.idDestino)}
                className={'!bg-transparent !border-0 !p-0 !font-semibold text-xs inline-flex items-center gap-1 ' + estilos.boton}
              >
                Acceder
                <ArrowRight size={13} />
              </button>
            </div>
          );
        })}
      </div>

      {recientesResueltos.length > 0 && (
        <div className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">
            Últimos módulos utilizados
          </h3>
          <div className="flex flex-wrap gap-2">
            {recientesResueltos.map((entrada) => {
              const Icon = entrada.icon;
              return (
                <button
                  key={entrada.id}
                  type="button"
                  onClick={() => onNavigate(entrada.id)}
                  className="flex items-center gap-1.5 !font-medium text-xs px-3 py-1.5 rounded-full !border !border-slate-200 dark:!border-slate-700 !bg-white dark:!bg-slate-800 !text-slate-600 dark:!text-slate-300 hover:!border-indigo-300 dark:hover:!border-indigo-500/50 hover:!text-indigo-700 dark:hover:!text-indigo-300"
                >
                  <Icon size={13} />
                  {entrada.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default PantallaInicio;
