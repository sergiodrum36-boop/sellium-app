/*
 * TipologiaReferencias.js
 * Pantalla de mantenimiento para el nuevo concepto "Tipología" (Vino /
 * Licor) por marca/referencia, usado por el Dashboard de Ventas Sell-In
 * (QlikSense) para medir qué peso tiene cada tipología sobre el total
 * vendido.
 *
 * Cada marca se muestra con una tipología "actual": si ya tiene una
 * asignación manual guardada (colección tipologiasMarca), se usa esa; si
 * no, se propone automáticamente por palabras clave (tipologia.js) a modo
 * de sugerencia — nunca se guarda sola, solo se ve en gris con la etiqueta
 * "Sugerida automáticamente" hasta que el usuario la confirma o la cambia.
 * Elegir cualquier valor en el desplegable (incluido "Sin clasificar") crea
 * una asignación manual explícita para esa marca.
 *
 * No hay botón "Guardar todo": cada fila se guarda al vuelo en cuanto se
 * cambia su desplegable (igual de simple que corregir una casilla en una
 * hoja de cálculo), con un pequeño indicador de "Guardando..." por fila.
 *
 * CAMBIO (a petición de Sergio): se añade un botón "Eliminar" por fila para
 * borrar del todo marcas que no son referencias reales — p.ej. "ELEGIR
 * ARTICULO" u otros nombres placeholder que quedaron creados en el catálogo
 * por algún Excel importado antes de que existiera el filtro de filas
 * placeholder (ver parserLiquidacion.js). Borra el documento de la
 * colección global `marcas` (y su asignación de tipología si tenía una) sin
 * tocar ningún histórico de compras/ventas: esos movimientos, si los
 * hubiera, guardan el nombre de la marca por su cuenta (denormalizado) así
 * que no dejan de verse, simplemente la marca deja de estar en el catálogo
 * para poder elegirla en movimientos nuevos. Como el borrado de Firestore no
 * se puede deshacer, se pide confirmación explícita antes de ejecutarlo.
 *
 * CAMBIO (a petición de Sergio, bug de "Sin clasificar" con % que no
 * cuadraba): esta pantalla solo listaba marcas de la colección `marcas`,
 * pero el Dashboard calcula la tipología de cada VENTA por su `id_marca` —
 * si algún movimiento de `ventasReales` apunta a un id_marca que ya no
 * existe como documento en `marcas` (referencia "huérfana": la marca se
 * borró o se fusionó en algún momento pero el histórico sigue apuntando al
 * id antiguo), esa venta nunca aparecía aquí para poder clasificarla, y sin
 * embargo SÍ contaba como "Sin clasificar" en el Dashboard. Ahora se recibe
 * también `ventasReales` y se añaden a la tabla, marcadas con el origen
 * "Solo en histórico", las referencias que aparecen en ventas pero no en el
 * catálogo — así se pueden clasificar (o al menos localizar) y el recuento
 * de aquí vuelve a cuadrar con el % del Dashboard. No tienen botón Eliminar
 * (no hay ningún documento de `marcas` que borrar).
 *
 * CAMBIO (causa real del desajuste de "Sin clasificar" — las huérfanas de
 * arriba no eran el problema en el caso de Sergio): la sugerencia automática
 * de esta pantalla llamaba a `inferirTipologiaPorNombre(m.nombre_marca)`
 * SOLO con el nombre, aunque el documento de `marcas` sí guarda `familia`
 * (se rellena al importar, ver ImportarVentasReales.js). El Dashboard, en
 * cambio, siempre ha llamado a `inferirTipologiaPorNombre(nombre, familia)`
 * — con los dos. Si el nombre de una marca sugiere una categoría pero su
 * Familia contiene una palabra clave de OTRA categoría distinta, el
 * resultado es ambiguo (`inferirTipologiaPorNombre` devuelve null ante
 * cualquier ambigüedad) y el Dashboard la manda a "Sin clasificar" — pero
 * aquí, al no mirar la Familia, no había ambigüedad y la marca se veía con
 * un badge de color, como si ya estuviera clasificada. De ahí que "aquí todo
 * parece asignado" y el Dashboard aun así muestre un % de Sin clasificar.
 * Se corrige pasando también `m.familia` aquí, para que la sugerencia (y por
 * tanto lo que se ve como "ya clasificado") sea siempre coherente con lo que
 * calcula el Dashboard.
 */

import React, { useState, useMemo } from 'react';
import { Search, Trash2 } from 'lucide-react';
import { saveTipologiaMarca, deleteDocument } from './firebaseApi';
import { inferirTipologiaPorNombre } from './tipologia';
import { inputClasses, thClasses, tdClasses } from './uiClasses';

const ESTILO_BADGE = {
  Vino: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400',
  Licor: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  'Coctelería': 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-400',
  'Ajuste/Rappel': 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400',
  '': 'bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400',
};

const TipologiaBadge = ({ tipologia }) => (
  <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${ESTILO_BADGE[tipologia || '']}`}>
    {tipologia || 'Sin clasificar'}
  </span>
);

function TipologiaReferencias({ marcas, tipologiasMarca, ventasReales, onTipologiaGuardada }) {

  const [busqueda, setBusqueda] = useState('');
  const [guardandoId, setGuardandoId] = useState(null);
  const [borrandoId, setBorrandoId] = useState(null);

  // id_marca -> tipología asignada a mano (la última guardada; saveTipologiaMarca
  // se asegura de que nunca quede más de una asignación viva por marca).
  const mapaAsignaciones = useMemo(() => {
    const mapa = new Map();
    (tipologiasMarca || []).forEach(t => mapa.set(t.id_marca, t.tipologia));
    return mapa;
  }, [tipologiasMarca]);

  // Unión de "marcas de verdad" (documento en la colección `marcas`) +
  // referencias HUÉRFANAS: id_marca que aparece en algún movimiento de
  // `ventasReales` pero no tiene (ya no tiene) documento en `marcas`. Sin
  // esto, esas ventas eran invisibles aquí — no se podían clasificar — pero
  // sí contaban como "Sin clasificar" en el Dashboard, que calcula la
  // tipología fila a fila directamente sobre `ventasReales`. `familia` se
  // guarda también para poder pasarla a `inferirTipologiaPorNombre` igual
  // que hace el propio Dashboard.
  const entidades = useMemo(() => {
    const lista = (marcas || []).map(m => ({
      id: m.id,
      nombre: m.nombre_marca || '(sin nombre)',
      familia: m.familia,
      huerfana: false,
    }));
    const idsCatalogo = new Set(lista.map(e => e.id));
    const huerfanas = new Map();
    (ventasReales || []).forEach(v => {
      if (v.id_marca && !idsCatalogo.has(v.id_marca) && !huerfanas.has(v.id_marca)) {
        huerfanas.set(v.id_marca, { id: v.id_marca, nombre: v.nombre_marca || '(sin nombre)', familia: v.familia, huerfana: true });
      }
    });
    return [...lista, ...huerfanas.values()];
  }, [marcas, ventasReales]);

  // DIAGNÓSTICO: para cada id_marca, con qué OTRO texto (nombre_marca
  // denormalizado en la propia venta) aparece en `ventasReales` — distinto
  // al nombre actual de esa marca en el catálogo. Esto revela el caso real
  // detectado con Sergio: una venta puede guardar "PALOMO CAZADOR" como
  // nombre_marca (el texto tal cual venía en el Excel) pero su id_marca
  // apuntar a una marca del catálogo que en realidad se llama "Palomo
  // Cazador Magnum" (se enlazó así durante la reconciliación de la
  // importación, al no existir una marca con el nombre EXACTO "Palomo
  // Cazador"). Si esa marca del catálogo SÍ está clasificada, el Dashboard
  // debería contarla bien — así que si aun así sale como "Sin clasificar",
  // esto ayuda a localizar cuál es la marca del catálogo (a veces con un
  // nombre que no tiene nada que ver) a la que de verdad apunta esa venta.
  const aliasVentasPorId = useMemo(() => {
    const mapa = new Map();
    (ventasReales || []).forEach(v => {
      if (!v.id_marca || !v.nombre_marca) return;
      if (!mapa.has(v.id_marca)) mapa.set(v.id_marca, new Set());
      mapa.get(v.id_marca).add(v.nombre_marca.trim().toUpperCase());
    });
    return mapa;
  }, [ventasReales]);

  const filas = useMemo(() => {
    return entidades
      .map(e => {
        const tieneAsignacionManual = mapaAsignaciones.has(e.id);
        const tipologiaManual = mapaAsignaciones.get(e.id);
        const tipologiaMostrada = tieneAsignacionManual ? tipologiaManual : (inferirTipologiaPorNombre(e.nombre, e.familia) || '');
        const nombresEnVentas = aliasVentasPorId.get(e.id);
        const aliases = nombresEnVentas
          ? [...nombresEnVentas].filter(n => n !== e.nombre.trim().toUpperCase())
          : [];
        return {
          id: e.id,
          nombre: e.nombre,
          tipologia: tipologiaMostrada,
          origen: tieneAsignacionManual ? 'manual' : (tipologiaMostrada ? 'sugerida' : 'ninguna'),
          huerfana: e.huerfana,
          aliases,
        };
      })
      .filter(f => !busqueda.trim() || f.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [entidades, mapaAsignaciones, busqueda, aliasVentasPorId]);

  const resumen = useMemo(() => {
    const todas = entidades.map(e => {
      const tieneAsignacionManual = mapaAsignaciones.has(e.id);
      const tipologiaManual = mapaAsignaciones.get(e.id);
      return tieneAsignacionManual ? tipologiaManual : (inferirTipologiaPorNombre(e.nombre, e.familia) || '');
    });
    return {
      vino: todas.filter(t => t === 'Vino').length,
      licor: todas.filter(t => t === 'Licor').length,
      cocteleria: todas.filter(t => t === 'Coctelería').length,
      ajuste: todas.filter(t => t === 'Ajuste/Rappel').length,
      sinClasificar: todas.filter(t => !t).length,
      huerfanas: entidades.filter(e => e.huerfana).length,
    };
  }, [entidades, mapaAsignaciones]);

  const handleCambiarTipologia = async (idMarca, nuevaTipologia) => {
    setGuardandoId(idMarca);
    try {
      await saveTipologiaMarca(idMarca, nuevaTipologia);
      if (onTipologiaGuardada) await onTipologiaGuardada();
    } catch (error) {
      console.error('Error guardando tipología:', error);
      alert('Error al guardar la tipología: ' + error.message);
    }
    setGuardandoId(null);
  };

  const handleEliminarMarca = async (idMarca, nombreMarca) => {
    if (!window.confirm(
      `Vas a eliminar por completo la marca "${nombreMarca}" del catálogo.\n` +
      `Si ya tiene compras o ventas asociadas, esos movimientos seguirán existiendo con su nombre actual, ` +
      `pero la marca dejará de poder elegirse para movimientos nuevos.\n` +
      `Esta acción no se puede deshacer. ¿Continuar?`
    )) return;

    setBorrandoId(idMarca);
    try {
      // Si tenía una tipología asignada a mano, se borra también — si no, se
      // quedaría huérfana (apuntando a una marca que ya no existe).
      const asignacion = (tipologiasMarca || []).find(t => t.id_marca === idMarca);
      if (asignacion) await deleteDocument('tipologiasMarca', asignacion.id);
      await deleteDocument('marcas', idMarca);
      if (onTipologiaGuardada) await onTipologiaGuardada();
    } catch (error) {
      console.error('Error eliminando la marca:', error);
      alert('Error al eliminar la marca: ' + error.message);
    }
    setBorrandoId(null);
  };

  return (
    <div>
      <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-1">Tipología de Referencias (Vino / Licor / Coctelería)</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
        Clasifica cada marca/referencia como Vino, Licor o Coctelería para poder ver, en el Dashboard de Ventas
        Sell-In, qué peso tiene cada tipología sobre el total vendido. Las que aún no has revisado muestran una
        sugerencia automática en gris (por el nombre de la marca) — cámbiala o confírmala cuando quieras; no se
        guarda nada hasta que tocas el desplegable. Usa "Ajuste/Rappel" para líneas que no son un producto en sí
        (rappels, descuentos, abonos...) — esas quedan fuera del cálculo de peso % por tipología del Dashboard,
        para no distorsionar el reparto real de ventas.
        {resumen.huerfanas > 0 && (
          <> Hay <strong>{resumen.huerfanas}</strong> referencia{resumen.huerfanas !== 1 ? 's' : ''} marcada
          {resumen.huerfanas !== 1 ? 's' : ''} como "Solo en histórico" — aparecen en ventas pero ya no tienen
          ficha en el catálogo de marcas; sin clasificarlas aquí, el Dashboard las cuenta como "Sin clasificar"
          aunque no las veas en ningún otro sitio.</>
        )}
      </p>

      <div className="flex flex-wrap gap-3 mb-4">
        <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
          Vino: {resumen.vino}
        </span>
        <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
          Licor: {resumen.licor}
        </span>
        <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-400">
          Coctelería: {resumen.cocteleria}
        </span>
        <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400">
          Ajuste/Rappel: {resumen.ajuste}
        </span>
        <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400">
          Sin clasificar: {resumen.sinClasificar}
        </span>
        {resumen.huerfanas > 0 && (
          <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400">
            Solo en histórico: {resumen.huerfanas}
          </span>
        )}
      </div>

      <div className="relative mb-4 max-w-xs">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar marca..."
          className={`${inputClasses} w-full pl-8`}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className={thClasses}>Marca</th>
              <th className={thClasses}>Tipología</th>
              <th className={thClasses}>Origen</th>
              <th className={thClasses}>Cambiar a</th>
              <th className={thClasses}>Eliminar</th>
            </tr>
          </thead>
          <tbody>
            {filas.length > 0 ? (
              filas.map(f => (
                <tr key={f.id}>
                  <td className={`${tdClasses} font-semibold`}>
                    {f.nombre}
                    {f.huerfana && (
                      <span
                        className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400"
                        title="Aparece en ventas pero ya no tiene ficha en el catálogo de marcas"
                      >
                        Solo en histórico
                      </span>
                    )}
                    {f.aliases.length > 0 && (
                      <div className="mt-0.5 font-normal text-[10px] text-amber-600 dark:text-amber-400">
                        En ventas también aparece como: {f.aliases.join(', ')}
                      </div>
                    )}
                    <div className="mt-0.5 font-normal font-mono text-[10px] text-slate-400 dark:text-slate-600">
                      ID: {f.id}
                    </div>
                  </td>
                  <td className={tdClasses}><TipologiaBadge tipologia={f.tipologia} /></td>
                  <td className={`${tdClasses} text-slate-400 dark:text-slate-500`}>
                    {f.origen === 'manual' ? 'Asignada a mano' : f.origen === 'sugerida' ? 'Sugerida automáticamente' : '—'}
                  </td>
                  <td className={tdClasses}>
                    <select
                      value={f.tipologia}
                      onChange={(e) => handleCambiarTipologia(f.id, e.target.value)}
                      disabled={guardandoId === f.id}
                      className={inputClasses}
                    >
                      <option value="">Sin clasificar</option>
                      <option value="Vino">Vino</option>
                      <option value="Licor">Licor</option>
                      <option value="Coctelería">Coctelería</option>
                      <option value="Ajuste/Rappel">Ajuste/Rappel</option>
                    </select>
                    {guardandoId === f.id && (
                      <span className="ml-2 text-[11px] text-slate-400 dark:text-slate-500">Guardando...</span>
                    )}
                  </td>
                  <td className={`${tdClasses} text-center`}>
                    {f.huerfana ? (
                      <span className="text-slate-300 dark:text-slate-600" title="No tiene documento en el catálogo que borrar">—</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleEliminarMarca(f.id, f.nombre)}
                        disabled={borrandoId === f.id}
                        title="Eliminar esta marca del catálogo"
                        className="!bg-transparent !border-0 !text-red-500 hover:!text-red-600 dark:!text-red-400 dark:hover:!text-red-300 disabled:opacity-50 p-1"
                      >
                        {borrandoId === f.id ? (
                          <span className="text-[11px] text-slate-400 dark:text-slate-500">Borrando...</span>
                        ) : (
                          <Trash2 size={14} />
                        )}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5" className={`${tdClasses} text-center py-5`}>
                  {busqueda ? 'Ninguna marca coincide con la búsqueda.' : 'No hay marcas todavía.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default TipologiaReferencias;
