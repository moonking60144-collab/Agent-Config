@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: ========================================
::   VS Code 配置自動部署工具
::   版本: 1.0
::   用途: 自動部署 VS Code 設定與擴充套件
:: ========================================

echo.
echo ========================================
echo   VS Code 配置自動部署工具
echo ========================================
echo.

:: ========================================
:: [1/6] 環境檢查
:: ========================================
echo [1/6] 檢查環境...

:: 檢查 VS Code 是否安裝
where code >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ❌ 錯誤：未找到 VS Code 命令 'code'
    echo.
    echo 請確認：
    echo   1. VS Code 已安裝
    echo   2. VS Code 已加入系統 PATH
    echo   3. 重新開啟終端機以載入新的 PATH
    echo.
    pause
    exit /b 1
)

:: 顯示 VS Code 版本
for /f "tokens=*" %%v in ('code --version 2^>nul ^| findstr /r "^[0-9]"') do (
    echo ✓ 找到 VS Code 版本: %%v
    goto :version_found
)
:version_found

echo.

:: ========================================
:: [2/6] 路徑設定
:: ========================================
echo [2/6] 設定路徑...

set "SCRIPT_DIR=%~dp0"
set "VS_CODE_USER=%APPDATA%\Code\User"

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
:: [3/8] 備份現有設定（可選）
:: ========================================
echo [3/8] 備份現有設定...

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
:: [4/8] 部署設定檔
:: ========================================
echo [4/8] 部署設定檔...

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
:: [5/8] 安裝擴充套件
:: ========================================
echo [5/8] 安裝擴充套件...

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

        :: 安裝擴充套件
        code --install-extension "%%i" >nul 2>&1

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
:: [6/8] 部署 CODEX MCP 配置
:: ========================================
echo [6/8] 部署 CODEX MCP 配置...

set "CODEX_DIR=%USERPROFILE%\.codex"

:: 建立 .codex 目錄
if not exist "%CODEX_DIR%" (
    mkdir "%CODEX_DIR%"
    echo ✓ 已建立目錄: %CODEX_DIR%
)

:: [6a] 複製 AGENTS.md（Codex 全局規範 - 效率優先版本）
if exist "%SCRIPT_DIR%codex\AGENTS.md" (
    copy /Y "%SCRIPT_DIR%codex\AGENTS.md" "%CODEX_DIR%\AGENTS.md" >nul
    if %errorlevel% equ 0 (
        echo ✓ 已部署 AGENTS.md（Codex 全局規範）
    ) else (
        echo ❌ 部署 AGENTS.md 失敗
    )
) else (
    echo ⊘ 找不到 codex\AGENTS.md，跳過
)

:: [6b] 複製 config.toml（MCP 服務配置 - Serena 全局模式）
if exist "%SCRIPT_DIR%codex\config.toml" (
    copy /Y "%SCRIPT_DIR%codex\config.toml" "%CODEX_DIR%\config.toml" >nul
    if %errorlevel% equ 0 (
        echo ✓ 已部署 config.toml（Serena 全局配置）
    ) else (
        echo ❌ 部署 config.toml 失敗
    )
) else (
    echo ⊘ 找不到 codex\config.toml，跳過
)

echo.
echo CODEX MCP 配置部署完成！
echo - AGENTS.md：效率優先規範（工具並用、查詢擴展）
echo - config.toml：10 個 MCP 服務（Serena 全局模式）

echo.

:: ========================================
:: [7/8] API Keys 設定引導
:: ========================================
echo [7/8] API Keys 設定引導...

set "SETUP_KEYS=N"
echo.
echo 📌 MCP 服務需要以下 API Keys：
echo    1. GitHub Personal Access Token
echo    2. Firecrawl API Key
echo.
echo 📝 注意：Serena MCP 已設定為全局模式，不需要指定專案路徑
echo.
set /p SETUP_KEYS="是否現在設定 API Keys？(Y/N，預設 N): "

if /i "%SETUP_KEYS%"=="Y" (
    echo.
    echo 開始設定 API Keys...
    echo.

    :: 詢問 GitHub Token
    set /p GITHUB_TOKEN="請輸入 GitHub Personal Access Token (ghp_...): "

    :: 詢問 Firecrawl Key
    set /p FIRECRAWL_KEY="請輸入 Firecrawl API Key (fc-...): "

    echo.
    echo 正在更新 config.toml...

    :: 使用 PowerShell 替換佔位符
    powershell -Command "(Get-Content '%CODEX_DIR%\config.toml') -replace 'YOUR_GITHUB_TOKEN_HERE', '%GITHUB_TOKEN%' | Set-Content '%CODEX_DIR%\config.toml'"
    powershell -Command "(Get-Content '%CODEX_DIR%\config.toml') -replace 'YOUR_FIRECRAWL_API_KEY_HERE', '%FIRECRAWL_KEY%' | Set-Content '%CODEX_DIR%\config.toml'"

    echo ✓ API Keys 已設定完成
    set "KEYS_STATUS=已設定"
) else (
    echo ✓ 跳過 API Keys 設定
    echo.
    echo 📌 請稍後手動編輯：%CODEX_DIR%\config.toml
    echo    設定 GitHub Token 與 Firecrawl API Key
    set "KEYS_STATUS=需手動設定"
)

echo.

:: ========================================
:: [8/8] 部署完成報告
:: ========================================
echo ========================================
echo   部署完成報告
echo ========================================
echo.
echo ✓ VS Code 設定檔部署: 完成
echo   - settings.json
echo   - keybindings.json
echo   - snippets 目錄
echo.
echo ✓ CODEX MCP 配置: 完成
echo   - AGENTS.md (10 個 MCP 服務規範)
echo   - config.toml (MCP 服務配置)
echo   - API Keys 設定: %KEYS_STATUS%
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
echo   1. 請完全關閉並重啟 VS Code 以套用所有設定
echo   2. 確認已安裝字型: JetBrainsMono Nerd Font
echo   3. 部分擴充套件可能需要重新載入視窗
echo   4. CODEX MCP 配置位於: %CODEX_DIR%
echo   5. 如需修改 API Keys，請編輯: %CODEX_DIR%\config.toml
echo.
echo ========================================
echo.

pause
exit /b 0
