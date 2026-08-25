/*
 * FiltroMultiSelect.js
 * Compartido entre DashboardSellOutClientes.js y DashboardSellOutMarcas.js.
 *
 * A petición de Sergio (2026-07-19, tercera vuelta sobre estos filtros):
 * "tiene que ser un filtro donde pueda seleccionar los clientes que quiera
 * o deseleccionar los que no quiera... los demás filtros también tienen
 * que tener esa opción, igual quiero seleccionar dos zonas o a 4
 * comerciales" — Zona, Preventista y Cliente pasan de elegir UN valor
 * (FiltroSelect.js/FiltroBuscador.js, ya no se usan) a elegir CUALQUIER
 * combinación de varios a la vez.
 *
 * CUARTA vuelta (2026-07-19, mismo día): "solo puedo seleccionar pero no
 * puedo deseleccionar... deberían aparecer todos seleccionados y con el
 * buscador buscar lo que quisiera quitar, también debería tener opción de
 * deseleccionarlo todo para así poder seleccionar los que quiera". El
 * problema real de la v1: sin filtro activo (`values = []`, "se ve todo")
 * las casillas se pintaban TODAS vacías, así que quitar uno o dos clientes
 * de una lista de 500 exigía marcar los otros 498 a mano.
 *
 * Ahora hay dos formas de trabajar, y las dos parten de `values = []`:
 *   1) Modo "todos" (el que se ve nada más abrir el desplegable, sin tocar
 *      nada todavía): TODAS las casillas aparecen marcadas, porque sin
 *      filtro se están viendo todos. Desmarcar una casilla la EXCLUYE — por
 *      dentro, `values` pasa a ser "todos menos ese" (se manda al padre
 *      como lista de ids incluidos; el filtro no cambia de forma).
 *   2) Modo "ninguno" (tras pulsar "Deseleccionar todo"): todas las
 *      casillas aparecen vacías y hay que ir marcando una a una las que se
 *      quieren — para el caso contrario, elegir 2 zonas o 4 comerciales de
 *      una lista corta.
 * Como `values = []` sirve para las dos cosas (sin filtro = "todos" para
 * quien consume el filtro), la diferencia entre los dos modos es solo
 * visual/interactiva y vive en el estado local `modoVacio` de este
 * componente — se reinicia a modo "todos" en cuanto cambian las opciones
 * (cambio de distribuidor), que es cuando de verdad hay que empezar de cero.
 *
 * Para no pintar 495 chips cuando solo se han excluido 3 clientes (o al
 * revés), el bloque de chips muestra siempre el lado más corto: si hay más
 * marcados que descartados enseña los "excluidos" (con opción de
 * reincluirlos), y si hay menos marcados que el total enseña los
 * "incluidos" (con opción de quitarlos).
 */
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { etiqueta, inputClasses } from './uiClasses';

const LIMITE_RESULTADOS = 200;
const LIMITE_CHIPS = 20;

function FiltroMultiSelect({ label, values, onChange, opciones, getValue = (o) => o.id, getLabel = (o) => o.nombre, placeholder = 'Todos', className = '' }) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  // true = se partió de "Deseleccionar todo" y hay que ir marcando uno a
  // uno; false (por defecto) = se parte de "todos marcados" y desmarcar
  // excluye. Ver comentario de cabecera.
  const [modoVacio, setModoVacio] = useState(false);
  const ref = useRef(null);

  // Cambiar de distribuidor (u otro contexto) trae opciones nuevas — se
  // vuelve a partir de "todos marcados", no de la última elección manual.
  useEffect(() => { setModoVacio(false); }, [opciones]);

  useEffect(() => {
    const handleClickFuera = (e) => {
      if (ref.current && !ref.current.contains(e.target)) { setAbierto(false); setBusqueda(''); }
    };
    document.addEventListener('mousedown', handleClickFuera);
    return () => document.removeEventListener('mousedown', handleClickFuera);
  }, []);

  const filtradas = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    const base = !t ? opciones : opciones.filter((o) => getLabel(o).toLowerCase().includes(t));
    return base.slice(0, LIMITE_RESULTADOS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, opciones]);

  // Sin filtro activo (values vacío): en modo "todos" se ve todo marcado;
  // en modo "ninguno" (tras Deseleccionar todo) se ve todo vacío.
  const estaElegido = (o) => (values.length === 0 ? !modoVacio : values.includes(getValue(o)));

  const toggle = (o) => {
    const v = getValue(o);
    if (values.length === 0 && !modoVacio) {
      // Estaban todos marcados de forma implícita — desmarcar uno lo
      // convierte en "todos menos este", explícito.
      onChange(opciones.map(getValue).filter((x) => x !== v));
      return;
    }
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  };

  const quitar = (v) => onChange(values.filter((x) => x !== v));
  const reincluir = (v) => onChange([...values, v]);

  const deseleccionarTodo = () => { onChange([]); setModoVacio(true); };
  const seleccionarTodo = () => { onChange([]); setModoVacio(false); };

  // Qué lado enseñar en los chips: el más corto.
  const excluidos = useMemo(() => {
    if (values.length === 0) return [];
    return opciones.filter((o) => !values.includes(getValue(o)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, opciones]);

  const incluidos = useMemo(() => {
    if (values.length === 0) return [];
    return values.map((v) => opciones.find((o) => getValue(o) === v)).filter(Boolean);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, opciones]);

  const modoExclusion = values.length > 0 && excluidos.length < incluidos.length;
  const chipsAMostrar = modoExclusion ? excluidos : incluidos;

  let textoBoton = placeholder;
  if (values.length === 0 && modoVacio) textoBoton = 'Ninguno seleccionado';
  else if (values.length > 0 && modoExclusion) textoBoton = `Todos menos ${excluidos.length}`;
  else if (values.length > 0) textoBoton = `${values.length} seleccionado${values.length !== 1 ? 's' : ''}`;

  return (
    <div className={className} ref={ref} style={{ position: 'relative' }}>
      <label className={etiqueta}>{label}</label><br />
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className={`${inputClasses} w-full flex items-center justify-between gap-2 text-left !font-normal`}
      >
        <span className={values.length === 0 && !modoVacio ? 'text-slate-400 dark:text-slate-500' : ''}>
          {textoBoton}
        </span>
        <ChevronDown size={14} className="shrink-0 text-slate-400" />
      </button>

      {(chipsAMostrar.length > 0 || (values.length === 0 && modoVacio)) && (
        <div className="flex flex-wrap items-center gap-1 mt-1.5">
          {modoExclusion && chipsAMostrar.length > 0 && (
            <span className="text-[11px] text-slate-400 dark:text-slate-500 mr-0.5">Excluidos:</span>
          )}
          {chipsAMostrar.slice(0, LIMITE_CHIPS).map((o) => (
            <span
              key={getValue(o)}
              className={`inline-flex items-center gap-1 rounded-full pl-2.5 pr-1 py-0.5 text-[11px] font-semibold ${
                modoExclusion
                  ? 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/30'
                  : 'bg-indigo-50 dark:bg-indigo-500/15 !text-indigo-700 dark:!text-indigo-300'
              }`}
            >
              {getLabel(o)}
              <button
                type="button"
                onClick={() => (modoExclusion ? reincluir(getValue(o)) : quitar(getValue(o)))}
                className="!border-0 !bg-transparent p-0.5 rounded-full hover:!bg-black/10 dark:hover:!bg-white/10"
                title={modoExclusion ? 'Volver a incluir' : 'Quitar'}
              >
                <X size={10} />
              </button>
            </span>
          ))}
          {chipsAMostrar.length > LIMITE_CHIPS && (
            <span className="text-[11px] text-slate-400 dark:text-slate-500">y {chipsAMostrar.length - LIMITE_CHIPS} más</span>
          )}
          {values.length > 0 && (
            <button
              type="button"
              onClick={deseleccionarTodo}
              className="text-[11px] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 underline !border-0 !bg-transparent"
            >
              Deseleccionar todo
            </button>
          )}
          {values.length === 0 && modoVacio && (
            <span className="text-[11px] text-slate-400 dark:text-slate-500">Marca los que quieras en el buscador de abajo</span>
          )}
        </div>
      )}

      {abierto && (
        <div className="absolute z-30 mt-1 w-full max-h-80 flex flex-col bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-md shadow-lg overflow-hidden">
          {opciones.length > 8 && (
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar..."
              autoFocus
              className={`${inputClasses} !rounded-none !border-0 !border-b !border-b-slate-200 dark:!border-b-slate-700 w-full shrink-0`}
            />
          )}
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-slate-100 dark:border-slate-700 shrink-0">
            <button
              type="button"
              onClick={seleccionarTodo}
              className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline !border-0 !bg-transparent"
            >
              Marcar todos
            </button>
            <button
              type="button"
              onClick={deseleccionarTodo}
              className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:underline !border-0 !bg-transparent"
            >
              Deseleccionar todo
            </button>
          </div>
          <div className="overflow-y-auto">
            {filtradas.length === 0 && (
              <div className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">Sin resultados.</div>
            )}
            {filtradas.map((o) => (
              <button
                key={getValue(o)}
                type="button"
                onClick={() => toggle(o)}
                className={
                  'w-full text-left px-3 py-1.5 text-sm !border-0 !font-normal flex items-center gap-2 transition-colors ' +
                  (estaElegido(o)
                    ? '!bg-indigo-50 dark:!bg-indigo-500/15 !text-indigo-700 dark:!text-indigo-300'
                    : '!bg-transparent !text-slate-600 dark:!text-slate-300 hover:!bg-slate-100 dark:hover:!bg-slate-700')
                }
              >
                <span className={`w-3.5 h-3.5 rounded-sm border shrink-0 flex items-center justify-center ${estaElegido(o) ? '!bg-indigo-600 !border-indigo-600' : 'border-slate-300 dark:border-slate-500'}`}>
                  {estaElegido(o) && <span className="w-1.5 h-1.5 rounded-[1px] bg-white" />}
                </span>
                {getLabel(o)}
              </button>
            ))}
          </div>
          {opciones.length > LIMITE_RESULTADOS && filtradas.length === LIMITE_RESULTADOS && (
            <div className="px-3 py-1.5 text-[11px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-700 shrink-0">
              Hay más de {LIMITE_RESULTADOS} resultados — sigue escribiendo para acotar.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default FiltroMultiSelect;
