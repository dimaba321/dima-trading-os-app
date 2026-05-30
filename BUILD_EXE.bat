@echo off
title Dima Trading OS — Build Installer
cd /d "%~dp0"

:: Read current version from package.json
for /f "tokens=2 delims=:, " %%v in ('findstr /r "\"version\"" package.json') do (
  set RAW_VER=%%v
)
set CURRENT_VER=%RAW_VER:"=%

echo.
echo ╔══════════════════════════════════════════════════════════╗
echo ║        DIMA TRADING OS ^| Windows Installer Builder       ║
echo ║                                                          ║
echo ║   Current version: v%CURRENT_VER%                                ║
echo ╚══════════════════════════════════════════════════════════╝
echo.
echo   [1] Personal build   ^| keeps your trades and data
echo   [2] Customer build   ^| clean slate, version auto-bumped
echo   [3] Customer build   ^| clean slate, set version manually
echo   [4] Exit
echo.
set /p choice="Enter 1, 2, 3 or 4: "

if "%choice%"=="1" goto personal
if "%choice%"=="2" goto customer_auto
if "%choice%"=="3" goto customer_manual
if "%choice%"=="4" exit
echo Invalid choice. Please enter 1, 2, 3 or 4.
pause
goto end

:personal
echo.
echo Building PERSONAL build ^(v%CURRENT_VER% — no version change^)...
echo.
set WIN_CSC_LINK=
set CSC_IDENTITY_AUTO_DISCOVERY=false
node scripts/build_installer.js
goto end

:customer_auto
echo.
echo Building CUSTOMER build ^(patch auto-bumped from v%CURRENT_VER%^)...
echo.
set WIN_CSC_LINK=
set CSC_IDENTITY_AUTO_DISCOVERY=false
node scripts/build_installer.js --clean
goto end

:customer_manual
echo.
set /p NEW_VER="Enter new version number (e.g. 1.2.0): "
if "%NEW_VER%"=="" (
  echo No version entered. Cancelled.
  pause
  goto end
)
echo.
echo Building CUSTOMER build v%NEW_VER%...
echo.
set WIN_CSC_LINK=
set CSC_IDENTITY_AUTO_DISCOVERY=false
node scripts/build_installer.js --clean --ver %NEW_VER%
goto end

:end
echo.
if exist CUSTOMER_BUILD\ (
  echo +---------------------------------------------------------+
  echo ^|  Customer builds: CUSTOMER_BUILD\                       ^|
  echo ^|  Each version has its own folder with .exe + README.txt ^|
  echo +---------------------------------------------------------+
  echo.
)
if exist release\*.exe (
  echo  Personal build: release\
  echo.
)
echo  NOTE (builder only): Windows Developer Mode must be ON on THIS machine
echo  to build. Customers do NOT need Developer Mode to install the .exe.
echo.
pause
