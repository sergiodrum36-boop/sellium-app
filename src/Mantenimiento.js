/*
 * Mantenimiento.js (Versión 1.1 - Rediseño visual Fase 3)
 * Cambios sobre la versión anterior: solo la maquetación pasa a Tailwind CSS
 * (con soporte de modo oscuro). La lógica de borrado no cambia.
 *
 * CAMBIO (papelera, a petición de Sergio): el reseteo ya NO borra los
 * registros de Firestore de verdad — los mueve a la papelera (recuperables
 * desde "Papelera", uno a uno, o desde el registro de "Auditoría" para ver
 * qué se reseteó y cuándo). Ver firebaseApi.js/resetUserHistory.
 */

import React, { useState } from 'react';
import { resetUserHistory } from './firebaseApi';
import { auth } from './firebaseConfig';
import { inputClasses, etiqueta } from './uiClasses';

function Mantenimiento({ idUsuario, onResetApp }) {

    const [cargando, setCargando] = useState(false);
    const [confirmacion, setConfirmacion] = useState(''); // Estado para la palabra de seguridad

    const handleReset = async () => {

        if (confirmacion.toUpperCase() !== "BORRAR") {
            alert("Por favor, escriba la palabra BORRAR en el campo de texto para confirmar.");
            return;
        }

        if (!window.confirm("Está a punto de mover a la papelera TODO el historial de compras, ventas y A&P (Sell-In y Sell-Out) de SU cuenta. Sus distribuidores y marcas NO se tocan. Podrá recuperar registros concretos desde \"Papelera\" si fue un error. ¿Continuar?")) {
            return;
        }

        setCargando(true);
        try {
            // 1. Llamar a la API para mover los datos a la papelera
            const resultados = await resetUserHistory(idUsuario, {
                uid: auth.currentUser?.uid,
                email: auth.currentUser?.email
            });

            // 2. Avisar a la aplicación principal para que recargue la vista
            onResetApp();

            // 3. Mostrar resumen de lo movido a la papelera
            alert(`✅ Reseteo completado con éxito. Se movieron a la papelera:
- ${resultados.historicoSellIn || 0} Registros de Compras (Sell-In).
- ${resultados.historicoSellOut || 0} Registros de Ventas/A&P (Sell-Out).

Sus distribuidores y marcas se han conservado. Puede recuperar registros concretos desde "Papelera" (Herramientas).`);

        } catch (error) {
            console.error("Error al resetear la historia:", error);
            alert("ERROR CRÍTICO: No se pudo conectar o borrar los datos. Revise su conexión.");
        }
        setCargando(false);
    };

    return (
        <div>
            <h2 className="text-lg font-medium text-slate-900 dark:text-white mb-4">Mantenimiento y Limpieza de Datos</h2>
            <div className="border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10 rounded-xl p-5 max-w-2xl">
                <h4 className="text-red-700 dark:text-red-400 font-semibold mb-3">⚠️ Borrar TODO el Historial de su Cuenta</h4>

                <p className="text-sm text-slate-700 dark:text-slate-300 mb-2">
                    Esta acción mueve a la <strong>papelera</strong> todos los registros transaccionales (Histórico Sell-In e Histórico Sell-Out) asociados a <strong>su ID de usuario</strong> — no los borra de forma permanente, pero desaparecen de todas las pantallas hasta que los recupere desde "Papelera" (Herramientas). Sus distribuidores y marcas maestras NO se tocan.
                </p>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                    Utilice esta opción para limpiar datos de prueba y poner su aplicación a cero.
                </p>

                <hr className="border-red-200 dark:border-red-500/30 my-5" />

                <div className="mb-4 flex items-center gap-2">
                    <label className={etiqueta}>
                        Escriba BORRAR para confirmar:
                    </label>
                    <input
                        type="text"
                        value={confirmacion}
                        onChange={(e) => setConfirmacion(e.target.value)}
                        className={`${inputClasses} !border-red-400 dark:!border-red-500/60`}
                        disabled={cargando}
                    />
                </div>

                <button
                    onClick={handleReset}
                    disabled={cargando || confirmacion.toUpperCase() !== "BORRAR"}
                    className="!bg-red-600 hover:!bg-red-700 disabled:!bg-red-300 dark:disabled:!bg-red-900 !text-white !border-0 !font-semibold px-5 py-2.5 rounded-md text-sm"
                >
                    {cargando ? 'Borrando...' : 'BORRAR TODO EL CONTENIDO'}
                </button>
            </div>
        </div>
    );
}

export default Mantenimiento;
