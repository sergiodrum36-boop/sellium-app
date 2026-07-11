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

echo ============================================
echo Subiendo todo a GitHub...
echo Puede que se abra una ventana del navegador
echo para iniciar sesion con tu cuenta de GitHub
echo (sergiodrum36-boop). Inicia sesion si te lo pide.
echo ============================================
git branch -M main
git push -u origin main

echo ============================================
echo FIN. Revisa el texto de arriba:
echo - Si ves "Branch 'main' set up to track..." o
echo   similar, ha ido bien.
echo - Si ves algun "error" o "fatal", copiamelo.
echo.
echo Repositorio: https://github.com/sergiodrum36-boop/sellium-app
echo.
echo SIGUIENTE PASO (si aun no lo has hecho): entra en
echo ese repositorio, pestaña Settings, luego Secrets
echo and variables - Actions - New repository secret,
echo crea uno llamado FIREBASE_TOKEN con el token que
echo te dio el comando "firebase login:ci".
echo ============================================
echo.
echo Pulsa una tecla para cerrar esta ventana...
pause >nul
