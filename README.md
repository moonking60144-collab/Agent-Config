# config — 個人 Agent 與開發環境設定包

> 換新電腦 / 新公司時，clone 下來跑一個腳本，就還原我的 AI agent 行為習慣（Claude Code、Codex）與 VS Code 開發環境。

可攜的「設定」進版控；憑證、帳號狀態、機器特定路徑一律排除。**本 repo 為私人 repo。**

---

## 快速開始

Codex 設定的 canonical deploy／validate 使用 Node.js，Windows、macOS、Linux 共用同一實作：

    node scripts/deploy-codex.mjs
    node scripts/validate-codex.mjs

只要部署 Codex，不需要 PowerShell。`validate-codex.mjs` 需要 Python 3.11+ 的 `tomllib`；fresh／`--force-config` 部署另需要 `uv` 與 `npx`，並會安裝或升級 stable Serena。完整部署 Claude、Codex 與 VS Code 時仍可使用 PowerShell；`deploy.ps1` 的 Codex 段會呼叫同一個 Node deployer，避免兩套邏輯漂移。完整部署需要 Git 與 Node.js，macOS／Linux 另需 PowerShell 7。

Codex hooks 會在每次 `SessionStart` 記錄 observed standard instruction/config digests 與當下 ledger baseline；若已找到 unfinished ledger，另把它綁定到 session。`Stop` 會檢查 session-bound ledger，以及 baseline 後新增、重新完成或內容／completion contract 已改變的 complete ledgers。這些 digest 不是 Codex 實際載入 instruction chain 的完整證明。Hook 定義變更後，Codex 會依 hash 要求重新信任；請在支援 hook 管理的介面檢查並信任本 repo 部署的 user-level hooks。未信任前 hook 會被跳過，不得宣稱 provenance 或 completion guard 已生效。

```powershell
git clone https://github.com/moonking60144-collab/config.git
cd config
pwsh -File deploy.ps1
```

Windows PowerShell 5.1 沒有 `pwsh` 時：

```powershell
powershell -ExecutionPolicy Bypass -File deploy.ps1
```

要覆蓋既有 Codex config 時：

```powershell
pwsh -File deploy.ps1 -ForceCodex
```

`deploy.ps1` 會：依目前 OS 展開路徑與 command，把設定還原到正確位置、探測本機硬體生成 `~/.claude/profile.md`、安裝 VS Code 擴充套件，並備份被覆蓋的既有檔。Claude 備份集中在 `~/.claude/backups/deploy-claude/`，其他目標沿用 `*.bak.<時間戳>`；每個目標預設保留最近 5 份備份，可用 `-BackupRetention` 調整，設為 `0` 可停用清理。Codex skill 目錄的備份會移到 `~/.codex/backups/skills/`，避免 `.bak.*` 目錄被 Codex 當成可用 skill 掃入清單。

跨平台部署目標：

| 項目 | Windows | macOS | Linux |
|------|---------|-------|-------|
| Claude / Codex | `~/.claude` / `~/.codex` | `~/.claude` / `~/.codex` | `~/.claude` / `~/.codex` |
| VS Code User | `%APPDATA%\Code\User` | `~/Library/Application Support/Code/User` | `~/.config/Code/User` |
| Claude hook | `node ... check-traditional.mjs` | `node ... check-traditional.mjs` | `node ... check-traditional.mjs` |
| Context7 MCP | `npx.cmd` / `npx` | `npx` | `npx` |
| Codex terminal | `powershell` | `zsh` | `bash` |

---

## 倉庫結構

```
config/
├── .gitattributes               # 固定跨平台文字檔換行策略
├── deploy.ps1                   # 主部署：repo -> 本機
├── backup.ps1                   # 反向同步：本機 -> repo
├── scripts/
│   ├── deploy-claude.mjs        # Claude 唯一 deployer：merge、staged write、備份與 hook 部署
│   ├── deploy-codex.mjs         # Codex 跨平台 deployer：backup、staging、失敗回復
│   ├── validate-codex.mjs       # Codex 跨平台 repo／active 驗證
│   ├── run-codex-evals.mjs      # 無依賴 Codex routing eval runner
│   └── validate-config.ps1      # 完整設定與 Context7 驗證；Codex 可改用 Node validator
├── claude/                      # Claude Code
│   ├── CLAUDE.md                #   可攜核心（行為準則 + 程式撰寫準則 + 語言/身份偏好）
│   ├── profile.example.md       #   機器 profile 範本（硬體/OS/工具/常用指令）
│   ├── settings.json            #   user settings（hook command 由 deploy 依 OS 展開）
│   └── hooks/
│       └── check-traditional.mjs #  Stop hook：偵測回覆含簡體字就擋下要求改繁體
├── codex/
│   ├── AGENTS.md                #   Codex user-level 全域規則
│   ├── config.toml              #   Codex CLI 可攜偏好（已剔除機器特定的 node_repl 等）
│   ├── evals/
│   │   ├── workflow-routing.cases.jsonl # versioned routing / boundary / historical cases
│   │   └── workflow-routing.output.schema.json # schema-constrained eval result
│   ├── compact-prompts/         #   context compaction prompt 實驗檔
│   ├── profiles/                #   Codex profile 檔，部署到 ~/.codex/*.config.toml
│   └── skills/
│       ├── review/              #   issue-first 審查準則
│       ├── agent-core-lite/      #   日常跨檔、同步、驗證、commit/push 工作流程
│       ├── agent-core-project/   #   長任務 plan / ledger / resume 工作流程
│       ├── agent-failure-debugging/ # 重複失敗時的 capture / diagnosis / 最小恢復流程
│       ├── repo-onboarding-audit/   # 陌生 repo 的 read-only 偵查與架構盤點流程
│       ├── agent-core-engine/       # custom agent runtime / tool loop / compactor 設計準則
│       └── frontend-ui-designer/    # Product Design 取向的前端視覺、prototype 與 design QA 流程
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
| `hooks/check-traditional.mjs` | `~/.claude/hooks/` | 跨平台繁體中文 Stop hook；由 Node exec form 執行 |
| （生成）`profile.md` | `~/.claude/profile.md` | deploy 探測本機硬體生成，僅供本機環境盤點，不自動載入 context |

**CLAUDE.md 與 profile.md 的邊界**：行為與工程規則是跨機器的可攜核心，放在 `CLAUDE.md`；硬體規格、OS 與工具版本會隨機器改變，由 deploy 重新生成 `profile.md`。`profile.md` 不以 `@import` 常駐載入，避免機器 inventory 佔用每個 session 的 context；需要時再直接讀取。

### Codex（`codex/`）

`AGENTS.md` 部署到 `~/.codex/AGENTS.md`，作為 Codex user-level 核心契約與 native skill precedence；skill description 是候選 routing canonical。無效的 unrestricted override 與重複 dispatch table 已退役。可攜行為規則進版控，機器特定 runtime 路徑、帳號狀態與自動生成內容不放入此檔。

`skills/` 部署到 `~/.codex/skills/`。目前 repo 管理七個 Codex skills：

| Skill | 使用時機 | 重點 |
|-------|----------|------|
| `review` | 使用者要求 review、audit、inspect、PR/diff/branch review、architecture/integration/system review | issue-first 審查，先列 bugs、回歸、安全、測試與部署風險 |
| `agent-core-lite` | 一般範圍明確的跨檔實作、config/runtime mismatch、sync/deploy/commit/push | 依證據調整觀察、規劃與執行路徑，保留 scope、授權、驗證與停止條件 |
| `agent-core-project` | 跨 3+ 可獨立驗證子系統、長任務、需要 plan/ledger/resume、或高爆炸半徑變更 | 用 Intake Gate、project plan、progress ledger、`done_verified`、`next_instruction` 保證可續接與可驗證 |
| `agent-failure-debugging` | 同一錯誤或假設失敗出現兩次、tool loop 形成、config 改了但 runtime 沒生效、輸出宣稱和實際狀態不一致 | 沿用有效失敗紀錄與排除範圍，依未解缺口選最小可逆檢查或恢復，避免重複 capture 與固定排錯首步 |
| `repo-onboarding-audit` | 進陌生 repo、開始 review/architecture audit 前缺上下文、要先盤點 stack、entry point、test surface 或 validation commands | 唯讀偵查 package manifest、framework fingerprint、entry points、top-level tree、tooling、tests、資料流、conventions、git history |
| `agent-core-engine` | 設計、實作、審查或擴充 custom agent runtime、tool loop、compactor、retry engine | 將 agent core 做成 deterministic lifecycle，並提供可複製的 TypeScript skeleton |
| `frontend-ui-designer` | 新 UI、視覺改版、prototype、URL/image-to-code、landing page、dashboard、產品畫面 polish | 先鎖定 design brief 與 visual target，沿用既有 design system，補齊互動狀態、asset fidelity、responsive 與 evidence-based design QA |

`scripts/deploy-codex.mjs` 只同步 repo 內存在的 skill 目錄，會先 stage 完整目錄、備份既有 active skill，再 replacement；失敗時從新備份回復；`references/` 會隨 skill 遞迴同步。既有 `~/.codex/skills/*.bak.*` 會移出 registry。`deploy.ps1` 的 Codex 段呼叫同一 Node deployer；`backup.ps1` 仍只回寫 repo 已管理的 skill。

#### Codex workflow 架構

目前架構維持 routing、execution、verification、risk rules 四層。Lite、Project、Review 共用同一份 verification contract；Project 只增加持久進度與完成門檻，不另建測試流程。沒有新增 router、ledger 類型、workflow DAG 或完整 agent framework。

~~~mermaid
flowchart TD
  A["User request"] --> B["Native skill descriptions"]
  B --> C["AGENTS thin precedence"]
  C --> D{"Process"}
  D --> E["review / onboarding / failure-debugging"]
  D --> F["agent-core-lite / agent-core-project"]
  D --> G["agent-core-engine"]
  C --> H{"Domain when needed"}
  H --> I["frontend-ui-designer / other domain skills"]
  F --> J["Conditional preflight references"]
  E --> K["Evidence / findings"]
  J --> V["Shared discovery / oracle / checks / receipt"]
  V --> K
  V --> S["Shared completion evaluator: CLI + Stop"]
  B -.-> L["Routing classifier: classification only"]
~~~

Read-only、destructive、升降級與 historical classifier cases 維護在 codex/evals/workflow-routing.cases.jsonl。run-codex-evals.mjs 驗證 schema-constrained routing classification、repeat 與 threshold；它不宣稱 native skill body 或 conditional reference 已被 runtime 載入。

`config.toml` 只保留可攜偏好（短版 additive `developer_instructions`、reasoning/personality、sandbox/approval 策略、features、agents 等）。不設定 `model_instructions_file`，讓 GPT-5.6 與後續模型保留各自的內建 instructions，再額外載入 `AGENTS.md`。不固定 `model` 與 `review_model`：新 task 使用 Codex 當下的 recommended model，`/review` 跟隨目前 task 的模型。也不啟用或保存 `model_catalog_json` snapshot，模型清單與能力由官方 / server 端 catalog 管理。已**剔除**機器特定 / 自動生成的內容：

- `[mcp_servers.node_repl]` — Codex 首次啟動自行生成，command 指向 `bin\<版本 hash>\node_repl.exe`，每次更新就變。
- `[marketplaces.*]` 的 local source、`[desktop.open-in-target-preferences.perPath]` 的絕對路徑。

`config.toml` 部署目標是 `~/.codex/config.toml`，**預設不覆蓋既有檔**（避免蓋掉現機的 node_repl）；要覆蓋用 `pwsh -File deploy.ps1 -ForceCodex`。`AGENTS.md` 與 repo 管理的 `skills/` 不含機器特定 runtime 路徑，部署時會先備份再覆蓋；skill 備份不放在 `~/.codex/skills/` 底下，避免重複出現在 Codex skill picker。

`config.toml` 裡的 `__NPX_COMMAND__`、`__SERENA_COMMAND__`、`__SYSTEM_ROOT__`、`__CODEX_TERMINAL_SHELL__` 是跨平台 template token，不是實際部署值。`scripts/deploy-codex.mjs` 負責展開，`deploy.ps1` 只轉交參數給同一 Node deployer。它會在 Windows 展開為 `npx.cmd`、`SystemRoot`、`powershell`，在 macOS 展開為 `npx`、移除 Windows-only `SystemRoot` / WSL 開關、terminal shell 用 `zsh`。部署 Codex config 時也會透過 `uv tool install` / `uv tool upgrade` 統一使用最新 stable `serena-agent`，再把該機器的 Serena binary 路徑寫入 active config；不追蹤 GitHub `main`。部署腳本會讀取該 stable 版本自帶的 `project.template.yml`，再以 `scripts/repair-serena-project-configs.mjs` 將已註冊專案統一成相容的 `languages` 或 `language_servers` schema，避免不同版本輪流重寫後導致 `KeyError`。

目前 repo 版 Codex 不固定模型版本，避免每次模型更新都要修改 repo；Codex Desktop 寫入 active `~/.codex/config.toml` 的目前模型與 `model_reasoning_effort` 視為 runtime 狀態，不會由 `backup.ps1` 回寫 repo。`model_reasoning_summary`、`model_verbosity`、`personality` 仍屬可攜偏好。可攜 token 行為維持 `model_context_window = 372000`、`model_auto_compact_token_limit` 不固定、`tool_output_token_limit = 8000`。日常 reasoning 預設為 `xhigh`，`Max` / `Ultra` 由 task 需要時再從模型選擇器調整。

`profiles/compact-preserve.config.toml` 是 experimental compact prompt profile。需要測 context 壓縮摘要品質時，用 `codex --profile compact-preserve`；不要先放進全域 `config.toml`。

### VS Code（`vscode/`）

`settings.json` 是本機與舊 repo 版本「合併」後的結果（兩邊各有獨有設定，直接覆蓋會掉設定）。Gemini Code Assist / Gemini CLI companion 已從 managed extensions 與 settings 中移除；若單機臨時安裝，不要用 `backup.ps1 -IncludeExtensions` 回寫進 repo。

部署目標依 OS 決定：Windows 是 `%APPDATA%\Code\User\`，macOS 是 `~/Library/Application Support/Code/User`，Linux 是 `~/.config/Code/User`。擴充套件以 `extensions.txt` 為準逐一安裝（`code --install-extension`）。

### 驗證

Codex-only 跨平台驗證：

    node scripts/validate-codex.mjs

Routing-classifier contract／case 清單：

    node scripts/run-codex-evals.mjs --validate
    node scripts/run-codex-evals.mjs --list

有模型用量的 classifier smoke／完整 regression：

    node scripts/run-codex-evals.mjs --run
    node scripts/run-codex-evals.mjs --run --all

新機器尚未 deploy active Codex 時：

    node scripts/validate-codex.mjs --skip-active

完整設定與 Context7 驗證仍可執行：

```powershell
pwsh -File scripts/validate-config.ps1
```

新機器尚未部署 active 設定時可先只驗 repo：

```powershell
pwsh -File scripts/validate-config.ps1 -SkipActive
```

Node validator會檢查 repo-managed skills、TOML、hooks、routing-classifier cases 與 output schema；PowerShell validator轉交同一 Node canonical validation，避免維護第二份 Codex contract。只有明確執行 --run 才會呼叫模型並產生用量。

Project-grade ledger 使用同名 `.completion.json`，完成契約與遷移規則以 [Project skill 的 Shared Completion Contract](codex/skills/agent-core-project/SKILL.md#shared-completion-contract) 為準；[completion schema](codex/hooks/project-ledger-completion.schema.json) 管理 shape，[validator](codex/hooks/validate-project-ledger.mjs) 管理證據、artifact integrity 與 remote-check 語意。SessionStart 記錄 baseline，Stop 檢查 session-bound 與新完成／變動的 ledger，最多要求一次 continuation。Hash 不證明業務語意或 native skill activation；remoteChecks 的一手遠端結果仍需由實際 provider query 提供。治理案例及退役條件見 [evidence policy fixture](tests/fixtures/project-ledger-evidence-policy.md)。

程式變更採用 [shared verification](codex/skills/agent-core-lite/references/verification.md)：從 Git diff 的前後版本與 references 找候選 consumer，用獨立 oracle、實際 entrypoint、可重播生成／狀態序列、乾淨副本中的 sensitivity challenge 或受控效能樣本產生 receipt。CLI 與 v2/v3 completion 共用 [同一個 executable contract](codex/skills/agent-core-lite/scripts/verification-contract.mjs)，不讓版本實作互相依賴。新完成的 Project 必須有 current-source receipt，且每個 behavioral evidence 透過 `verificationChecks` 指向足以支持該層級的 check；舊完成紀錄仍可非 strict 讀取，不把歷史紀錄批次變成未完成。

```text
node codex/skills/agent-core-lite/scripts/verify-change.mjs discover --repo <scope-root> --output <external-control-dir>/discovery.json
node codex/skills/agent-core-lite/scripts/verify-change.mjs run --repo <scope-root> --plan <external-control-dir>/plan.json --output <external-control-dir>/receipt.json
node codex/skills/agent-core-lite/scripts/verify-change.mjs validate --repo <scope-root> --result <external-control-dir>/receipt.json
node codex/hooks/validate-project-ledger.mjs --ledger <ledger> --require-evidence-policy --require-verification
```

Lite 使用同一 runner，不為收據升級成 Project；純文件修改用直接檢查。無 Git HEAD 時改用 current-file snapshot，仍產生同一 receipt、通過同一 CLI／Stop，不必建立 Git repo 或跳過驗證。Control artifacts 預設放 scope 外；repo-local ledger／sidecar／receipt 必須預先 untracked 且 Git-ignored，避免 snapshot 自我相依。非 Git 目錄使用外部 control artifacts。

文字 discovery 不是完整 call graph、V8 executed-file 不是 branch／side-effect coverage，其他語言需 native trace adapter。目前 snapshot 仍拒絕 symlink、非 regular file 與超過 32 MiB 的檔案；補充 native checks 不會繞過此限制，不適用的 scope 保持未驗證，不能宣稱 strict complete。Receipt 是可重跑證據，不是 agent 誠實度認證。反例、false-positive boundary 與被替代規則見 [verification protocol fixture](tests/fixtures/verification-protocol.md)。

Canonical validator 會比較 repo 管理的可攜設定與 MCP 參數，並確認 managed MCP command 可解析至 executable；它不執行任意 active command。模型、reasoning effort、service tier、desktop／plugin 選擇、hook trust 與 project／marketplace runtime state 可與 template 不同。新增 runtime-only MCP 不回寫 repo。完整回歸測試可執行 `node --test --test-concurrency=1 tests/*.test.mjs`；測試檔涵蓋實際 Stop、批次部署回滾、active config 正反例及 verification 的生成案例、敏感度與效能負對照。效能 probe 序列化，不能用平行測試的總時間冒充效能指標。

---

## 在某臺機器調整後同步回 repo

```powershell
pwsh -File backup.ps1
git diff          # 檢視變更
git add -A
git commit -m "更新設定"
git push
```

目前 active → repo 的完整反向同步仍由 `backup.ps1` 負責；沒有 PowerShell 的 Mac 應把 repo 當 source of truth，直接修改 repo 後執行 Node deploy，不要以手動複製 active 檔案冒充 backup pipeline。

`backup.ps1` 會把本機的 `CLAUDE.md` / settings / canonical `check-traditional.mjs` hook / Codex `AGENTS.md` / repo 管理的 Codex skills / compact prompts / profiles / VS Code 設定回寫到 repo，並自動把 hook path、GCP 專案 ID 還原成佔位符。Codex `config.toml` 只回寫可攜 tool output / reasoning summary / verbosity / personality key；目前模型與 `model_reasoning_effort` 不回寫，避免單一 task 的選擇污染 repo 預設，也不會帶入 `notify`、`projects.*`、本機絕對路徑等機器特定內容。`profile.md` 含機器特定內容，不自動回寫。

VS Code extensions 清單預設不回寫，避免某臺機器的臨時擴充污染 repo。確定要更新 `vscode/extensions.txt` 時才執行：

```powershell
pwsh -File backup.ps1 -IncludeExtensions
```

---

## Checkout ownership

同一 remote 若存在多個 clone、worktree 或 submodule checkout，只指定一個長期 canonical checkout。Session／temporary clone 可用於進行中的 patch，但不得和 canonical checkout 同時累積未提交變更。Commit 前先比對 remote、branch、HEAD、upstream 與 dirty state；push 後只用 fast-forward 對齊其他 checkout。若 canonical checkout 是 parent repo 的 submodule，submodule pointer 是否更新是另一個明確決策，不與 Config commit 混為一談。

---

## 安全性

`.gitignore` 擋掉憑證與帳號狀態（即使誤把 `~/.claude`、`~/.codex` 複製進來也不會被提交）：

- `.credentials.json`（Claude OAuth）、`auth.json`（Codex / ChatGPT OAuth）
- `.claude.json`（email、帳號 UUID、referral code、專案歷史）
- `.env` / `*.env`、`.sandbox-secrets/`
- `claude/profile.md`（機器特定硬體 profile）

進版控的設定檔已確認無明文 API key / token。
