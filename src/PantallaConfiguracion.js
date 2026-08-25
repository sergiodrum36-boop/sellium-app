/*
 * PantallaConfiguracion.js
 * "Configuración" — pantalla de nivel superior (26/07/2026) para los
 * catálogos de la Agenda Comercial. Empezó con solo "Otras actividades"
 * (Trabajo administrativo, Vacaciones, Asuntos propios, Reunión comercial,
 * Prospección — ver firebaseApi/actividadesAgenda.js) y Sergio pidió mover
 * aquí también "Medio y Objetivo" (antes un gestor plegable dentro de la
 * propia Agenda Comercial): "esto se debe meter en Configuración" — un único
 * sitio para gestionar los 3 catálogos, en vez de repartidos entre pantallas.
 *
 * Los 3 catálogos NO se gestionan igual, y esta pantalla respeta esa
 * diferencia en vez de forzarlos a un mismo molde:
 *  - "Otras actividades" — colección GLOBAL `actividadesAgenda` (sin
 *    id_usuario, todos leen la misma lista). Sergio pidió explícitamente que
 *    NO la pueda tocar cualquiera: "si mañana lo usa más gente ellos no
 *    podrán manipularlo". Las reglas de Firestore exigen rol 'manager' para
 *    crear/borrar/renombrar (esManager() en firestore.rules) — esta pantalla
 *    solo añade una capa de UX a juego (oculta los controles si no eres
 *    manager, en vez de dejar que fallen con "permission-denied").
 *  - "Medio" y "Objetivo" — colección `catalogosAgenda`, PRIVADA por usuario
 *    (cada cuenta edita la suya) — el mismo dato de una cuenta concreta que
 *    ya usan Agenda Comercial y Planificación Comercial, así que esta
 *    sección respeta el mismo bloqueo en modo "Todos los usuarios" que el
 *    resto de pantallas de una cuenta (ver `bloqueadoPorTodos`).
 *
 * Vive como acceso de nivel superior (junto a "Presupuesto y Forecast"),
 * fuera de los grupos de Sidebar — no encaja en "Ventas y Datos", "Análisis"
 * ni "CRM y Comercial", y su uso es igual de infrecuente que Presupuesto.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Settings2, Pencil, X, ShieldAlert } from 'lucide-react';
import {
  getActividadesAgenda,
  saveNuevaActividadAgenda,
  actualizarActividadAgenda,
  seedActividadesAgendaPorDefecto,
  getCatalogosAgendaPorUsuario,
  saveNuevoCatalogoAgenda,
  actualizarCatalogoAgenda,
  seedCatalogosAgendaPorDefecto,
  deleteDocument,
} from './firebaseApi';
import { tarjeta, tituloPantalla, subtitulo, botonPrimario, botonSecundario, botonPill, inputClasses, etiqueta } from './uiClasses';

export const PANTALLA_CONFIGURACION = 'CONFIGURACION';

function PantallaConfiguracion({ idUsuario, bloqueadoPorTodos = false, esManager = false }) {
  // --- Otras actividades (global, solo manager edita) ---
  const [actividades, setActividades] = useState([]);
  const [cargandoActividades, setCargandoActividades] = useState(true);
  const [nuevaActividad, setNuevaActividad] = useState('');
  const [procesandoActividad, setProcesandoActividad] = useState(false);

  const cargarActividades = useCallback(async () => {
    setCargandoActividades(true);
    try {
      const lista = await getActividadesAgenda();
      setActividades(lista.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)));
    } catch (error) {
      console.error('Error cargando actividadesAgenda:', error);
      alert('Error al cargar el catálogo: ' + error.message);
    }
    setCargandoActividades(false);
  }, []);

  useEffect(() => { cargarActividades(); }, [cargarActividades]);

  const handleAgregarActividad = async () => {
    const texto = nuevaActividad.trim();
    if (!texto) return;
    setProcesandoActividad(true);
    try {
      await saveNuevaActividadAgenda(texto, actividades.length);
      setNuevaActividad('');
      await cargarActividades();
    } catch (error) {
      console.error('Error añadiendo actividad:', error);
      alert('Error al añadir: ' + error.message);
    }
    setProcesandoActividad(false);
  };

  const handleRenombrarActividad = async (item) => {
    const nuevoNombre = window.prompt('Nuevo nombre:', item.nombre);
    if (!nuevoNombre || !nuevoNombre.trim() || nuevoNombre.trim() === item.nombre) return;
    setProcesandoActividad(true);
    try {
      await actualizarActividadAgenda(item.id, { nombre: nuevoNombre.trim() });
      await cargarActividades();
    } catch (error) {
      console.error('Error renombrando actividad:', error);
      alert('Error al renombrar: ' + error.message);
    }
    setProcesandoActividad(false);
  };

  const handleBorrarActividad = async (item) => {
    if (!window.confirm(`¿Borrar "${item.nombre}" del catálogo? Las visitas que ya la usan conservan el texto tal cual, solo deja de poder elegirse para visitas nuevas.`)) return;
    setProcesandoActividad(true);
    try {
      await deleteDocument('actividadesAgenda', item.id);
      await cargarActividades();
    } catch (error) {
      console.error('Error borrando actividad:', error);
      alert('Error al borrar: ' + error.message);
    }
    setProcesandoActividad(false);
  };

  const handleSeedActividades = async () => {
    setProcesandoActividad(true);
    try {
      await seedActividadesAgendaPorDefecto();
      await cargarActividades();
    } catch (error) {
      console.error('Error cargando valores por defecto:', error);
      alert('Error: ' + error.message);
    }
    setProcesandoActividad(false);
  };

  // --- Medio y Objetivo (privado por usuario, cualquiera edita el suyo) ---
  const [catalogos, setCatalogos] = useState([]);
  const [cargandoCatalogos, setCargandoCatalogos] = useState(true);
  const [nuevoMedio, setNuevoMedio] = useState('');
  const [nuevoObjetivo, setNuevoObjetivo] = useState('');
  const [procesandoCatalogo, setProcesandoCatalogo] = useState(false);

  const cargarCatalogos = useCallback(async () => {
    if (!idUsuario) { setCatalogos([]); setCargandoCatalogos(false); return; }
    setCargandoCatalogos(true);
    try {
      const lista = await getCatalogosAgendaPorUsuario(idUsuario);
      setCatalogos(lista);
    } catch (error) {
      console.error('Error cargando catalogosAgenda:', error);
      alert('Error al cargar Medio/Objetivo: ' + error.message);
    }
    setCargandoCatalogos(false);
  }, [idUsuario]);

  useEffect(() => { cargarCatalogos(); }, [cargarCatalogos]);

  const mediosCatalogo = catalogos.filter((c) => c.tipo === 'medio').sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  const objetivosCatalogo = catalogos.filter((c) => c.tipo === 'objetivo').sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

  const handleAgregarCatalogo = async (tipo, nombre) => {
    const texto = (nombre || '').trim();
    if (!texto) return;
    const yaExiste = catalogos.some((c) => c.tipo === tipo && c.nombre.toLowerCase() === texto.toLowerCase());
    if (yaExiste) { alert('Ya existe una opción con ese nombre.'); return; }
    const maxOrden = catalogos.filter((c) => c.tipo === tipo).reduce((m, c) => Math.max(m, c.orden || 0), -1);
    setProcesandoCatalogo(true);
    try {
      await saveNuevoCatalogoAgenda(idUsuario, tipo, texto, maxOrden + 1);
      if (tipo === 'medio') setNuevoMedio(''); else setNuevoObjetivo('');
      await cargarCatalogos();
    } catch (error) {
      console.error('Error añadiendo la opción:', error);
      alert('Error al añadir: ' + error.message);
    }
    setProcesandoCatalogo(false);
  };

  const handleRenombrarCatalogo = async (item) => {
    const nuevoNombre = window.prompt('Nuevo nombre:', item.nombre);
    if (!nuevoNombre || !nuevoNombre.trim() || nuevoNombre.trim() === item.nombre) return;
    setProcesandoCatalogo(true);
    try {
      await actualizarCatalogoAgenda(item.id, { nombre: nuevoNombre.trim() });
      await cargarCatalogos();
    } catch (error) {
      console.error('Error renombrando la opción:', error);
      alert('Error al renombrar: ' + error.message);
    }
    setProcesandoCatalogo(false);
  };

  const handleBorrarCatalogo = async (item) => {
    if (!window.confirm(`¿Borrar "${item.nombre}"? Las visitas que ya lo tengan puesto conservan el texto, solo deja de estar disponible para las nuevas.`)) return;
    setProcesandoCatalogo(true);
    try {
      await deleteDocument('catalogosAgenda', item.id);
      await cargarCatalogos();
    } catch (error) {
      console.error('Error borrando la opción:', error);
      alert('Error al borrar: ' + error.message);
    }
    setProcesandoCatalogo(false);
  };

  const handleSeedCatalogos = async () => {
    setProcesandoCatalogo(true);
    try {
      await seedCatalogosAgendaPorDefecto(idUsuario);
      await cargarCatalogos();
    } catch (error) {
      console.error('Error cargando los valores por defecto:', error);
      alert('Error: ' + error.message);
    }
    setProcesandoCatalogo(false);
  };

  return (
    <div>
      <h1 className={tituloPantalla}>Configuración</h1>
      <p className={subtitulo}>
        Catálogos que se usan al crear o cerrar una visita en la Agenda Comercial: Medio, Objetivo y "otras actividades" sin distribuidor.
      </p>

      <div className={`${tarjeta} mb-5`}>
        <h4 className="text-sm font-medium text-slate-900 dark:text-white mb-3">
          <span className="inline-flex items-center gap-1.5"><Settings2 size={15} className="text-slate-400" />Medio y Objetivo</span>
        </h4>
        {bloqueadoPorTodos ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Medio y Objetivo son datos de una cuenta concreta — elige "Mis datos" o un usuario del selector "Viendo como" (barra lateral) para editarlos.
          </p>
        ) : cargandoCatalogos ? (
          <div className="text-slate-500 dark:text-slate-400 text-sm">Cargando...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {[
              { tipo: 'medio', titulo: 'Medio', lista: mediosCatalogo, valor: nuevoMedio, setValor: setNuevoMedio },
              { tipo: 'objetivo', titulo: 'Objetivo', lista: objetivosCatalogo, valor: nuevoObjetivo, setValor: setNuevoObjetivo },
            ].map((col) => (
              <div key={col.tipo}>
                <h5 className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">{col.titulo}</h5>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {col.lista.length === 0 && <span className="text-xs text-slate-400">Sin opciones todavía.</span>}
                  {col.lista.map((item) => (
                    <span key={item.id} className={`${botonPill} inline-flex items-center gap-1`}>
                      {item.nombre}
                      <button type="button" onClick={() => handleRenombrarCatalogo(item)} disabled={procesandoCatalogo} className="text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-200" title="Renombrar">
                        <Pencil size={11} />
                      </button>
                      <button type="button" onClick={() => handleBorrarCatalogo(item)} disabled={procesandoCatalogo} className="text-indigo-400 hover:text-red-600" title="Borrar">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={col.valor}
                    onChange={(e) => col.setValor(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAgregarCatalogo(col.tipo, col.valor); }}
                    placeholder={`Nuevo ${col.titulo.toLowerCase()}...`}
                    className={`${inputClasses} flex-1`}
                  />
                  <button type="button" disabled={procesandoCatalogo} onClick={() => handleAgregarCatalogo(col.tipo, col.valor)} className={botonSecundario}>
                    Añadir
                  </button>
                </div>
              </div>
            ))}
            {mediosCatalogo.length === 0 && objetivosCatalogo.length === 0 && (
              <div className="sm:col-span-2">
                <button type="button" disabled={procesandoCatalogo} onClick={handleSeedCatalogos} className={botonPrimario}>
                  Cargar valores por defecto
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {!esManager && (
        <div className={`${tarjeta} mb-5 border-amber-200 dark:border-amber-500/30`}>
          <p className="text-sm text-slate-700 dark:text-slate-300 inline-flex items-start gap-2">
            <ShieldAlert size={16} className="text-amber-500 mt-0.5 shrink-0" />
            "Otras actividades" es compartido por todos los usuarios y solo un manager puede añadir, renombrar o borrar opciones. Aquí solo puedes consultarlo.
          </p>
        </div>
      )}

      {cargandoActividades ? (
        <div className="text-slate-500 dark:text-slate-400">Cargando...</div>
      ) : (
        <div className={tarjeta}>
          <h4 className="text-sm font-medium text-slate-900 dark:text-white mb-3">
            <span className="inline-flex items-center gap-1.5"><Settings2 size={15} className="text-slate-400" />Otras actividades (sin distribuidor)</span>
          </h4>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {actividades.length === 0 && <span className="text-xs text-slate-400">Sin actividades todavía.</span>}
            {actividades.map((item) => (
              <span key={item.id} className={`${botonPill} inline-flex items-center gap-1`}>
                {item.nombre}
                {esManager && (
                  <>
                    <button type="button" onClick={() => handleRenombrarActividad(item)} disabled={procesandoActividad} className="text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-200" title="Renombrar">
                      <Pencil size={11} />
                    </button>
                    <button type="button" onClick={() => handleBorrarActividad(item)} disabled={procesandoActividad} className="text-indigo-400 hover:text-red-600" title="Borrar">
                      <X size={12} />
                    </button>
                  </>
                )}
              </span>
            ))}
          </div>

          {esManager && (
            <>
              <div className="flex gap-2 max-w-md">
                <input
                  type="text"
                  value={nuevaActividad}
                  onChange={(e) => setNuevaActividad(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAgregarActividad(); }}
                  placeholder="Nueva actividad..."
                  className={`${inputClasses} flex-1`}
                />
                <button type="button" disabled={procesandoActividad} onClick={handleAgregarActividad} className={botonSecundario}>
                  Añadir
                </button>
              </div>
              {actividades.length === 0 && (
                <button type="button" disabled={procesandoActividad} onClick={handleSeedActividades} className={`${botonPrimario} mt-3`}>
                  Cargar valores por defecto
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default PantallaConfiguracion;
