/*
 * SplashScreen.js (NUEVO)
 * Pantalla de carga profesional que muestra el logo.
 */

import React from 'react';
// Importamos el logo (asumiendo que está en 'src/assets/logo.png')
import logo from './assets/logo.png'; 
// Importaremos un CSS propio para centrarlo
import './SplashScreen.css'; 

function SplashScreen() {
  return (
    <div className="splash-container">
      <img src={logo} alt="Logo de la empresa" className="splash-logo" />
      <div className="splash-loader"></div>
      <p>Cargando aplicación...</p>
    </div>
  );
}

export default SplashScreen;