/*
 * PantallaAcuerdosClientes.js
 * "Acuerdos con Clientes" (27/07/2026, a petición de Sergio: "necesito
 * integrar en Sellium todo los formatos de acuerdos, que se queden grabados
 * y que controlen los consumos de los clientes según se vayan subiendo los
 * datos"). SEGUNDA pieza de "Acuerdos con clientes/distribuidores" — ver
 * PantallaRapelDistribuidores.js para la primera.
 *
 * Diseño confirmado con Sergio a partir de 6 propuestas de acuerdo reales
 * que compartió (RTE Malquerida, RTE Noema, Chiringuito Las Dunas, La Plaza
 * Aguamarga, RTE Casablanca, Chiringuito La Mamola):
 *  - Un acuerdo fija, para UN cliente final y durante una vigencia, un
 *    volumen de botellas objetivo COMPARTIDO entre TODAS sus referencias
 *    (se suman, no hay objetivo por marca).
 *  - Cada referencia lleva su condición base de compra: descuento simple/
 *    combinado (ej. "10% Vega + 20% extra") o promoción de cajas tipo
 *    "X+Y" (ej. "11+1").
 *  - Además, a nivel de TODO el acuerdo (no de una marca en concreto) puede
 *    haber beneficios extra: rapel por volumen superado (ej. "si se superan
 *    900 botellas, 5% dto adicional en mercancía"), aportación fija
 *    €/botella escalonada (ej. "1€/bot. hasta 1200, 1,5€/bot. si se superan
 *    1500"), o valor añadido (cesión de cava/vinoteca que pasa a ser del
 *    cliente al cumplir, copas personalizadas...).
 *  - Seguimiento automático: si el acuerdo está vinculado a un cliente ya
 *    existente en el maestro de Sell-Out Clientes (`id_cliente`), se cruza
 *    el consumo real (`movimientosSellOutClientes`) contra el volumen
 *    pactado — ver seguimientoAcuerdos.js. Un cliente nuevo sin histórico
 *    todavía puede tener acuerdo igualmente, solo que sin barra de progreso
 *    automática hasta que aparezca en una importación.
 *
 * Fase 2 (27/07/2026, a petición de Sergio: "fase 2 y después reviso"):
 * botón "Descargar PDF" en el detalle de cada acuerdo, con el mismo formato
 * que sus propuestas reales (cabecera + tabla + condiciones + firmas) — ver
 * exportarAcuerdoPdf.js.
 *
 * Primera versión — igual que Rapel Distribuidores/Avisos de Consumo:
 * "probemos a ver qué tal queda", se ajusta con el uso real.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Trash2, Handshake, Pencil, X, Eye, Download } from 'lucide-react';
import {
  getDistribuidoresPorUsuario,
  getMarcasGlobales,
  getClientesSellOutGeneral,
  getMovimientosSellOutClientesGeneral,
  getAcuerdosClientesPorUsuario,
  crearAcuerdoCliente,
  editarAcuerdoCliente,
  borrarAcuerdoCliente,
} from './firebaseApi';
import { auth } from './firebaseConfig';
import { calcularConsumoAcuerdo, calcularEstadoVigencia, diasHastaFin } from './seguimientoAcuerdos';
import { descargarPdfAcuerdo } from './exportarAcuerdoPdf';
import TablaOrdenable from './TablaOrdenable';
import {
  tarjeta, tituloPantalla, subtitulo, inputClasses, etiqueta,
  botonPrimario, botonSecundario, botonExito, botonPeligro,
  thClasses, tdClasses, kpiCard, kpiTitulo, kpiValor
} from './uiClasses';

export const PANTALLA_ACUERDOS_CLIENTES = 'ACUERDOS_CLIENTES';

const formateadorNumero = new Intl.NumberFormat('es-ES');
const formateadorPct = (v) => `${(Number(v) || 0).toFixed(0)}%`;

const BADGE_ESTADO = {
  vigente: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30',
  proximo: 'bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-500/30',
  finalizado: 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600',
};
const ETIQUETA_ESTADO = { vigente: 'Vigente', proximo: 'Próximo', finalizado: 'Finalizado' };

const ETIQUETA_TIPO_APORTACION = {
  rapel_volumen: 'Rapel por volumen',
  aportacion_fija_botella: 'Aportación fija €/botella',
  valor_añadido: 'Valor añadido',
};

const nuevaReferencia = () => ({
  id_marca: '', nombre_marca: '', formato: '6 x 750', pvp_iva: '',
  tipo_condicion: 'descuento', descuento_pct: '', promocion_texto: '', pvp_neto: '',
});
const nuevaAportacion = () => ({ tipo: 'rapel_volumen', descripcion: '' });

const acuerdoVacio = () => ({
  numero: '', id_cliente: null, clienteEsNuevo: false, nombre_cliente: '',
  tipo_negocio: '', id_distribuidor: '', localidad: '', direccion: '',
  responsable_negocio: '', telefono_contacto: '', nif: '',
  fecha_propuesta: '', vigencia_inicio: '', vigencia_fin: '',
  volumen_objetivo_botellas: '',
  referencias: [nuevaReferencia()],
  aportaciones: [],
  acciones_exposicion: '', observaciones: '',
});

// --- Barra de progreso de volumen (consumido vs. pactado) ------------------
function BarraProgreso({ pct, cumplido }) {
  if (pct === null) {
    return <span className="text-xs text-slate-400 dark:text-slate-500">sin histórico</span>;
  }
  const anchoPct = Math.min(100, Math.max(0, pct));
  const color = cumplido ? 'bg-emerald-500' : pct >= 70 ? 'bg-amber-500' : 'bg-indigo-500';
  return (
    <div className="min-w-[120px]">
      <div className="h-2 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${anchoPct}%` }} />
      </div>
      <span className="text-[11px] text-slate-500 dark:text-slate-400">{formateadorPct(pct)}</span>
    </div>
  );
}

// --- Editor de referencias (marca + condición base de compra) --------------
function EditorReferencias({ referencias, onChange, marcasGlobales }) {
  const actualizarFila = (i, campo, valor) => {
    const copia = referencias.map((r, idx) => (idx === i ? { ...r, [campo]: valor } : r));
    onChange(copia);
  };
  const cambiarMarca = (i, idMarca) => {
    const marca = marcasGlobales.find((m) => m.id === idMarca);
    const copia = referencias.map((r, idx) => (idx === i ? { ...r, id_marca: idMarca, nombre_marca: marca?.nombre_marca || '' } : r));
    onChange(copia);
  };
  const añadirFila = () => onChange([...referencias, nuevaReferencia()]);
  const quitarFila = (i) => onChange(referencias.filter((_, idx) => idx !== i));

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th className={thClasses}>Marca</th>
            <th className={thClasses}>Formato</th>
            <th className={thClasses}>PVP+IVA</th>
            <th className={thClasses}>Condición</th>
            <th className={thClasses}>Valor</th>
            <th className={thClasses}>PVP neto</th>
            <th className={thClasses}></th>
          </tr>
        </thead>
        <tbody>
          {referencias.map((r, i) => (
            <tr key={i}>
              <td className={tdClasses}>
                <select value={r.id_marca} onChange={(e) => cambiarMarca(i, e.target.value)} className={`${inputClasses} w-48`}>
                  <option value="">-- Marca --</option>
                  {marcasGlobales.map((m) => <option key={m.id} value={m.id}>{m.nombre_marca}</option>)}
                </select>
              </td>
              <td className={tdClasses}>
                <input type="text" value={r.formato} onChange={(e) => actualizarFila(i, 'formato', e.target.value)} className={`${inputClasses} w-24`} placeholder="6 x 750" />
              </td>
              <td className={tdClasses}>
                <input type="number" step="0.01" value={r.pvp_iva} onChange={(e) => actualizarFila(i, 'pvp_iva', e.target.value)} className={`${inputClasses} w-24`} />
              </td>
              <td className={tdClasses}>
                <select value={r.tipo_condicion} onChange={(e) => actualizarFila(i, 'tipo_condicion', e.target.value)} className={`${inputClasses} w-40`}>
                  <option value="descuento">Descuento</option>
                  <option value="promocion_cajas">Promoción cajas (X+Y)</option>
                </select>
              </td>
              <td className={tdClasses}>
                {r.tipo_condicion === 'descuento' ? (
                  <input type="number" step="0.1" value={r.descuento_pct} onChange={(e) => actualizarFila(i, 'descuento_pct', e.target.value)} className={`${inputClasses} w-24`} placeholder="% dto" />
                ) : (
                  <input type="text" value={r.promocion_texto} onChange={(e) => actualizarFila(i, 'promocion_texto', e.target.value)} className={`${inputClasses} w-24`} placeholder="ej. 11+1" />
                )}
              </td>
              <td className={tdClasses}>
                <input type="number" step="0.01" value={r.pvp_neto} onChange={(e) => actualizarFila(i, 'pvp_neto', e.target.value)} className={`${inputClasses} w-24`} />
              </td>
              <td className={tdClasses}>
                <button type="button" onClick={() => quitarFila(i)} className="text-red-500 hover:text-red-700"><Trash2 size={15} /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" onClick={añadirFila} className={`${botonSecundario} mt-2`}>
        <span className="inline-flex items-center gap-1.5"><Plus size={14} />Añadir referencia</span>
      </button>
    </div>
  );
}

// --- Editor de aportaciones adicionales a nivel de acuerdo (rapel/aportación
// fija/valor añadido) — texto libre para la descripción porque cada acuerdo
// real que compartió Sergio redacta el escalón/condición de forma distinta;
// `tipo` sirve para mostrar un badge y filtrar/reportar más adelante. -------
function EditorAportaciones({ aportaciones, onChange }) {
  const actualizarFila = (i, campo, valor) => {
    const copia = aportaciones.map((a, idx) => (idx === i ? { ...a, [campo]: valor } : a));
    onChange(copia);
  };
  const añadirFila = () => onChange([...aportaciones, nuevaAportacion()]);
  const quitarFila = (i) => onChange(aportaciones.filter((_, idx) => idx !== i));

  return (
    <div>
      {aportaciones.map((a, i) => (
        <div key={i} className="flex gap-2 items-start mb-2">
          <select value={a.tipo} onChange={(e) => actualizarFila(i, 'tipo', e.target.value)} className={`${inputClasses} w-56 shrink-0`}>
            <option value="rapel_volumen">Rapel por volumen</option>
            <option value="aportacion_fija_botella">Aportación fija €/botella</option>
            <option value="valor_añadido">Valor añadido</option>
          </select>
          <input
            type="text" value={a.descripcion} onChange={(e) => actualizarFila(i, 'descripcion', e.target.value)}
            className={`${inputClasses} flex-1`}
            placeholder="ej. Si se superan 900 botellas, 5% dto adicional en mercancía sin cargo"
          />
          <button type="button" onClick={() => quitarFila(i)} className="text-red-500 hover:text-red-700 mt-1.5 shrink-0"><Trash2 size={15} /></button>
        </div>
      ))}
      <button type="button" onClick={añadirFila} className={botonSecundario}>
        <span className="inline-flex items-center gap-1.5"><Plus size={14} />Añadir aportación</span>
      </button>
    </div>
  );
}

// --- Formulario completo (crear/editar) -------------------------------------
function FormularioAcuerdo({ valores, onChange, distribuidores, clientesSellOut, marcasGlobales }) {
  const set = (campo, valor) => onChange({ ...valores, [campo]: valor });

  const clientesDelDistribuidor = useMemo(
    () => (valores.id_distribuidor ? clientesSellOut.filter((c) => c.id_distribuidor === valores.id_distribuidor) : []),
    [clientesSellOut, valores.id_distribuidor]
  );

  const cambiarCliente = (idCliente) => {
    const cliente = clientesDelDistribuidor.find((c) => c.id === idCliente);
    onChange({ ...valores, id_cliente: idCliente || null, nombre_cliente: cliente?.nombre_cliente || '' });
  };

  return (
    <div className="space-y-5">
      <div>
        <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Datos del acuerdo</h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className={`${etiqueta} block mb-1`}>Nº propuesta</label>
            <input type="text" value={valores.numero} onChange={(e) => set('numero', e.target.value)} className={`${inputClasses} w-full`} />
          </div>
          <div>
            <label className={`${etiqueta} block mb-1`}>Distribuidor / colaborador</label>
            <select value={valores.id_distribuidor} onChange={(e) => onChange({ ...valores, id_distribuidor: e.target.value, id_cliente: null, nombre_cliente: valores.clienteEsNuevo ? valores.nombre_cliente : '' })} className={`${inputClasses} w-full`}>
              <option value="">-- Elegir --</option>
              {distribuidores.map((d) => <option key={d.id} value={d.id}>{d.nombre_distribuidor}</option>)}
            </select>
          </div>
          <div>
            <label className={`${etiqueta} block mb-1`}>Tipo de negocio</label>
            <input type="text" value={valores.tipo_negocio} onChange={(e) => set('tipo_negocio', e.target.value)} className={`${inputClasses} w-full`} placeholder="RTE, CHIRINGUITO..." />
          </div>
        </div>

        <div className="mt-3">
          <label className={`${etiqueta} block mb-1`}>Cliente</label>
          <div className="flex flex-wrap items-center gap-3">
            {!valores.clienteEsNuevo ? (
              <select
                value={valores.id_cliente || ''}
                onChange={(e) => cambiarCliente(e.target.value)}
                className={`${inputClasses} w-full max-w-sm`}
                disabled={!valores.id_distribuidor}
              >
                <option value="">{valores.id_distribuidor ? '-- Elegir cliente --' : 'Elige antes un distribuidor'}</option>
                {clientesDelDistribuidor.map((c) => <option key={c.id} value={c.id}>{c.nombre_cliente}</option>)}
              </select>
            ) : (
              <input type="text" value={valores.nombre_cliente} onChange={(e) => set('nombre_cliente', e.target.value)} className={`${inputClasses} w-full max-w-sm`} placeholder="Nombre del cliente nuevo" />
            )}
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={valores.clienteEsNuevo}
                onChange={(e) => onChange({ ...valores, clienteEsNuevo: e.target.checked, id_cliente: null, nombre_cliente: '' })}
              />
              Cliente nuevo (sin histórico todavía — sin seguimiento automático hasta que aparezca en una importación)
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
          <div>
            <label className={`${etiqueta} block mb-1`}>Localidad</label>
            <input type="text" value={valores.localidad} onChange={(e) => set('localidad', e.target.value)} className={`${inputClasses} w-full`} />
          </div>
          <div>
            <label className={`${etiqueta} block mb-1`}>Dirección</label>
            <input type="text" value={valores.direccion} onChange={(e) => set('direccion', e.target.value)} className={`${inputClasses} w-full`} />
          </div>
          <div>
            <label className={`${etiqueta} block mb-1`}>Responsable del negocio</label>
            <input type="text" value={valores.responsable_negocio} onChange={(e) => set('responsable_negocio', e.target.value)} className={`${inputClasses} w-full`} />
          </div>
          <div>
            <label className={`${etiqueta} block mb-1`}>Teléfono contacto</label>
            <input type="text" value={valores.telefono_contacto} onChange={(e) => set('telefono_contacto', e.target.value)} className={`${inputClasses} w-full`} />
          </div>
          <div>
            <label className={`${etiqueta} block mb-1`}>NIF</label>
            <input type="text" value={valores.nif} onChange={(e) => set('nif', e.target.value)} className={`${inputClasses} w-full`} />
          </div>
          <div>
            <label className={`${etiqueta} block mb-1`}>Fecha propuesta</label>
            <input type="date" value={valores.fecha_propuesta} onChange={(e) => set('fecha_propuesta', e.target.value)} className={`${inputClasses} w-full`} />
          </div>
          <div>
            <label className={`${etiqueta} block mb-1`}>Vigencia desde</label>
            <input type="date" value={valores.vigencia_inicio} onChange={(e) => set('vigencia_inicio', e.target.value)} className={`${inputClasses} w-full`} />
          </div>
          <div>
            <label className={`${etiqueta} block mb-1`}>Vigencia hasta</label>
            <input type="date" value={valores.vigencia_fin} onChange={(e) => set('vigencia_fin', e.target.value)} className={`${inputClasses} w-full`} />
          </div>
        </div>
      </div>

      <div>
        <label className={`${etiqueta} block mb-1`}>Volumen objetivo (botellas/año, compartido entre todas las referencias)</label>
        <input type="number" value={valores.volumen_objetivo_botellas} onChange={(e) => set('volumen_objetivo_botellas', e.target.value)} className={`${inputClasses} w-40`} />
      </div>

      <div>
        <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Compromiso de volumen — referencias</h4>
        <EditorReferencias referencias={valores.referencias} onChange={(referencias) => set('referencias', referencias)} marcasGlobales={marcasGlobales} />
      </div>

      <div>
        <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Aportaciones adicionales (rapel, aportación fija, valor añadido...)</h4>
        <EditorAportaciones aportaciones={valores.aportaciones} onChange={(aportaciones) => set('aportaciones', aportaciones)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className={`${etiqueta} block mb-1`}>Acciones para exposición</label>
          <textarea value={valores.acciones_exposicion} onChange={(e) => set('acciones_exposicion', e.target.value)} className={`${inputClasses} w-full`} rows={3} />
        </div>
        <div>
          <label className={`${etiqueta} block mb-1`}>Observaciones</label>
          <textarea value={valores.observaciones} onChange={(e) => set('observaciones', e.target.value)} className={`${inputClasses} w-full`} rows={3} />
        </div>
      </div>
    </div>
  );
}

function PantallaAcuerdosClientes({ idUsuario, bloqueadoPorTodos = false }) {
  const [distribuidores, setDistribuidores] = useState([]);
  const [marcasGlobales, setMarcasGlobales] = useState([]);
  const [clientesSellOut, setClientesSellOut] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [acuerdos, setAcuerdos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const [idDistribuidorFiltro, setIdDistribuidorFiltro] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todos');

  // modo: null | 'crear' | 'ver' | 'editar'
  const [modo, setModo] = useState(null);
  const [acuerdoActivo, setAcuerdoActivo] = useState(null); // el documento original (para editar/borrar)
  const [formulario, setFormulario] = useState(acuerdoVacio());

  const cargarTodo = useCallback(async () => {
    if (!idUsuario) {
      setDistribuidores([]); setMarcasGlobales([]); setClientesSellOut([]); setMovimientos([]); setAcuerdos([]);
      setCargando(false);
      return;
    }
    setCargando(true);
    try {
      const [dist, marcas, clientes, movs, ac] = await Promise.all([
        getDistribuidoresPorUsuario(idUsuario),
        getMarcasGlobales(),
        getClientesSellOutGeneral(idUsuario),
        getMovimientosSellOutClientesGeneral(idUsuario),
        getAcuerdosClientesPorUsuario(idUsuario),
      ]);
      setDistribuidores(dist.sort((a, b) => (a.nombre_distribuidor || '').localeCompare(b.nombre_distribuidor || '', 'es')));
      setMarcasGlobales(marcas.sort((a, b) => (a.nombre_marca || '').localeCompare(b.nombre_marca || '', 'es')));
      setClientesSellOut(clientes);
      setMovimientos(movs);
      setAcuerdos(ac);
    } catch (error) {
      console.error('Error cargando Acuerdos con Clientes:', error);
      alert('Error al cargar los datos: ' + error.message);
    }
    setCargando(false);
  }, [idUsuario]);

  useEffect(() => { cargarTodo(); }, [cargarTodo]);

  const mapaDistribuidores = useMemo(() => new Map(distribuidores.map((d) => [d.id, d.nombre_distribuidor])), [distribuidores]);

  // Cada acuerdo + su cálculo de consumo/estado, ya listo para pintar.
  const filas = useMemo(() => acuerdos.map((acuerdo) => ({
    acuerdo,
    consumo: calcularConsumoAcuerdo({ acuerdo, movimientos }),
    estado: calcularEstadoVigencia(acuerdo),
    dias: diasHastaFin(acuerdo),
  })), [acuerdos, movimientos]);

  const filasFiltradas = useMemo(() => filas.filter((f) => {
    if (idDistribuidorFiltro && f.acuerdo.id_distribuidor !== idDistribuidorFiltro) return false;
    if (filtroEstado !== 'todos' && f.estado !== filtroEstado) return false;
    return true;
  }), [filas, idDistribuidorFiltro, filtroEstado]);

  const kpiVigentes = filas.filter((f) => f.estado === 'vigente').length;
  const kpiCumplidos = filas.filter((f) => f.consumo.vinculado && f.consumo.cumplido).length;
  const kpiPorVencer = filas.filter((f) => f.estado === 'vigente' && f.dias !== null && f.dias <= 30).length;

  const actor = () => ({ uid: auth.currentUser?.uid, email: auth.currentUser?.email });

  const abrirCrear = () => { setFormulario(acuerdoVacio()); setAcuerdoActivo(null); setModo('crear'); };
  const abrirVer = (acuerdo) => { setAcuerdoActivo(acuerdo); setModo('ver'); };
  const pasarAEditar = () => {
    const a = acuerdoActivo;
    setFormulario({
      numero: a.numero || '', id_cliente: a.id_cliente || null, clienteEsNuevo: !a.id_cliente,
      nombre_cliente: a.nombre_cliente || '', tipo_negocio: a.tipo_negocio || '', id_distribuidor: a.id_distribuidor || '',
      localidad: a.localidad || '', direccion: a.direccion || '', responsable_negocio: a.responsable_negocio || '',
      telefono_contacto: a.telefono_contacto || '', nif: a.nif || '', fecha_propuesta: a.fecha_propuesta || '',
      vigencia_inicio: a.vigencia_inicio || '', vigencia_fin: a.vigencia_fin || '',
      volumen_objetivo_botellas: a.volumen_objetivo_botellas || '',
      referencias: a.referencias && a.referencias.length ? a.referencias : [nuevaReferencia()],
      aportaciones: a.aportaciones || [], acciones_exposicion: a.acciones_exposicion || '', observaciones: a.observaciones || '',
    });
    setModo('editar');
  };
  const cerrarModal = () => { setModo(null); setAcuerdoActivo(null); };

  const handleGuardar = async () => {
    if (!formulario.id_distribuidor) { alert('Elige un distribuidor.'); return; }
    if (!formulario.nombre_cliente) { alert('Falta el nombre del cliente.'); return; }
    setGuardando(true);
    try {
      const datos = { ...formulario };
      delete datos.clienteEsNuevo;
      if (modo === 'crear') {
        await crearAcuerdoCliente(idUsuario, datos, actor());
      } else {
        await editarAcuerdoCliente(idUsuario, acuerdoActivo.id, datos, actor());
      }
      await cargarTodo();
      cerrarModal();
    } catch (error) {
      console.error('Error guardando el acuerdo:', error);
      alert('Error al guardar: ' + error.message);
    }
    setGuardando(false);
  };

  const handleBorrar = async () => {
    if (!acuerdoActivo) return;
    if (!window.confirm(`¿Borrar el acuerdo de "${acuerdoActivo.nombre_cliente}"? No se puede deshacer.`)) return;
    setGuardando(true);
    try {
      await borrarAcuerdoCliente(acuerdoActivo.id);
      await cargarTodo();
      cerrarModal();
    } catch (error) {
      console.error('Error borrando el acuerdo:', error);
      alert('Error al borrar: ' + error.message);
    }
    setGuardando(false);
  };

  if (bloqueadoPorTodos) {
    return (
      <div className={tarjeta}>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          "Acuerdos con Clientes" no está disponible en modo "Todos los usuarios" — elige "Mis datos" o un usuario del selector "Viendo como" (barra lateral) para usar esta pantalla.
        </p>
      </div>
    );
  }

  const columnas = [
    { titulo: 'Cliente', valor: (f) => f.acuerdo.nombre_cliente, render: (f) => <span className="font-medium">{f.acuerdo.nombre_cliente}</span> },
    { titulo: 'Distribuidor', valor: (f) => mapaDistribuidores.get(f.acuerdo.id_distribuidor) || '', render: (f) => mapaDistribuidores.get(f.acuerdo.id_distribuidor) || '—' },
    { titulo: 'Nº', valor: (f) => f.acuerdo.numero || '', render: (f) => f.acuerdo.numero || '—' },
    {
      titulo: 'Vigencia', valor: (f) => f.acuerdo.vigencia_inicio || '',
      render: (f) => (
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${BADGE_ESTADO[f.estado]}`}>{ETIQUETA_ESTADO[f.estado]}</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">{f.acuerdo.vigencia_inicio || '?'} — {f.acuerdo.vigencia_fin || '?'}</span>
        </div>
      ),
    },
    { titulo: 'Objetivo', derecha: true, valor: (f) => f.consumo.objetivo, render: (f) => formateadorNumero.format(f.consumo.objetivo) + ' bot.' },
    { titulo: 'Consumido', derecha: true, valor: (f) => f.consumo.totalConsumido, render: (f) => f.consumo.vinculado ? `${formateadorNumero.format(f.consumo.totalConsumido)} bot.` : <span className="text-slate-400">sin histórico</span> },
    { titulo: 'Progreso', render: (f) => <BarraProgreso pct={f.consumo.pctCumplimiento} cumplido={f.consumo.cumplido} /> },
    { titulo: '', render: (f) => (
      <div className="flex gap-1.5">
        <button type="button" onClick={() => abrirVer(f.acuerdo)} className={botonSecundario}>
          <span className="inline-flex items-center gap-1"><Eye size={13} />Ver</span>
        </button>
        <button
          type="button"
          onClick={() => descargarPdfAcuerdo(f.acuerdo, { nombreDistribuidor: mapaDistribuidores.get(f.acuerdo.id_distribuidor) })}
          className={botonSecundario}
          title="Descargar PDF"
        >
          <Download size={13} />
        </button>
      </div>
    ) },
  ];

  return (
    <div>
      <h1 className={tituloPantalla}>Acuerdos con Clientes</h1>
      <p className={subtitulo}>
        Registro de acuerdos de aportación por cliente final (descuento, promoción de cajas, rapel por volumen, aportación fija por botella, valor añadido) con seguimiento automático del consumo real frente al volumen pactado.
      </p>

      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div className="min-w-[220px]">
          <label className={`${etiqueta} block mb-1`}>Distribuidor</label>
          <select value={idDistribuidorFiltro} onChange={(e) => setIdDistribuidorFiltro(e.target.value)} className={`${inputClasses} w-full`}>
            <option value="">Todos</option>
            {distribuidores.map((d) => <option key={d.id} value={d.id}>{d.nombre_distribuidor}</option>)}
          </select>
        </div>
        <div className="min-w-[180px]">
          <label className={`${etiqueta} block mb-1`}>Estado</label>
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className={`${inputClasses} w-full`}>
            <option value="todos">Todos</option>
            <option value="vigente">Vigente</option>
            <option value="proximo">Próximo</option>
            <option value="finalizado">Finalizado</option>
          </select>
        </div>
        <button type="button" onClick={abrirCrear} className={botonPrimario}>
          <span className="inline-flex items-center gap-1.5"><Plus size={14} />Nuevo acuerdo</span>
        </button>
      </div>

      {cargando ? (
        <div className="text-slate-500 dark:text-slate-400">Cargando datos...</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-3 mb-6">
            <div className={kpiCard}>
              <div className={kpiTitulo}>Acuerdos vigentes</div>
              <div className={kpiValor}>{kpiVigentes}</div>
            </div>
            <div className={kpiCard}>
              <div className={kpiTitulo}>Cumplidos (de los vinculados)</div>
              <div className={kpiValor}>{kpiCumplidos}</div>
            </div>
            <div className={kpiCard}>
              <div className={kpiTitulo}>Vencen en 30 días o menos</div>
              <div className={kpiValor}>{kpiPorVencer}</div>
            </div>
          </div>

          <div className={tarjeta}>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-3 inline-flex items-center gap-1.5"><Handshake size={16} />Acuerdos ({filasFiltradas.length})</h3>
            {filasFiltradas.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">No hay acuerdos que cumplan este filtro.</p>
            ) : (
              <TablaOrdenable filas={filasFiltradas} columnas={columnas} keyExtractor={(f) => f.acuerdo.id} />
            )}
          </div>
        </>
      )}

      {/* Modal crear/editar */}
      {(modo === 'crear' || modo === 'editar') && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-base font-semibold text-slate-900 dark:text-white">{modo === 'crear' ? 'Nuevo acuerdo' : `Editar acuerdo: ${acuerdoActivo?.nombre_cliente}`}</h4>
              <button type="button" onClick={cerrarModal} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X size={18} /></button>
            </div>

            <FormularioAcuerdo valores={formulario} onChange={setFormulario} distribuidores={distribuidores} clientesSellOut={clientesSellOut} marcasGlobales={marcasGlobales} />

            <div className="flex gap-2 mt-5">
              <button type="button" onClick={handleGuardar} disabled={guardando} className={botonExito}>
                {guardando ? 'Guardando...' : 'Guardar acuerdo'}
              </button>
              <button type="button" onClick={cerrarModal} disabled={guardando} className={botonSecundario}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal ver detalle */}
      {modo === 'ver' && acuerdoActivo && (() => {
        const consumo = calcularConsumoAcuerdo({ acuerdo: acuerdoActivo, movimientos });
        const estado = calcularEstadoVigencia(acuerdoActivo);
        return (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-base font-semibold text-slate-900 dark:text-white">{acuerdoActivo.nombre_cliente}</h4>
                <button type="button" onClick={cerrarModal} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X size={18} /></button>
              </div>
              <div className="flex items-center gap-2 mb-4">
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${BADGE_ESTADO[estado]}`}>{ETIQUETA_ESTADO[estado]}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {mapaDistribuidores.get(acuerdoActivo.id_distribuidor) || '—'} · {acuerdoActivo.numero || 'sin número'} · {acuerdoActivo.vigencia_inicio || '?'} — {acuerdoActivo.vigencia_fin || '?'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                <div><span className="text-slate-500 dark:text-slate-400">Tipo de negocio:</span> {acuerdoActivo.tipo_negocio || '—'}</div>
                <div><span className="text-slate-500 dark:text-slate-400">Localidad:</span> {acuerdoActivo.localidad || '—'}</div>
                <div><span className="text-slate-500 dark:text-slate-400">Responsable:</span> {acuerdoActivo.responsable_negocio || '—'}</div>
                <div><span className="text-slate-500 dark:text-slate-400">Teléfono:</span> {acuerdoActivo.telefono_contacto || '—'}</div>
              </div>

              <div className="mb-4">
                <p className={`${etiqueta} mb-1`}>Volumen objetivo: {formateadorNumero.format(consumo.objetivo)} botellas</p>
                <BarraProgreso pct={consumo.pctCumplimiento} cumplido={consumo.cumplido} />
                {!consumo.vinculado && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Cliente sin vincular a Sell-Out Clientes todavía — no hay seguimiento automático hasta que aparezca en una importación.
                  </p>
                )}
                {consumo.vinculado && consumo.porMarca.length > 0 && (
                  <ul className="mt-2 text-xs text-slate-600 dark:text-slate-300 space-y-0.5">
                    {consumo.porMarca.map((m) => <li key={m.id_marca}>{m.nombre_marca}: {formateadorNumero.format(m.uds)} uds.</li>)}
                  </ul>
                )}
              </div>

              <div className="mb-4">
                <p className={`${etiqueta} mb-1`}>Referencias</p>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr><th className={thClasses}>Marca</th><th className={thClasses}>Formato</th><th className={thClasses}>PVP+IVA</th><th className={thClasses}>Condición</th><th className={thClasses}>PVP neto</th></tr></thead>
                    <tbody>
                      {(acuerdoActivo.referencias || []).map((r, i) => (
                        <tr key={i}>
                          <td className={tdClasses}>{r.nombre_marca}</td>
                          <td className={tdClasses}>{r.formato}</td>
                          <td className={tdClasses}>{r.pvp_iva ? `${r.pvp_iva} €` : '—'}</td>
                          <td className={tdClasses}>{r.tipo_condicion === 'descuento' ? `${r.descuento_pct || 0}% dto` : (r.promocion_texto || '—')}</td>
                          <td className={tdClasses}>{r.pvp_neto ? `${r.pvp_neto} €` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {(acuerdoActivo.aportaciones || []).length > 0 && (
                <div className="mb-4">
                  <p className={`${etiqueta} mb-1`}>Aportaciones adicionales</p>
                  <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                    {acuerdoActivo.aportaciones.map((a, i) => (
                      <li key={i}><span className="font-semibold">{ETIQUETA_TIPO_APORTACION[a.tipo] || a.tipo}:</span> {a.descripcion}</li>
                    ))}
                  </ul>
                </div>
              )}

              {acuerdoActivo.acciones_exposicion && (
                <div className="mb-4">
                  <p className={`${etiqueta} mb-1`}>Acciones para exposición</p>
                  <p className="text-sm text-slate-700 dark:text-slate-300">{acuerdoActivo.acciones_exposicion}</p>
                </div>
              )}
              {acuerdoActivo.observaciones && (
                <div className="mb-4">
                  <p className={`${etiqueta} mb-1`}>Observaciones</p>
                  <p className="text-sm text-slate-700 dark:text-slate-300">{acuerdoActivo.observaciones}</p>
                </div>
              )}

              <div className="flex gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => descargarPdfAcuerdo(acuerdoActivo, { nombreDistribuidor: mapaDistribuidores.get(acuerdoActivo.id_distribuidor) })}
                  className={botonPrimario}
                >
                  <span className="inline-flex items-center gap-1.5"><Download size={14} />Descargar PDF</span>
                </button>
                <button type="button" onClick={pasarAEditar} className={botonSecundario}>
                  <span className="inline-flex items-center gap-1.5"><Pencil size={14} />Editar</span>
                </button>
                <button type="button" onClick={handleBorrar} disabled={guardando} className={botonPeligro}>Borrar</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default PantallaAcuerdosClientes;
