@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: ========================================
::   VS Code Insiders 配置自動部署工具
::   版本: 1.0
::   用途: 自動部署 VS Code Insiders 設定與擴充套件
:: ========================================

echo.
echo ========================================
echo   VS Code Insiders 配置自動部署工具
echo ========================================
echo.

:: ========================================
:: [1/6] 環境檢查
:: ========================================
echo [1/6] 檢查環境...

:: 檢查 VS Code Insiders 是否安裝
where code-insiders >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ❌ 錯誤：未找到 VS Code Insiders 命令 'code-insiders'
    echo.
    echo 請確認：
    echo   1. VS Code Insiders 已安裝
    echo   2. VS Code Insiders 已加入系統 PATH
    echo   3. 重新開啟終端機以載入新的 PATH
    echo.
    pause
    exit /b 1
)

:: 顯示 VS Code Insiders 版本
for /f "tokens=*" %%v in ('code-insiders --version 2^>nul ^| findstr /r "^[0-9]"') do (
    echo ✓ 找到 VS Code Insiders 版本: %%v
    goto :version_found
)
:version_found

echo.

:: ========================================
:: [2/6] 路徑設定
:: ========================================
echo [2/6] 設定路徑...

set "SCRIPT_DIR=%~dp0"
set "VS_CODE_USER=%APPDATA%\Code - Insiders\User"

echo ✓ 當前使用者: %USERNAME%
echo ✓ 來源目錄: %SCRIPT_DIR%
echo ✓ 目標目錄: %VS_CODE_USER%

:: 檢查來源檔案是否存在
if not exist "%SCRIPT_DIR%User\settings.json" (
    echo.
    echo ❌ 錯誤：找不到 User\settings.json
    echo    請確認腳本位於倉庫根目錄執行
    pause
    exit /b 1
)

if not exist "%SCRIPT_DIR%extensions.txt" (
    echo.
    echo ❌ 錯誤：找不到 extensions.txt
    pause
    exit /b 1
)

echo.

:: ========================================
:: [3/6] 備份現有設定（可選）
:: ========================================
echo [3/6] 備份現有設定...

set "BACKUP_CHOICE=N"
set /p BACKUP_CHOICE="是否備份現有設定？(Y/N，預設 N): "

if /i "%BACKUP_CHOICE%"=="Y" (
    echo.
    echo 正在備份現有設定...

    set "TIMESTAMP=%date:~0,4%%date:~5,2%%date:~8,2%_%time:~0,2%%time:~3,2%%time:~6,2%"
    set "TIMESTAMP=!TIMESTAMP: =0!"

    if exist "%VS_CODE_USER%\settings.json" (
        copy /Y "%VS_CODE_USER%\settings.json" "%VS_CODE_USER%\settings.json.bak.!TIMESTAMP!" >nul
        echo ✓ 已備份 settings.json
    )

    if exist "%VS_CODE_USER%\keybindings.json" (
        copy /Y "%VS_CODE_USER%\keybindings.json" "%VS_CODE_USER%\keybindings.json.bak.!TIMESTAMP!" >nul
        echo ✓ 已備份 keybindings.json
    )

    echo ✓ 備份完成（時間戳記: !TIMESTAMP!）
) else (
    echo ✓ 跳過備份
)

echo.

:: ========================================
:: [4/6] 部署設定檔
:: ========================================
echo [4/6] 部署設定檔...

:: 確保目標目錄存在
if not exist "%VS_CODE_USER%" (
    mkdir "%VS_CODE_USER%"
    echo ✓ 已建立目錄: %VS_CODE_USER%
)

:: 複製 settings.json
copy /Y "%SCRIPT_DIR%User\settings.json" "%VS_CODE_USER%\settings.json" >nul
if %errorlevel% equ 0 (
    echo ✓ 已部署 settings.json
) else (
    echo ❌ 部署 settings.json 失敗
)

:: 複製 keybindings.json
copy /Y "%SCRIPT_DIR%User\keybindings.json" "%VS_CODE_USER%\keybindings.json" >nul
if %errorlevel% equ 0 (
    echo ✓ 已部署 keybindings.json
) else (
    echo ❌ 部署 keybindings.json 失敗
)

:: 建立 snippets 目錄
if not exist "%VS_CODE_USER%\snippets" (
    mkdir "%VS_CODE_USER%\snippets"
    echo ✓ 已建立 snippets 目錄
)

:: 如果有 snippets 檔案，複製它們
if exist "%SCRIPT_DIR%User\snippets\*.*" (
    xcopy /Y /E /I "%SCRIPT_DIR%User\snippets\*.*" "%VS_CODE_USER%\snippets\" >nul
    echo ✓ 已複製 snippets
)

echo.

:: ========================================
:: [5/6] 安裝擴充套件
:: ========================================
echo [5/6] 安裝擴充套件...

set "INSTALL_EXTENSIONS=Y"
set /p INSTALL_EXTENSIONS="是否安裝擴充套件（35個）？(Y/N，預設 Y): "

if /i "%INSTALL_EXTENSIONS%"=="N" (
    echo ✓ 跳過擴充套件安裝
    goto :skip_extensions
)

echo.
echo 開始安裝擴充套件（這可能需要幾分鐘）...
echo.

set COUNT=0
set SUCCESS=0
set FAILED=0
set "FAILED_LIST="

for /f "usebackq delims=" %%i in ("%SCRIPT_DIR%extensions.txt") do (
    set LINE=%%i

    :: 跳過空行
    if not "!LINE!"=="" (
        set /a COUNT+=1

        echo [!COUNT!/35] 安裝: %%i

        :: 安裝擴充套件（使用 code-insiders 命令）
        code-insiders --install-extension "%%i" >nul 2>&1

        if !errorlevel! equ 0 (
            set /a SUCCESS+=1
            echo          ✓ 成功
        ) else (
            set /a FAILED+=1
            echo          ❌ 失敗
            set "FAILED_LIST=!FAILED_LIST!%%i, "
        )
    )
)

echo.
echo ✓ 擴充套件安裝完成

:skip_extensions

echo.

:: ========================================
:: [6/6] 部署完成報告
:: ========================================
echo ========================================
echo   部署完成報告
echo ========================================
echo.
echo ✓ 設定檔部署: 完成
echo   - settings.json
echo   - keybindings.json
echo   - snippets 目錄
echo.

if /i "%INSTALL_EXTENSIONS%"=="Y" (
    echo ✓ 擴充套件安裝: 完成
    echo   - 總數: %COUNT% 個
    echo   - 成功: %SUCCESS% 個
    echo   - 失敗: %FAILED% 個
    echo.

    if %FAILED% gtr 0 (
        echo ⚠ 失敗的擴充套件:
        echo   %FAILED_LIST:~0,-2%
        echo.
        echo   建議手動安裝失敗的擴充套件
        echo.
    )
) else (
    echo ⊘ 擴充套件安裝: 已跳過
    echo.
)

echo ========================================
echo.
echo 📌 重要提示:
echo   1. 請完全關閉並重啟 VS Code Insiders 以套用所有設定
echo   2. 確認已安裝字型: JetBrainsMono Nerd Font
echo   3. 部分擴充套件可能需要重新載入視窗
echo.
echo ========================================
echo.

pause
exit /b 0
