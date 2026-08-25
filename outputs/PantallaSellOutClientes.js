/*
 * PantallaSellOutClientes.js
 * Contenedor de la sección "Sell-Out Clientes" (a petición de Sergio: apartado
 * nuevo y diferencial para el detalle de ventas de cada distribuidor a sus
 * clientes finales). Mismo patrón que PantallaVentasReales.js: dos subvistas
 * (Clientes = dashboard, Importar), memoria de pestañas vía
 * usePestañasVisitadas.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { getDistribuidoresPorUsuario, getMarcasGlobales } from './firebaseApi';
import { tarjeta } from './uiClasses';
import DashboardSellOutClientes from './DashboardSellOutClientes';
import ImportarSellOutClientes from './ImportarSellOutClientes';
import usePestañasVisitadas from './usePestañasVisitadas';

export const PESTAÑA_SELLOUT_CLIENTES_DASHBOARD = 'SELLOUT_CLIENTES_DASHBOARD';
export const PESTAÑA_SELLOUT_CLIENTES_IMPORTAR = 'SELLOUT_CLIENTES_IMPORTAR';
export const PESTAÑAS_SELLOUT_CLIENTES = [PESTAÑA_SELLOUT_CLIENTES_DASHBOARD, PESTAÑA_SELLOUT_CLIENTES_IMPORTAR];

function PantallaSellOutClientes({ idUsuario, vistaActiva, onNavigate }) {

  const [listaDistribuidores, setListaDistribuidores] = useState([]);
  const [marcasGlobales, setMarcasGlobales] = useState([]);
  const [cargando, setCargando] = useState(true);

  const cargarTodo = useCallback(async () => {
    setCargando(true);
    try {
      const [distribuidores, marcas] = await Promise.all([
        getDistribuidoresPorUsuario(idUsuario),
        getMarcasGlobales()
      ]);
      setListaDistribuidores(distribuidores.sort((a, b) => (a.nombre_distribuidor || '').localeCompare(b.nombre_distribuidor || '')));
      setMarcasGlobales(marcas.sort((a, b) => (a.nombre_marca || '').localeCompare(b.nombre_marca || '')));
    } catch (error) {
      console.error('Error cargando Sell-Out Clientes:', error);
      alert('Error al cargar los datos: ' + error.message);
    }
    setCargando(false);
  }, [idUsuario]);

  useEffect(() => {
    if (!idUsuario) return;
    cargarTodo();
  }, [idUsuario, cargarTodo]);

  const handleImportComplete = () => {
    cargarTodo();
    if (onNavigate) onNavigate(PESTAÑA_SELLOUT_CLIENTES_DASHBOARD);
  };

  // Memoria de pestañas (ver PantallaVentasReales.js / usePestañasVisitadas.js).
  const visitadas = usePestañasVisitadas(vistaActiva);
  const estiloVista = (id) => ({ display: vistaActiva === id ? 'block' : 'none' });

  return (
    <div>
      {cargando ? (
        <div className="text-slate-500 dark:text-slate-400">Cargando datos...</div>
      ) : (
        <>
          {visitadas.has(PESTAÑA_SELLOUT_CLIENTES_DASHBOARD) && (
            <div style={estiloVista(PESTAÑA_SELLOUT_CLIENTES_DASHBOARD)}>
              <DashboardSellOutClientes idUsuario={idUsuario} listaDistribuidores={listaDistribuidores} />
            </div>
          )}
          {visitadas.has(PESTAÑA_SELLOUT_CLIENTES_IMPORTAR) && (
            <div className={tarjeta} style={estiloVista(PESTAÑA_SELLOUT_CLIENTES_IMPORTAR)}>
              <ImportarSellOutClientes
                idUsuario={idUsuario}
                listaDistribuidores={listaDistribuidores}
                marcasGlobales={marcasGlobales}
                onImportComplete={handleImportComplete}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default PantallaSellOutClientes;
