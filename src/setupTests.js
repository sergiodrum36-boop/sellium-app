// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Polyfill de TextEncoder/TextDecoder para el entorno de test (jsdom).
// MOTIVO (2026-08-25): App.test.js (y cualquier test futuro que, aunque sea
// indirectamente, importe App.js) rompe con "ReferenceError: TextEncoder is
// not defined" — jsdom no implementa TextEncoder/TextDecoder de forma
// nativa, y la cadena de imports jspdf -> jspdf-autotable -> fast-png ->
// iobuffer (añadida el 27/07/2026 con el PDF de Acuerdos con Clientes, ver
// src/pdfExport.js) los usa directamente en el ámbito global. Node sí los
// tiene (vía el módulo "util"), jsdom no los expone — por eso el build
// normal (navegador real) nunca falla, solo Jest. Con esto disponibles en
// `global` antes de que se ejecute ningún test, la importación no revienta.
// Este fallo llevaba bloqueando el paso "Ejecutar tests (Jest)" de
// deploy.yml (obligatorio desde el 25/07/2026) desde que se añadió el PDF —
// es decir, ningún deploy vía GitHub Actions se ha completado desde
// entonces; solo "Publicar App.bat" (que no pasa por este paso) llegaba a
// publicar.
import { TextEncoder, TextDecoder } from 'util';
if (typeof global.TextEncoder === 'undefined') global.TextEncoder = TextEncoder;
if (typeof global.TextDecoder === 'undefined') global.TextDecoder = TextDecoder;
