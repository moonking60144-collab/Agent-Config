# Agent Workflow

## 架構

```mermaid
flowchart TB
    R["Config Repo<br/>規則與可攜設定"] --> C["Codex<br/>AGENTS.md + Skills"]
    R --> A["Claude Code<br/>CLAUDE.md + Skills + Hooks"]
    R --> V["VS Code<br/>編輯器設定"]
    C --> S["依任務選擇<br/>Lite / Project / Review"]
    S --> E["共用驗證契約"]
    S -. "需要持久協調" .-> P["Project Ledger<br/>進度與交接"]
    A --> T["專案工具與實際入口驗證"]
    E --> O["結果、證據與未解邊界"]
    T --> O
```

- **Lite**：範圍明確的修改；**Project**：需要持久進度與交接；**Review**：唯讀、問題優先。
- 保存進度與驗證強度分開：一般 Project 可用原生檢查結案；共享狀態、ownership、非同步恢復或明示契約才要求嚴格 runner。新 completion v4 保存層級決策，舊契約維持既有要求。
- 續接以明確的 session／ledger 綁定為準；同 repo 的最新紀錄只作候選，不自動接管目前任務。
- 架構、非同步收斂、互動效能等細節依風險載入，不讓每個任務承擔整份檢查表。
- Codex 與 Claude 的 8 個 skills 共用 `codex/skills/` 來源；Claude 部署時適配路徑與 hooks，兩邊的模型、工具與 ledger 分開。task-handoff 本身寫了兩邊的做法，部署時不改寫。
- 通用工程判斷集中於上述規則與 skills；重複的 `karpathy-guidelines` 不另行部署。純探索／審查子 agent 關閉 apps、plugins、memories 與權限請求工具；檔案權限仍繼承主 session，安裝及寫入驗證由主 agent 執行。

## 順序

```mermaid
flowchart LR
    A["需求與授權"] --> B["定位入口<br/>資料流與影響範圍"]
    B --> C["選擇足夠簡單的方案"]
    C --> D["實作或唯讀審查"]
    D --> E["依主張驗證"]
    E --> F["交付證據與限制"]
    E -. "反例或失敗" .-> B
```

這是判斷順序，不是固定儀式；簡單任務不因步驟數而升級流程。

## 核心工程判斷

驗證 runner 需要 Node.js、Git 與 ripgrep 可執行檔；macOS 使用 `brew install ripgrep`，非標準安裝位置可用 `VERIFICATION_RG` 指定絕對路徑。App 內附工具或 shell function 不代表其他啟動環境也能使用。

- 交代關鍵依據與必要推導，深度依問題調整，不強制固定模板。
- **降低複雜度**：增加共享狀態或抽象前，考慮更簡單的方案。
- **依契約隔離失敗**：無關資料不阻擋有效操作，但未知資料不能直接略過，也不能破壞原子性。
- **測試隨契約收斂**：驗證真實入口與可觀察結果，淘汰只綁舊實作的測試，不只持續疊加。
- **證據優先於自述**：unit、跨層、runtime、遠端 CI 各自支持不同主張；沒有測到的範圍不宣稱成功。
- **維護**：事故先查既有規則與 repo enforcement；重複或已被程式承接的規則，合併或刪除。

## 實作入口

| 想看什麼 | 入口 |
|---|---|
| 常駐協作規則 | [Codex](codex/AGENTS.md) · [Claude](claude/CLAUDE.md) |
| 架構取捨與驗證方法 | [Architecture](codex/skills/agent-core-lite/references/architecture-preflight.md) · [Verification](codex/skills/agent-core-lite/references/verification.md) |
| 長任務與交接 | [Project skill](codex/skills/agent-core-project/SKILL.md) · [Task handoff](codex/skills/task-handoff/SKILL.md)：開同名、同模型的新 task 接手，確認後封存目前 task；Claude 桌面版有 `start_session` 時同樣開新 session，沒有或來源在 worktree 裡時改在原 session 清除對話，由 [handoff hook](claude/hooks/resume-handoff.mjs) 帶入交接內容 |
| UI 設計查詢與跨頁規範 | [Frontend + UI UX Pro Max](codex/skills/frontend-ui-designer/references/ui-ux-pro-max.md) |
| 規則如何演進 | [Config governance](AGENTS.md) · [介入紀錄](INTERVENTIONS.md) |
| 回合結論檢查 | [claim-check mod](claude/plugins/claim-check/hooks/register.ts)：回答送出後用次一級模型檢查結論是否超出工具證據；超出證據與矛盾在下一輪交給 Claude 查證，會影響判斷的錯誤才明確更正，屬事後校正、不是送出前攔截；不顯示給使用者，檢查沒完成時才通知 |

部署：[Codex](scripts/deploy-codex.mjs) · [Claude](scripts/deploy-claude.mjs) · [完整環境](deploy.ps1)。
Codex 設定部署只查找已安裝的 Serena，使用 `codex` context，不安裝／升級工具、不遷移其他專案；首次部署未找到 Serena 時略過該 MCP 區段。既有 `config.toml` 預設保留，設定遷移須另做精準修改與驗收，不用整份覆蓋保留模型及本機選項。Claude 的舊數值用詞 hook 已退役，部署會清理舊註冊與檔案。
檢查：[Codex validator](scripts/validate-codex.mjs) · [routing eval](scripts/run-codex-evals.mjs)。Push 前由 [pre-push hook](.githooks/pre-push) 執行 Node 測試、validator 與 Python 測試；本機有列出 `plugin test` 的 Claude Code build 時也跑 mod 測試，找不到就印出略過訊息後放行；新 clone 先執行 `git config core.hooksPath .githooks` 啟用。

Routing eval 用 `--codex-bin "/path/to/codex"` 指定實際使用的 Desktop／IDE／CLI 執行檔；未指定時解析 PATH。版本查詢與測試共用同一支執行檔，artifact 記錄其絕對路徑與版本。這層驗證 routing classifier，App 操作及原生 skill 啟用另行驗收。

Claude mod 從本 repo 的 marketplace 安裝，需在終端機執行。以資料夾加入的 marketplace 會直接從 repo 資料夾讀取 plugin（`claude plugin list` 的 Read from 是 repo 路徑），修改後 `/reload-plugins` 或重開 session 即生效。檢查紀錄寫在 `~/.claude/workflow/claim-check/<session>.jsonl`。

```text
claude plugin marketplace add <本 repo 路徑>
claude plugin install claim-check@agent-config
```

其他機器也可用 `/plugin install claim-check --marketplace moonking60144-collab/Agent-Config` 從 GitHub 安裝。
