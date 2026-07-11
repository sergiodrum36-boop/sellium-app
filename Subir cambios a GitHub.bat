@echo off
title Sellium - Subir cambios a GitHub
cd /d "%~dp0"

echo ============================================
echo Subiendo los ultimos cambios a GitHub...
echo ============================================
git add -A
git commit -m "Actualizacion automatica"
git push

echo ============================================
echo FIN. Revisa el texto de arriba:
echo - Si pone "nothing to commit" es que no habia
echo   cambios nuevos (normal, no es un error).
echo - Si ves algun "error" o "fatal", copiamelo.
echo - Si ha ido bien, GitHub compilara y publicara
echo   la app sola en 1-2 minutos. Progreso en:
echo   https://github.com/sergiodrum36-boop/sellium-app/actions
echo ============================================
echo.
echo Pulsa una tecla para cerrar esta ventana...
pause >nul
