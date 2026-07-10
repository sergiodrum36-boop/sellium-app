import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import ErrorBoundary from './ErrorBoundary';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    {/* Red de seguridad última (ver ErrorBoundary.js): App.js ya envuelve
        cada una de sus 5 secciones principales en su propio ErrorBoundary,
        pero un fallo FUERA de esas 5 (p.ej. en el propio Layout/Sidebar, o
        en LoginScreen antes de autenticarse) no estaría cubierto por
        ninguno de ellos. Este boundary global es el último recurso: sin él,
        cualquier error no capturado en otro sitio dejaría la app en blanco. */}
    <ErrorBoundary label="Aplicación">
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
