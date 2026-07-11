/*
 * Auditoria.js (Versión 1.0)
 * Nueva pantalla, a petición de Sergio (mejora de "profesionalización" de
 * la app, tras la auditoría): registro de solo lectura de quién borró,
 * restauró, eliminó definitivamente o reseteó qué, y cuándo — ver
 * firebaseApi.js, sección 22 (registrarAuditoria). Es un histórico
 * inmutable: no hay ninguna acción posible desde aquí, solo consulta.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { getAuditoria } from './firebaseApi';
import { botonSecundario, thClasses, tdClasses, tarjeta, inputClasses, etiqueta, filtroContenedor } from './uiClasses';

const ETIQUETA_ACCION = {
  eliminar: 'Borrado (a papelera)',
  restaurar: 'Restaurado',
  eliminar_definitivo: 'Eliminado definitivamente',
  reset_historico: 'Reseteo de mantenimiento'
};

const ETIQUETA_COLECCION = {
  historicoSellIn: 'Compras (Sell-In)',
  historicoSellOut: 'Ventas y A&P (Sell-Out)'
};

const formateadorFecha = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-ES');
  } catch {
    return iso;
  }
};

function Auditoria({ idUsuario }) {
  const [entradas, setEntradas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtroAccion, setFiltroAccion] = useState('');

  const cargar = useCallback(async () => {
    if (!idUsuario) { setEntradas([]); return; }
    setCargando(true);
    try {
      const datos = await getAuditoria(idUsuario);
      setEntradas(datos);
    } catch (error) {
      console.error('Error cargando la auditoría:', error);
      alert('Error al cargar la auditoría: ' + error.message);
    }
    setCargando(false);
  }, [idUsuario]);

  useEffect(() => { cargar(); }, [cargar]);

  const entradasFiltradas = filtroAccion
    ? entradas.filter(e => e.accion === filtroAccion)
    : entradas;

  if (cargando) {
    return <div className="text-slate-500 dark:text-slate-400">Cargando auditoría...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <h3 className="text-lg font-medium text-slate-900 dark:text-white">Auditoría</h3>
        <button className={botonSecundario} onClick={cargar}>Actualizar</button>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
        Registro de quién borró, restauró, eliminó definitivamente o reseteó datos, y cuándo. Es solo de consulta — no se puede editar ni borrar.
      </p>

      <div className={filtroContenedor}>
        <label className={etiqueta}>Acción:</label>
        <select value={filtroAccion} onChange={(e) => setFiltroAccion(e.target.value)} className={inputClasses}>
          <option value="">-- Todas --</option>
          {Object.entries(ETIQUETA_ACCION).map(([valor, etiquetaTexto]) => (
            <option key={valor} value={valor}>{etiquetaTexto}</option>
          ))}
        </select>
      </div>

      <div className={`${tarjeta} mt-4`}>
        {entradasFiltradas.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No hay entradas de auditoría que coincidan.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className={thClasses}>Fecha</th>
                  <th className={thClasses}>Acción</th>
                  <th className={thClasses}>Colección</th>
                  <th className={thClasses}>Resumen</th>
                  <th className={thClasses}>Realizado por</th>
                </tr>
              </thead>
              <tbody>
                {entradasFiltradas.map(e => (
                  <tr key={e.id}>
                    <td className={tdClasses}>{formateadorFecha(e.fecha)}</td>
                    <td className={`${tdClasses} font-semibold`}>{ETIQUETA_ACCION[e.accion] || e.accion}</td>
                    <td className={tdClasses}>{ETIQUETA_COLECCION[e.coleccion] || e.coleccion}</td>
                    <td className={tdClasses}>{e.resumen || '—'}</td>
                    <td className={tdClasses}>{e.actor_email || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default Auditoria;
