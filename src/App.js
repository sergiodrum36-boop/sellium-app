/*
 * App.js (Versión 4.2 - CORREGIDO y CON PANTALLA DE AYUDA)
 * Se elimina la lógica de 'Admin' errónea.
 * Se añade el botón de Ayuda [?] y el modal 'PantallaAyuda'.
 *
 * CAMBIO (nuevo Dashboard A&P Visión Compañía, a petición de Sergio): se
 * añade PantallaDashboardAPCompania, tercera subvista del grupo "Dashboard"
 * (ver Layout.js), renderizada igual que PantallaDashboard — un id plano de
 * nivel superior, no una pestaña de Gestión ni de Ventas Reales.
 *
 * CAMBIO (memoria de pestañas, a petición de Sergio: "si cambias de pestaña
 * y vuelves, los datos/filtros se han quitado"): las 5 secciones de nivel
 * superior (Gestión, Ventas Reales, Reportes, Dashboard, Dashboard A&P
 * Compañía) ya no se montan/desmontan con `{condicion && <Componente/>}` —
 * ahora se quedan montadas en segundo plano (ocultas con display:none) en
 * cuanto se visitan por primera vez, vía usePestañasVisitadas.js. También
 * se aplica dentro de PantallaDistribuidor.js (sus 11 subpestañas) y
 * PantallaVentasReales.js (sus 3 subvistas) para que la memoria funcione a
 * todos los niveles, no solo entre estas 5 secciones. Se añade además un
 * pequeño "empujón" de resize (ver más abajo) para que los gráficos
 * (recharts) de los dashboards no se queden a 0px la primera vez que
 * vuelves a una pestaña que estaba oculta.
 *
 * CAMBIO (Error Boundaries, a petición de Sergio - repaso/auditoría de la
 * app): cada una de las 5 secciones de nivel superior (y el modal de Ayuda)
 * se envuelve en su propio <ErrorBoundary> (ver ErrorBoundary.js). Antes,
 * un error de render en cualquier pantalla tumbaba TODA la app (pantalla en
 * blanco). Ahora solo se rompe esa sección concreta — el resto del Sidebar
 * y de las demás pestañas (incluidas las que se quedan montadas en segundo
 * plano gracias a la memoria de pestañas) siguen funcionando. Hay además un
 * ErrorBoundary global en index.js como red de seguridad última, por si
 * algo falla fuera de estas 5 secciones (p.ej. en el propio Layout/Sidebar
 * o en LoginScreen).
 */

import React, { useState, useEffect } from 'react';
import './firebaseConfig';
import { auth } from './firebaseConfig';
import './App.css';

// Importamos las pantallas principales
import LoginScreen from './LoginScreen';
import PantallaDistribuidor, { PESTAÑA_VENTAS_AP, PESTAÑAS_GESTION } from './PantallaDistribuidor';
import PantallaReportes from './PantallaReportes';
import PantallaDashboard from './PantallaDashboard';
import PantallaDashboardAPCompania, { PANTALLA_DASHBOARD_AP_COMPANIA } from './PantallaDashboardAPCompania';
import PantallaVentasReales, { PESTAÑAS_VENTAS_REALES } from './PantallaVentasReales';
// ¡NO importamos SplashScreen aquí, usamos la de Login!
// ¡NO importamos getUserRole!

// ¡NUEVA PANTALLA DE AYUDA!
import PantallaAyuda from './PantallaAyuda';

// Barra lateral de navegación + modo oscuro (rediseño visual)
import Layout, { PANTALLA_REPORTES, PANTALLA_DASHBOARD } from './Layout';

// Memoria de pestañas (ver cabecera del archivo y usePestañasVisitadas.js)
import usePestañasVisitadas from './usePestañasVisitadas';

// Error Boundaries por sección (ver cabecera del archivo y ErrorBoundary.js)
import ErrorBoundary from './ErrorBoundary';

// Rediseño visual, Fase 3: "pantallaActiva" ya no distingue solo entre las 4
// pantallas de nivel superior — ahora puede ser también cualquiera de los
// ids de "Gestión por Distribuidor" (PESTAÑAS_GESTION), porque su navegación
// se ha fusionado dentro del Sidebar único de Layout.js. Este helper decide
// si el id activo hay que renderizarlo dentro de PantallaDistribuidor o en
// una de las pantallas de nivel superior.
const esPestañaDeGestion = (id) => PESTAÑAS_GESTION.includes(id);

// Fase 4 "Unificar Dashboards": lo mismo para las 2 subvistas de Ventas
// Reales (Dashboard e Importar), que ahora tienen ids propios exportados
// desde PantallaVentasReales.js en vez de un único PANTALLA_VENTAS_REALES.
const esPestañaDeVentasReales = (id) => PESTAÑAS_VENTAS_REALES.includes(id);

function App() {

  const [idUsuario, setIdUsuario] = useState(null);
  const [cargandoAuth, setCargandoAuth] = useState(true);
  // Por defecto se abre en "Ventas y A&P" (antes era PANTALLA_GESTION, que a
  // su vez arrancaba internamente en esa misma pestaña) — mismo punto de
  // entrada de siempre.
  const [pantallaActiva, setPantallaActiva] = useState(PESTAÑA_VENTAS_AP);

  // --- ¡NUEVO ESTADO DE AYUDA! ---
  const [ayudaVisible, setAyudaVisible] = useState(false);

  // --- Memoria de pestañas (ver cabecera del archivo) ---
  // "Grupo" de nivel superior al que pertenece pantallaActiva: para
  // Gestión/Ventas Reales hay muchos ids de hoja distintos (una pestaña
  // interna cada uno) que en este nivel cuentan como "la misma sección" —
  // no queremos montar/desmontar todo PantallaDistribuidor cada vez que
  // cambias de subpestaña DENTRO de Gestión, eso ya lo resuelve ese propio
  // componente con su propio usePestañasVisitadas. Reportes/Dashboard/
  // Dashboard A&P Compañía ya son ids únicos de nivel superior, así que
  // sirven tal cual como su propio "grupo".
  const grupoActivo = esPestañaDeGestion(pantallaActiva)
    ? 'GRUPO_GESTION'
    : esPestañaDeVentasReales(pantallaActiva)
      ? 'GRUPO_VENTAS_REALES'
      : pantallaActiva;
  const gruposVisitados = usePestañasVisitadas(grupoActivo);
  const estiloGrupo = (activo) => ({ display: activo ? 'block' : 'none' });

  // Los dashboards con gráficos (recharts) se quedan montados en segundo
  // plano y solo se ocultan con display:none (ver usePestañasVisitadas.js).
  // ResponsiveContainer no siempre recalcula bien su ancho al pasar de
  // display:none a block por sí solo (mide 0px la primera vez) — se fuerza
  // un evento "resize" cada vez que cambia la pestaña activa para que los
  // gráficos ya montados se redibujen con su tamaño real, sin parpadeos.
  useEffect(() => {
    const idTimeout = setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    return () => clearTimeout(idTimeout);
  }, [pantallaActiva]);

  // useEffect (Corregido, sin lógica de Admin)
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        setIdUsuario(user.uid);
      } else {
        setIdUsuario(null);
      }
      setCargandoAuth(false);
    });
    return () => unsubscribe();
  }, []);

  // handleLoginSuccess (Corregido, sin lógica de Admin)
  const handleLoginSuccess = async (uid) => {
    setIdUsuario(uid);
    setPantallaActiva(PESTAÑA_VENTAS_AP);
    setCargandoAuth(false);
  };

  const handleLogout = () => {
    auth.signOut().then(() => {
      setIdUsuario(null);
    });
  };

  // --- RENDERIZADO MODIFICADO ---

  // 1. Si estamos cargando, mostrar el Login (que ahora tiene el logo)
  //    (El Splash Screen solo se ve si la app está publicada,
  //     en local es mejor ver el Login)
  if (cargandoAuth) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  // 2. Si NO hay usuario, mostrar Login
  if (!idUsuario) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  // 3. Si HAY usuario, mostrar la App
  return (
    <div className="App">
      <Layout
        pantallaActiva={pantallaActiva}
        onNavigate={setPantallaActiva}
        userEmail={auth.currentUser.email}
        onHelp={() => setAyudaVisible(true)}
        onLogout={handleLogout}
      >
        {gruposVisitados.has('GRUPO_GESTION') && (
          <div style={estiloGrupo(esPestañaDeGestion(pantallaActiva))}>
            <ErrorBoundary label="Gestión por Distribuidor">
              <PantallaDistribuidor idUsuario={idUsuario} pestañaActiva={pantallaActiva} />
            </ErrorBoundary>
          </div>
        )}
        {gruposVisitados.has('GRUPO_VENTAS_REALES') && (
          <div style={estiloGrupo(esPestañaDeVentasReales(pantallaActiva))}>
            <ErrorBoundary label="Ventas Reales / Sell-In (QlikSense)">
              <PantallaVentasReales idUsuario={idUsuario} vistaActiva={pantallaActiva} onNavigate={setPantallaActiva} />
            </ErrorBoundary>
          </div>
        )}
        {gruposVisitados.has(PANTALLA_REPORTES) && (
          <div style={estiloGrupo(pantallaActiva === PANTALLA_REPORTES)}>
            <ErrorBoundary label="Reportes Generales">
              <PantallaReportes idUsuario={idUsuario} />
            </ErrorBoundary>
          </div>
        )}
        {gruposVisitados.has(PANTALLA_DASHBOARD) && (
          <div style={estiloGrupo(pantallaActiva === PANTALLA_DASHBOARD)}>
            <ErrorBoundary label="Dashboard">
              <PantallaDashboard idUsuario={idUsuario} />
            </ErrorBoundary>
          </div>
        )}
        {gruposVisitados.has(PANTALLA_DASHBOARD_AP_COMPANIA) && (
          <div style={estiloGrupo(pantallaActiva === PANTALLA_DASHBOARD_AP_COMPANIA)}>
            <ErrorBoundary label="Dashboard A&P Visión Compañía">
              <PantallaDashboardAPCompania idUsuario={idUsuario} />
            </ErrorBoundary>
          </div>
        )}
      </Layout>

      {/* --- ¡NUEVO MODAL DE AYUDA! --- */}
      {ayudaVisible && (
        <ErrorBoundary label="Ayuda">
          <PantallaAyuda onClose={() => setAyudaVisible(false)} />
        </ErrorBoundary>
      )}
    </div>
  );
}

export default App;
