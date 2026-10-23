@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22.12 or newer first: https://nodejs.org/
  pause
  exit /b 1
)
if not exist ".env" copy ".env.example" ".env" >nul
call npm ci
if errorlevel 1 goto fail
call npm run build
if errorlevel 1 goto fail
echo.
echo Open http://localhost:3000 in your browser after the server starts.
echo This is a LOCAL development server, not a public deployment.
echo.
call npm start
exit /b %errorlevel%
:fail
echo Installation or build failed. Read README_KO.md.
pause
exit /b 1
