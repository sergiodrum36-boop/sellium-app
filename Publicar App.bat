@echo off
title Mi App Comercial - Publicar
cd /d "%~dp0"

echo ============================================
echo Comprobando dependencias...
echo ============================================
call npm install

echo ============================================
echo Generando version de produccion (build)...
echo Esto puede tardar uno o dos minutos.
echo ============================================
call npm run build
if errorlevel 1 (
  echo ============================================
  echo ERROR: la build ha fallado. Revisa el mensaje
  echo de arriba antes de seguir. No se ha publicado
  echo nada.
  echo ============================================
  pause
  exit /b 1
)

echo ============================================
echo Subiendo a Firebase Hosting...
echo ============================================
call firebase deploy --only hosting
if errorlevel 1 (
  echo ============================================
  echo ERROR: el despliegue ha fallado. Si es la
  echo primera vez, ejecuta antes
  echo "Publicar App (1a vez - Login).bat"
  echo ============================================
  pause
  exit /b 1
)

echo ============================================
echo LISTO. La app esta publicada.
echo La URL aparece arriba, en la linea "Hosting URL".
echo ============================================
pause
