/*
 * PantallaSellOutClientes.js
 * Contenedor de la sección "Sell-Out Clientes" (a petición de Sergio: apartado
 * nuevo y diferencial para el detalle de ventas de cada distribuidor a sus
 * clientes finales). Mismo patrón que PantallaVentasReales.js: dos subvistas
 * (Clientes = dashboard, Importar), memoria de pestañas vía
 * usePestañasVisitadas.
 *
 * CAMBIO (selector de distribuidor GLOBAL, a petición de Sergio: "lo sigo
 * viendo un poco lioso" — análisis de IA de julio 2026): la lista de
 * distribuidores ya no se carga aquí — llega como prop `listaDistribuidoresGlobal`
 * desde App.js (la misma que usa "Gestión por Distribuidor"), y el
 * distribuidor elegido (`idDistribuidorSel`/`onCambiarDistribuidorSel`) se
 * pasa tal cual a los dos dashboards en vez de que cada uno mantenga su
 * propio estado suelto — así elegir un distribuidor en cualquiera de los 3
 * sitios (Gestión, Clientes, Por Marca) se refleja al momento en los otros
 * dos.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { getMarcasGlobales } from './firebaseApi';
import { tarjeta } from './uiClasses';
import DashboardSellOutClientes from './DashboardSellOutClientes';
import DashboardSellOutMarcas from './DashboardSellOutMarcas';
import ImportarSellOutClientes from './ImportarSellOutClientes';
import ImportarDireccionesClientes from './ImportarDireccionesClientes';
import usePestañasVisitadas from './usePestañasVisitadas';

export const PESTAÑA_SELLOUT_CLIENTES_DASHBOARD = 'SELLOUT_CLIENTES_DASHBOARD';
export const PESTAÑA_SELLOUT_CLIENTES_MARCAS = 'SELLOUT_CLIENTES_MARCAS';
export const PESTAÑA_SELLOUT_CLIENTES_IMPORTAR = 'SELLOUT_CLIENTES_IMPORTAR';
// Direcciones de clientes finales (26/07/2026, primer paso de
// "Geolocalización" — ver ImportarDireccionesClientes.js): NO da de alta
// clientes nuevos, solo añade dirección/zona a los que ya existen aquí.
export const PESTAÑA_SELLOUT_CLIENTES_DIRECCIONES = 'SELLOUT_CLIENTES_DIRECCIONES';
export const PESTAÑAS_SELLOUT_CLIENTES = [
  PESTAÑA_SELLOUT_CLIENTES_DASHBOARD, PESTAÑA_SELLOUT_CLIENTES_MARCAS,
  PESTAÑA_SELLOUT_CLIENTES_IMPORTAR, PESTAÑA_SELLOUT_CLIENTES_DIRECCIONES,
];

function PantallaSellOutClientes({
  idUsuario, vistaActiva, onNavigate,
  idDistribuidorSel, onCambiarDistribuidorSel, listaDistribuidoresGlobal,
}) {

  const listaDistribuidores = listaDistribuidoresGlobal || [];
  const [marcasGlobales, setMarcasGlobales] = useState([]);
  const [cargando, setCargando] = useState(true);

  const cargarTodo = useCallback(async () => {
    setCargando(true);
    try {
      const marcas = await getMarcasGlobales();
      setMarcasGlobales(marcas.sort((a, b) => (a.nombre_marca || '').localeCompare(b.nombre_marca || '')));
    } catch (error) {
      console.error('Error cargando Sell-Out Clientes:', error);
      alert('Error al cargar los datos: ' + error.message);
    }
    setCargando(false);
  }, []);

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
              <DashboardSellOutClientes
                idUsuario={idUsuario}
                listaDistribuidores={listaDistribuidores}
                idDistribuidor={idDistribuidorSel}
                onCambiarDistribuidor={onCambiarDistribuidorSel}
              />
            </div>
          )}
          {visitadas.has(PESTAÑA_SELLOUT_CLIENTES_MARCAS) && (
            <div style={estiloVista(PESTAÑA_SELLOUT_CLIENTES_MARCAS)}>
              <DashboardSellOutMarcas
                idUsuario={idUsuario}
                listaDistribuidores={listaDistribuidores}
                marcasGlobales={marcasGlobales}
                idDistribuidor={idDistribuidorSel}
                onCambiarDistribuidor={onCambiarDistribuidorSel}
              />
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
          {visitadas.has(PESTAÑA_SELLOUT_CLIENTES_DIRECCIONES) && (
            <div style={estiloVista(PESTAÑA_SELLOUT_CLIENTES_DIRECCIONES)}>
              <ImportarDireccionesClientes
                idUsuario={idUsuario}
                listaDistribuidores={listaDistribuidores}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default PantallaSellOutClientes;
