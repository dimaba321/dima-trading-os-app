@echo off
title Saving Dima Trading OS to GitHub...
cd /d "%~dp0"

echo.
echo ============================================
echo  DIMA TRADING OS - Saving to GitHub
echo ============================================
echo.

REM Stage all changes
git add -A

REM Check if there's anything to commit
git diff --cached --quiet
if %errorlevel% == 0 (
  echo [OK] No changes to save - already up to date.
  git push origin main >nul 2>&1
  echo [OK] GitHub is in sync.
  goto :done
)

REM Create commit with timestamp
for /f "tokens=1-3 delims=/ " %%a in ('date /t') do set DATE=%%c-%%b-%%a
for /f "tokens=1-2 delims=: " %%a in ('time /t') do set TIME=%%a:%%b
git commit -m "Auto-save %DATE% %TIME%"

REM Push to GitHub
echo.
echo Pushing to GitHub...
git push origin main

if %errorlevel% == 0 (
  echo.
  echo [OK] Saved successfully to github.com/dimaba321/dima-trading-os-app
) else (
  echo.
  echo [ERROR] Push failed - check internet connection or GitHub login
)

:done
echo.
pause
