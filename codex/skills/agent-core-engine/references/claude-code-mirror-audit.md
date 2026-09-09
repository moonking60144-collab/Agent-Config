# Claude Code 鏡像審計

最近審計日期：2026-06-30。

## 來源範圍

- `tanbiralam/claude-code`，revision `6f6f12b37f529488b10e53928dd5508bb93535c7`.
- `starkdcc/claude-code-original-src`，revision `cd17021a7ebdf403a67df707ac02f6bf27b6c993`.
- `nirholas/claude-code`，revision `0252b1cc4381ea33ceb8d567c01cb8922a0229ef`.
- `tanbiralam` 與 `starkdcc` 共用 `1902` 條 `src/` 路徑；共用集合的 300 檔 hash 抽樣完全一致。
- `tanbiralam` 有 `92` 個 A-only `src/` 檔案。相關新增包含 SDK／control 生成型別、延遲工具／runtime 型別、task／monitor 工具、內建 Claude API 文件 skills、verification skill 文件與數種內部工具型別。
- `nirholas` 目前只有內容為 `# Fresh Start` 的 `README.md`；不可作為實作證據。

## 整合對照表

| 領域 | 來源路徑 | 可重用重點 | 整合狀態 |
| --- | --- | --- | --- |
| Query 生命週期 | `src/QueryEngine.ts`, `src/query/config.ts`, `src/query/deps.ts`, `src/query/stopHooks.ts`, `src/Task.ts` | 擷取不可變 query config，以窄依賴注入提高可測試性，保留 stop-hook 阻止續行的狀態，明確處理 abort 與失去 owner 的權限請求。 | 已在 SKILL.md 納入 query 生命週期與控制／事件指引。 |
| 工具契約 | `src/Tool.ts`, `src/tools.ts`, concrete tools under `src/tools/` | 工具為 typed object，包含 schema、permission、唯讀／並行／破壞性 metadata、中斷行為、最大結果大小、可觀測輸入補填、strict mode 與 fail-closed 預設。 | 已有涵蓋；擴充 classifier 與 API-input 不可變說明。 |
| 延遲工具 schema | `src/tools/ToolSearchTool/prompt.ts`, `src/tools/ToolSearchTool/ToolSearchTool.ts`, `src/Tool.ts` | 大型 registry 可延遲完整 schema。Discovery tool 支援精確 select: 與有上限的關鍵字搜尋，alwaysLoad 則讓關鍵工具在 turn 1 可見。 | 已新增「延遲載入工具 Schema 契約」。 |
| Hook 契約 | `src/schemas/hooks.ts`, `src/utils/hooks.ts`, `src/utils/settings/types.ts` | Hooks 需要 schema、timeout、非同步／背景模式、阻塞決策、stdout／stderr／exit 處理、matcher 正規化，以及不同的 stop／failure／compact／session events。 | 已有涵蓋；除來源對照表外未新增修補。 |
| Bash 權限安全 | `src/tools/BashTool/bashPermissions.ts`, `src/tools/BashTool/readOnlyValidation.ts`, `src/tools/BashTool/pathValidation.ts`, `src/tools/BashTool/bashSecurity.ts` | 權限比對以理解 parser 的路徑剝除 wrappers／env vars，deny／ask 比 allow 更嚴格，驗證路徑／重新導向／Git 邊界情況；解析歧義時 fail closed。 | 已新增「Shell 權限契約」。 |
| PowerShell 權限安全 | `src/tools/PowerShellTool/PowerShellTool.tsx`, `src/tools/PowerShellTool/readOnlyValidation.ts`, `src/tools/PowerShellTool/pathValidation.ts`, `src/tools/PowerShellTool/powershellPermissions.ts`, `src/tools/PowerShellTool/gitSafety.ts` | PowerShell 需要自己的 AST／security flags。拒絕 script blocks、subexpressions、splatting、member／static invocation、assignments、stop-parsing、UNC、providers、會改 cwd 的複合命令與不安全 pipeline args。 | 已新增「Shell 權限契約」；修正先前只涵蓋 Bash 的描述。 |
| 工具結果儲存 | `src/utils/toolResultStorage.ts`, shell tools' `mapToolResultToToolResultBlockParam` usage | 個別工具持久化不足。彙總 user-message 預算須分組正規化 tool results、保存精確替換字串、依 tool_use_id 凍結決策，並於 resume 重建。 | 已新增「工具結果預算契約」。 |
| 壓縮流程 | `src/commands/compact/compact.ts`, `src/services/compact/compact.ts`, `src/services/compact/microCompact.ts`, `src/services/compact/sessionMemoryCompact.ts`, `src/services/compact/postCompactCleanup.ts`, `src/services/compact/autoCompact.ts` | 手動 compact 先嘗試 session memory，再於摘要前 microcompact；PTL retry 裁剪最舊 context；壓縮後恢復 files／skills／plan 並清除失效快取。 | 大多已有涵蓋；已修正來源清單。 |
| API microcompact | `src/services/compact/apiMicrocompact.ts`, `src/services/compact/grouping.ts`, `src/services/compact/timeBasedMCConfig.ts`, `src/services/compact/microCompact.ts` | Cache-hot 壓縮可只做 API cache edits 而不改本地 transcript；cache-cold／時間型壓縮會修改 prompt。依 API round／assistant response id 分組，不依使用者 turn。時間型壓縮應限 main thread、依 TTL 間隔觸發，至少保留一個近期 round。 | 已加入詳細「Context 壓縮契約」指引。 |
| Session-memory 壓縮 | `src/services/compact/sessionMemoryCompact.ts`, `src/services/compact/prompt.ts` | 須等待擷取，保留 tool_use／tool_result 與同 message id assistant chunks 的 API 不變條件，過濾舊 compact 邊界；摘要／token 門檻無助益時 fallback。摘要模型 prompt 應明確禁止工具呼叫。 | 已加入詳細「Context 壓縮契約」指引。 |
| 壓縮後清理 | `src/services/compact/postCompactCleanup.ts`, `src/services/compact/autoCompact.ts` | Module-level state 共用，清理須區分 main thread 與 subagent 壓縮；跨 compaction 不重設已呼叫 skill 內容。Autocompact 需要預留輸出 tokens、feature／source gates 與連續失敗斷路器。 | 已加入清理範圍說明。 |
| Reactive compact 限制 | `src/commands/compact/compact.ts`, `src/services/compact/autoCompact.ts` | 呼叫點引用受 feature gate 控制的 reactive compact 路徑，但此 checkout 沒有 src/services/compact/reactiveCompact.ts。 | 不引用缺檔作實作證據。 |
| Transcript／resume | `src/utils/sessionStorage.ts`, `src/cli/transports/ccrClient.ts`, `src/cli/print.ts`, `src/bootstrap/state.ts`, `src/entrypoints/sdk/coreSchemas.ts` | Resume 依賴 append-only 紀錄、compact 邊界、保留片段重新連結、parent links、內容替換 entries、metadata 重新追加與有效率的尾端／邊界掃描。 | 已有涵蓋；擴充控制／事件 schema。 |
| Resume 邊界情況 | `src/utils/sessionStorage.ts` | Compaction／退出後在尾端重新追加 metadata；尾端掃描更新可變 metadata；驗證 tail-to-head chain 才重新連結保留片段；過期 usage 歸零；重播 snip removals；依 assistant message.id 恢復並行工具結果 siblings。 | 已加入詳細「Transcript 持久化契約」指引。 |
| 控制／SDK schema | `src/entrypoints/sdk/coreSchemas.ts`, `src/entrypoints/sdk/controlSchemas.ts`, generated SDK type files | Wire events 應具型別：user／assistant／system／result／status／rate-limit／compact boundary、parent_tool_use_id、session_id、uuid、permission denials、init metadata。 | 已新增「控制／事件 Schema 契約」。 |
| 多 agent 協調 | `src/tools/AgentTool/*`, `src/utils/swarm/*`, `src/utils/teammateMailbox.ts`, `src/utils/swarm/permissionSync.ts` | Workers 需要各自 identity／cwd／tool pool／permission context；權限提示可經 leader UI 或 mailbox；mailbox 訊息須具型別且可安全並行；resume 需要隔離 metadata。 | 已新增「多 Agent 協調契約」。 |
| Agent 定義檔案 | `src/tools/AgentTool/loadAgentsDir.ts`, `src/tools/AgentTool/prompt.ts`, `src/tools/AgentTool/agentToolUtils.ts` | 自訂 agent 格式應逐欄驗證、安全略過非 agent 文件，支援 allow／deny 工具規則、來源優先序、MCP 要求、memory／tool 注入、背景／前景語意與隔離／fork context。 | 已新增「Agent 定義契約」。 |
| Skill 套件與呼叫 | `src/skills/bundledSkills.ts`, `src/skills/loadSkillsDir.ts`, `src/tools/SkillTool/SkillTool.ts`, `src/tools/SkillTool/prompt.ts`, `src/skills/mcpSkillBuilders.ts` | Skills 應有窄 frontmatter schema、附路徑防護的延遲 bundled 檔案解出、條件 path 啟用、以 realpath 去重的動態探索、清單預算、安全屬性權限審查與 inline／fork 呼叫模式。 | 已新增「Skill 套件契約」。 |
| 內建工作流 skills | `src/skills/bundled/batch.ts`, `src/skills/bundled/skillify.ts`, `src/skills/bundled/simplify.ts`, `src/skills/bundled/remember.ts`, `src/skills/bundled/updateConfig.ts` | 可用流程模式：平行 agent 前先定義 e2e 步驟；以成功條件與最少工具提煉可重複工作流；從重用／品質／效率審查；寫記憶前先提清理建議；由實際 runtime schema 生成設定 schemas。 | 已部分納入流程指引；刻意不複製自動 commit／push 行為。 |
| 記憶系統 | `src/memdir/memoryTypes.ts`, `src/memdir/findRelevantMemories.ts`, `src/memdir/memdir.ts`, `src/services/extractMemories/prompts.ts`, `src/services/autoDream/*` | 持久記憶需要封閉分類、明確禁止保存清單、索引／主題分離、相關性前置篩選、行動前漂移驗證、安全 memory 目錄驗證、以讀取為主的擷取權限與受控整併。 | 已新增「持久記憶契約」；全域 AGENTS 只放行為規則。 |
| Session 任務 | `src/tools/TodoWriteTool/*`, `src/tools/TaskCreateTool/*`, `src/tools/TaskUpdateTool/prompt.ts`, `src/utils/todo/types.ts` | 任務清單是目前 session 控制狀態，不是記憶。3 步以上使用、維持恰好一項進行中任務、不把部分／失敗工作標完成；team 附依賴／owners，多步計畫納入驗證。 | 已新增「Session 任務契約」。 |
| 串流執行器 | `src/services/tools/StreamingToolExecutor.ts`, `src/services/tools/toolExecution.ts`, `src/services/toolUseSummary/toolUseSummaryGenerator.ts` | 先解析輸入再分類並行安全性；安全工具只能與安全工具並行，不安全工具獨占；依模型順序緩衝結果但允許進度事件；讀取失敗不取消 siblings；不變條件失敗產生合成 tool_result errors。 | 已新增「串流工具執行契約」。 |
| 權限規則整理 | `src/utils/permissions/permissionRuleParser.ts`, `src/utils/permissions/shadowedRuleDetection.ts`, `src/utils/permissions/PermissionRule.ts` | 權限規則需要正規化舊工具名稱、解析 escaped 規則內容並偵測遮蔽，避免整項工具的 ask／deny 靜默使特定 allow 不可達。 | 已加入「Shell 權限契約」。 |
| 輸入佇列處理 | `src/utils/queueProcessor.ts` | 佇列 slash／bash 命令應逐一隔離執行；一般 prompts 只在同模式才批次；main-thread 佇列處理不得被送往 subagent 的訊息拖住。 | 已加入 task／runtime 指引。 |
| A-only 內建文件 skills | `src/skills/bundled/claude-api/*`, `src/skills/bundled/verify/*` | 可作產品文件套件範例，不作 Codex 全域行為。 | 未整合；需要另行決定 skill／內容。 |
| A-only UI／工具 | `src/components/*`, `src/ink/*`, `src/tools/WebBrowserTool/*`, `src/tools/MonitorTool/*`, `src/tools/WorkflowTool/*` | 主要為產品 UI、runtime 專屬工具或內部功能介面。 | 刻意排除，除非未來 Codex 功能要求該精確工具介面。 |

## 尚可深入的候選

下列項目不阻塞目前全域 Codex 設定，但也不能聲稱已「完全挖掘完畢」：

- `src/services/contextCollapse/*`：可能只有建立細粒度 context log／commit engine 時才有價值，目前全域 Codex 設定不需要。
- `src/services/settingsSync/*` 與完整設定驗證樹：只有建立本地 config schema／checker skill 時才整合。
- A-only 內建 `claude-api` 文件 skill：只有目標是本地 API 參考 skill 才整合，不作 agent-core 行為。
- Runtime 專屬 UI／statusline／monitor／browser 介面仍刻意排除，除非使用者要求該精確產品介面。
