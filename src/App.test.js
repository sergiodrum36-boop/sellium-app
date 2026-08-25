/*
 * App.test.js
 * CORREGIDO (2026-08-25): este archivo era el test de ejemplo que deja
 * create-react-app al arrancar un proyecto ("renders learn react link"),
 * nunca actualizado desde entonces — Sellium nunca ha tenido ese texto, así
 * que este test llevaba roto desde el principio. No se notaba porque
 * `npm test` no formaba parte del deploy hasta el 25/07/2026 (ver
 * deploy.yml, paso "Ejecutar tests (Jest)"), y desde entonces este mismo
 * archivo fallaba por otro motivo antes de llegar siquiera a esta
 * comprobación (ver setupTests.js y el "jest.transformIgnorePatterns" de
 * package.json) — es decir, ningún deploy vía GitHub Actions se ha
 * completado con éxito desde que se añadió ese paso.
 *
 * Ahora sí es un smoke test real: sin sesión iniciada, App.js muestra
 * LoginScreen.js, así que se comprueba que aparece su botón real
 * "INICIAR SESIÓN" — si algún cambio futuro rompe el árbol de imports de
 * App.js (como pasó con jsPDF/FullCalendar/react-leaflet), este test vuelve
 * a fallar y el deploy se bloquea como debe.
 */
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders login screen when no user is signed in', () => {
  render(<App />);
  const botonLogin = screen.getByText(/iniciar sesión/i);
  expect(botonLogin).toBeInTheDocument();
});
