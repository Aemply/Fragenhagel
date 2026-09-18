@echo off
title FRAGENHAGEL
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Node.js wurde nicht gefunden.
 echo Bitte Node.js installieren und danach diese Datei erneut starten.
 pause
 exit /b
)
if not exist node_modules (
 echo Installiere benoetigte Pakete einmalig...
 call npm install
)
start "" http://localhost:3000/host.html
node server.js
pause
