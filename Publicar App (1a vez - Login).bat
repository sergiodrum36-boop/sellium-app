@echo off
title Mi App Comercial - Login en Firebase
cd /d "%~dp0"

echo ============================================
echo Iniciando sesion en Firebase.
echo Se abrira una ventana del navegador para que
echo inicies sesion con tu cuenta de Google.
echo Esto solo hace falta hacerlo UNA VEZ.
echo ============================================
call firebase login

echo ============================================
echo Listo. Ya puedes usar "Publicar App.bat"
echo cada vez que quieras subir cambios.
echo ============================================
pause
