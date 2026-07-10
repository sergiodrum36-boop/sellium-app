@echo off
title Mi App Comercial
cd /d "%~dp0"

echo ============================================
echo Comprobando dependencias (Tailwind, iconos, etc)...
echo La primera vez puede tardar unos minutos.
echo ============================================
call npm install

echo ============================================
echo Iniciando Mi App Comercial...
echo Se abrira sola en el navegador en unos segundos.
echo NO CIERRES esta ventana mientras uses la app.
echo Para cerrar la app, simplemente cierra esta ventana.
echo ============================================
call npm start
