/*
 * ErrorBoundary.js
 * A petición de Sergio (repaso/auditoría de la app): hasta ahora, un error
 * de React en cualquier pantalla (por ejemplo el "Rendered more hooks..."
 * que vimos al implementar la memoria de pestañas) tumbaba TODA la app —
 * React desmonta el árbol entero al no encontrar ningún componente que
 * capture el error, dejando una pantalla en blanco (o, en desarrollo, el
 * overlay rojo de errores). Este componente es un "Error Boundary": la
 * única forma que tiene React de capturar errores de render/lifecycle en
 * los componentes hijos (por eso tiene que ser una clase — los Hooks NO
 * pueden hacer de Error Boundary, no existe un "useErrorBoundary").
 *
 * Uso: envolver cualquier bloque de UI que quieras aislar:
 *
 *   <ErrorBoundary label="Gestión por Distribuidor">
 *     <PantallaDistribuidor ... />
 *   </ErrorBoundary>
 *
 * Si algo dentro de ese bloque falla, SOLO ese bloque se sustituye por el
 * mensaje de error de abajo — el resto de la app (Sidebar, otras pestañas
 * ya cargadas, etc.) sigue funcionando con normalidad. Ver App.js: hay un
 * ErrorBoundary por cada una de las 5 secciones de nivel superior (así un
 * fallo en una pestaña que se quedó cargada en segundo plano, gracias a
 * usePestañasVisitadas.js, no puede tumbar la pestaña que sí estás mirando)
 * y uno global en index.js como red de seguridad última.
 *
 * "Reintentar" simplemente vuelve a intentar renderizar los mismos hijos
 * (por si el fallo fue puntual, p.ej. un dato temporalmente inconsistente);
 * si el problema es persistente, "Recargar página" es la salida segura.
 */

import React from 'react';
import { tarjeta, botonPrimario, botonSecundario } from './uiClasses';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, infoReact) {
    // Log detallado en consola para poder diagnosticar luego (incluye en
    // qué componente exacto de este bloque se originó el fallo).
    console.error(
      `ErrorBoundary${this.props.label ? ` — ${this.props.label}` : ''}:`,
      error,
      infoReact && infoReact.componentStack
    );
  }

  handleReintentar = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className={`${tarjeta} text-center border-red-200 dark:border-red-900/50`}>
          <h3 className="text-base font-medium text-red-600 dark:text-red-400 mb-1">
            {this.props.label ? `Algo ha fallado en "${this.props.label}"` : 'Algo ha fallado'}
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
            Puedes intentarlo de nuevo o cambiar a otra pestaña — el resto de la
            app sigue funcionando con normalidad. Si el error persiste, recarga
            la página.
          </p>
          <div className="flex gap-2 justify-center">
            <button onClick={this.handleReintentar} className={botonPrimario}>
              Reintentar
            </button>
            <button onClick={() => window.location.reload()} className={botonSecundario}>
              Recargar página
            </button>
          </div>
          {process.env.NODE_ENV !== 'production' && (
            <pre className="mt-4 text-left text-xs text-red-600 dark:text-red-400 overflow-auto max-h-48 bg-red-50 dark:bg-red-950/30 p-3 rounded-md">
              {String((this.state.error && this.state.error.stack) || this.state.error)}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
