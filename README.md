# config — 個人 Agent 與開發環境設定包

> 換新電腦 / 新公司時，clone 下來跑一個腳本，就還原我的 AI agent 行為習慣（Claude Code、Codex）與 VS Code 開發環境。

可攜的「設定」進版控；憑證、帳號狀態、機器特定路徑一律排除。**本 repo 為私人 repo。**

---

## 快速開始

```powershell
git clone https://github.com/moonking60144-collab/config.git
cd config
pwsh -File deploy.ps1
```

PowerShell 5.1 沒有 `pwsh` 時：

```powershell
powershell -ExecutionPolicy Bypass -File deploy.ps1
```

`deploy.ps1` 會：把設定還原到正確路徑、探測本機硬體生成 `~/.claude/profile.md`、安裝 VS Code 擴充套件，並備份被覆蓋的既有檔（`*.bak.<時間戳>`）。

---

## 倉庫結構

```
config/
├── deploy.ps1                   # 主部署：repo -> 本機
├── backup.ps1                   # 反向同步：本機 -> repo
├── claude/                      # Claude Code
│   ├── CLAUDE.md                #   可攜核心（行為準則 + 程式撰寫準則 + 語言/身份偏好）
│   ├── profile.example.md       #   機器 profile 範本（硬體/OS/工具/常用指令）
│   ├── settings.json            #   user settings（hook 路徑用 __USERPROFILE__ 佔位）
│   └── hooks/
│       └── check-traditional.ps1#   Stop hook：偵測回覆含簡體字就擋下要求改繁體
├── codex/
│   └── config.toml              # Codex CLI 可攜偏好（已剔除機器特定的 node_repl 等）
└── vscode/
    ├── settings.json            # 合併後的 VS Code 設定（GCP 專案 ID 已佔位）
    ├── keybindings.json
    └── extensions.txt           # 目前實際安裝的擴充套件清單
```

---

## 各部分說明

### Claude Code（`claude/`）

| 檔案 | 部署目標 | 說明 |
|------|----------|------|
| `CLAUDE.md` | `~/.claude/CLAUDE.md` | user-level global memory，不論工作目錄在哪都載入 |
| `settings.json` | `~/.claude/settings.json` | 權限模式、effort 等級、Stop hook |
| `hooks/check-traditional.ps1` | `~/.claude/hooks/` | 繁體中文檢查 hook |
| （生成）`profile.md` | `~/.claude/profile.md` | deploy 探測本機硬體生成，被 `CLAUDE.md` 以 `@import` 載入 |

**CLAUDE.md 為什麼拆兩份**：行為準則 / 程式準則是跨機器的習慣（可攜）；硬體規格、OS、工具版本是機器特定的，換機器就變。所以 `CLAUDE.md` 只放可攜核心，末尾用官方 `@~/.claude/profile.md` 把機器 profile 分檔 import 進來。換機器時 deploy 會探測新機硬體重新生成 profile，不需手改規範。

> 首次啟動 Claude Code 會跳出 import 批准對話，按核准即可。

### Codex（`codex/`）

`config.toml` 只保留可攜偏好（`developer_instructions`、model 選擇、sandbox/approval 策略、features、agents 等）。已**剔除**機器特定 / 自動生成的內容：

- `[mcp_servers.node_repl]` — Codex 首次啟動自行生成，command 指向 `bin\<版本 hash>\node_repl.exe`，每次更新就變。
- `[marketplaces.*]` 的 local source、`[desktop.open-in-target-preferences.perPath]` 的絕對路徑。

部署目標 `~/.codex/config.toml`，**預設不覆蓋既有檔**（避免蓋掉現機的 node_repl）；要覆蓋用 `pwsh -File deploy.ps1 -ForceCodex`。

### VS Code（`vscode/`）

`settings.json` 是本機與舊 repo 版本「合併」後的結果（兩邊各有獨有設定，直接覆蓋會掉設定）。`geminicodeassist.project` 已換成佔位字串 `your-gcp-project-id`，部署後請改回自己的 GCP 專案 ID。

部署目標 `%APPDATA%\Code\User\`。擴充套件以 `extensions.txt` 為準逐一安裝（`code --install-extension`）。

---

## 在某臺機器調整後同步回 repo

```powershell
pwsh -File backup.ps1
git diff          # 檢視變更
git add -A
git commit -m "更新設定"
git push
```

`backup.ps1` 會把本機的 `CLAUDE.md` / settings / hooks / VS Code 設定回寫到 repo，並自動把 hook 絕對路徑、GCP 專案 ID 還原成佔位符。Codex `config.toml` 與 `profile.md` 含機器特定內容，不自動回寫。

---

## 安全性

`.gitignore` 擋掉憑證與帳號狀態（即使誤把 `~/.claude`、`~/.codex` 複製進來也不會被提交）：

- `.credentials.json`（Claude OAuth）、`auth.json`（Codex / ChatGPT OAuth）
- `.claude.json`（email、帳號 UUID、referral code、專案歷史）
- `.env` / `*.env`、`.sandbox-secrets/`
- `claude/profile.md`（機器特定硬體 profile）

進版控的設定檔已確認無明文 API key / token。
