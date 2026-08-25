@echo off
title Actualizar Preventistas 2025
cd /d "%~dp0"

echo ============================================
echo PASO 1: Informe (todavia NO se cambia nada)
echo ============================================
call node actualizarPreventistas2025.js

echo.
echo ============================================
echo Revisa el informe de arriba.
echo ============================================
echo.

set /p CONFIRMAR="¿Aplicar estos cambios de verdad? Escribe SI y pulsa Enter (o cierra esta ventana para cancelar): "

if /i "%CONFIRMAR%"=="SI" (
    echo.
    echo Aplicando cambios...
    call node actualizarPreventistas2025.js --aplicar
) else (
    echo.
    echo Cancelado. No se ha cambiado nada.
)

echo.
pause
