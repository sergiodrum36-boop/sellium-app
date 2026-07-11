@echo off
title Sellium - Subir cambios a GitHub
cd /d "%~dp0"

echo ============================================
echo Subiendo los ultimos cambios a GitHub...
echo ============================================
git add -A
git commit -m "Actualizacion %date% %time%"
if errorlevel 1 (
  echo ============================================
  echo No habia cambios nuevos que subir.
  echo ============================================
  pause
  exit /b 0
)

git push
if errorlevel 1 (
  echo ============================================
  echo ERROR: el push ha fallado. Revisa el mensaje
  echo de arriba.
  echo ============================================
  pause
  exit /b 1
)

echo ============================================
echo LISTO. Cambios subidos a GitHub. Ahora GitHub
echo compilara y publicara la app sola (1-2 min).
echo Puedes ver el progreso en:
echo https://github.com/sergiodrum36-boop/sellium-app/actions
echo ============================================
pause
