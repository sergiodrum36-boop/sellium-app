@echo off
title Sellium - Subir a GitHub (primera vez)
cd /d "%~dp0"

echo ============================================
echo Conectando este proyecto con tu repositorio
echo de GitHub: sergiodrum36-boop/sellium-app
echo ============================================
git remote remove origin >nul 2>&1
git remote add origin https://github.com/sergiodrum36-boop/sellium-app.git

echo ============================================
echo Preparando los archivos para subir...
echo ============================================
git add -A
git commit -m "Subida inicial a GitHub"
if errorlevel 1 (
  echo ============================================
  echo Aviso: no habia cambios nuevos que preparar
  echo (puede ser normal). Continuando...
  echo ============================================
)

echo ============================================
echo Subiendo todo a GitHub...
echo Puede que se abra una ventana del navegador
echo para iniciar sesion con tu cuenta de GitHub
echo (sergiodrum36-boop). Inicia sesion si te lo pide.
echo ============================================
git branch -M main
git push -u origin main
if errorlevel 1 (
  echo ============================================
  echo ERROR: el push ha fallado. Revisa el mensaje
  echo de arriba - lo mas normal es que falte iniciar
  echo sesion con GitHub en la ventana que se abre.
  echo ============================================
  pause
  exit /b 1
)

echo ============================================
echo LISTO. El codigo ya esta en GitHub:
echo https://github.com/sergiodrum36-boop/sellium-app
echo.
echo SIGUIENTE PASO (si aun no lo has hecho): entra en
echo ese repositorio - Settings - Secrets and variables
echo - Actions - New repository secret - crea uno llamado
echo FIREBASE_TOKEN con el token que te dio el comando
echo "firebase login:ci". Sin ese secreto, GitHub no
echo podra publicar la app automaticamente.
echo ============================================
pause
