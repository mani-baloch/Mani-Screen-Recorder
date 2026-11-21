@echo off
title Screen Studio Pro
cd /d "%~dp0"

echo ===================================================
echo           Screen Studio Pro is Starting...
echo ===================================================
echo.
echo Opening your Screen Recorder in your browser...
echo Keep this window open while recording.
echo.

node local-server.js
pause
