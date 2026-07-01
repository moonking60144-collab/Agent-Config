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

`deploy.ps1` 會：把設定還原到正確路徑、探測本機硬體生成 `~/.claude/profile.md`、安裝 VS Code 擴充套件，並備份被覆蓋的既有檔（`*.bak.<時間戳>`）。Codex skill 目錄的備份會移到 `~/.codex/backups/skills/`，避免 `.bak.*` 目錄被 Codex 當成可用 skill 掃入清單。

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
│   ├── AGENTS.md                #   Codex user-level 全域規則
│   ├── config.toml              #   Codex CLI 可攜偏好（已剔除機器特定的 node_repl 等）
│   ├── model-catalog.json       #   Codex model catalog snapshot（預設不由 config.toml 引用）
│   ├── compact-prompts/         #   context compaction prompt 實驗檔
│   ├── profiles/                #   Codex profile 檔，部署到 ~/.codex/*.config.toml
│   └── skills/
│       ├── review/              #   issue-first 審查準則
│       ├── agent-failure-debugging/ # 重複失敗時的 capture / diagnosis / 最小恢復流程
│       ├── repo-onboarding-audit/   # 陌生 repo 的 read-only 偵查與架構盤點流程
│       └── agent-core-engine/       # custom agent runtime / tool loop / compactor 設計準則
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

`AGENTS.md` 部署到 `~/.codex/AGENTS.md`，作為 Codex user-level 全域規則；目前主要保存 Windows / WSL 路徑歸屬規則，避免 agent 因 shell 環境誤判目標檔案系統。

`skills/` 部署到 `~/.codex/skills/`。目前 repo 管理四個 Codex skills：

| Skill | 使用時機 | 重點 |
|-------|----------|------|
| `review` | 使用者要求 review、audit、inspect、PR/diff/branch review、architecture/integration/system review | issue-first 審查，先列 bugs、回歸、安全、測試與部署風險 |
| `agent-failure-debugging` | 同一錯誤或假設失敗出現兩次、tool loop 形成、config 改了但 runtime 沒生效、輸出宣稱和實際狀態不一致 | 先記錄 task goal、最後成功步驟、失敗工具/指令、重複模式、環境假設，再分類 root cause，選最小可逆驗證動作 |
| `repo-onboarding-audit` | 進陌生 repo、開始 review/architecture audit 前缺上下文、要先盤點 stack、entry point、test surface 或 validation commands | 唯讀偵查 package manifest、framework fingerprint、entry points、top-level tree、tooling、tests、資料流、conventions、git history |
| `agent-core-engine` | 設計、實作、審查或擴充 custom agent runtime、tool loop、compactor、retry engine | 將 agent core 做成 deterministic lifecycle，並提供可複製的 TypeScript skeleton |

`deploy.ps1` 只同步 repo 內存在的 skill 目錄，並會把既有 `~/.codex/skills/*.bak.*` 備份移出 skill registry；`backup.ps1` 也只回寫 repo 已管理的 skill，避免把系統、外掛 cache 或備份目錄掃進版控。

`config.toml` 只保留可攜偏好（`developer_instructions`、model 選擇、sandbox/approval 策略、features、agents 等）。目前不啟用 `model_catalog_json` override，讓 Codex 使用官方 / server 端 catalog。已**剔除**機器特定 / 自動生成的內容：

- `[mcp_servers.node_repl]` — Codex 首次啟動自行生成，command 指向 `bin\<版本 hash>\node_repl.exe`，每次更新就變。
- `[marketplaces.*]` 的 local source、`[desktop.open-in-target-preferences.perPath]` 的絕對路徑。

`config.toml` 部署目標是 `~/.codex/config.toml`，**預設不覆蓋既有檔**（避免蓋掉現機的 node_repl）；要覆蓋用 `pwsh -File deploy.ps1 -ForceCodex`。`AGENTS.md` 與 repo 管理的 `skills/` 不含機器特定 runtime 路徑，部署時會先備份再覆蓋；skill 備份不放在 `~/.codex/skills/` 底下，避免重複出現在 Codex skill picker。

目前 repo 版 Codex 預設以 `gpt-5.5` 為主，不啟用 `model_catalog_json` override；`model-catalog.json` 只保留 Codex 內建 catalog snapshot。可攜 token 行為跟隨 active `~/.codex/config.toml`：`model_context_window = 1000000`、`model_auto_compact_token_limit` 不固定、`tool_output_token_limit = 8000`。

`profiles/compact-preserve.config.toml` 是 experimental compact prompt profile。需要測 context 壓縮摘要品質時，用 `codex --profile compact-preserve`；不要先放進全域 base config。

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

`backup.ps1` 會把本機的 `CLAUDE.md` / settings / hooks / Codex `AGENTS.md` / repo 管理的 Codex skills / compact prompts / profiles / VS Code 設定回寫到 repo，並自動把 hook 絕對路徑、GCP 專案 ID 還原成佔位符。Codex `config.toml` 只回寫可攜模型 / token 行為 key，避免把 `notify`、`projects.*`、本機絕對路徑等機器特定內容帶進 repo；`profile.md` 含機器特定內容，不自動回寫。

---

## 安全性

`.gitignore` 擋掉憑證與帳號狀態（即使誤把 `~/.claude`、`~/.codex` 複製進來也不會被提交）：

- `.credentials.json`（Claude OAuth）、`auth.json`（Codex / ChatGPT OAuth）
- `.claude.json`（email、帳號 UUID、referral code、專案歷史）
- `.env` / `*.env`、`.sandbox-secrets/`
- `claude/profile.md`（機器特定硬體 profile）

進版控的設定檔已確認無明文 API key / token。
