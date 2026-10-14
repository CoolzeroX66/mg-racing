@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Reifen-Dienst - Mega Godzilla Racing Manager
where node >nul 2>nul || (echo Node.js ist nicht installiert: https://nodejs.org & pause & exit /b 1)
node tools\reifen-dienst.mjs
pause
