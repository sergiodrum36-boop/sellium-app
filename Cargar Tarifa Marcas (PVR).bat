@echo off
title Cargar Tarifa Marcas (PVR)
cd /d "%~dp0"

echo ============================================
echo PASO 1: Informe (todavia NO se guarda nada)
echo ============================================
call node seedTarifaMarcas.js

echo.
echo ============================================
echo Revisa el informe de arriba: confirmados / dudosos / sin candidato.
echo Solo se guardaran los CONFIRMADOS si continuas.
echo ============================================
echo.

set /p CONFIRMAR="¿Guardar los cruces confirmados de verdad? Escribe SI y pulsa Enter (o cierra esta ventana para cancelar): "

if /i "%CONFIRMAR%"=="SI" (
    echo.
    echo Guardando...
    call node seedTarifaMarcas.js --aplicar
) else (
    echo.
    echo Cancelado. No se ha guardado nada.
)

echo.
pause
