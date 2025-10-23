# VSCode-Config - 個人 VS Code 配置倉庫

> 🚀 自動化部署個人 VS Code 設定與 35 個精選擴充套件

[![License](https://img.shields.io/badge/license-Private-red.svg)]()
[![VS Code](https://img.shields.io/badge/VS%20Code-1.80%2B-blue.svg)](https://code.visualstudio.com/)
[![Windows](https://img.shields.io/badge/platform-Windows-lightgrey.svg)]()

## ⚡ 快速部署（3 步驟）

```batch
# 1. Clone 此倉庫到本機
git clone <your-repo-url> VSCode-Config
cd VSCode-Config

# 2. 執行部署腳本
deploy-vscode.bat

# 3. 重啟 VS Code
```

完成！您的 VS Code 現在已配置完成，包含所有設定與擴充套件。

---

## 📦 包含內容

### 🎨 編輯器設定

- **字型**：JetBrainsMono Nerd Font（終端機與編輯器）
- **主題**：Material Icon Theme
- **Git 整合**：自動提交、自動抓取、GitLens AI 整合
- **Diff 編輯器**：啟用 CodeLens、顯示空白差異
- **視窗管理**：自動還原上次視窗

### 🤖 AI 助手擴充套件（6個）

| 擴充套件 | 用途 |
|---------|------|
| Claude Code | Anthropic Claude AI 程式碼助手 |
| GitHub Copilot + Chat | GitHub AI 程式碼建議與對話 |
| Gemini Code Assist | Google Gemini AI 助手 |
| Continue AI | 開源 AI 程式碼助手 |
| Codeium | 免費 AI 自動完成 |
| ChatGPT | OpenAI ChatGPT 整合 |

### 🔧 開發工具擴充套件（29個）

**Git 工具（6個）**
- GitLens - Git 增強工具
- Git Graph - Git 分支視覺化
- Git History - Git 歷史瀏覽器
- Git Tags - Git 標籤管理
- GitHub Pull Requests - PR 管理
- Open in GitHub - 快速開啟 GitHub

**遠端開發（3個）**
- GitHub Repositories - 遠端倉庫瀏覽
- Remote Repositories - 遠端倉庫編輯
- GitHub Codespaces - 雲端開發環境

**Python 開發（4個）**
- Python - Python 語言支援
- Pylance - Python 語言伺服器
- Debugpy - Python 除錯器
- Python Envs - Python 環境管理

**前端開發（3個）**
- Vetur - Vue.js 工具
- Live Server - 即時預覽伺服器
- npm IntelliSense - npm 套件智慧感知

**其他工具（13個）**
- Better Comments - 增強註解
- Commit Message Editor - Git 提交訊息編輯器
- ESLint - JavaScript Linter
- Terminal in Status Bar - 終端機快捷鍵
- Status Bar Text - 自訂狀態列文字
- Docker - 容器管理
- Azure Repos - Azure DevOps 整合
- Material Icon Theme - 檔案圖示主題
- PDF Viewer - PDF 檢視器
- Markdown All in One - Markdown 工具
- Git and GitHub Pack - Git 工具包

### ⌨️ 快速鍵設定

| 快速鍵 | 功能 |
|--------|------|
| `Shift + Enter` | 終端機中插入換行符（不執行命令） |

---

## 📋 前置需求

### 必要軟體

- ✅ **Windows 10/11**
- ✅ **[VS Code](https://code.visualstudio.com/)** 1.80 或更新版本
- ✅ **網路連線**（安裝擴充套件時需要）

### 建議安裝

- 📦 **[JetBrainsMono Nerd Font](https://www.nerdfonts.com/)** - 用於終端機與編輯器
- 📦 **[Git for Windows](https://git-scm.com/)** - 版本控制（如已安裝可忽略）

---

## 🚀 部署方式

### 方式 1：自動部署（推薦）✨

這是最簡單的方式，適合大多數使用者。

```batch
# Clone 倉庫
git clone <your-repo-url> VSCode-Config
cd VSCode-Config

# 執行部署腳本
deploy-vscode.bat

# 根據提示選擇：
# - 是否備份現有設定？(Y/N，預設 N)
# - 是否安裝擴充套件？(Y/N，預設 Y)

# 重啟 VS Code
```

**部署腳本會自動：**
1. ✓ 檢查 VS Code 是否已安裝
2. ✓ 備份現有設定（可選）
3. ✓ 複製 settings.json 和 keybindings.json
4. ✓ 安裝所有 35 個擴充套件
5. ✓ 顯示詳細的安裝報告

### 方式 2：手動部署

如果您想手動控制每個步驟：

#### 步驟 1：複製設定檔

```batch
# 複製 settings.json
copy User\settings.json %APPDATA%\Code\User\settings.json

# 複製 keybindings.json
copy User\keybindings.json %APPDATA%\Code\User\keybindings.json

# 建立 snippets 目錄（如果不存在）
if not exist "%APPDATA%\Code\User\snippets" mkdir "%APPDATA%\Code\User\snippets"
```

#### 步驟 2：安裝擴充套件

```batch
# 安裝所有擴充套件（需要幾分鐘）
for /f %i in (extensions.txt) do code --install-extension %i
```

或者手動安裝特定擴充套件：

```batch
code --install-extension anthropic.claude-code
code --install-extension github.copilot
# ... 依此類推
```

### 方式 3：部署到 VS Code Insiders

如果您使用 VS Code Insiders：

```batch
# 執行 Insiders 專用腳本
deploy-vscode-insiders.bat
```

---

## 🔄 更新倉庫（從電腦同步）

當您在電腦上調整了 VS Code 設定後，可以將更新同步回倉庫：

```batch
# 執行反向備份腳本
backup-current-settings.bat
```

**這會自動：**
1. ✓ 複製 settings.json, keybindings.json 到倉庫
2. ✓ 複製所有 snippets 到倉庫
3. ✓ 匯出當前安裝的擴充套件清單到 extensions.txt

**然後提交變更：**

```batch
git add .
git commit -m "更新 VS Code 設定 - %date%"
git push
```

---

## 🛠️ 擴充套件完整清單

<details>
<summary>點擊展開查看全部 35 個擴充套件</summary>

### AI & 程式碼助手
- `aaron-bond.better-comments` - Better Comments
- `anthropic.claude-code` - Claude Code
- `codeium.codeium` - Codeium
- `continue.continue` - Continue
- `github.copilot` - GitHub Copilot
- `github.copilot-chat` - GitHub Copilot Chat
- `google.geminicodeassist` - Gemini Code Assist
- `openai.chatgpt` - ChatGPT

### Git 工具
- `donjayamanne.githistory` - Git History
- `eamodio.gitlens` - GitLens
- `howardzuo.vscode-git-tags` - Git Tags
- `mhutchie.git-graph` - Git Graph
- `vinirossa.vscode-gitandgithub-pack` - Git and GitHub Pack
- `ziyasal.vscode-open-in-github` - Open in GitHub

### 遠端開發
- `github.codespaces` - GitHub Codespaces
- `github.remotehub` - GitHub Repositories
- `ms-vscode.remote-repositories` - Remote Repositories

### Python 開發
- `ms-python.debugpy` - Python Debugger
- `ms-python.python` - Python
- `ms-python.vscode-pylance` - Pylance
- `ms-python.vscode-python-envs` - Python Environment Manager

### 前端開發
- `christian-kohler.npm-intellisense` - npm IntelliSense
- `octref.vetur` - Vetur
- `ritwickdey.liveserver` - Live Server

### 其他工具
- `adam-bender.commit-message-editor` - Commit Message Editor
- `dbaeumer.vscode-eslint` - ESLint
- `flyfly6.terminal-in-status-bar` - Terminal in Status Bar
- `github.vscode-pull-request-github` - GitHub Pull Requests
- `marceloxp.statusbartext` - Status Bar Text
- `ms-azuretools.vscode-containers` - Docker
- `ms-vscode.azure-repos` - Azure Repos
- `pkief.material-icon-theme` - Material Icon Theme
- `saoudrizwan.claude-dev` - Claude Dev
- `tomoki1207.pdf` - vscode-pdf
- `yzhang.markdown-all-in-one` - Markdown All in One

</details>

---

## 🎨 字型安裝

本配置使用 **JetBrainsMono Nerd Font**，強烈建議安裝以獲得最佳體驗。

### 下載與安裝

1. **下載字型**
   - [Nerd Fonts 官網](https://www.nerdfonts.com/)
   - [直接下載 JetBrainsMono](https://github.com/ryanoasis/nerd-fonts/releases/download/v3.1.1/JetBrainsMono.zip)

2. **安裝字型**（Windows）
   - 解壓縮 ZIP 檔案
   - 雙擊 `.ttf` 或 `.otf` 檔案
   - 點擊「安裝」按鈕
   - 安裝所有字型（Regular, Bold, Italic 等）

3. **驗證安裝**
   - 重啟 VS Code
   - 開啟終端機應該能看到美化的字型與圖示

### 字型設定說明

本倉庫的 settings.json 已包含以下字型設定：

```json
{
  "terminal.integrated.fontFamily": "JetBrainsMono Nerd Font Mono",
  "editor.fontFamily": "JetBrainsMono Nerd Font, Cascadia Code, Consolas, 'Courier New', monospace"
}
```

如果未安裝 JetBrainsMono，VS Code 會自動回退到 Cascadia Code 或 Consolas。

---

## ❓ 故障排除

### 問題 1：擴充套件安裝失敗

**症狀**：部署腳本顯示某些擴充套件安裝失敗

**解決方式**：
1. 檢查網路連線是否正常
2. 手動安裝失敗的擴充套件：
   ```batch
   code --install-extension <extension-id>
   ```
3. 檢查 VS Code 輸出面板（`Ctrl+Shift+U`）查看詳細錯誤訊息
4. 部分擴充套件可能需要特定的 VS Code 版本，請更新 VS Code

### 問題 2：設定未生效

**症狀**：部署完成但設定沒有改變

**解決方式**：
1. **完全關閉** VS Code（所有視窗）
2. 重新開啟 VS Code
3. 檢查設定是否已載入：
   - `Ctrl+,` 開啟設定
   - 點擊右上角 `{}` 圖示查看 JSON
   - 確認設定內容與倉庫中的 settings.json 一致
4. 如果仍未生效，手動複製檔案並重啟

### 問題 3：字型顯示異常

**症狀**：終端機或編輯器字型顯示為方框或亂碼

**解決方式**：
1. 確認已安裝 JetBrainsMono Nerd Font
2. Windows 安裝字型：
   - 雙擊 `.ttf` 檔案
   - 點擊「安裝」
   - 安裝所有變體（Regular, Bold, Italic）
3. 完全關閉並重啟 VS Code（重要！）
4. 檢查字型設定：
   ```json
   "terminal.integrated.fontFamily": "JetBrainsMono Nerd Font Mono"
   ```

### 問題 4：部署腳本無法執行

**症狀**：雙擊 `.bat` 檔案沒有反應或閃退

**解決方式**：
1. **以系統管理員身分執行**
   - 右鍵點擊 `.bat` 檔案
   - 選擇「以系統管理員身分執行」

2. **檢查 VS Code 是否在 PATH 中**
   ```batch
   # 在 PowerShell 或 CMD 中執行
   code --version
   ```
   如果顯示「找不到命令」，需要將 VS Code 加入 PATH：
   - 設定 → 系統 → 進階系統設定 → 環境變數
   - 在「使用者變數」中編輯 `Path`
   - 新增 `C:\Users\<你的使用者名稱>\AppData\Local\Programs\Microsoft VS Code\bin`
   - 重啟終端機

3. **手動執行腳本**
   ```batch
   # 在 CMD 中執行
   cd C:\path\to\VSCode-Config
   deploy-vscode.bat
   ```

### 問題 5：Git 路徑錯誤

**症狀**：settings.json 中的 Git 路徑與您的系統不符

**解決方式**：

本倉庫預設 Git 路徑為：`C:\Program Files\Git\cmd\git.exe`

如果您的 Git 安裝在其他位置，請修改 `User/settings.json`：

```json
{
  "git.path": "C:\\你的Git路徑\\cmd\\git.exe"
}
```

或者移除此設定，讓 VS Code 自動偵測 Git。

### 問題 6：Gemini 專案 ID 錯誤

**症狀**：Gemini Code Assist 無法連線或顯示專案錯誤

**解決方式**：

本倉庫包含我的個人 Gemini 專案 ID：`circular-nebula-bzbbb`

請修改 `User/settings.json` 為您自己的專案 ID：

```json
{
  "geminicodeassist.project": "your-project-id"
}
```

或者移除此行，讓 Gemini 擴充套件自動設定。

---

## 📂 倉庫結構

```
VSCode-Config/
├── User/                          # VS Code 使用者設定
│   ├── settings.json             # 編輯器設定
│   ├── keybindings.json          # 快速鍵綁定
│   └── snippets/                  # 程式碼片段（目前為空）
├── extensions.txt                 # 35 個擴充套件清單
├── deploy-vscode.bat             # Windows 批次部署腳本
├── deploy-vscode-insiders.bat    # VS Code Insiders 部署腳本
├── backup-current-settings.bat   # 反向備份腳本
├── README.md                      # 本檔案
└── .gitignore                     # Git 忽略規則
```

---

## 🔐 安全性說明

### 私人倉庫

- ⚠️ **本倉庫為私人倉庫**，包含個人化設定
- ⚠️ 可能包含敏感資訊（專案路徑、個人 ID 等）
- ⚠️ 請勿公開此倉庫

### 建議檢查項目

部署前建議檢查並移除以下敏感資訊：

- `geminicodeassist.project` - Gemini 專案 ID
- `git.path` - Git 安裝路徑（可能包含使用者名稱）
- 任何包含個人資訊的設定

---

## 📄 授權

本倉庫為個人使用配置，僅供參考。

---

## 🔗 相關連結

- [VS Code 官方文件](https://code.visualstudio.com/docs)
- [VS Code 擴充套件市集](https://marketplace.visualstudio.com/)
- [Nerd Fonts](https://www.nerdfonts.com/)
- [GitHub Copilot](https://github.com/features/copilot)
- [Claude Code](https://www.anthropic.com/)

---

## 📝 更新日誌

### 2025-10-23
- ✨ 初始版本
- 📦 包含 35 個擴充套件
- 🎨 設定 JetBrainsMono Nerd Font
- 🤖 整合 6 個 AI 助手
- ❌ 移除 WSL 相關設定（非必要）

---

**最後更新**：2025-10-23
**維護者**：chicago (moonking60144-collab)
