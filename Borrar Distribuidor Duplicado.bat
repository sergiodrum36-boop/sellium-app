@echo off
title Borrar Distribuidor Duplicado (DIEGO CANALS)
cd /d "%~dp0"

echo ============================================
echo PASO 1: Informe (todavia NO se borra nada)
echo ============================================
call node eliminarDistribuidorDuplicado.js

echo.
echo ============================================
echo Revisa el informe de arriba: son los documentos
echo que se van a borrar PARA SIEMPRE (no hay papelera
echo ni deshacer en este script).
echo ============================================
echo.

set /p CONFIRMAR="¿Borrar de verdad? Escribe SI y pulsa Enter (o cierra esta ventana para cancelar): "

if /i "%CONFIRMAR%"=="SI" (
    echo.
    echo Borrando...
    call node eliminarDistribuidorDuplicado.js --aplicar
) else (
    echo.
    echo Cancelado. No se ha borrado nada.
)

echo.
pause
