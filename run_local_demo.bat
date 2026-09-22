@echo off
chcp 65001 >nul
title VeriFlow 离线演示启动引擎
cd /d "%~dp0"

echo ======================================================================
echo    VeriFlow 竞赛双核训练平台 · 一键本地离线演示启动器
echo ======================================================================
echo.

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未在系统 PATH 中找到 python 命令，请确认已安装 Python 3.10+。
    pause
    exit /b 1
)

python scripts/run_local_demo.py
if %errorlevel% neq 0 (
    echo.
    echo [提示] 进程已退出，按任意键关闭窗口。
    pause >nul
)
