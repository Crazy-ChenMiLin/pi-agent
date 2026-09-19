@echo off
rem Pithagoras Portal - pi web portal (with password auth)
rem NOTE: this project does NOT read .env in local mode - env vars must be set here.
rem NOTE: workspace var is WORKSPACE_ROOT (README says WORKSPACES_DIR which is outdated).
title Pithagoras Portal - http://127.0.0.1:4100
cd /d D:\code_project\pi-session\pithagoras

set PORTAL_PASSWORD=pithagoras2026
set PORTAL_SECRET=61338d89bbd942ba87e8bb827b6ef4238a55badb545bcd64d91a664e63df5aa3
set WORKSPACE_ROOT=D:\code_project\pi-session\workspaces
set EXECUTOR=host
set PI_PROVIDER=wechat
set PI_MODEL=Deepseek-v4-flash

echo.
echo   Starting Pithagoras on http://127.0.0.1:4100
echo   Login password: pithagoras2026
echo   MINIMIZE this window (do NOT close) to keep the server running.
echo.
C:\Users\26487\.workbuddy\binaries\node\versions\22.22.2-3\node.exe server\dist\index.js
pause