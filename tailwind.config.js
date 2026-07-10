/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#e6f1fb',
          100: '#b5d4f4',
          200: '#85b7eb',
          300: '#5aa1e6',
          400: '#378add',
          500: '#007bff',
          600: '#185fa5',
          700: '#0f4a82',
          800: '#0c447c',
          900: '#042c53',
        },
        // Tokens del rediseño visual (Fase 3): usados en Sidebar.js, KpiCard.js
        // y en los gráficos del Dashboard (barra Top 10 y donut).
        wine: { DEFAULT: '#A13D52', soft: 'rgba(161,61,82,0.16)', dark: '#6E1F30' },
        gold: { DEFAULT: '#C9A227', soft: 'rgba(201,162,39,0.16)' },
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.35), 0 10px 28px -12px rgba(0,0,0,0.55)',
        'card-light': '0 1px 2px rgba(15,23,42,0.06), 0 10px 28px -12px rgba(15,23,42,0.12)',
      },
    },
  },
  plugins: [],
};
