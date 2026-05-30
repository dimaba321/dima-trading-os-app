@echo off
title Dima Trading OS — Build Installer
cd /d "%~dp0"
echo.
echo ╔══════════════════════════════════════════════╗
echo ║   DIMA TRADING OS — Build EXE Installer     ║
echo ╚══════════════════════════════════════════════╝
echo.
echo Step 1: Building React app...
call npx vite build
if errorlevel 1 goto :error

echo.
echo Step 2: Building Windows installer...
call npx electron-builder --win nsis --publish never
if errorlevel 1 (
  echo.
  echo [!] NSIS installer failed ^(needs Developer Mode for symlinks^)
  echo [i] Your app IS built and works at:
  echo     dist\win-unpacked\Dima Trading OS.exe
  echo.
  echo To fix the installer, enable Windows Developer Mode:
  echo    Settings ^> Privacy ^& security ^> For developers ^> Developer Mode ON
  echo Then run this script again.
  goto :done
)

echo.
echo ✓ Installer built! Check the dist\ folder.
:done
pause
goto :eof

:error
echo Build failed. Check errors above.
pause
