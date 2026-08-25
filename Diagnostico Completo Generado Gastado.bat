@echo off
title Diagnostico Completo A&P Generado-Gastado
cd /d "%~dp0"

call node diagnosticoGeneradoGastadoCompleto.js

echo.
pause
