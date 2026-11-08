@echo off
chcp 65001 >nul
title Ka-tok
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [!] Chua cai Node.js. Hay tai ban LTS tai https://nodejs.org roi chay lai file nay.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo.
  echo  Dang cai dat thu vien lan dau, vui long cho...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo  [!] Cai dat that bai. Kiem tra ket noi Internet roi thu lai.
    pause
    exit /b 1
  )
)

call npm start
pause
