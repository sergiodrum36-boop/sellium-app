/*
 * VentasYAP.js (Versión 6.2 - Rediseño visual Fase 3)
 * Cambios sobre la 6.1: solo la maquetación pasa a Tailwind CSS (con
 * soporte de modo oscuro). La lógica de formulario y guardado no cambia.
 */

import React, { useState, useEffect } from 'react';
import { saveMovimientosSellOut, saveNuevaMarca } from './firebaseApi';
import { inputClasses, botonInfo, botonExito, botonSecundario, etiqueta, tarjeta } from './uiClasses';
import SelectorMesAno from './SelectorMesAno';

const formateadorMoneda = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

const estadoInicialFormulario = {
  id_marca: '',
  precio_aplicado: 0,
  ventas_uds: 0,
  muestras_uds: 0,
  regaladas_uds: 0,
  unidades_acuerdo: 0,
  precio_acuerdo_unidad: 0,
  aportacion_euros: 0,
};

const estadoInicialMarca = {
  nombre_marca: '',
  Coste_Unidad: 0,
  AP_Generado_Por_Unidad: 0
};

function VentasYAP({ idUsuario, idDistribuidor, marcas, onMarcaAdded, onDataSaved }) {

  const [formData, setFormData] = useState(estadoInicialFormulario);
  const [mesAno, setMesAno] = useState('');
  const [cargando, setCargando] = useState(false);
  const [marcaSeleccionada, setMarcaSeleccionada] = useState(null);
  const [modalMarcaVisible, setModalMarcaVisible] = useState(false);
  const [nuevaMarcaData, setNuevaMarcaData] = useState(estadoInicialMarca);
  const [cargandoMarca, setCargandoMarca] = useState(false);

  useEffect(() => {
    setMesAno('');
    setFormData(estadoInicialFormulario);
  }, [idDistribuidor]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === 'id_marca') {
      const marca = marcas.find(m => m.id === value);
      setMarcaSeleccionada(marca || null);
      setFormData(prev => ({
        ...prev,
        [name]: value,
        precio_aplicado: marca ? (marca.Coste_Unidad || 0) : 0
      }));
    } else {
      const valorActualizado = parseFloat(value) || 0;
      setFormData(prev => ({ ...prev, [name]: valorActualizado }));
    }
  };

  const precioFinal = parseFloat(formData.precio_aplicado) || 0;
  const ventasEurosCalculadas = precioFinal * (parseFloat(formData.ventas_uds) || 0);
  const valorRegaladasCalculado = precioFinal * (parseFloat(formData.regaladas_uds) || 0);
  const valorMuestrasCalculado = precioFinal * (parseFloat(formData.muestras_uds) || 0);
  const precioAcuerdoFinal = parseFloat(formData.precio_acuerdo_unidad) || 0;
  const valorAcuerdoCalculado = precioAcuerdoFinal * (parseFloat(formData.unidades_acuerdo) || 0);

  const handleGuardarMovimiento = async () => {
    if (!mesAno) { alert("Por favor, seleccione un Mes/Año."); return; }
    if (!idDistribuidor || !formData.id_marca) { alert("Por favor, seleccione Distribuidor y Marca."); return; }

    // --- ¡CORRECCIÓN AQUÍ! ---
    // Antes comprobábamos "> 0". Ahora comprobamos "!= 0".
    // Esto permite números negativos (devoluciones).
    const tieneDatos = formData.ventas_uds !== 0 ||
                       formData.muestras_uds !== 0 ||
                       formData.regaladas_uds !== 0 ||
                       formData.unidades_acuerdo !== 0 ||
                       formData.aportacion_euros !== 0;

    if (!tieneDatos) {
      alert("No hay datos que guardar (todos son 0).");
      return;
    }

    if (!window.confirm(`¿Está seguro de que desea guardar este movimiento?`)) {
      return;
    }

    setCargando(true);
    try {
      const movimiento = {
        id_marca: marcaSeleccionada.id,
        nombre_marca: marcaSeleccionada.nombre_marca,
        coste_unidad: precioFinal,
        ap_por_unidad: marcaSeleccionada.AP_Generado_Por_Unidad,
        ventas_uds: parseFloat(formData.ventas_uds) || 0,
        muestras_uds: parseFloat(formData.muestras_uds) || 0,
        regaladas_uds: parseFloat(formData.regaladas_uds) || 0,
        aportacion_euros: parseFloat(formData.aportacion_euros) || 0,
        ventas_euros: ventasEurosCalculadas,
        valor_regaladas_euros: valorRegaladasCalculado,
        valor_muestras_euros: valorMuestrasCalculado,
        unidades_acuerdo: parseFloat(formData.unidades_acuerdo) || 0,
        precio_acuerdo_unidad: precioAcuerdoFinal,
        valor_acuerdo_euros: valorAcuerdoCalculado,
        origen: 'manual'
      };

      await saveMovimientosSellOut(idUsuario, idDistribuidor, mesAno, [movimiento]);
      alert(`¡Éxito! Movimiento guardado.`);
      setFormData(estadoInicialFormulario);
      setMarcaSeleccionada(null);
      onDataSaved();

    } catch (error) {
      console.error("Error al guardar:", error);
      alert("Error: " + error.message);
    }
    setCargando(false);
  };

  const handleGuardarNuevaMarca = async () => {
    if (!nuevaMarcaData.nombre_marca.trim()) { alert("El nombre no puede estar vacío."); return; }
    setCargandoMarca(true);
    try {
      const dataParaGuardar = {
        ...nuevaMarcaData,
        nombre_marca: nuevaMarcaData.nombre_marca.trim().toUpperCase(),
        Coste_Unidad: parseFloat(nuevaMarcaData.Coste_Unidad) || 0,
        AP_Generado_Por_Unidad: parseFloat(nuevaMarcaData.AP_Generado_Por_Unidad) || 0
      };
      await saveNuevaMarca(dataParaGuardar);
      if (onMarcaAdded) onMarcaAdded();
      alert(`¡Marca guardada!`);
      setModalMarcaVisible(false);
      setNuevaMarcaData(estadoInicialMarca);
    } catch (error) {
      alert("Error: " + error.message);
    }
    setCargandoMarca(false);
  };

  const handleModalMarcaChange = (e) => {
    const { name, value } = e.target;
    setNuevaMarcaData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="max-w-xl">

      <div className="mb-5 flex items-center gap-2">
        <label className={etiqueta}>Mes/Año de los Movimientos:</label>
        <SelectorMesAno value={mesAno} onChange={setMesAno} className="max-w-xs" />
      </div>

      <div className={tarjeta}>

        <FormRow label="Marca:">
          <select name="id_marca" value={formData.id_marca} onChange={handleChange} className={`${inputClasses} flex-1`}>
            <option value="">-- Seleccione una Marca --</option>
            {marcas.map(marca => (
              <option key={marca.id} value={marca.id}>{marca.nombre_marca}</option>
            ))}
          </select>
          <button onClick={() => setModalMarcaVisible(true)} className={botonInfo}>+ Añadir</button>
        </FormRow>

        {modalMarcaVisible && (
          <div className="border border-sky-200 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/10 rounded-lg p-4 my-4">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Añadir Nueva Marca Global</h4>
            <FormRow label="Nombre Marca:">
              <input name="nombre_marca" type="text" className={`${inputClasses} flex-1`} value={nuevaMarcaData.nombre_marca} onChange={handleModalMarcaChange} />
            </FormRow>
            <FormRow label="Precio Oficial:">
              <input name="Coste_Unidad" type="number" className={`${inputClasses} flex-1`} value={nuevaMarcaData.Coste_Unidad === 0 ? '' : nuevaMarcaData.Coste_Unidad} onChange={handleModalMarcaChange} />
            </FormRow>
            <FormRow label="A&P Generado:">
              <input name="AP_Generado_Por_Unidad" type="number" className={`${inputClasses} flex-1`} value={nuevaMarcaData.AP_Generado_Por_Unidad === 0 ? '' : nuevaMarcaData.AP_Generado_Por_Unidad} onChange={handleModalMarcaChange} />
            </FormRow>
            <div className="flex gap-2 mt-3">
              <button onClick={handleGuardarNuevaMarca} disabled={cargandoMarca} className={botonExito}>Guardar</button>
              <button onClick={() => setModalMarcaVisible(false)} disabled={cargandoMarca} className={botonSecundario}>Cancelar</button>
            </div>
          </div>
        )}

        {formData.id_marca && (
          <>
            <FormRow label="VENTAS (uds):">
              <input
                name="ventas_uds"
                type="number"
                className={`${inputClasses} flex-1`}
                value={formData.ventas_uds === 0 ? '' : formData.ventas_uds}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Precio Unitario (€):" labelClassName="!text-indigo-600 dark:!text-indigo-400">
              <input
                name="precio_aplicado"
                type="number"
                step="0.01"
                className={`${inputClasses} flex-1 !border-indigo-300 dark:!border-indigo-500/50 !bg-indigo-50 dark:!bg-indigo-500/10`}
                value={formData.precio_aplicado === 0 ? '' : formData.precio_aplicado}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="VENTAS (€):">
              <input
                type="text"
                className={`${inputClasses} flex-1 !bg-slate-100 dark:!bg-slate-800 !font-semibold`}
                value={ventasEurosCalculadas === 0 ? '' : formateadorMoneda.format(ventasEurosCalculadas)}
                readOnly
                disabled
              />
            </FormRow>
            <hr className="border-slate-200 dark:border-slate-800 my-4" />
            <FormRow label="A&P MUESTRAS (uds):">
              <input
                name="muestras_uds"
                type="number"
                className={`${inputClasses} flex-1`}
                value={formData.muestras_uds === 0 ? '' : formData.muestras_uds}
                onChange={handleChange}
              />
            </FormRow>
            <FormRow label="A&P REGALADAS (uds):">
              <input
                name="regaladas_uds"
                type="number"
                className={`${inputClasses} flex-1`}
                value={formData.regaladas_uds === 0 ? '' : formData.regaladas_uds}
                onChange={handleChange}
              />
            </FormRow>
            <hr className="border-slate-200 dark:border-slate-800 my-4" />
            <FormRow label="BOT. ACUERDO (uds):" labelClassName="!text-amber-600 dark:!text-amber-400">
              <input
                name="unidades_acuerdo"
                type="number"
                className={`${inputClasses} flex-1 !border-amber-300 dark:!border-amber-500/50 !bg-amber-50 dark:!bg-amber-500/10`}
                value={formData.unidades_acuerdo === 0 ? '' : formData.unidades_acuerdo}
                onChange={handleChange}
              />
            </FormRow>
            <FormRow label="PRECIO ACUERDO (€/Botella):" labelClassName="!text-amber-600 dark:!text-amber-400">
              <input
                name="precio_acuerdo_unidad"
                type="number"
                step="0.01"
                className={`${inputClasses} flex-1 !border-amber-300 dark:!border-amber-500/50 !bg-amber-50 dark:!bg-amber-500/10`}
                value={formData.precio_acuerdo_unidad === 0 ? '' : formData.precio_acuerdo_unidad}
                onChange={handleChange}
              />
            </FormRow>
            <FormRow label="VALOR ACUERDO (€):">
              <input
                type="text"
                className={`${inputClasses} flex-1 !bg-slate-100 dark:!bg-slate-800 !font-semibold`}
                value={valorAcuerdoCalculado === 0 ? '' : formateadorMoneda.format(valorAcuerdoCalculado)}
                readOnly
                disabled
              />
            </FormRow>
            <hr className="border-slate-200 dark:border-slate-800 my-4" />
            <FormRow label="APORTACIÓN A&P MANUAL (€):">
              <input
                name="aportacion_euros"
                type="number"
                className={`${inputClasses} flex-1`}
                value={formData.aportacion_euros === 0 ? '' : formData.aportacion_euros}
                onChange={handleChange}
              />
            </FormRow>
            <p className="text-xs text-slate-500 dark:text-slate-400 -mt-1 ml-[13.5rem]">
              Úsalo solo para un gasto de A&P adicional que no sea ni Muestras, ni Regaladas, ni Acuerdo
              (p.ej. un abono o descuento puntual pactado con el distribuidor). Para el resto, no hace falta tocarlo — se queda en 0€.
            </p>
          </>
        )}
      </div>

      <div className="mt-5">
        <button onClick={handleGuardarMovimiento} disabled={cargando || !formData.id_marca} className={`${botonExito} !px-6 !py-2.5 text-base`}>
          {cargando ? 'Guardando...' : 'GUARDAR MOVIMIENTO'}
        </button>
      </div>
    </div>
  );
}

// Fila de formulario: etiqueta de ancho fijo + control(es) a la derecha.
const FormRow = ({ label, labelClassName = '', children }) => (
  <div className="flex items-center gap-3 mb-3">
    <label className={`w-48 shrink-0 text-sm font-semibold text-slate-700 dark:text-slate-300 ${labelClassName}`}>{label}</label>
    {children}
  </div>
);

export default VentasYAP;
