@echo off
chcp 65001 >nul
title 代办清单 - 本地服务

echo.
echo ================================================================
echo   代办清单 实时同步服务器
echo ================================================================
echo.

REM 检查 Node.js
where node >nul 2>nul
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js
    echo        下载地址：https://nodejs.org/
    pause
    exit /b 1
)

REM 检查依赖
if not exist "node_modules\ws" (
    echo [1/2] 首次运行，正在安装依赖（约 1 分钟）...
    call npm install
    if errorlevel 1 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
) else (
    echo [1/2] 依赖已安装
)

REM 启动服务
echo [2/2] 启动服务（端口 3000）...
echo.

REM 获取本机 IP（局域网）
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set LOCAL_IP=%%a
    goto :show_info
)

:show_info
echo   ================================================================
echo   服务已启动！
echo.
echo   本机访问:     http://localhost:3000
echo   局域网访问:   http://%LOCAL_IP%:3000
echo.
echo   ★ 如果使用花生壳（vicp.fun）等动态域名：
echo     1. 登录花生壳后台，设置「外网映射」
echo     2. 映射类型: HTTP
echo     3. 外网域名: 976aqkt41761.vicp.fun （或你注册的）
echo     4. 外网端口: 80      （默认）
echo     5. 内网主机: %LOCAL_IP%
echo     6. 内网端口: 3000
echo     7. 保存后，通过 http://976aqkt41761.vicp.fun 即可访问
echo.
echo     注意：路由器也要做端口映射（80 → %LOCAL_IP%:3000）
echo     或者直接映射到电脑的 3000 端口
echo.
echo   按 Ctrl+C 停止服务
echo   ================================================================
echo.

node server.js

pause