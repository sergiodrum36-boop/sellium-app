@echo off
title Diagnostico Todos Distribuidores
cd /d "%~dp0"

call node diagnosticoTodosDistribuidores.js

echo.
pause
