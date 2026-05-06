@echo off
title Studio Task Hub 3000
cd /d "%~dp0"
echo Starting Studio Task Hub on port 3000...
echo.
if exist "C:\Program Files\nodejs\node.exe" (
  "C:\Program Files\nodejs\node.exe" server-v2.js
) else (
  node server-v2.js
)
echo.
echo Server stopped. If there is an error above, send the text to Codex.
pause
