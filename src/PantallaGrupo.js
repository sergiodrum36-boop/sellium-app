/*
 * PantallaGrupo.js (Rediseño visual, Fase 7 — "pantalla de menú por área",
 * a petición de Sergio: "al pulsar cualquier tarjeta debería enviar a otra
 * pantalla donde se apreciará cada menú, ahora hay que irse al sidebar").
 *
 * Hasta ahora, pulsar una tarjeta de Inicio (ver PantallaInicio.js) llevaba
 * directo a UNA pantalla de trabajo concreta (p.ej. "Ventas y A&P") — para
 * ver cualquier otra pantalla de esa misma área (p.ej. "Stock") había que
 * irse al Sidebar. Esta pantalla es el escalón intermedio que faltaba: un
 * "menú" a pantalla completa con TODOS los accesos de un grupo (Ventas y
 * Datos / Análisis / Administración — ver GROUPS en Layout.js), organizados
 * igual que en el Sidebar (mismas subcategorías), pero como tarjetas
 * grandes y centradas en vez de una lista estrecha.
 *
 * Es un componente GENÉRICO parametrizado por `grupoId`: no tiene un id de
 * pantalla propio por grupo — App.js le pasa directamente `pantallaActiva`
 * como `grupoId` (los 3 ids de grupo, 'ventas-datos'/'analisis'/
 * 'administracion', son los mismos que ya usa Layout.js/Sidebar.js) y este
 * componente busca sus datos (label/icon/color/items) en GROUPS, la misma
 * fuente que ya usa el Sidebar — así no puede desincronizarse.
 *
 * "Presupuesto y Forecast" NO tiene pantalla de grupo: es un único acceso
 * suelto (TOP_ITEMS en Layout.js, no un grupo con sub-items), así que su
 * tarjeta en Inicio sigue entrando directo a la pantalla — no hay "menú"
 * que enseñar cuando solo hay un destino posible.
 */

import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { GROUPS } from './Layout';
import { ESTILOS_COLOR } from './estilosArea';

// Un grupo puede tener sub-categorías (items con su propio `items`, ver
// modelo de datos en Sidebar.js) o items sueltos directamente. Se separan
// para pintar las sub-categorías como secciones con su propio título y los
// sueltos (si los hay) en una última sección sin título.
const esContenedor = (entrada) => Array.isArray(entrada.items);

function TarjetaItem({ item, estilos, onNavigate }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => onNavigate(item.id)}
      className={
        'flex flex-col items-center text-center gap-2 rounded-xl p-4 border bg-white dark:bg-slate-800 ' +
        'border-slate-200 dark:border-slate-700 transition-colors !font-medium ' + estilos.hoverTarjeta
      }
    >
      <span className={'w-10 h-10 rounded-lg flex items-center justify-center ' + estilos.iconoSuave}>
        <Icon size={18} />
      </span>
      <span className="text-sm text-slate-700 dark:text-slate-200">{item.label}</span>
    </button>
  );
}

function PantallaGrupo({ grupoId, onNavigate, onVolver }) {
  const grupo = GROUPS.find(g => g.id === grupoId);
  // No debería pasar (App.js solo monta esta pantalla cuando pantallaActiva
  // es uno de los ids de GROUPS), pero por si acaso un id queda obsoleto en
  // algún sitio, se evita romper el render.
  if (!grupo) return null;

  const Icon = grupo.icon;
  const estilos = ESTILOS_COLOR[grupo.color];
  const contenedores = grupo.items.filter(esContenedor);
  const sueltos = grupo.items.filter((e) => !esContenedor(e));

  return (
    <div>
      <button
        type="button"
        onClick={onVolver}
        className="!bg-transparent !border-0 !font-medium text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 inline-flex items-center gap-1.5 mb-6"
      >
        <ArrowLeft size={15} />
        Inicio
      </button>

      <div className="flex flex-col items-center text-center mb-8">
        <span className={'w-12 h-12 rounded-lg flex items-center justify-center mb-3 ' + estilos.icono}>
          <Icon size={24} />
        </span>
        <h1 className="text-xl font-bold uppercase tracking-wide text-slate-900 dark:text-white mb-1.5">
          {grupo.label}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">{grupo.descripcion}</p>
      </div>

      <div className="space-y-8 max-w-3xl mx-auto">
        {contenedores.map((sub) => (
          <div key={sub.id}>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 text-center mb-3">
              {sub.label}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {sub.items.map((item) => (
                <TarjetaItem key={item.id} item={item} estilos={estilos} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}

        {sueltos.length > 0 && (
          <div>
            {contenedores.length > 0 && (
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 text-center mb-3">
                Otros accesos
              </h2>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {sueltos.map((item) => (
                <TarjetaItem key={item.id} item={item} estilos={estilos} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PantallaGrupo;
