/*
 * PantallaEstructuraComercial.js
 * RENOMBRADA A "Equipo Comercial" en pantalla (26/07/2026) — el nombre del
 * archivo y el id exportado (PANTALLA_ESTRUCTURA_COMERCIAL) se dejan tal
 * cual para no generar más churn del necesario, pero OJO: esto NO es lo que
 * Sergio llama "Estructura Comercial". Tras una primera pasada (construida
 * sobre una interpretación genérica de "CRM"), Sergio aclaró que para él
 * "Estructura Comercial" es otra cosa muy concreta: clasificar cada
 * distribuidor (A-E, según un Excel real que compartió) según su peso de
 * facturación dentro de la cartera de su comercial, para decidir cuántas
 * visitas trimestrales necesita — ver PantallaClasificacionComercial.js
 * (PANTALLA_CLASIFICACION_COMERCIAL), que es la pantalla que de verdad lleva
 * ese nombre en el menú.
 *
 * Esta pantalla (la de este archivo) sigue siendo útil por derecho propio:
 * es la ficha de personas (comerciales/preventistas) con su zona y su
 * jerarquía (supervisor) — el "quién" del equipo, complementario al "qué
 * peso tiene cada distribuidor" de Estructura Comercial. Por eso se
 * renombra a "Equipo Comercial" en el menú (ver CRM_ITEMS en Layout.js) en
 * vez de borrarse o fusionarse.
 *
 * Dos pestañas internas (Comerciales/Zonas, patrón simple igual que
 * PantallaPresupuesto.js) más un bloque de "Preventistas sin vincular": lee
 * los nombres de preventista que ya aparecen en Sell-Out por Cliente Final
 * pero que todavía no tienen un Comercial dado de alta con ese mismo nombre
 * (ver estructuraComercial.js/getPreventistasSinVincular) y deja crearlo con
 * un clic — así el alta de esta nueva estructura no obliga a teclear de cero
 * los nombres que la app ya conoce por las importaciones.
 *
 * Igual que "Presupuesto y Forecast"/"Gestión por Distribuidor": es una
 * pantalla de EDICIÓN de datos maestros propios de una cuenta, así que no
 * tiene sentido en modo "Todos los usuarios" (ver App.js) — se bloquea con
 * el mismo aviso que esas dos pantallas.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Network, MapPin, Plus, Trash2, Users, UserPlus } from 'lucide-react';
import {
  getZonasPorUsuario, saveNuevaZona,
  getComercialesPorUsuario, saveNuevoComercial,
  getMovimientosSellOutClientesGeneral,
  deleteDocument
} from './firebaseApi';
import { construirJerarquiaComerciales, getPreventistasSinVincular } from './estructuraComercial';
import {
  tarjeta, tituloPantalla, subtitulo, botonPrimario, botonSecundario, botonPeligro,
  inputClasses, etiqueta
} from './uiClasses';
import TablaOrdenable from './TablaOrdenable';

export const PANTALLA_ESTRUCTURA_COMERCIAL = 'ESTRUCTURA_COMERCIAL';

const ROLES_COMERCIAL = [
  { valor: 'preventista', etiqueta: 'Preventista' },
  { valor: 'supervisor', etiqueta: 'Supervisor' },
  { valor: 'gerente', etiqueta: 'Gerente' },
];

const FORM_COMERCIAL_VACIO = { nombre: '', email: '', telefono: '', rol: 'preventista', id_zona: '', id_supervisor: '' };

// Árbol de jerarquía: recursivo, con indentación por nivel — suficiente para
// esta primera versión (sin drag&drop ni colapsar/expandir, ver más adelante
// si la lista de comerciales crece mucho).
function NodoJerarquia({ nodo, nivel, mapaZonas }) {
  const nombreZona = nodo.id_zona ? (mapaZonas.get(nodo.id_zona) || '') : '';
  return (
    <div>
      <div
        className="flex items-center gap-2 py-1.5 border-b border-slate-100 dark:border-slate-700 last:border-0"
        style={{ paddingLeft: `${nivel * 20}px` }}
      >
        <Users size={13} className="text-slate-400 shrink-0" />
        <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{nodo.nombre}</span>
        <span className="text-[11px] text-slate-400 dark:text-slate-500">
          {ROLES_COMERCIAL.find(r => r.valor === nodo.rol)?.etiqueta || nodo.rol || '—'}
          {nombreZona && ` · ${nombreZona}`}
        </span>
      </div>
      {nodo.children.map(hijo => (
        <NodoJerarquia key={hijo.id} nodo={hijo} nivel={nivel + 1} mapaZonas={mapaZonas} />
      ))}
    </div>
  );
}

function PantallaEstructuraComercial({ idUsuario, bloqueadoPorTodos = false }) {
  const [pestañaInterna, setPestañaInterna] = useState('COMERCIALES');
  const [zonas, setZonas] = useState([]);
  const [comerciales, setComerciales] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [cargando, setCargando] = useState(true);

  const [nombreZona, setNombreZona] = useState('');
  const [descripcionZona, setDescripcionZona] = useState('');
  const [guardandoZona, setGuardandoZona] = useState(false);

  const [formComercial, setFormComercial] = useState({ ...FORM_COMERCIAL_VACIO });
  const [guardandoComercial, setGuardandoComercial] = useState(false);
  const [borrandoId, setBorrandoId] = useState(null);

  const cargarTodo = useCallback(async () => {
    if (!idUsuario) {
      setZonas([]); setComerciales([]); setMovimientos([]);
      setCargando(false);
      return;
    }
    setCargando(true);
    try {
      const [z, c, m] = await Promise.all([
        getZonasPorUsuario(idUsuario),
        getComercialesPorUsuario(idUsuario),
        getMovimientosSellOutClientesGeneral(idUsuario),
      ]);
      setZonas(z.sort((a, b) => (a.nombre_zona || '').localeCompare(b.nombre_zona || '', 'es')));
      setComerciales(c.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es')));
      setMovimientos(m);
    } catch (error) {
      console.error('Error cargando Estructura Comercial:', error);
      alert('Error al cargar Estructura Comercial: ' + error.message);
    }
    setCargando(false);
  }, [idUsuario]);

  useEffect(() => { cargarTodo(); }, [cargarTodo]);

  const mapaZonas = useMemo(() => new Map(zonas.map(z => [z.id, z.nombre_zona])), [zonas]);
  const mapaComerciales = useMemo(() => new Map(comerciales.map(c => [c.id, c.nombre])), [comerciales]);
  const jerarquia = useMemo(() => construirJerarquiaComerciales(comerciales), [comerciales]);
  const preventistasSinVincular = useMemo(
    () => getPreventistasSinVincular(movimientos, comerciales),
    [movimientos, comerciales]
  );

  const handleCrearZona = async (e) => {
    e.preventDefault();
    if (!nombreZona.trim()) { alert('El nombre de la zona no puede estar vacío.'); return; }
    setGuardandoZona(true);
    try {
      await saveNuevaZona({
        id_usuario: idUsuario,
        nombre_zona: nombreZona.trim(),
        descripcion: descripcionZona.trim(),
      });
      setNombreZona('');
      setDescripcionZona('');
      await cargarTodo();
    } catch (error) {
      console.error('Error creando zona:', error);
      alert('Error al crear la zona: ' + error.message);
    }
    setGuardandoZona(false);
  };

  const handleBorrarZona = async (zona) => {
    const enUso = comerciales.some(c => c.id_zona === zona.id);
    if (!window.confirm(
      `¿Borrar la zona "${zona.nombre_zona}"?` +
      (enUso ? ' Hay comerciales asignados a esta zona; se quedarán sin zona asignada.' : '')
    )) return;
    setBorrandoId(zona.id);
    try {
      await deleteDocument('zonas', zona.id);
      await cargarTodo();
    } catch (error) {
      console.error('Error borrando zona:', error);
      alert('Error al borrar la zona: ' + error.message);
    }
    setBorrandoId(null);
  };

  const crearComercial = async (datosBase) => {
    setGuardandoComercial(true);
    try {
      await saveNuevoComercial({
        id_usuario: idUsuario,
        nombre: datosBase.nombre.trim(),
        email: (datosBase.email || '').trim(),
        telefono: (datosBase.telefono || '').trim(),
        rol: datosBase.rol || 'preventista',
        id_zona: datosBase.id_zona || '',
        id_supervisor: datosBase.id_supervisor || '',
        activo: true,
      });
      await cargarTodo();
      return true;
    } catch (error) {
      console.error('Error creando comercial:', error);
      alert('Error al crear el comercial: ' + error.message);
      return false;
    } finally {
      setGuardandoComercial(false);
    }
  };

  const handleCrearComercial = async (e) => {
    e.preventDefault();
    if (!formComercial.nombre.trim()) { alert('El nombre del comercial no puede estar vacío.'); return; }
    const ok = await crearComercial(formComercial);
    if (ok) setFormComercial({ ...FORM_COMERCIAL_VACIO });
  };

  const handleCrearDesdeTexto = async (texto) => {
    await crearComercial({ ...FORM_COMERCIAL_VACIO, nombre: texto, rol: 'preventista' });
  };

  const handleBorrarComercial = async (comercial) => {
    const tieneSubordinados = comerciales.some(c => c.id_supervisor === comercial.id);
    if (!window.confirm(
      `¿Borrar a "${comercial.nombre}"?` +
      (tieneSubordinados ? ' Los comerciales que dependen de él/ella se quedarán sin supervisor asignado.' : '')
    )) return;
    setBorrandoId(comercial.id);
    try {
      await deleteDocument('comerciales', comercial.id);
      await cargarTodo();
    } catch (error) {
      console.error('Error borrando comercial:', error);
      alert('Error al borrar el comercial: ' + error.message);
    }
    setBorrandoId(null);
  };

  if (bloqueadoPorTodos) {
    return (
      <div className={tarjeta}>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          "Equipo Comercial" no está disponible en modo "Todos los usuarios" — zonas y comerciales son datos maestros de una cuenta concreta. Elige "Mis datos" o un usuario del selector "Viendo como" (barra lateral) para usar esta pantalla.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className={tituloPantalla}>Equipo Comercial</h1>
      <p className={subtitulo}>
        Comerciales/preventistas y zonas como entidades reales, con jerarquía — el "quién" del equipo. Para el peso y la clasificación de cada distribuidor, ver "Estructura Comercial".
      </p>

      <div className="flex gap-2 mb-5">
        <button
          type="button"
          onClick={() => setPestañaInterna('COMERCIALES')}
          className={pestañaInterna === 'COMERCIALES' ? botonPrimario : botonSecundario}
        >
          Comerciales
        </button>
        <button
          type="button"
          onClick={() => setPestañaInterna('ZONAS')}
          className={pestañaInterna === 'ZONAS' ? botonPrimario : botonSecundario}
        >
          Zonas
        </button>
      </div>

      {cargando ? (
        <div className="text-slate-500 dark:text-slate-400">Cargando datos...</div>
      ) : pestañaInterna === 'ZONAS' ? (
        <>
          <form onSubmit={handleCrearZona} className={`${tarjeta} mb-5 flex flex-wrap gap-3 items-end`}>
            <div>
              <label className={`${etiqueta} block mb-1`}>Nombre de la zona</label>
              <input
                type="text"
                value={nombreZona}
                onChange={(e) => setNombreZona(e.target.value)}
                placeholder="p.ej. Zona Norte"
                className={`${inputClasses} w-56`}
              />
            </div>
            <div>
              <label className={`${etiqueta} block mb-1`}>Descripción (opcional)</label>
              <input
                type="text"
                value={descripcionZona}
                onChange={(e) => setDescripcionZona(e.target.value)}
                placeholder="Notas sobre esta zona"
                className={`${inputClasses} w-72`}
              />
            </div>
            <button type="submit" disabled={guardandoZona} className={botonPrimario}>
              <span className="inline-flex items-center gap-1.5">
                <Plus size={14} />
                {guardandoZona ? 'Guardando...' : 'Añadir zona'}
              </span>
            </button>
          </form>

          <div className={tarjeta}>
            <h4 className="text-sm font-medium text-slate-900 dark:text-white mb-3">Zonas ({zonas.length})</h4>
            {zonas.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Todavía no hay zonas dadas de alta.</p>
            ) : (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700">
                <TablaOrdenable
                  filas={zonas}
                  keyExtractor={z => z.id}
                  columnas={[
                    {
                      titulo: 'Zona', valor: z => z.nombre_zona, render: z => (
                        <span className="font-semibold inline-flex items-center gap-1.5"><MapPin size={13} className="text-slate-400" />{z.nombre_zona}</span>
                      ),
                    },
                    { titulo: 'Descripción', valor: z => z.descripcion || '', render: z => z.descripcion || '—' },
                    { titulo: 'Comerciales asignados', derecha: true, valor: z => comerciales.filter(c => c.id_zona === z.id).length, render: z => comerciales.filter(c => c.id_zona === z.id).length },
                    {
                      titulo: 'Acciones', render: z => (
                        <button className={botonPeligro} disabled={borrandoId === z.id} onClick={() => handleBorrarZona(z)}>
                          <span className="inline-flex items-center gap-1"><Trash2 size={12} />Borrar</span>
                        </button>
                      ),
                    },
                  ]}
                />
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <form onSubmit={handleCrearComercial} className={`${tarjeta} mb-5 flex flex-wrap gap-3 items-end`}>
            <div>
              <label className={`${etiqueta} block mb-1`}>Nombre</label>
              <input
                type="text"
                value={formComercial.nombre}
                onChange={(e) => setFormComercial(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Nombre y apellidos"
                className={`${inputClasses} w-56`}
              />
            </div>
            <div>
              <label className={`${etiqueta} block mb-1`}>Rol</label>
              <select
                value={formComercial.rol}
                onChange={(e) => setFormComercial(f => ({ ...f, rol: e.target.value }))}
                className={`${inputClasses} w-40`}
              >
                {ROLES_COMERCIAL.map(r => <option key={r.valor} value={r.valor}>{r.etiqueta}</option>)}
              </select>
            </div>
            <div>
              <label className={`${etiqueta} block mb-1`}>Zona</label>
              <select
                value={formComercial.id_zona}
                onChange={(e) => setFormComercial(f => ({ ...f, id_zona: e.target.value }))}
                className={`${inputClasses} w-44`}
              >
                <option value="">Sin zona</option>
                {zonas.map(z => <option key={z.id} value={z.id}>{z.nombre_zona}</option>)}
              </select>
            </div>
            <div>
              <label className={`${etiqueta} block mb-1`}>Supervisor</label>
              <select
                value={formComercial.id_supervisor}
                onChange={(e) => setFormComercial(f => ({ ...f, id_supervisor: e.target.value }))}
                className={`${inputClasses} w-48`}
              >
                <option value="">Sin supervisor</option>
                {comerciales.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className={`${etiqueta} block mb-1`}>Email (opcional)</label>
              <input
                type="email"
                value={formComercial.email}
                onChange={(e) => setFormComercial(f => ({ ...f, email: e.target.value }))}
                className={`${inputClasses} w-48`}
              />
            </div>
            <div>
              <label className={`${etiqueta} block mb-1`}>Teléfono (opcional)</label>
              <input
                type="text"
                value={formComercial.telefono}
                onChange={(e) => setFormComercial(f => ({ ...f, telefono: e.target.value }))}
                className={`${inputClasses} w-36`}
              />
            </div>
            <button type="submit" disabled={guardandoComercial} className={botonPrimario}>
              <span className="inline-flex items-center gap-1.5">
                <Plus size={14} />
                {guardandoComercial ? 'Guardando...' : 'Añadir comercial'}
              </span>
            </button>
          </form>

          {preventistasSinVincular.length > 0 && (
            <div className={`${tarjeta} mb-5 border-amber-200 dark:border-amber-500/30`}>
              <h4 className="text-sm font-medium text-slate-900 dark:text-white mb-1">Preventistas sin vincular</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                Estos nombres aparecen en Sell-Out por Cliente Final pero todavía no tienen un comercial dado de alta con ese nombre. Puedes crearlos con un clic (rol "Preventista", sin zona ni supervisor — edítalos después si hace falta).
              </p>
              <div className="flex flex-wrap gap-2">
                {preventistasSinVincular.map((p) => (
                  <button
                    key={p.texto}
                    type="button"
                    disabled={guardandoComercial}
                    onClick={() => handleCrearDesdeTexto(p.texto)}
                    className="!bg-amber-50 dark:!bg-amber-500/10 hover:!bg-amber-100 dark:hover:!bg-amber-500/20 !text-amber-800 dark:!text-amber-300 !border !border-amber-200 dark:!border-amber-500/30 !font-medium text-xs px-3 py-1.5 rounded-full inline-flex items-center gap-1.5"
                  >
                    <UserPlus size={12} />
                    {p.texto} ({p.count})
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={`${tarjeta} mb-5`}>
            <h4 className="text-sm font-medium text-slate-900 dark:text-white mb-3">Comerciales ({comerciales.length})</h4>
            {comerciales.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Todavía no hay comerciales dados de alta.</p>
            ) : (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700">
                <TablaOrdenable
                  filas={comerciales}
                  keyExtractor={c => c.id}
                  columnas={[
                    { titulo: 'Nombre', valor: c => c.nombre, render: c => <span className="font-semibold">{c.nombre}</span> },
                    { titulo: 'Rol', valor: c => ROLES_COMERCIAL.find(r => r.valor === c.rol)?.etiqueta || c.rol || '', render: c => ROLES_COMERCIAL.find(r => r.valor === c.rol)?.etiqueta || c.rol || '—' },
                    { titulo: 'Zona', valor: c => c.id_zona ? (mapaZonas.get(c.id_zona) || '') : '', render: c => c.id_zona ? (mapaZonas.get(c.id_zona) || '—') : '—' },
                    { titulo: 'Supervisor', valor: c => c.id_supervisor ? (mapaComerciales.get(c.id_supervisor) || '') : '', render: c => c.id_supervisor ? (mapaComerciales.get(c.id_supervisor) || '—') : '—' },
                    { titulo: 'Email', valor: c => c.email || '', render: c => c.email || '—' },
                    { titulo: 'Teléfono', valor: c => c.telefono || '', render: c => c.telefono || '—' },
                    {
                      titulo: 'Acciones', render: c => (
                        <button className={botonPeligro} disabled={borrandoId === c.id} onClick={() => handleBorrarComercial(c)}>
                          <span className="inline-flex items-center gap-1"><Trash2 size={12} />Borrar</span>
                        </button>
                      ),
                    },
                  ]}
                />
              </div>
            )}
          </div>

          <div className={tarjeta}>
            <h4 className="text-sm font-medium text-slate-900 dark:text-white mb-3">
              <span className="inline-flex items-center gap-1.5"><Network size={15} className="text-slate-400" />Jerarquía</span>
            </h4>
            {jerarquia.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Sin comerciales todavía.</p>
            ) : (
              <div>
                {jerarquia.map((raiz) => (
                  <NodoJerarquia key={raiz.id} nodo={raiz} nivel={0} mapaZonas={mapaZonas} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default PantallaEstructuraComercial;
