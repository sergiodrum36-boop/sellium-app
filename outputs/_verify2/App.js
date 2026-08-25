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
 *
 * CAMBIO (roles/permisos, a petición de Sergio: "cada usuario nuevo podrá
 * solo ver y trabajar sobre sus datos, yo tendré acceso como manager a los
 * míos y a los de los demás — podré hacer análisis de solo lo mío, solo lo
 * de algún usuario o de todo en general"): tras el login se consulta el
 * perfil (usuarios/{uid}, ver firebaseApi.js) para saber el rol. Si es
 * 'manager', se carga además la lista de todos los usuarios y aparece en el
 * Sidebar (Layout.js) el selector "Viendo como", que cambia
 * `idUsuarioViendo`. TODAS las pantallas reciben `idUsuarioEfectivo` (no el
 * `idUsuario` propio a secas) — así, sin tocar ninguna pantalla ni
 * firebaseApi.js, un manager puede consultar los datos de cualquier usuario
 * simplemente cambiando qué id se pasa hacia abajo; las reglas de Firestore
 * (esManager()) son las que de verdad autorizan esa lectura en el servidor.
 * "Todo en general" (vista agregada de todos los usuarios a la vez) queda
 * fuera de esta primera fase — aquí solo se puede ver "lo mío" o "lo de un
 * usuario concreto, uno cada vez".
 *
 * CAMBIO (alertas proactivas, a petición de Sergio, último punto de la
 * auditoría de la app): se calcula un pequeño conjunto de avisos (balance
 * negativo, distribuidores sin actividad reciente, descuadre de datos, ver
 * alertas.js) sobre el histórico COMPLETO (sin el filtro de periodo que sí
 * aplican los dashboards) y se muestran en una campana con contador en el
 * pie del Sidebar (Layout.js/AlertasBell.js). Se recalculan cada vez que
 * cambia idUsuarioEfectivo (login, o un manager cambia a quién está viendo)
 * y también a mano, con el botón de refresco de la propia campana.
 *
 * CAMBIO (roles/permisos Fase 2 — "Todos los usuarios", a petición de
 * Sergio): `idUsuarioViendo` ahora también puede valer TODOS_LOS_USUARIOS
 * (sentinel de firebaseApi.js), elegido desde el selector "Viendo como" de
 * Layout.js. `idUsuarioEfectivo` lo pasa tal cual a las 4 pantallas de
 * análisis (Dashboard, Dashboard A&P Compañía, Reportes, Ventas Reales) —
 * sus funciones "Generales" de firebaseApi.js ya saben agregar sobre todos
 * los usuarios cuando reciben ese sentinel. "Gestión por Distribuidor"
 * (PantallaDistribuidor) es la excepción: es una pantalla de EDICIÓN, no de
 * análisis, y "todos los usuarios a la vez" no tiene sentido para dar de
 * alta o borrar datos — en ese modo recibe `idUsuario=null` en vez del
 * sentinel (así sus cargas de datos, todas guardadas con `if (!idUsuario)
 * return`, simplemente no se disparan) y un aviso propio en vez de
 * contenido, ver `bloqueadoPorTodos` en PantallaDistribuidor.js.
 *
 * CAMBIO (Presupuesto y Forecast, Fase 2 profesionalización, a petición de
 * Sergio): nueva sección de nivel superior PantallaPresupuesto (ver
 * Layout.js/PantallaPresupuesto.js), con la misma mecánica de "bloqueo en
 * modo Todos los usuarios" que Gestión: su pestaña "Objetivo Anual" es de
 * EDICIÓN (fijar un objetivo requiere una cuenta y un distribuidor
 * concretos), no de análisis.
 *
 * CAMBIO (Recuperación de Ventas, a petición de Sergio): nueva sección de
 * nivel superior PantallaRecuperacionVentas (ver Layout.js/
 * PantallaRecuperacionVentas.js) — informe mensual por distribuidor/marca
 * frente al mismo mes del año anterior, para detectar caídas de compra. Es
 * de ANÁLISIS (como Dashboard/Reportes), así que recibe idUsuarioEfectivo
 * directamente y sí funciona en modo "Todos los usuarios".
 *
 * CAMBIO (arranque del nuevo bloque "CRM y Comercial", a petición de Sergio,
 * 26/07/2026): tres secciones en el grupo "crm" (ver Layout.js).
 * PantallaEstructuraComercial ("Equipo Comercial" en pantalla, ver aviso de
 * renombrado en su cabecera) — comerciales/preventistas y zonas como
 * entidades reales, con jerarquía. PantallaClasificacionComercial
 * ("Estructura Comercial" en pantalla, el nombre real que usa Sergio para
 * esto) — clasificación de distribuidores (criterios A-E editables) y peso
 * dentro de la cartera de cada comercial, reproduciendo el Excel real que
 * compartió. PantallaPlanificacionComercial ("Planificación Comercial") —
 * calendario de visitas trimestral generado a partir de esa clasificación,
 * pedida por Sergio justo después de terminar la anterior. Las tres son de
 * EDICIÓN de datos maestros de una cuenta concreta (como "Gestión por
 * Distribuidor"/"Presupuesto y Forecast"), así que reciben `idUsuario=null`
 * y `bloqueadoPorTodos=true` en modo "Todos los usuarios" en vez del sentinel.
 */

import React, { useState, useEffect } from 'react';
import './firebaseConfig';
import { auth } from './firebaseConfig';
import './App.css';

// Importamos las pantallas principales
import LoginScreen from './LoginScreen';
import PantallaDistribuidor, { PESTAÑAS_GESTION } from './PantallaDistribuidor';
import PantallaReportes from './PantallaReportes';
import PantallaDashboard from './PantallaDashboard';
import PantallaDashboardAPCompania, { PANTALLA_DASHBOARD_AP_COMPANIA } from './PantallaDashboardAPCompania';
import PantallaVentasReales, { PESTAÑAS_VENTAS_REALES } from './PantallaVentasReales';
import PantallaPresupuesto, { PANTALLA_PRESUPUESTO } from './PantallaPresupuesto';
import PantallaRecuperacionVentas, { PANTALLA_RECUPERACION_VENTAS } from './PantallaRecuperacionVentas';
import PantallaSellOutClientes, { PESTAÑAS_SELLOUT_CLIENTES } from './PantallaSellOutClientes';
import PantallaEstructuraComercial, { PANTALLA_ESTRUCTURA_COMERCIAL } from './PantallaEstructuraComercial';
import PantallaClasificacionComercial, { PANTALLA_CLASIFICACION_COMERCIAL } from './PantallaClasificacionComercial';
import PantallaPlanificacionComercial, { PANTALLA_PLANIFICACION_COMERCIAL } from './PantallaPlanificacionComercial';
import PantallaAgendaComercial, { PANTALLA_AGENDA_COMERCIAL } from './PantallaAgendaComercial';
import PantallaGeolocalizacion, { PANTALLA_GEOLOCALIZACION } from './PantallaGeolocalizacion';
import PantallaRapelDistribuidores, { PANTALLA_RAPEL_DISTRIBUIDORES } from './PantallaRapelDistribuidores';
import PantallaAvisosConsumo, { PANTALLA_AVISOS_CONSUMO } from './PantallaAvisosConsumo';
import PantallaAcuerdosClientes, { PANTALLA_ACUERDOS_CLIENTES } from './PantallaAcuerdosClientes';
import PantallaConfiguracion, { PANTALLA_CONFIGURACION } from './PantallaConfiguracion';
// ¡NO importamos SplashScreen aquí, usamos la de Login!
// ¡NO importamos getUserRole!

// Pantalla de inicio (Fase 6 del rediseño visual, ver cabecera de Layout.js
// y PantallaInicio.js) — nueva pantalla por defecto al entrar/tras login.
import PantallaInicio from './PantallaInicio';

// Pantalla de menú por área (Fase 7, ver cabecera de PantallaGrupo.js) —
// escalón intermedio entre Inicio y las pantallas de trabajo: enseña TODOS
// los accesos de un grupo sin tener que abrir el Sidebar.
import PantallaGrupo from './PantallaGrupo';

// ¡NUEVA PANTALLA DE AYUDA!
import PantallaAyuda from './PantallaAyuda';

// Barra lateral de navegación + modo oscuro (rediseño visual)
import Layout, { PANTALLA_REPORTES, PANTALLA_DASHBOARD, PANTALLA_INICIO, GROUPS } from './Layout';

// Memoria de pestañas (ver cabecera del archivo y usePestañasVisitadas.js)
import usePestañasVisitadas from './usePestañasVisitadas';

// Error Boundaries por sección (ver cabecera del archivo y ErrorBoundary.js)
import ErrorBoundary from './ErrorBoundary';

// Roles/permisos (ver cabecera del archivo, firebaseApi.js y firestore.rules)
import { getPerfilUsuario, getListaUsuarios, TODOS_LOS_USUARIOS, getDistribuidoresPorUsuario, getHistoricoSellInGeneral, getHistoricoSellOutGeneral, saveNuevoDistribuidor } from './firebaseApi';

// Alertas proactivas (ver cabecera del archivo y alertas.js)
import { calcularAlertas } from './alertas';

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

// Sell-Out Clientes (a petición de Sergio): mismo patrón que Ventas Reales,
// 2 subvistas (Clientes/Importar) con ids propios exportados desde
// PantallaSellOutClientes.js.
const esPestañaDeSellOutClientes = (id) => PESTAÑAS_SELLOUT_CLIENTES.includes(id);

// Fase 7 (ver cabecera de PantallaGrupo.js): los 3 ids de grupo
// ('ventas-datos'/'analisis'/'administracion', definidos en GROUPS dentro
// de Layout.js) ahora también son pantallas navegables por sí mismos — el
// "menú" de esa área. Mismo patrón que los helpers de arriba: se agrupan
// bajo un único "grupo" de memoria de pestañas (GRUPO_HUB) porque las 3
// comparten el mismo componente (PantallaGrupo), solo cambia qué grupoId
// recibe.
const esGrupoHub = (id) => GROUPS.some((g) => g.id === id);

function App() {

  const [idUsuario, setIdUsuario] = useState(null);
  const [cargandoAuth, setCargandoAuth] = useState(true);

  // Roles/permisos (ver cabecera del archivo). rolUsuario por defecto es
  // 'usuario' — tanto antes de que llegue la respuesta de getPerfilUsuario
  // como si el perfil no existiera por lo que sea (cuentas antiguas creadas
  // a mano en la consola, antes de este cambio): en ambos casos, lo más
  // seguro es no mostrar el selector de manager hasta confirmar el rol.
  const [rolUsuario, setRolUsuario] = useState('usuario');
  const [listaUsuarios, setListaUsuarios] = useState([]);
  // null = "viendo mis propios datos". Con valor = uid de otro usuario que
  // un manager ha elegido consultar (ver selector "Viendo como" en Layout).
  const [idUsuarioViendo, setIdUsuarioViendo] = useState(null);

  // Alertas proactivas (ver cabecera del archivo y alertas.js).
  const [alertas, setAlertas] = useState([]);
  const [cargandoAlertas, setCargandoAlertas] = useState(false);

  const esManager = rolUsuario === 'manager';
  // El id que de verdad se pasa a todas las pantallas: el propio, salvo que
  // seas manager y hayas elegido ver a otro usuario. Las reglas de
  // Firestore (esManager(), ver firestore.rules) son las que autorizan de
  // verdad esa lectura en el servidor — esto es solo qué id se pide.
  const idUsuarioEfectivo = (esManager && idUsuarioViendo) ? idUsuarioViendo : idUsuario;
  // Ver CAMBIO (Fase 2) en la cabecera: "Gestión por Distribuidor" es de
  // edición, no de análisis, así que el modo "Todos los usuarios" no le
  // aplica igual que a las otras 4 secciones.
  const enModoTodosLosUsuarios = idUsuarioEfectivo === TODOS_LOS_USUARIOS;
  // Fase 6 (ver cabecera de Layout.js): por defecto se abre en PANTALLA_INICIO
  // (antes era PESTAÑA_VENTAS_AP, directo a trabajar sin ningún punto de
  // entrada neutral) — así se ve primero la pantalla de inicio con las 4
  // tarjetas, no una pantalla de trabajo concreta.
  const [pantallaActiva, setPantallaActiva] = useState(PANTALLA_INICIO);

  // --- ¡NUEVO ESTADO DE AYUDA! ---
  const [ayudaVisible, setAyudaVisible] = useState(false);

  // Selector de distribuidor GLOBAL (mejora de navegación, a petición de
  // Sergio: "lo sigo viendo un poco lioso" — análisis de IA de julio 2026).
  // Antes "Gestión por Distribuidor", "Sell-Out Clientes" y "Sell-Out por
  // Marca" mantenían CADA UNA su propio distribuidor seleccionado de forma
  // independiente (3 estados sueltos): cambiarlo en una no se reflejaba en
  // las otras dos, y no había ningún sitio fijo donde ver "qué distribuidor
  // estoy viendo ahora mismo". Se sube aquí, a un único estado, y baja como
  // prop a las 3 pantallas y al selector nuevo de la barra superior
  // (Layout.js) — cambiarlo desde cualquier sitio lo cambia en todos.
  const [listaDistribuidoresGlobal, setListaDistribuidoresGlobal] = useState([]);
  const [idDistribuidorSel, setIdDistribuidorSel] = useState('');
  const [cargandoDistribuidoresGlobal, setCargandoDistribuidoresGlobal] = useState(true);

  // Carga (y recarga tras crear/resetear) la lista de distribuidores del
  // usuario que se esté viendo. En modo "Todos los usuarios" no hay un
  // distribuidor "actual" con sentido (se está viendo la suma de varios
  // usuarios a la vez), así que se vacía la lista y el selector desaparece.
  const cargarDistribuidoresGlobal = async () => {
    if (!idUsuarioEfectivo || enModoTodosLosUsuarios) {
      setListaDistribuidoresGlobal([]);
      setCargandoDistribuidoresGlobal(false);
      return;
    }
    setCargandoDistribuidoresGlobal(true);
    try {
      const distribuidores = await getDistribuidoresPorUsuario(idUsuarioEfectivo);
      const ordenados = distribuidores.sort((a, b) => (a.nombre_distribuidor || '').localeCompare(b.nombre_distribuidor || ''));
      setListaDistribuidoresGlobal(ordenados);
      // Si el seleccionado actual ya no existe en la nueva lista (p.ej. tras
      // cambiar de usuario en "Viendo como", o tras un reseteo de cuenta) o
      // no había ninguno elegido todavía, se elige el primero por defecto —
      // igual que hacía antes PantallaDistribuidor.js con su propio estado.
      setIdDistribuidorSel((actual) => {
        if (actual && ordenados.some((d) => d.id === actual)) return actual;
        return ordenados.length > 0 ? ordenados[0].id : '';
      });
    } catch (error) {
      console.error('Error cargando distribuidores:', error);
    }
    setCargandoDistribuidoresGlobal(false);
  };

  useEffect(() => {
    cargarDistribuidoresGlobal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idUsuarioEfectivo, enModoTodosLosUsuarios]);

  // Alta de un nuevo distribuidor desde el selector global (antes vivía solo
  // dentro de PantallaDistribuidor.js — ahora es alcanzable desde cualquier
  // pantalla que use el selector de la barra superior).
  const handleCrearDistribuidorGlobal = async (nombre) => {
    const nuevoDistri = { nombre_distribuidor: nombre.trim().toUpperCase(), id_usuario: idUsuarioEfectivo };
    const nuevoId = await saveNuevoDistribuidor(nuevoDistri);
    const nuevoDistriCompleto = { ...nuevoDistri, id: nuevoId };
    setListaDistribuidoresGlobal((prev) =>
      [...prev, nuevoDistriCompleto].sort((a, b) => (a.nombre_distribuidor || '').localeCompare(b.nombre_distribuidor || ''))
    );
    setIdDistribuidorSel(nuevoId);
    return nuevoDistriCompleto;
  };

  // "Últimos módulos utilizados" (Fase 8 — rediseño de Inicio, especificación
  // Sergio: "esto aporta sensación de producto maduro"): historial de las
  // últimas pantallas de TRABAJO visitadas (Inicio y los menús de área no
  // cuentan como "un módulo" en sí, se excluyen) — persistido en
  // localStorage por usuario para que sobreviva a recargas de página.
  // PantallaInicio.js resuelve cada id a {label, icon} vía INDICE_BUSQUEDA
  // (Layout.js), así que aquí solo se guardan ids sueltos.
  const [historialReciente, setHistorialReciente] = useState([]);

  useEffect(() => {
    if (!idUsuario) { setHistorialReciente([]); return; }
    try {
      const guardado = window.localStorage.getItem(`sellium_recientes_${idUsuario}`);
      setHistorialReciente(guardado ? JSON.parse(guardado) : []);
    } catch (error) {
      setHistorialReciente([]);
    }
  }, [idUsuario]);

  useEffect(() => {
    if (!idUsuario) return;
    if (pantallaActiva === PANTALLA_INICIO || esGrupoHub(pantallaActiva)) return;
    setHistorialReciente((prev) => {
      const siguiente = [pantallaActiva, ...prev.filter((id) => id !== pantallaActiva)].slice(0, 5);
      try {
        window.localStorage.setItem(`sellium_recientes_${idUsuario}`, JSON.stringify(siguiente));
      } catch (error) {
        // localStorage no disponible (modo privado, cuota...): no es crítico,
        // simplemente no se recuerda entre sesiones.
      }
      return siguiente;
    });
  }, [pantallaActiva, idUsuario]);

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
      : esPestañaDeSellOutClientes(pantallaActiva)
        ? 'GRUPO_SELLOUT_CLIENTES'
        : esGrupoHub(pantallaActiva)
          ? 'GRUPO_HUB'
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

  // Roles/permisos: en cuanto sabemos quién es el usuario (login o recarga
  // de página con sesión ya iniciada), se consulta su perfil para saber el
  // rol. Si es manager, se carga también la lista de todos los usuarios
  // para el selector "Viendo como". Al cerrar sesión (idUsuario a null) se
  // resetea todo — si no, un manager que cierra sesión y otro usuario
  // normal inicia sesión en la misma pestaña se quedaría con el rol/lista
  // del manager anterior durante un instante.
  useEffect(() => {
    if (!idUsuario) {
      setRolUsuario('usuario');
      setListaUsuarios([]);
      setIdUsuarioViendo(null);
      return;
    }
    let cancelado = false;
    (async () => {
      try {
        const perfil = await getPerfilUsuario(idUsuario);
        const rol = perfil?.rol === 'manager' ? 'manager' : 'usuario';
        if (cancelado) return;
        setRolUsuario(rol);
        if (rol === 'manager') {
          const usuarios = await getListaUsuarios();
          if (!cancelado) setListaUsuarios(usuarios);
        }
      } catch (error) {
        console.error('No se pudo cargar el perfil de usuario:', error);
        if (!cancelado) setRolUsuario('usuario');
      }
    })();
    return () => { cancelado = true; };
  }, [idUsuario]);

  // Alertas proactivas (ver cabecera del archivo): se calculan sobre el
  // histórico COMPLETO de distribuidores/Sell-In/Sell-Out del usuario que se
  // esté viendo (idUsuarioEfectivo, respeta el selector "Viendo como" de un
  // manager) — sin el filtro de periodo que sí aplican los dashboards. Se
  // define como función (no solo dentro del useEffect) para poder ofrecer
  // también un botón de refresco manual en la propia campana.
  const cargarAlertas = async () => {
    if (!idUsuarioEfectivo) { setAlertas([]); return; }
    setCargandoAlertas(true);
    try {
      const [distribuidores, sellIn, sellOut] = await Promise.all([
        getDistribuidoresPorUsuario(idUsuarioEfectivo),
        getHistoricoSellInGeneral(idUsuarioEfectivo),
        getHistoricoSellOutGeneral(idUsuarioEfectivo)
      ]);
      setAlertas(calcularAlertas({ distribuidores, sellIn, sellOut }));
    } catch (error) {
      // No se interrumpe al usuario con un alert(): es un aviso de fondo,
      // no una acción que él haya pedido explícitamente.
      console.error('No se pudieron calcular las alertas:', error);
    }
    setCargandoAlertas(false);
  };

  useEffect(() => {
    cargarAlertas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idUsuarioEfectivo]);

  // handleLoginSuccess (Corregido, sin lógica de Admin)
  const handleLoginSuccess = async (uid) => {
    setIdUsuario(uid);
    setPantallaActiva(PANTALLA_INICIO);
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
        esManager={esManager}
        listaUsuarios={listaUsuarios}
        idUsuarioPropio={idUsuario}
        idUsuarioViendo={idUsuarioViendo}
        onCambiarUsuarioViendo={setIdUsuarioViendo}
        alertas={alertas}
        cargandoAlertas={cargandoAlertas}
        onRefrescarAlertas={cargarAlertas}
        idDistribuidorSel={idDistribuidorSel}
        onCambiarDistribuidorSel={setIdDistribuidorSel}
        listaDistribuidoresGlobal={listaDistribuidoresGlobal}
        cargandoDistribuidoresGlobal={cargandoDistribuidoresGlobal}
        onCrearDistribuidorGlobal={handleCrearDistribuidorGlobal}
      >
        {gruposVisitados.has(PANTALLA_INICIO) && (
          <div style={estiloGrupo(pantallaActiva === PANTALLA_INICIO)}>
            <ErrorBoundary label="Inicio">
              <PantallaInicio
                onNavigate={setPantallaActiva}
                userEmail={auth.currentUser.email}
                historialReciente={historialReciente}
              />
            </ErrorBoundary>
          </div>
        )}
        {gruposVisitados.has('GRUPO_HUB') && (
          <div style={estiloGrupo(esGrupoHub(pantallaActiva))}>
            <ErrorBoundary label="Menú de área">
              <PantallaGrupo
                grupoId={pantallaActiva}
                onNavigate={setPantallaActiva}
                onVolver={() => setPantallaActiva(PANTALLA_INICIO)}
              />
            </ErrorBoundary>
          </div>
        )}
        {gruposVisitados.has('GRUPO_GESTION') && (
          <div style={estiloGrupo(esPestañaDeGestion(pantallaActiva))}>
            <ErrorBoundary label="Gestión por Distribuidor">
              <PantallaDistribuidor
                idUsuario={enModoTodosLosUsuarios ? null : idUsuarioEfectivo}
                pestañaActiva={pantallaActiva}
                bloqueadoPorTodos={enModoTodosLosUsuarios}
                idDistribuidorSel={idDistribuidorSel}
                onCambiarDistribuidorSel={setIdDistribuidorSel}
                listaDistribuidoresGlobal={listaDistribuidoresGlobal}
                cargandoDistribuidoresGlobal={cargandoDistribuidoresGlobal}
                onRefrescarDistribuidoresGlobal={cargarDistribuidoresGlobal}
              />
            </ErrorBoundary>
          </div>
        )}
        {gruposVisitados.has('GRUPO_VENTAS_REALES') && (
          <div style={estiloGrupo(esPestañaDeVentasReales(pantallaActiva))}>
            <ErrorBoundary label="Ventas Reales / Sell-In (QlikSense)">
              <PantallaVentasReales idUsuario={idUsuarioEfectivo} vistaActiva={pantallaActiva} onNavigate={setPantallaActiva} />
            </ErrorBoundary>
          </div>
        )}
        {gruposVisitados.has('GRUPO_SELLOUT_CLIENTES') && (
          <div style={estiloGrupo(esPestañaDeSellOutClientes(pantallaActiva))}>
            <ErrorBoundary label="Sell-Out Clientes">
              <PantallaSellOutClientes
                idUsuario={idUsuarioEfectivo}
                vistaActiva={pantallaActiva}
                onNavigate={setPantallaActiva}
                idDistribuidorSel={idDistribuidorSel}
                onCambiarDistribuidorSel={setIdDistribuidorSel}
                listaDistribuidoresGlobal={listaDistribuidoresGlobal}
              />
            </ErrorBoundary>
          </div>
        )}
        {gruposVisitados.has(PANTALLA_REPORTES) && (
          <div style={estiloGrupo(pantallaActiva === PANTALLA_REPORTES)}>
            <ErrorBoundary label="Reportes Generales">
              <PantallaReportes idUsuario={idUsuarioEfectivo} />
            </ErrorBoundary>
          </div>
        )}
        {gruposVisitados.has(PANTALLA_DASHBOARD) && (
          <div style={estiloGrupo(pantallaActiva === PANTALLA_DASHBOARD)}>
            <ErrorBoundary label="Dashboard">
              <PantallaDashboard idUsuario={idUsuarioEfectivo} />
            </ErrorBoundary>
          </div>
        )}
        {gruposVisitados.has(PANTALLA_DASHBOARD_AP_COMPANIA) && (
          <div style={estiloGrupo(pantallaActiva === PANTALLA_DASHBOARD_AP_COMPANIA)}>
            <ErrorBoundary label="Dashboard A&P Visión Compañía">
              <PantallaDashboardAPCompania idUsuario={idUsuarioEfectivo} />
            </ErrorBoundary>
          </div>
        )}
        {gruposVisitados.has(PANTALLA_PRESUPUESTO) && (
          <div style={estiloGrupo(pantallaActiva === PANTALLA_PRESUPUESTO)}>
            <ErrorBoundary label="Presupuesto y Forecast">
              <PantallaPresupuesto
                idUsuario={enModoTodosLosUsuarios ? null : idUsuarioEfectivo}
                bloqueadoPorTodos={enModoTodosLosUsuarios}
              />
            </ErrorBoundary>
          </div>
        )}
        {gruposVisitados.has(PANTALLA_RECUPERACION_VENTAS) && (
          <div style={estiloGrupo(pantallaActiva === PANTALLA_RECUPERACION_VENTAS)}>
            <ErrorBoundary label="Recuperación de Ventas">
              <PantallaRecuperacionVentas idUsuario={idUsuarioEfectivo} />
            </ErrorBoundary>
          </div>
        )}
        {gruposVisitados.has(PANTALLA_ESTRUCTURA_COMERCIAL) && (
          <div style={estiloGrupo(pantallaActiva === PANTALLA_ESTRUCTURA_COMERCIAL)}>
            <ErrorBoundary label="Equipo Comercial">
              <PantallaEstructuraComercial
                idUsuario={enModoTodosLosUsuarios ? null : idUsuarioEfectivo}
                bloqueadoPorTodos={enModoTodosLosUsuarios}
              />
            </ErrorBoundary>
          </div>
        )}
        {gruposVisitados.has(PANTALLA_CLASIFICACION_COMERCIAL) && (
          <div style={estiloGrupo(pantallaActiva === PANTALLA_CLASIFICACION_COMERCIAL)}>
            <ErrorBoundary label="Estructura Comercial">
              <PantallaClasificacionComercial
                idUsuario={enModoTodosLosUsuarios ? null : idUsuarioEfectivo}
                bloqueadoPorTodos={enModoTodosLosUsuarios}
              />
            </ErrorBoundary>
          </div>
        )}
        {gruposVisitados.has(PANTALLA_PLANIFICACION_COMERCIAL) && (
          <div style={estiloGrupo(pantallaActiva === PANTALLA_PLANIFICACION_COMERCIAL)}>
            <ErrorBoundary label="Planificación Comercial">
              <PantallaPlanificacionComercial
                idUsuario={enModoTodosLosUsuarios ? null : idUsuarioEfectivo}
                bloqueadoPorTodos={enModoTodosLosUsuarios}
              />
            </ErrorBoundary>
          </div>
        )}
        {gruposVisitados.has(PANTALLA_AGENDA_COMERCIAL) && (
          <div style={estiloGrupo(pantallaActiva === PANTALLA_AGENDA_COMERCIAL)}>
            <ErrorBoundary label="Agenda Comercial">
              <PantallaAgendaComercial
                idUsuario={enModoTodosLosUsuarios ? null : idUsuarioEfectivo}
                bloqueadoPorTodos={enModoTodosLosUsuarios}
              />
            </ErrorBoundary>
          </div>
        )}
        {gruposVisitados.has(PANTALLA_GEOLOCALIZACION) && (
          <div style={estiloGrupo(pantallaActiva === PANTALLA_GEOLOCALIZACION)}>
            <ErrorBoundary label="Geolocalización">
              <PantallaGeolocalizacion
                idUsuario={enModoTodosLosUsuarios ? null : idUsuarioEfectivo}
                bloqueadoPorTodos={enModoTodosLosUsuarios}
              />
            </ErrorBoundary>
          </div>
        )}
        {gruposVisitados.has(PANTALLA_RAPEL_DISTRIBUIDORES) && (
          <div style={estiloGrupo(pantallaActiva === PANTALLA_RAPEL_DISTRIBUIDORES)}>
            <ErrorBoundary label="Rapel Distribuidores">
              <PantallaRapelDistribuidores
                idUsuario={enModoTodosLosUsuarios ? null : idUsuarioEfectivo}
                bloqueadoPorTodos={enModoTodosLosUsuarios}
              />
            </ErrorBoundary>
          </div>
        )}
        {gruposVisitados.has(PANTALLA_AVISOS_CONSUMO) && (
          <div style={estiloGrupo(pantallaActiva === PANTALLA_AVISOS_CONSUMO)}>
            <ErrorBoundary label="Avisos de Consumo">
              <PantallaAvisosConsumo
                idUsuario={enModoTodosLosUsuarios ? null : idUsuarioEfectivo}
                bloqueadoPorTodos={enModoTodosLosUsuarios}
              />
            </ErrorBoundary>
          </div>
        )}
        {gruposVisitados.has(PANTALLA_ACUERDOS_CLIENTES) && (
          <div style={estiloGrupo(pantallaActiva === PANTALLA_ACUERDOS_CLIENTES)}>
            <ErrorBoundary label="Acuerdos con Clientes">
              <PantallaAcuerdosClientes
                idUsuario={enModoTodosLosUsuarios ? null : idUsuarioEfectivo}
                bloqueadoPorTodos={enModoTodosLosUsuarios}
              />
            </ErrorBoundary>
          </div>
        )}
        {gruposVisitados.has(PANTALLA_CONFIGURACION) && (
          <div style={estiloGrupo(pantallaActiva === PANTALLA_CONFIGURACION)}>
            <ErrorBoundary label="Configuración">
              {/* "Otras actividades" es GLOBAL (no depende de idUsuario) y
                  solo `esManager` decide si se muestran sus controles de
                  edición. "Medio y Objetivo" (movido aquí desde Agenda
                  Comercial, a petición de Sergio) SÍ es de una cuenta
                  concreta, así que recibe idUsuario/bloqueadoPorTodos igual
                  que el resto de pantallas de este bloque. */}
              <PantallaConfiguracion
                esManager={esManager}
                idUsuario={enModoTodosLosUsuarios ? null : idUsuarioEfectivo}
                bloqueadoPorTodos={enModoTodosLosUsuarios}
              />
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
