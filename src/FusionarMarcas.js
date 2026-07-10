/*
 * FusionarMarcas.js (Versión 1.1 - Rediseño visual Fase 3)
 * Cambios sobre la versión anterior: solo la maquetación pasa a Tailwind CSS
 * (con soporte de modo oscuro). La lógica de fusión no cambia.
 *
 * Detecta marcas con nombres parecidos (posibles duplicados creados por
 * escribirlas de forma distinta, o por importar un Excel con nombres algo
 * distintos a los que ya había) y permite fusionarlas: se elige una marca
 * "principal" y el resto de movimientos (Sell-In / Sell-Out) que apuntaban
 * a las duplicadas se reasignan a la principal. Nunca fusiona nada solo:
 * cada grupo requiere confirmación explícita.
 */

import React, { useState, useMemo } from 'react';
import { agruparPosiblesDuplicados, similitud } from './matching';
import { reasignarMovimientosDeMarca, deleteDocument, saveNuevaMarca } from './firebaseApi';
import { inputClasses, botonExito, thClasses, tdClasses } from './uiClasses';

const formateadorMoneda = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

function FusionarMarcas({ idUsuario, marcas, onMerged }) {

  const clustersIniciales = useMemo(() => agruparPosiblesDuplicados(marcas || [], 0.6), [marcas]);

  // Estado por cluster: { principalId, seleccion: { [marcaId]: boolean }, nombreFinal, costeFinal, apFinal }
  const [estadoClusters, setEstadoClusters] = useState(() => {
    const inicial = {};
    clustersIniciales.forEach((cluster, idx) => {
      const principal = cluster[0];
      const seleccion = {};
      cluster.forEach(m => {
        if (m.id === principal.id) return;
        seleccion[m.id] = similitud(m.nombre_marca, principal.nombre_marca) >= 0.999;
      });
      inicial[idx] = {
        principalId: principal.id,
        seleccion,
        nombreFinal: principal.nombre_marca,
        costeFinal: principal.Coste_Unidad || 0,
        apFinal: principal.AP_Generado_Por_Unidad || 0
      };
    });
    return inicial;
  });

  const [fusionando, setFusionando] = useState(null); // índice del cluster en proceso
  const [resultados, setResultados] = useState({}); // { [idx]: resumen }
  const [clustersOcultos, setClustersOcultos] = useState({}); // { [idx]: true } tras fusionar

  const setPrincipal = (idx, marcaId) => {
    setEstadoClusters(prev => {
      const cluster = clustersIniciales[idx];
      const seleccionPrevia = prev[idx]?.seleccion || {};
      const nuevaSeleccion = {};
      const nuevoPrincipal = cluster.find(c => c.id === marcaId);
      cluster.forEach(m => {
        if (m.id === marcaId) return;
        // Mantener selección previa si existía, si no recalcular por similitud al nuevo principal
        nuevaSeleccion[m.id] = seleccionPrevia[m.id] ?? (similitud(m.nombre_marca, nuevoPrincipal.nombre_marca) >= 0.999);
      });
      return {
        ...prev,
        [idx]: {
          ...prev[idx],
          principalId: marcaId,
          seleccion: nuevaSeleccion,
          nombreFinal: nuevoPrincipal.nombre_marca,
          costeFinal: nuevoPrincipal.Coste_Unidad || 0,
          apFinal: nuevoPrincipal.AP_Generado_Por_Unidad || 0
        }
      };
    });
  };

  const toggleSeleccion = (idx, marcaId) => {
    setEstadoClusters(prev => ({
      ...prev,
      [idx]: { ...prev[idx], seleccion: { ...prev[idx].seleccion, [marcaId]: !prev[idx].seleccion[marcaId] } }
    }));
  };

  const setCampoFinal = (idx, campo, valor) => {
    setEstadoClusters(prev => ({ ...prev, [idx]: { ...prev[idx], [campo]: valor } }));
  };

  // Copia nombre/precio/A&P de una fila concreta del cluster al bloque "datos finales"
  const copiarDatosDeFila = (idx, marca) => {
    setEstadoClusters(prev => ({
      ...prev,
      [idx]: {
        ...prev[idx],
        nombreFinal: marca.nombre_marca,
        costeFinal: marca.Coste_Unidad || 0,
        apFinal: marca.AP_Generado_Por_Unidad || 0
      }
    }));
  };

  const handleFusionarCluster = async (idx) => {
    const cluster = clustersIniciales[idx];
    const { principalId, seleccion, nombreFinal, costeFinal, apFinal } = estadoClusters[idx];
    const principal = cluster.find(m => m.id === principalId);
    const aFusionar = cluster.filter(m => m.id !== principalId && seleccion[m.id]);

    if (aFusionar.length === 0) {
      alert('No has marcado ninguna marca para fusionar en este grupo.');
      return;
    }
    if (!nombreFinal || !nombreFinal.trim()) {
      alert('El nombre final de la marca no puede estar vacío.');
      return;
    }

    if (!window.confirm(
      `Vas a fusionar ${aFusionar.length} marca(s) en "${nombreFinal}".\n` +
      `Todo su histórico de compras y ventas pasará a esa marca, y las marcas duplicadas se borrarán.\n` +
      `La marca resultante quedará con: Precio ${formateadorMoneda.format(costeFinal || 0)} y A&P/ud ${formateadorMoneda.format(apFinal || 0)}.\n` +
      `Esta acción no se puede deshacer. ¿Continuar?`
    )) return;

    setFusionando(idx);
    try {
      // Las reglas de Firestore de este proyecto no permiten "update" (solo
      // crear y borrar), así que no se puede modificar la marca "principal"
      // in-place. En su lugar: se crea SIEMPRE una marca nueva con el
      // nombre/precio/A&P finales, se reasigna a esa marca nueva el histórico
      // de TODAS las marcas fusionadas (incluida la que se marcó como
      // "principal"), y se borran todas las marcas antiguas del grupo.
      const idNuevaMarca = await saveNuevaMarca({
        nombre_marca: nombreFinal.trim(),
        Coste_Unidad: Number(costeFinal) || 0,
        AP_Generado_Por_Unidad: Number(apFinal) || 0
      });

      const idsAFusionar = [principal.id, ...aFusionar.map(m => m.id)];

      let totalIn = 0, totalOut = 0;
      for (const idAntiguo of idsAFusionar) {
        totalIn += await reasignarMovimientosDeMarca('historicoSellIn', idUsuario, idAntiguo, idNuevaMarca, nombreFinal.trim());
        totalOut += await reasignarMovimientosDeMarca('historicoSellOut', idUsuario, idAntiguo, idNuevaMarca, nombreFinal.trim());
        await deleteDocument('marcas', idAntiguo);
      }
      setResultados(prev => ({ ...prev, [idx]: { principal: nombreFinal.trim(), fusionadas: aFusionar.length, totalIn, totalOut } }));
      setClustersOcultos(prev => ({ ...prev, [idx]: true }));
      if (onMerged) onMerged();
    } catch (err) {
      console.error('Error fusionando marcas:', err);
      alert('Error al fusionar: ' + err.message);
    }
    setFusionando(null);
  };

  if (clustersIniciales.length === 0) {
    return (
      <div>
        <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">Fusionar Marcas Duplicadas</h3>
        <p className="text-sm text-emerald-600 dark:text-emerald-400">No se han detectado marcas con nombres parecidos. Todo en orden.</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">Fusionar Marcas Duplicadas</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
        Se han encontrado {clustersIniciales.length} grupo(s) de marcas con nombres parecidos.
        Revisa cada grupo: elige cuál es la marca "principal" a conservar y marca cuáles de las
        demás son en realidad la misma marca (no fusiones variantes reales como distintos tamaños
        de botella, distintas cosechas o coletillas como "(CON SERVICIO DIRECTO)" si en tu negocio
        eso significa un producto o precio distinto — revísalo antes de marcar la casilla). Al fusionar,
        además de mover el histórico, la marca resultante se queda con el nombre/precio/A&P que elijas
        abajo. Nada se borra hasta que pulses "Fusionar este grupo".
      </p>

      {clustersIniciales.map((cluster, idx) => {
        if (clustersOcultos[idx]) {
          const r = resultados[idx];
          return (
            <div key={idx} className="border border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 rounded-xl p-4 mb-4 text-sm">
              ✅ Fusionadas {r.fusionadas} marca(s) en "{r.principal}" ({r.totalIn} mov. Sell-In y {r.totalOut} mov. Sell-Out reasignados).
            </div>
          );
        }

        const { principalId, seleccion, nombreFinal, costeFinal, apFinal } = estadoClusters[idx];
        return (
          <div key={idx} className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 mb-4 bg-white dark:bg-slate-800">
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className={thClasses}>Principal</th>
                    <th className={thClasses}>Marca</th>
                    <th className={thClasses}>Precio (€)</th>
                    <th className={thClasses}>A&P/ud (€)</th>
                    <th className={thClasses}>Similitud con principal</th>
                    <th className={thClasses}>Fusionar en principal</th>
                    <th className={thClasses}>Datos a usar</th>
                  </tr>
                </thead>
                <tbody>
                  {cluster.map(m => (
                    <tr key={m.id}>
                      <td className={`${tdClasses} text-center`}>
                        <input type="radio" checked={principalId === m.id} onChange={() => setPrincipal(idx, m.id)} />
                      </td>
                      <td className={`${tdClasses} ${principalId === m.id ? 'font-semibold' : ''}`}>{m.nombre_marca}</td>
                      <td className={`${tdClasses} text-right tabular-nums`}>{formateadorMoneda.format(m.Coste_Unidad || 0)}</td>
                      <td className={`${tdClasses} text-right tabular-nums`}>{formateadorMoneda.format(m.AP_Generado_Por_Unidad || 0)}</td>
                      <td className={`${tdClasses} text-center`}>
                        {m.id === principalId ? '—' : `${Math.round(similitud(m.nombre_marca, cluster.find(c => c.id === principalId).nombre_marca) * 100)}%`}
                      </td>
                      <td className={`${tdClasses} text-center`}>
                        {m.id !== principalId && (
                          <input type="checkbox" checked={!!seleccion[m.id]} onChange={() => toggleSeleccion(idx, m.id)} />
                        )}
                      </td>
                      <td className={`${tdClasses} text-center`}>
                        <button
                          onClick={() => copiarDatosDeFila(idx, m)}
                          className="!bg-slate-200 dark:!bg-slate-700 hover:!bg-slate-300 dark:hover:!bg-slate-600 !text-slate-700 dark:!text-slate-100 !border-0 !font-medium text-[11px] px-2 py-1 rounded"
                          title="Usar el nombre, precio y A&P de esta fila como datos finales de la marca fusionada"
                        >
                          Usar estos datos
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
              <strong className="text-xs text-slate-700 dark:text-slate-200">Datos finales de la marca fusionada:</strong>
              <div className="flex gap-4 mt-2 flex-wrap items-center">
                <label className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                  Nombre:
                  <input
                    type="text"
                    value={nombreFinal}
                    onChange={(e) => setCampoFinal(idx, 'nombreFinal', e.target.value)}
                    className={`${inputClasses} min-w-[220px]`}
                  />
                </label>
                <label className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                  Precio (€):
                  <input
                    type="number"
                    step="0.01"
                    value={costeFinal}
                    onChange={(e) => setCampoFinal(idx, 'costeFinal', e.target.value)}
                    className={`${inputClasses} w-24`}
                  />
                </label>
                <label className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                  A&P/ud (€):
                  <input
                    type="number"
                    step="0.01"
                    value={apFinal}
                    onChange={(e) => setCampoFinal(idx, 'apFinal', e.target.value)}
                    className={`${inputClasses} w-24`}
                  />
                </label>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                Por defecto son los datos de la marca "Principal" marcada arriba. Usa "Usar estos datos" en la fila
                que tenga el precio/A&P correcto (normalmente la importada del último Excel) o edítalos a mano.
              </p>
            </div>

            <button
              onClick={() => handleFusionarCluster(idx)}
              disabled={fusionando === idx}
              className={`${botonExito} mt-3`}
            >
              {fusionando === idx ? 'Fusionando...' : 'Fusionar este grupo'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default FusionarMarcas;
