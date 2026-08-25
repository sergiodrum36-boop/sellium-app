/*
 * Papelera.js (Versión 1.0)
 * Nueva pantalla, a petición de Sergio (mejora de "profesionalización" de
 * la app, tras la auditoría): muestra los registros de Histórico Sell-In y
 * Sell-Out que se han "borrado" desde Historico.js/HistoricoSellIn.js o
 * mediante el reseteo de Mantenimiento.js — que en realidad solo quedan
 * marcados como eliminados (ver firebaseApi.js, sección 22), no borrados de
 * verdad. Desde aquí se puede "Restaurar" (vuelven a aparecer en todas las
 * pantallas normales) o "Eliminar definitivamente" (ahí sí, sin vuelta
 * atrás).
 *
 * No usa idDistribuidor ni depende del distribuidor seleccionado arriba en
 * PantallaDistribuidor — es intencionadamente "vista de toda la cuenta",
 * igual que Mantenimiento.js.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { getPapelera, restaurarDePapelera, eliminarDefinitivamente } from './firebaseApi';
import { auth } from './firebaseConfig';
import { botonSecundario, botonPeligro, tarjeta } from './uiClasses';
import TablaOrdenable from './TablaOrdenable';

const formateadorFecha = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-ES');
  } catch {
    return iso;
  }
};

function Papelera({ idUsuario, marcas, listaDistribuidores }) {
  const [papeleraSellIn, setPapeleraSellIn] = useState([]);
  const [papeleraSellOut, setPapeleraSellOut] = useState([]);
  const [papeleraSellOutClientesMovimientos, setPapeleraSellOutClientesMovimientos] = useState([]);
  const [papeleraSellOutClientesMaestro, setPapeleraSellOutClientesMaestro] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [procesandoId, setProcesandoId] = useState(null);

  const mapaMarcas = new Map(marcas.map(m => [m.id, m.nombre_marca]));
  const mapaDistribuidores = new Map(listaDistribuidores.map(d => [d.id, d.nombre_distribuidor]));

  const cargarPapelera = useCallback(async () => {
    if (!idUsuario) {
      setPapeleraSellIn([]); setPapeleraSellOut([]);
      setPapeleraSellOutClientesMovimientos([]); setPapeleraSellOutClientesMaestro([]);
      return;
    }
    setCargando(true);
    try {
      const [sellIn, sellOut, sellOutClientesMov, sellOutClientesMaestro] = await Promise.all([
        getPapelera(idUsuario, 'historicoSellIn'),
        getPapelera(idUsuario, 'historicoSellOut'),
        getPapelera(idUsuario, 'movimientosSellOutClientes'),
        getPapelera(idUsuario, 'clientesSellOut')
      ]);
      sellIn.sort((a, b) => (b.eliminado_en || '').localeCompare(a.eliminado_en || ''));
      sellOut.sort((a, b) => (b.eliminado_en || '').localeCompare(a.eliminado_en || ''));
      sellOutClientesMov.sort((a, b) => (b.eliminado_en || '').localeCompare(a.eliminado_en || ''));
      sellOutClientesMaestro.sort((a, b) => (b.eliminado_en || '').localeCompare(a.eliminado_en || ''));
      setPapeleraSellIn(sellIn);
      setPapeleraSellOut(sellOut);
      setPapeleraSellOutClientesMovimientos(sellOutClientesMov);
      setPapeleraSellOutClientesMaestro(sellOutClientesMaestro);
    } catch (error) {
      console.error('Error cargando la papelera:', error);
      alert('Error al cargar la papelera: ' + error.message);
    }
    setCargando(false);
  }, [idUsuario]);

  useEffect(() => { cargarPapelera(); }, [cargarPapelera]);

  const actorActual = () => ({ uid: auth.currentUser?.uid, email: auth.currentUser?.email });

  const handleRestaurar = async (collectionName, item, resumen) => {
    setProcesandoId(item.id);
    try {
      const actor = actorActual();
      await restaurarDePapelera(collectionName, item.id, {
        idUsuario: item.id_usuario,
        actorUid: actor.uid,
        actorEmail: actor.email,
        resumen
      });
      await cargarPapelera();
    } catch (error) {
      console.error('Error al restaurar:', error);
      alert('Error al restaurar: ' + error.message);
    }
    setProcesandoId(null);
  };

  const handleEliminarDefinitivo = async (collectionName, item, resumen) => {
    if (!window.confirm('¿Eliminar definitivamente este registro? Esta acción NO se puede deshacer.')) return;
    setProcesandoId(item.id);
    try {
      const actor = actorActual();
      await eliminarDefinitivamente(collectionName, item.id, {
        idUsuario: item.id_usuario,
        actorUid: actor.uid,
        actorEmail: actor.email,
        resumen
      });
      await cargarPapelera();
    } catch (error) {
      console.error('Error al eliminar definitivamente:', error);
      alert('Error al eliminar definitivamente: ' + error.message);
    }
    setProcesandoId(null);
  };

  const ETIQUETA_RESUMEN = {
    historicoSellIn: 'Sell-In',
    historicoSellOut: 'Sell-Out',
    movimientosSellOutClientes: 'Sell-Out Cliente'
  };

  const renderTabla = (titulo, filas, collectionName, columnas) => (
    <div className={`${tarjeta} mb-5`}>
      <h4 className="text-sm font-medium text-slate-900 dark:text-white mb-3">{titulo} ({filas.length})</h4>
      {filas.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No hay registros en la papelera.</p>
      ) : (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700">
          <TablaOrdenable
            filas={filas}
            keyExtractor={item => item.id}
            columnas={[
              { titulo: 'Mes/Año', valor: item => item.mes_ano || '', render: item => item.mes_ano },
              {
                titulo: 'Distribuidor',
                valor: item => mapaDistribuidores.get(item.id_distribuidor) || '',
                render: item => <span className="font-semibold">{mapaDistribuidores.get(item.id_distribuidor) || 'Distribuidor desconocido'}</span>,
              },
              { titulo: 'Marca', valor: item => mapaMarcas.get(item.id_marca) || '', render: item => mapaMarcas.get(item.id_marca) || 'Marca desconocida' },
              ...columnas.map(c => ({ titulo: c.label, render: c.render })),
              { titulo: 'Eliminado', valor: item => item.eliminado_en || '', render: item => formateadorFecha(item.eliminado_en) },
              {
                titulo: 'Acciones',
                claseCelda: 'whitespace-nowrap',
                render: (item) => {
                  const nombreMarca = mapaMarcas.get(item.id_marca) || 'Marca desconocida';
                  const resumen = `${ETIQUETA_RESUMEN[collectionName] || collectionName}: ${nombreMarca} · ${item.mes_ano}`;
                  const procesando = procesandoId === item.id;
                  return (
                    <div className="flex gap-2">
                      <button className={botonSecundario} disabled={procesando} onClick={() => handleRestaurar(collectionName, item, resumen)}>
                        Restaurar
                      </button>
                      <button className={botonPeligro} disabled={procesando} onClick={() => handleEliminarDefinitivo(collectionName, item, resumen)}>
                        Eliminar def.
                      </button>
                    </div>
                  );
                },
              },
            ]}
          />
        </div>
      )}
    </div>
  );

  // Tabla del maestro de clientes finales (clientesSellOut) — no tiene
  // mes_ano ni id_marca (esos atributos viven en los MOVIMIENTOS, ver
  // firebaseApi.js sección 21), así que usa un layout de columnas distinto
  // en vez de reutilizar renderTabla.
  const renderTablaClientesMaestro = (filas) => (
    <div className={`${tarjeta} mb-5`}>
      <h4 className="text-sm font-medium text-slate-900 dark:text-white mb-3">Clientes finales (maestro Sell-Out por Cliente) ({filas.length})</h4>
      {filas.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No hay registros en la papelera.</p>
      ) : (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700">
          <TablaOrdenable
            filas={filas}
            keyExtractor={item => item.id}
            columnas={[
              { titulo: 'Cliente', valor: item => item.nombre_cliente || '', render: item => <span className="font-semibold">{item.nombre_cliente}</span> },
              { titulo: 'Distribuidor', valor: item => mapaDistribuidores.get(item.id_distribuidor) || '', render: item => mapaDistribuidores.get(item.id_distribuidor) || 'Distribuidor desconocido' },
              { titulo: 'Cód./NIF', valor: item => item.cod_cliente_origen || item.nif_cif || '', render: item => item.cod_cliente_origen || item.nif_cif || '—' },
              { titulo: 'Eliminado', valor: item => item.eliminado_en || '', render: item => formateadorFecha(item.eliminado_en) },
              {
                titulo: 'Acciones',
                claseCelda: 'whitespace-nowrap',
                render: (item) => {
                  const resumen = `Sell-Out Cliente (maestro): ${item.nombre_cliente}`;
                  const procesando = procesandoId === item.id;
                  return (
                    <div className="flex gap-2">
                      <button className={botonSecundario} disabled={procesando} onClick={() => handleRestaurar('clientesSellOut', item, resumen)}>
                        Restaurar
                      </button>
                      <button className={botonPeligro} disabled={procesando} onClick={() => handleEliminarDefinitivo('clientesSellOut', item, resumen)}>
                        Eliminar def.
                      </button>
                    </div>
                  );
                },
              },
            ]}
          />
        </div>
      )}
    </div>
  );

  if (cargando) {
    return <div className="text-slate-500 dark:text-slate-400">Cargando papelera...</div>;
  }

  return (
    <div>
      <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-1">Papelera</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
        Registros de Compras (Sell-In) y Ventas/A&amp;P (Sell-Out) borrados desde Histórico o mediante el reseteo de Mantenimiento. Puedes restaurarlos o eliminarlos definitivamente.
      </p>

      {renderTabla('Compras (Sell-In)', papeleraSellIn, 'historicoSellIn', [
        { label: 'Unidades', render: (i) => Math.round(i.unidades_compradas || 0) },
        { label: 'Facturación (€)', render: (i) => (i.facturacion_euros || 0).toFixed(2) }
      ])}

      {renderTabla('Ventas y A&P (Sell-Out)', papeleraSellOut, 'historicoSellOut', [
        { label: 'Ventas (uds)', render: (i) => Math.round(i.ventas_uds || 0) },
        { label: 'Ventas (€)', render: (i) => (i.ventas_euros || 0).toFixed(2) }
      ])}

      {renderTabla('Sell-Out por Cliente Final (movimientos)', papeleraSellOutClientesMovimientos, 'movimientosSellOutClientes', [
        { label: 'Cliente', render: (i) => i.nombre_cliente || '—' },
        { label: 'Uds. totales', render: (i) => Math.round(i.uds_totales || 0) }
      ])}

      {renderTablaClientesMaestro(papeleraSellOutClientesMaestro)}
    </div>
  );
}

export default Papelera;
