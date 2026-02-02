@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: ========================================
::   VS Code 設定反向備份工具
::   版本: 1.0
::   用途: 從電腦同步設定回倉庫
:: ========================================

echo.
echo ========================================
echo   VS Code 設定反向備份工具
echo ========================================
echo.

:: ========================================
:: [1/4] 環境檢查
:: ========================================
echo [1/4] 檢查環境...

:: 檢查 VS Code 是否安裝
where code >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ❌ 錯誤：未找到 VS Code
    pause
    exit /b 1
)

echo ✓ 找到 VS Code

:: 設定路徑
set "SCRIPT_DIR=%~dp0"
set "VS_CODE_USER=%APPDATA%\Code\User"

echo ✓ 當前使用者: %USERNAME%
echo ✓ 來源目錄（電腦）: %VS_CODE_USER%
echo ✓ 目標目錄（倉庫）: %SCRIPT_DIR%

echo.

:: ========================================
:: [2/4] 備份設定檔
:: ========================================
echo [2/4] 備份設定檔到倉庫...

:: 確保目標目錄存在
if not exist "%SCRIPT_DIR%User" (
    mkdir "%SCRIPT_DIR%User"
    echo ✓ 已建立目錄: User\
)

if not exist "%SCRIPT_DIR%User\snippets" (
    mkdir "%SCRIPT_DIR%User\snippets"
    echo ✓ 已建立目錄: User\snippets\
)

:: 複製 settings.json
if exist "%VS_CODE_USER%\settings.json" (
    copy /Y "%VS_CODE_USER%\settings.json" "%SCRIPT_DIR%User\settings.json" >nul
    echo ✓ 已備份 settings.json
) else (
    echo ⚠ 找不到 settings.json
)

:: 複製 keybindings.json
if exist "%VS_CODE_USER%\keybindings.json" (
    copy /Y "%VS_CODE_USER%\keybindings.json" "%SCRIPT_DIR%User\keybindings.json" >nul
    echo ✓ 已備份 keybindings.json
) else (
    echo ⚠ 找不到 keybindings.json
)

:: 複製 snippets
if exist "%VS_CODE_USER%\snippets\*.*" (
    xcopy /Y /E /I "%VS_CODE_USER%\snippets\*.*" "%SCRIPT_DIR%User\snippets\" >nul
    echo ✓ 已備份 snippets
) else (
    echo ⚠ 找不到 snippets 或 snippets 為空
)

echo.

:: ========================================
:: [3/4] 更新擴充套件清單
:: ========================================
echo [3/4] 更新擴充套件清單...

echo 正在匯出擴充套件清單...
code --list-extensions > "%SCRIPT_DIR%extensions.txt"

if %errorlevel% equ 0 (
    :: 計算擴充套件數量
    set COUNT=0
    for /f %%i in ('type "%SCRIPT_DIR%extensions.txt" ^| find /c /v ""') do set COUNT=%%i

    echo ✓ 已匯出 !COUNT! 個擴充套件到 extensions.txt
) else (
    echo ❌ 匯出擴充套件清單失敗
)

echo.

:: ========================================
:: [4/4] 完成報告
:: ========================================
echo ========================================
echo   備份完成報告
echo ========================================
echo.
echo ✓ 已更新倉庫檔案：
echo   - User\settings.json
echo   - User\keybindings.json
echo   - User\snippets\
echo   - extensions.txt
echo.
echo ========================================
echo.
echo 📌 下一步：
echo   1. 檢查更新的檔案內容
echo   2. 提交變更到 Git: git add . ^&^& git commit -m "更新 VS Code 設定"
echo   3. 推送到遠端: git push
echo.
echo ========================================
echo.

pause
exit /b 0
