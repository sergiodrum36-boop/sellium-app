/*
 * PantallaAyuda.js (NUEVO)
 * Muestra un modal (ventana emergente) con las
 * instrucciones de uso de la aplicación.
 */

import React from 'react';

// Recibe la función 'onClose' desde App.js
function PantallaAyuda({ onClose }) {
  return (
    // Fondo oscuro semitransparente
    <div style={styles.modalOverlay}>
      {/* Contenedor blanco del modal */}
      <div style={styles.modalContent}>
        
        {/* Encabezado del Modal */}
        <div style={styles.modalHeader}>
          <h2>📖 Instrucciones de Uso</h2>
          <button onClick={onClose} style={styles.closeButton}>X</button>
        </div>

        {/* Contenido (con scroll si es muy largo) */}
        <div style={styles.modalBody}>
          <p>Bienvenido. Esta aplicación le permite gestionar las compras (Sell-In), ventas (Sell-Out) y el presupuesto de A&P de sus distribuidores.</p>

          <h4>I. Flujo Principal (Gestión vs. Reportes)</h4>
          <p>La aplicación tiene dos modos principales, seleccionables en el encabezado:</p>
          <ol>
            <li><strong>Gestión por Distribuidor:</strong> Es la pantalla principal para el trabajo diario: introducir datos, consultar el stock y el A&P de un cliente específico.</li>
            <li><strong>Reportes Generales (Power BI):</strong> Es una pantalla dedicada a exportar datos brutos (totales por rango de fechas) para su análisis en Power BI.</li>
          </ol>

          <h4>II. Gestión por Distribuidor (Pantalla Principal)</h4>
          <p>Esta es la pantalla donde pasará la mayor parte del tiempo.</p>
          <ul>
            <li><strong>Selector Principal:</strong> Use el desplegable "Gestionando al Distribuidor" para elegir el cliente sobre el que quiere trabajar. Todas las pestañas de abajo (`Stock`, `Control A&P`, etc.) se actualizarán automáticamente para mostrar solo los datos de ese distribuidor.</li>
            <li><strong>Añadir un Distribuidor Nuevo:</strong> Si un distribuidor no está en la lista, haga clic en el botón <strong>`[+ Añadir Distribuidor]`</strong>, escriba el nombre y guárdelo. Aparecerá en el selector.</li>
          </ul>

          <h4>III. Pestañas de Captura (Ventas y Compras)</h4>
          <p>Estas son las pestañas para <strong>introducir datos nuevos</strong>:</p>
          <ul>
            <li><strong>Pestaña "Ventas y A&P" (Sell-Out):</strong>
                <ol>
                    <li>Seleccione el <strong>Mes/Año</strong> del movimiento.</li>
                    <li>Seleccione la <strong>Marca</strong> en el desplegable.</li>
                    <li>Rellene los campos: `VENTAS (uds)`, `A&P MUESTRAS (uds)`, `A&P REGALADAS (uds)` o `APORTACIÓN A&P (€)`.</li>
                    <li>El campo `VENTAS (€)` se calcula automáticamente.</li>
                    <li>Haga clic en <strong>"GUARDAR MOVIMIENTO"</strong>.</li>
                </ol>
            </li>
            <li style={{marginTop: '10px'}}><strong>Pestaña "Compras" (Sell-In):</strong>
                <ol>
                    <li>Seleccione el <strong>Mes/Año</strong> de la compra.</li>
                    <li>Seleccione la <strong>Marca</strong>.</li>
                    <li>Rellene `UNIDADES COMPRADAS`.</li>
                    <li>El campo `FACTURACIÓN (€)` se calcula automáticamente.</li>
                    <li>Haga clic en <strong>"GUARDAR COMPRA"</strong>.</li>
                </ol>
            </li>
            <li style={{marginTop: '10px'}}><strong>Añadir una Marca Nueva:</strong> Si una marca no existe, haga clic en el botón <strong>`[+ Añadir]`</strong> al lado del desplegable de marcas. Rellene el Nombre, el Precio (`Coste_Unidad`) y el A&P (`AP_Generado_Por_Unidad`).</li>
          </ul>

          <h4>IV. Pestañas de Análisis (Refresco Automático)</h4>
          <p>Estas pestañas <strong>se actualizan solas</strong> cada vez que usted guarda o borra un movimiento.</p>
          <ul>
            <li><strong>Pestaña "Stock":</strong> Muestra el inventario teórico. `Stock Final = (Stock Inicial) + (Compras Año) - (Salidas Año)`. Las "Salidas" incluyen Ventas, Regaladas y Muestras.</li>
            <li><strong>Pestaña "Control A&P":</strong> Muestra el balance financiero del A&P. `A&P Generado` (de Compras) vs. `A&P Gastado` (de Salidas).</li>
          </ul>

          <h4>V. Pestañas de Histórico (Sell-In y Sell-Out)</h4>
          <p>Estas pestañas muestran el "libro de contabilidad" de todos los movimientos.</p>
          <ul>
            <li><strong>Filtros:</strong> Puede filtrar por rango de fechas y por marca.</li>
            <li><strong>Exportar:</strong> El botón verde "Exportar a Excel" exporta *solo* los datos que está viendo (ya filtrados).</li>
            <li><strong>Borrar:</strong> Puede borrar un registro erróneo usando el botón rojo "Borrar".</li>
          </ul>

          <h4>VI. Reportes Generales (Power BI)</h4>
          <p>Esta pantalla es <strong>solo</strong> para exportar datos brutos para análisis externo.</p>
          <ol>
            <li>Seleccione un rango de fechas ("Desde" y "Hasta").</li>
            <li>Haga clic en <strong>"Exportar Compras (Sell-In)"</strong>.</li>
            <li>Haga clic en <strong>"Exportar Ventas y Gastos (Sell-Out)"</strong>.</li>
          </ol>
          
          <h4>VII. Mantenimiento</h4>
          <p><strong>¡ADVERTENCIA!</strong> Use esta pestaña solo para borrar datos de prueba. Borrará <strong>TODO</strong> su historial de `Ventas` y `Compras`. **NO** borrará sus `Distribuidores` ni las `Marcas`.</p>
        </div>

      </div>
    </div>
  );
}

// Estilos para el Modal
const styles = {
  modalOverlay: {
    position: 'fixed', // Se superpone a todo
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.7)', // Fondo oscuro
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000, // Por encima de todo lo demás
  },
  modalContent: {
    backgroundColor: '#ffffff',
    color: '#333', // Texto oscuro
    padding: '20px',
    borderRadius: '8px',
    width: '80%',
    maxWidth: '800px',
    height: '80vh', // 80% de la altura de la pantalla
    boxShadow: '0 5px 15px rgba(0,0,0,0.3)',
    display: 'flex',
    flexDirection: 'column',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid #eee',
    paddingBottom: '10px',
  },
  closeButton: {
    background: 'transparent',
    border: 'none',
    fontSize: '24px',
    fontWeight: 'bold',
    cursor: 'pointer',
    color: '#888',
  },
  modalBody: {
    flex: 1, // Ocupa el espacio restante
    overflowY: 'auto', // ¡Añade scroll si el texto es muy largo!
    paddingTop: '10px',
  }
};

export default PantallaAyuda;