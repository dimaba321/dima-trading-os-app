@echo off
title Dima Trading OS — Build Installer
cd /d "%~dp0"
echo.
echo ╔══════════════════════════════════════════════════╗
echo ║   DIMA TRADING OS — Windows Installer Builder   ║
echo ╚══════════════════════════════════════════════════╝
echo.
echo Choose build type:
echo   [1] Personal build  — keeps your trades and positions
echo   [2] Customer build  — clean slate, no personal data
echo   [3] Exit
echo.
set /p choice="Enter 1, 2, or 3: "

if "%choice%"=="1" goto personal
if "%choice%"=="2" goto customer
if "%choice%"=="3" exit
echo Invalid choice.
goto end

:personal
echo.
echo Building PERSONAL installer...
set WIN_CSC_LINK=
set CSC_IDENTITY_AUTO_DISCOVERY=false
node scripts/build_installer.js
goto end

:customer
echo.
echo Building CUSTOMER installer (clean data)...
set WIN_CSC_LINK=
set CSC_IDENTITY_AUTO_DISCOVERY=false
node scripts/build_installer.js --clean
goto end

:end
echo.
if exist release\*.exe (
  echo ✓ Installer is in the 'release\' folder.
  echo.
  echo IMPORTANT: To install without errors, first enable:
  echo   Windows Settings ^> Privacy ^& Security ^> For Developers ^> Developer Mode: ON
  echo   Then run the .exe installer.
) else (
  echo Build may have failed. Check errors above.
)
pause
