---
name: agent-core-engine
description: "只適用於設計、實作、審查或擴充自訂 agent runtime、具型別的 tick loop、tool runner、retry engine、compactor、transcript、memory 或 resume 實作。不適用於一般業務流程、Config 路由規則或應用層非同步異動。"
---

# Agent Core Engine

使用者要求建立、整合、優化或審查 agent runtime、工具迴圈、compactor、retry engine，或可用於 production 的自主 coding agent 核心時，使用此 skill。

一般 Codex 任務不預設啟用完整 runtime 範本。日常整合由 agent-core-lite 負責範圍明確的多步工作、設定／runtime 漂移、context 壓力及 commit／push；重複失敗轉交 agent-failure-debugging。只有任務涉及 agent／runtime 架構本身，才使用此完整 skill。

這是全域 Codex skill。除非使用者明確指定目前業務 repo 為 runtime 實作目標，否則不將 src/agent-core 寫入該 repo。使用者要求改善「Codex 設定」時，更新全域 AGENTS／skills／templates，不修改專案原始碼。

## 必要工作流程

任務由 Review、Lite 或 Project 負責時，本 skill 提供 runtime 專屬設計與證據要求，不取代原流程。保留唯讀 review 模式，把 findings 回交 Review；實作證據回交負責執行的 Lite plan 或 Project ledger。領域專業不免除持久化交接要求，也不授予寫入權限。

1. 先讀目標 repo 適用規範與套件／測試工具。
2. 使用者偏好、全域 runtime 規則與專案實作細節分開。
3. 將 engine 實作成確定性的生命週期，而非鬆散的模型／工具迴圈。
4. 為生命週期轉移、工具驗證、重試分類、context 壓縮與停止條件加入聚焦測試。
5. 執行目標套件涵蓋新 engine 的 typecheck／build／test 命令。

驗證方法、獨立 oracle、生成序列、敏感度與 receipt 要求使用 [Lite 共用契約](../agent-core-lite/references/verification.md)。本 skill 提供 runtime 不變條件與轉移邊界，不另維護一套證據協定。

未指定目標 repo 時，停在全域層：

1. 行為規則更新至 ~/.codex/AGENTS.md。
2. 可重用流程更新至本 skill。
3. 可複製的實作骨架更新至 templates/。
4. 回報疑似先前誤放的專案檔案，但沒有使用者明確批准就不刪除。

將 agent-core 整合到一般 Codex 行為，而非實作 runtime 時，變更維持全域層：

1. 新增或調整 agent-core-lite 的 description／內文，讓 Codex 透過 skill discovery 觸發流程。
2. AGENTS.md 保持簡短路由與不可妥協的全域政策，不放整份架構契約。
3. config.toml 只更新簡短的 skill 路由指令。
4. 本 skill 維持聚焦完整 agent／runtime 工作。
5. 未獲使用者明確要求在專案實作 runtime，不複製 templates/typescript-agent-core/ 進專案。

## 參考資料提煉

從 Claude Code 原始碼鏡像等終端 agent 鏡像學習時，只提煉可重用工程結構：

- 不可變 query／session config 與可變 tick state 分離
- 生命週期轉移原因與 transcript 重建
- 工具契約包含 schema 驗證、權限檢查、唯讀／並行／破壞性 metadata、中斷行為、timeout 與結果正規化
- 協調執行時，唯讀且可安全並行的工具有限度平行；寫入、shell 異動與外部副作用依序執行
- 串流工具執行仍按序整合 transcript
- 生命週期 hook 契約具備 typed JSON payload、有限 timeout、明確阻塞語意與 stdout／stderr 路由
- 重試分類在模型層之下處理暫時錯誤，將明確 timeout 原因轉為可重試錯誤，確定性錯誤則回傳為工具輸出
- 摘要壓縮前的多階段 context 壓縮
- Microcompaction 依 API round 分組，並區分 cache-hot／cache-cold
- 壓縮後清理因 compact 邊界失效的快取與追蹤狀態
- 僅追加的 transcript 持久化，包含 compact 邊界、保留片段重新連結，以及支援安全續接的 metadata 重新追加
- Resume 重建處理裁剪範圍、過期 usage 與並行工具結果的 sibling 節點
- Shell 安全依解析與保守 fallback，不憑字串直覺；Bash 與 PowerShell 視為不同語言
- 大型工具 registry 延遲探索 schema，同時提供精確選取與關鍵字查詢
- 大型工具輸出外存，提供模型可見預覽及重播穩定的替換紀錄
- 權限規則解析、canonical 工具名稱別名與規則遮蔽偵測
- Skill 套件載入、條件啟用、權限審查與 inline／fork 呼叫
- 持久記憶分類、相關性檢索與漂移檢查
- 本 session 任務清單具備 ownership、依賴與驗證門檻
- 多 agent worker／leader 協調，以及透過 mailbox 傳遞權限請求

忽略 UI render、產品遙測、品牌專屬行為、statusline／語音功能與照搬的內部命名。

再次審查原始碼鏡像時，先讀 references/claude-code-mirror-audit.md；修改本 skill 前，先將新的來源路徑證據更新到該檔。

## Claude Code 鏡像審計

最近審計日期：2026-06-30。

參考鏡像：

- tanbiralam/claude-code，revision 6f6f12b37f529488b10e53928dd5508bb93535c7。
- starkdcc/claude-code-original-src，revision cd17021a7ebdf403a67df707ac02f6bf27b6c993。
- nirholas/claude-code，revision 0252b1cc4381ea33ceb8d567c01cb8922a0229ef；目前樹中只有 README.md，除非日後加入原始碼，否則不能作為實作證據。

覆蓋說明：

- tanbiralam 與 starkdcc 大致是同一份 TypeScript 快照：共用 1902 條 src/ 路徑；從共用集合抽取 300 檔的 hash 樣本完全一致。較新的 A-only 檔案優先看 tanbiralam，研究 README／來源地圖看 starkdcc。
- tanbiralam 增加相關的 A-only SDK／control 檔案，例如 src/entrypoints/sdk/controlSchemas.ts、src/entrypoints/sdk/coreSchemas.ts，以及 stubbed src/query/transitions.ts。
- Query 生命週期依據來自 src/QueryEngine.ts、src/query/config.ts、src/query/deps.ts、src/query/stopHooks.ts。
- 工具契約依據來自 src/Tool.ts、src/tools.ts 及 src/tools/ 下的實際工具，尤其 BashTool、PowerShellTool、FileReadTool、FileEditTool、AgentTool、Task*Tool、ToolSearchTool。
- Hook 契約依據來自 src/schemas/hooks.ts、src/utils/hooks.ts，以及 src/utils/settings/types.ts 的設定 schema 擴充。
- 權限與 shell 安全依據來自 src/utils/permissions/*、src/tools/BashTool/*、src/tools/PowerShellTool/*、src/tools/BashTool/readOnlyValidation.ts、src/tools/PowerShellTool/readOnlyValidation.ts。
- Context 壓縮依據來自 src/commands/compact/compact.ts、src/services/compact/compact.ts、src/services/compact/microCompact.ts、src/services/compact/sessionMemoryCompact.ts、src/services/compact/postCompactCleanup.ts、src/services/compact/autoCompact.ts。src/commands/compact/compact.ts 引用受 feature gate 控制的 reactiveCompact 路徑，但審計 checkout 沒有 src/services/compact/reactiveCompact.ts，不能引用該缺檔作實作證據。
- Transcript／resume 依據來自 src/bootstrap/state.ts、src/utils/sessionStorage.ts、src/utils/toolResultStorage.ts、src/cli/transports/ccrClient.ts、src/cli/print.ts、src/entrypoints/sdk/coreSchemas.ts。
- 多 agent 權限與 mailbox 依據來自 src/utils/swarm/*、src/tools/AgentTool/*、src/utils/teammateMailbox.ts、src/utils/swarm/permissionSync.ts。
- Skill 套件依據來自 src/skills/bundledSkills.ts、src/skills/loadSkillsDir.ts、src/tools/SkillTool/*、src/skills/mcpSkillBuilders.ts。
- 持久記憶依據來自 src/memdir/*、src/services/extractMemories/*、src/services/autoDream/*。
- Session 任務依據來自 src/tools/TodoWriteTool/*、src/tools/TaskCreateTool/*、src/tools/TaskUpdateTool/prompt.ts、src/utils/todo/types.ts。
- 串流執行依據來自 src/services/tools/StreamingToolExecutor.ts、src/services/tools/toolExecution.ts、src/services/toolUseSummary/toolUseSummaryGenerator.ts。

依這些鏡像擴充本 skill 時，在修改或 commit 訊息保留來源路徑註記。nirholas 仍只有 README 時，不得聲稱它證明某項實作細節。

## 架構契約

預設 engine 結構：

```text
Observe -> Plan -> Act -> AwaitTool -> Integrate -> CheckStop -> Compact/Retry -> Next
```

每個 tick context 必須追蹤：

- iterationId 與 maxIterations
- timeBudget.startTime 與絕對 timeBudget.deadline
- tokenBudget.maxContextTokens、currentUsage 與壓縮門檻
- lastProgressMarker.workspaceHash 與 consecutiveFailures
- scratchpad
- transcript 訊息
- 待執行工具呼叫與工具結果
- 目前生命週期狀態與轉移 log

## 工具契約

工具必須透過具型別的 registry 註冊。工具定義應包含：

- 穩定的 name
- schema.parse(input) 或等效驗證
- checkPermissions(input, context) 或等效權限門檻
- isReadOnly(input)
- isConcurrencySafe(input)
- isDestructive(input)
- interruptBehavior
- timeoutMs
- maxResultSizeChars
- execute(input, context, signal)
- 將結果正規化為標準工具訊息

預設必須 fail closed：

- 未明確宣告，就不視為可安全並行
- 未明確宣告，就不視為唯讀
- 破壞性操作須有明確權限攔截
- 安全相關工具須覆寫 classifier input；預設對 classifier 隱藏
- 可為 observers 補上模型可見輸入，但送 API 的輸入在快取敏感序列化完成後不得再修改

## 串流工具執行契約

模型回覆仍在串流時若能開始工具呼叫，執行仍須保有確定性的 transcript 順序：

- 判斷工具可否安全並行前，先解析並驗證輸入。解析或安全分類拋錯時，視為不可安全並行。
- 可安全並行的工具只能與其他可安全並行工具一起跑；不安全的工具必須獨占執行。
- 進度訊息可立即送出，但最終工具結果須依原始 tool_use 順序整合。
- 未知、遭中斷或因 sibling 取消而停止的工具，仍須產生模型可見的 tool_result error blocks，綁定原始 assistant message／tool_use ID。
- Shell 異動失敗可取消 sibling subprocesses；但 read／search／fetch 失敗不應取消無關 siblings。
- 遵守各工具 interruptBehavior：使用者中斷取消可取消工具，並等待不可取消工具結束。
- Context modifiers 預設不可並行，除非 runtime 明確設計並行 modifier 的合併語意。
- 非關鍵工具輸出摘要或標籤應允許失敗而不阻塞；summarizer 失敗不得讓已成功工具執行變成整個 turn 失敗。

## 延遲載入工具 Schema 契約

大型或動態 registry 的初始 prompt 不應總是攜帶所有完整 schema。延遲工具系統應包含：

- 小型、常駐、唯讀且可安全並行的 discovery tool
- 每項工具的 shouldDefer／alwaysLoad metadata
- 依穩定工具名稱精確選取，以確定性方式恢復
- 有 max_results 上限的關鍵字搜尋
- 回傳可呼叫 schema 引用的結果格式，而非散文指令
- 顯示仍在連線的 provider，讓查無結果能分辨「不存在」與「尚在連線」

絕不只憑名稱呼叫延遲工具；必須先取得並驗證完整 schema。

## 重試契約

重試前先分類：

- 暫時性：429、rate limit、明確 timeout errors、stream idle timeout、暫時 5xx、ECONNRESET、EPIPE、ETIMEDOUT、EAI_AGAIN。
- 確定性：schema errors、缺少路徑、permission denied、syntax errors、明確的命令非零失敗。
- 需使用者動作：權限提示、缺憑證／登入、破壞性確認。

只有暫時性錯誤可在內部重試。預設重試上限為 2，使用含 jitter 的指數退避並支援 abort signal。

不只依賴模糊的 AbortError 字串。工具、API request 與 stream idle timeout 應先轉成明確錯誤類別或 abort reason，再分類。

## Hook 契約

Runtime 支援 hooks 時，定義為具型別的生命週期事件，不使用任意 shell callbacks：

- PreToolUse：工具執行前觸發；只有明確契約允許才可阻擋。
- PostToolUse：工具成功後觸發；預設用於觀測。
- PostToolUseFailure：工具失敗後觸發，包含 tool_name、tool_input、tool_use_id、error、error_type、is_interrupt、is_timeout。
- PermissionDenied／PermissionRequest：權限專屬 hooks，明確定義 retry 或 allow／deny 語意。
- SessionStart／SessionEnd：session 生命週期 hooks，payload 包含來源或原因。
- Stop／StopFailure：turn 結束 hooks；API error 路徑不得誤報為正常 stop。
- PreCompact／PostCompact：壓縮 hooks；只有契約明訂時，PreCompact 才能附加自訂 compact 指令或阻擋。

每個 hook 必須宣告 payload schema、timeout、是否阻塞、stdout／stderr 路由及 exit-code 行為。觀測 hooks 應 fail open；權限與安全 hooks 應 fail closed 或詢問使用者。

## Shell 權限契約

Shell 權限邏輯必須依各 shell 家族使用 parser：

- Bash 與 PowerShell 須有各自的 parser、allowlist、路徑驗證、wrapper 剝除與命令注入檢查。
- 解析失敗、出現 script block／subexpression／nested command，或重新導向寫檔時，不把命令視為唯讀。
- timeout、time、nice、nohup 等安全 wrapper 與安全 env prefixes，只能透過已驗證的 parser／argv 路徑剝除。
- Deny 與 ask 規則須比 allow 更難繞過。比對 deny／ask 時，將所有前導 env prefixes 與 wrappers 正規化至固定點。
- PowerShell 唯讀驗證須拒絕 script blocks、subexpressions、expandable strings、splatting、member／static invocations、assignments、stop-parsing、UNC paths、非檔案系統 providers、會改 cwd 的複合命令與不安全 pipeline 引數。
- Bash 驗證須拒絕 shell metacharacter 歧義、command substitution、不安全 wrapper 值、重新導向／路徑逃逸、複合 cd 加相對路徑混淆，以及 Git 操作的路徑繞過。
- 同步 isReadOnly() 可作快速保守前置篩選；真正負責權限的執行路徑仍須在執行前重新解析與檢查。
- 權限規則字串需要 parser，不使用臨時字串切割。支援改名工具的 canonical aliases，並處理規則內容括號的 escape／unescape。
- 偵測被較廣 ask／deny 規則遮蔽、因而不可達的 allow 規則。Deny 遮蔽比 ask 遮蔽嚴重，優先回報。
- 共享設定比個人 session 規則採更保守處理；在某位使用者 sandbox 內安全的規則，仍可能對隊友不安全或產生混淆。

## Context 壓縮契約

Context 超過設定門檻時：

1. 保留 system／global／project 指令。
2. 保留最後 3 個完整對話／工具 rounds。
3. 工具輸出超過 50 行時，縮成頭尾片段並附審計標記。
4. 超大工具結果存至 prompt 外，回傳預覽與路徑。
5. 後續 edit／write 已涵蓋同檔案時，丟棄被取代的 read snapshots。
6. 先做 micro／snip compaction，再做摘要壓縮。
7. 完成以上步驟後，才摘要較舊的對話狀態。

Compaction 與 retry loops 必須有斷路器。同類失敗連續 3 次後，停止並回報已知事實與下一個驗證假設。

壓縮成功後，清理因 compact 邊界失效的狀態：microcompact trackers、session／message caches、permission／classifier approvals、speculative checks、context-collapse state、memory-file caches。除非實作有明確替換，否則保留 skill 內容與使用者目前目標。

詳細壓縮不變條件：

- 依 API round 或 assistant response ID 分組訊息歷史，不依使用者表面上的 turn。同 response ID 的串流 assistant chunks 必須留在一起。
- 保留尾段時，向前回溯納入保留 tool_results 對應的 tool_use blocks，以及同 message ID 的先前 assistant chunks。
- 區分 cache-hot 與 cache-cold 壓縮。Cache-hot 路徑可發出 API cache edits 而不改本地 transcript；cache-cold／時間型路徑因快取已過期，會修改 prompt 內容。
- 時間型 microcompact 應由真實 idle／cache-TTL 間隔觸發，只處理 main-thread sources，至少保留一個近期 round。避免 slice(-0) 這類意外保留全部內容的 bug。
- Session-memory 壓縮只在門檻為正且來源素材足夠時執行。Memory extraction 尚未完成、無可用記憶、範本為空、缺 summarized ID，或壓縮後估計仍高於門檻時，走 fallback。
- 不帶工具執行的摘要 prompt，必須明說工具呼叫會被拒絕且浪費 turn；否則摘要模型可能把唯一回覆用於嘗試呼叫工具。
- Session-memory 或 cache-cold 壓縮後，重設 cache-break baselines，避免預期 token 下降被回報成 prompt-cache 回歸。
- 壓縮後清理須依 query source 限定範圍。Subagent 壓縮不得重設同一程序中 main-thread 共用的 module-level state。
- 清理時不重設已呼叫 skill 的內容；compaction attachments 可能需要跨多次壓縮保留 skill 全文。

## 工具結果預算契約

大型工具輸出需要兩層保護：

- 單一工具輸出上限：個別工具應持久保存超大輸出，回傳模型可見預覽與路徑。
- 彙總訊息上限：多個並行工具結果可能合成一則模型可見 user message，因此 runner 須計算正規化後 wire message 的預算，不只計算各原始結果。

替換決策必須跨 turns 穩定：

- 在各 thread 狀態追蹤已見 tool result IDs 與凍結的替換選擇。
- 將替換紀錄持久寫入 transcript，讓 resume 重建相同的模型可見預覽位元組。
- 可行時依 ID 套用快取替換，不做檔案 I/O。
- 模型已看過未替換的結果，後續絕不再替換它；否則會破壞 prompt-cache 與 resume 一致性。
- 依 API serializer 組合 user／tool-result messages 的方式分組候選，包含並行工具結果邊界情況。
- 輸出本身已受限的工具，例如完整檔案讀取，可透過明確的 infinite 或 no-persist limit 選擇不參與。

## Transcript 持久化契約

支援 resume 的 runtime，其 transcript 持久化屬於 agent 核心：

- Transcript entries 僅追加，使用穩定 message IDs 與 parent links。
- 用明確 compact-boundary message 表示壓縮，不靜默取代歷史。
- 可行時逐字保留近期訊息；壓縮歷史需重新連結時，記錄 preserved-segment metadata。
- Compact 摘要保留完整 transcript 路徑，讓 agent 必要時恢復精確舊片段或錯誤輸出。
- 壓縮後與 session 退出時重新追加 session metadata，讓尾端視窗讀取者仍看到目前 title、tag、mode、worktree、PR 與 last prompt。
- Resume 重建時，避免去重後保留的訊息讓 parent pointers 越過 compact boundary。
- 重新追加快取 metadata 前，先從尾端掃描更新 SDK／UI 可變 metadata，避免舊 cache 值覆蓋外部 writer 的新值。
- 只有驗證 tail-to-head chain 後才重新連結保留片段。鏈結斷裂或片段過期時，不動作並記 log，不修改 transcript pointers。
- 壓縮後將保留 assistant messages 的過期 usage 歸零，避免 resume 因舊 usage 立即再觸發 autocompact。
- Snip compaction 必須重播已移除 UUIDs，並跨被移除範圍重新連結懸空 parentUuid pointers；否則 resume 可能重建未裁剪的歷史。
- 並行 tool_use／tool_result 串流形成 DAG，即使 parentUuid 儲存是 linked list。恢復時依 provider message ID 分組 assistant chunks，將鏈外 siblings 接回最後一個鏈內成員之後。
- 加入一致性 checkpoint，比對預期訊息數或最新 checkpoint 位置與重建鏈；在不一致變成靜默 resume bug 前記錄漂移。

## 控制／事件 Schema 契約

Runtime 提供 SDK、structured output、replay 或 remote-control events 時，為 wire format 定義 schemas，不串流無型別 blobs：

- user、assistant、system、result、error、status、rate-limit 與 compact-boundary messages
- 每個可能屬於工具子樹的 user／assistant／stream event 具有 parent_tool_use_id
- 穩定 uuid 與 session_id
- Compact-boundary metadata 包含 trigger、pre-token count 與 preserved-segment relink 欄位
- Permission-denial 紀錄包含 tool name、tool use ID 與原始 input
- Init／session messages 包含 transcript_path、permission_mode、cwd、啟用工具、MCP／plugin／skill 清單與 model

Compact 邊界與狀態變化必須是一級事件，不能由散文摘要推定。

## Agent 定義契約

Runtime 支援以檔案定義自訂 agent 時，registry 應採設定解析，不只是串接 prompt 文字：

- 各欄位獨立驗證；一個 agent 無效後仍繼續載入，單一壞檔不得破壞整個 registry。
- Markdown agent 檔案應要求明確 name 與 description。缺 name 的檔案可能是同目錄文件，應安全略過。
- 正規化 inherit 等模型繼承、修剪字串，並驗證 effort、permission mode、max turns、memory scope、background mode、isolation mode、hooks 與 MCP server requirements。
- Allowed／disallowed tools 使用與 runtime 權限相同的規則 parser；disallowed rules 應比對 canonical base tool names。
- Tool allowlists 應支援 undefined 或 * 表示所有工具，再扣除 disallowed tools。MCP 工具為動態探索，可能需要獨立 allow policy。
- 明確定義來源優先序：built-in、plugin、user settings、project settings、flags、policy 不得意外以不確定順序合併。
- Agent 宣告 durable memory 且 runtime 需檔案存取才能管理時，只有該 agent 已有明確 allowlist，才注入最低必要檔案工具。
- Agent prompt 應明確說明 context 邊界：除非 fork，否則新 agent 沒有隱含 context；foreground agents 提供必要結果，background agents 處理獨立工作。

## Skill 套件契約

Skills 是具有權限與 context 語意的 runtime 能力，不只是 Markdown 片段：

- 使用精簡 frontmatter schema：name、description、allowed-tools、argument-hint、when_to_use、model、disable-model-invocation、user-invocable、hooks、context、agent、effort、shell，以及可選的條件 paths。
- User／project skills 優先採 skill-name/SKILL.md。舊單檔命令格式作相容路徑，不作主要撰寫方式。
- 條件式 path skills 應在 touched files 匹配前保持隱藏。謹慎正規化 patterns；catch-all 實際是無條件，不應假裝有選擇性。
- Managed、user、project、additional 與 legacy skill roots 依確定順序載入；以 realpath 去重，避免 symlink 或重疊 roots 重複註冊同 skill。
- 動態探索應沿相關檔案的祖先路徑並遵守 ignore 規則，尤其巢狀依賴目錄。
- Bundled reference files 在首次呼叫時才延遲解出至確定的各 skill 目錄；拒絕絕對路徑或 ..、避免跟隨 symlink 寫入，並記憶化並行解出操作。
- 初始 skill 清單須有嚴格 context 預算。顯示足以判斷呼叫的描述，只有呼叫時才載入完整內文。
- 新 prompt-command 屬性預設須經權限審查。維護安全屬性 allowlist，避免靜默信任新欄位。
- 呼叫模式須明確。Inline skills 在目前 turn 加入模型可見指令；forked skills 隔離執行並回傳摘要結果文字。
- 遠端／canonical skills 須先探索再呼叫，連同 base directory 快取；只在 skill 內容代換宣告的 session／skill-dir variables，並註冊已呼叫內容供 compaction 保留。

## 持久記憶契約

持久記憶保存超出本 turn 的使用者／專案事實，不能取代讀取目前 repo：

- 使用封閉記憶分類，例如 user、feedback、project、reference。
- 不保存 code patterns、架構、檔案路徑、專案結構、Git 歷史、近期變更、除錯解法，或 repo 指令已管理的內容。
- Feedback 記憶同時包含修正與已驗證、非顯而易見的成功，附 Why: 與 How to apply:，讓下一個 agent 能判斷邊界情況。
- Project 記憶將相對日期轉為絕對日期，先寫持久事實或決策，再寫理由。
- 記憶視為歷史主張。依記憶中的檔名、函式名、旗標、命令或 repo 狀態採取行動前，核對目前檔案系統或 Git 狀態。
- 使用者要求忽略或不使用記憶時，視為記憶為空，不引用它。
- 記憶索引保持簡短，負責導向主題檔案，不變成完整 transcript 或全部事實 dump。
- 背景記憶擷取應以讀取為主，寫入嚴格限定在 memory 目錄 sandbox；預設不授予 shell write、remove、MCP 或巢狀 agent 能力。
- 記憶整併須有門檻：經過時間、session 數、排除目前 session，以及防止兩個整併程序同時改同檔案的 lock。

## Session 任務契約

任務清單代表目前 session 的控制狀態，不是持久記憶，也不是最終答案：

- 3 步以上、不簡單的多操作、使用者明確要求、多項任務或新收到需求時，使用任務清單。
- 單一直接或純對話要求不建立任務狀態。
- 除非 runtime 明確支援多 owner 任務語意，否則同時最多一項 in_progress。
- 開始前標 in_progress；工作確實完成且含必要測試／驗證後，才標 completed。
- 測試失敗、缺依賴、缺檔案或錯誤未解時，不將部分工作標 completed；維持進行中或建立 blocker 任務。
- 3 項以上任務須包含驗證／checkpoint 任務，不只以實作結束。
- Team runtime 的任務需有 owner、依賴與足夠描述，讓另一個 agent 不靠隱含 context 也能執行。
- 佇列命令保持隔離：slash commands 與 shell-mode commands 一次一個；一般 prompts 只有 mode 與目標 context 相符才可批次處理。

## 多 Agent 協調契約

Worker、teammate、fork 或 swarm runtime：

- Worker contexts 須有自身 identity、abort controller、cwd／worktree metadata、permission mode 與 tool pool。
- 無法顯示 UI 的 background workers 應避免直接權限提示；改送 leader 或 fail closed。
- Worker → leader 權限請求須使用 typed payloads：request ID、worker ID／name、tool name、tool use ID、input、suggestions、decision、updated input、permission updates、timestamp。
- Mailbox／queue 寫入須有足以支援並行 workers 的原子性；以檔案系統實作時使用 lock 或 append-only 協定。
- Leader 批准的權限更新須明確套用至 shared context，不容許 worker 靜默改變 leader mode。
- 除非 runtime 對任務清單、inboxes、permissions、cleanup 有穩健 namespace 設計，否則每個 leader 優先只保有一個 active team。
- 建立 team 應初始化對應任務清單，持久保存 leader session／model／cwd metadata，供外部 workers 探索協調入口。
- 訊息與任務 ownership 使用的 agent 名稱，須為穩定、使用者可辨識名稱，不是 opaque generated IDs。
- 除非 runtime 明確支援，否則避免遞迴 team 拓樸；扁平成員清單較易理解與除錯。
- Worktree 或遠端隔離須持久保存足夠 metadata 以支援 resume 與 cleanup。
- Worker resume 路徑須先重建繼承的 tool-result replacements 與 permission context，再繼續。

## 範本使用

templates/typescript-agent-core/ 的 TypeScript 骨架是起點，不是應自動安裝到每個 repo 的檔案。

只有使用者明確要求在目標專案實作 runtime 時才使用。複製最低必要檔案，配合 repo 原生 test runner 與 module style，先加聚焦測試再擴充 adapters。

## TypeScript Repo 建議檔案

除非 repo 有更明確本地慣例，否則使用此結構：

```text
src/agent-core/
  AgentEngine.ts
  contextCompactor.ts
  errorClassifier.ts
  lifecycle.ts
  retryPolicy.ts
  tickContext.ts
  toolRegistry.ts
  toolRunner.ts
  transcript.ts
  workspaceObserver.ts
  index.ts
tests/agent-core/
  *.test.ts
```

首版實作保持精簡、可測試。真實 model providers 與 shell tools 的 adapters 放在核心 engine 外。
