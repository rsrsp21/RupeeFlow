@echo off
title RupeeFlow
cd /d "%~dp0"
echo.
echo   RupeeFlow - starting...
echo.
echo   Checking dependencies...
call npm install --no-fund --no-audit
echo   Opening http://localhost:3000 when ready...
start "" http://localhost:3000
call npm run dev
pause
