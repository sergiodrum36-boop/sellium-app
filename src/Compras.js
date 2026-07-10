/*
 * Compras.js (Versión 7.1 - Rediseño visual Fase 3)
 * Cambios sobre la 7.0: solo la maquetación pasa a Tailwind CSS (con
 * soporte de modo oscuro), igual que su pantalla gemela VentasYAP.js.
 * La lógica de guardado no cambia.
 */

import React, { useState, useEffect } from 'react';
import { saveMovimientosSellIn, saveNuevaMarca } from './firebaseApi';
import { inputClasses, botonInfo, botonExito, botonSecundario, etiqueta, tarjeta } from './uiClasses';
import SelectorMesAno from './SelectorMesAno';

const formateadorMoneda = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

const estadoInicialFormulario = {
  id_marca: '',
  precio_aplicado: 0, // <-- ¡NUEVO CAMPO!
  unidades_compradas: 0,
};

const estadoInicialMarca = {
  nombre_marca: '',
  Coste_Unidad: 0,
  AP_Generado_Por_Unidad: 0
};

function Compras({ idUsuario, idDistribuidor, marcas, onMarcaAdded, onDataSaved }) {

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

      // Al cambiar marca, cargamos su precio oficial en el campo editable
      setFormData(prev => ({
        ...prev,
        [name]: value,
        precio_aplicado: marca ? (marca.Coste_Unidad || 0) : 0 // Cargamos el precio oficial
      }));
    } else {
      // Para cualquier otro campo (incluido precio_aplicado), actualizamos el valor
      const valorActualizado = parseFloat(value) || 0;
      setFormData(prev => ({ ...prev, [name]: valorActualizado }));
    }
  };

  // Cálculos en tiempo real: usa el precio que está en el formulario
  const precioFinal = parseFloat(formData.precio_aplicado) || 0;
  const facturacionEurosCalculada = precioFinal * (parseFloat(formData.unidades_compradas) || 0);

  const handleGuardarCompra = async () => {
    if (!mesAno) { alert("Por favor, seleccione un Mes/Año."); return; }
    if (!idDistribuidor || !formData.id_marca) { alert("Por favor, seleccione Distribuidor y Marca."); return; }
    if (formData.unidades_compradas === 0) { alert("Las unidades compradas no pueden ser 0."); return; }

    if (!window.confirm(`¿Está seguro de que desea guardar esta compra?`)) {
      return;
    }

    setCargando(true);
    try {
      const movimiento = {
        id_marca: marcaSeleccionada.id,
        nombre_marca: marcaSeleccionada.nombre_marca,
        coste_unidad: precioFinal, // <-- ¡GUARDAMOS EL PRECIO EDITADO/APLICADO!
        ap_por_unidad: marcaSeleccionada.AP_Generado_Por_Unidad,
        unidades_compradas: parseFloat(formData.unidades_compradas) || 0,
        facturacion_euros: facturacionEurosCalculada
      };

      await saveMovimientosSellIn(idUsuario, idDistribuidor, mesAno, [movimiento]);
      alert(`¡Éxito! Compra para ${marcaSeleccionada.nombre_marca} guardada.`);
      setFormData(estadoInicialFormulario);
      setMarcaSeleccionada(null);

      onDataSaved();

    } catch (error) {
      console.error("Error al guardar movimiento de Sell-In:", error);
      alert("Error al guardar: " + error.message);
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
        <label className={etiqueta}>Mes/Año de la Compra:</label>
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
            <FormRow label="Precio (Coste_Unidad):">
              <input name="Coste_Unidad" type="number" className={`${inputClasses} flex-1`} value={nuevaMarcaData.Coste_Unidad === 0 ? '' : nuevaMarcaData.Coste_Unidad} onChange={handleModalMarcaChange} />
            </FormRow>
            <FormRow label="A&P (AP_Generado...):">
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
            <FormRow label="UNIDADES COMPRADAS:">
              <input
                name="unidades_compradas"
                type="number"
                className={`${inputClasses} flex-1`}
                value={formData.unidades_compradas === 0 ? '' : formData.unidades_compradas}
                onChange={handleChange}
              />
            </FormRow>

            {/* --- CAMPO PRECIO EDITABLE --- */}
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
            {/* --- FIN CAMPO PRECIO EDITABLE --- */}

            <FormRow label="FACTURACIÓN (€):">
              <input
                type="text"
                className={`${inputClasses} flex-1 !bg-slate-100 dark:!bg-slate-900 !font-semibold`}
                value={facturacionEurosCalculada === 0 ? '' : formateadorMoneda.format(facturacionEurosCalculada)}
                readOnly
                disabled
              />
            </FormRow>
          </>
        )}
      </div>

      <div className="mt-5">
        <button onClick={handleGuardarCompra} disabled={cargando || !formData.id_marca} className={`${botonExito} !px-6 !py-2.5 text-base`}>
          {cargando ? 'Guardando...' : 'GUARDAR COMPRA'}
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

export default Compras;
