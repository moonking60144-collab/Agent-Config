---
name: agent-core-project
description: "適用於需要跨可獨立驗證子系統或跨 context 持久保存拆解、進度與交接的工作、不可逆且影響範圍大的操作，或須先審計才能確定工作清單的實作。不適用於一般範圍明確的跨檔工作或純 review。"
---

# Agent Core Project

在 Lite 的執行與驗證契約上，增加跨 context 的計畫、狀態與交接；只保留續接需要的資訊，不另建固定階段或領域流程。

是否保存進度與驗證強度分開決定。Project 不自動要求嚴格 runner；依實際修改風險選 native 或 strict，不能因任務較久、需要 compaction 或交接而升級驗證。

## 受理與續接

只有需要子系統獨立驗收、compaction／交接、不可逆／高影響範圍操作，或多階段實作清單必須探索後才知道時，才使用 Project。計算可獨立測試的行為，而非檔案、層數或工具數。不需持久化執行時降級至 Lite。

建立產物前，檢查 `~/.codex/projects/<repo-slug>/ledgers/` 及專案規則或先前交接指定的精確 repo-local 路徑，尋找相符的未完成 ledger。目標與本輪 checkout 相符時從 next_instruction 續接；不重新探索仍有效的 done_verified 工作。跨 task／worktree 的 ledger 只提供線索，先核對本輪原始碼與 runtime，不照搬過期完成狀態。只有現有證據無法解決的歸屬衝突才詢問。

同 repo 可以有多項工作，不以修改時間選擇目前任務。確認目前 session 與 ledger 後，可將 JSON `{cwd, session_id, ledger_path}` 傳入 `node ~/.codex/hooks/record-session-provenance.mjs` 的 stdin 建立明確綁定；`ledger_path` 必須屬於該 checkout。Session ID 從目前原生 session 資訊取得，不猜其他 session 的 ID。資訊不可得時保留未綁定狀態並依任務脈絡工作；恢復 hook 只提示候選，不替新 session 接手工作。


## 產物歸屬

預設路徑是 `~/.codex/projects/<repo-slug>/plans/` 與 ledgers/。Repo 名稱衝突時附加簡短路徑 hash。只有使用者要求且符合共用 [verification 放置契約](../agent-core-lite/references/verification.md) 時，才使用 repo-local 控制產物。無專案工作使用 `projectless-<thread-id>` 與外部控制產物；相同 runner 支援沒有 Git HEAD 的目前檔案快照。給使用者的報告可放在暫存輸出目錄；控制狀態留在 ledger。

Ledger 目錄保存續接狀態、必要證據與可重建快照，不作為驗證 checkout、node_modules 或 build cache 的工作區。這類可拋棄產物放在本次擁有的暫存目錄；必要紀錄及恢復材料保存完成、沒有程序或未完成任務依賴後，於本次授權內清理。測試失敗且仍需診斷時，記錄暫存路徑及保留原因。既有資料先盤點引用與用途，不依大小或存放天數批次刪除。

## 盤點、計畫與 Ledger

每項交付記錄足以續接的目標、檔案、依賴與驗收標準；ownership、consumer、恢復與阻塞決策只記本案適用者。領域決策放在 plan，證據方法依共用 [verification contract](../agent-core-lite/references/verification.md)。Ledger 引用適用的完成證據；strict 引用 runner plan／receipt，不複製 consumer 清單或檢查定義。特定 repo 的治理留在該 repo，不由 Project 另列要求。

Ledger 以以下欄位開始：

```text
project_status: active | blocked | complete | archived
repo_path: <absolute root>
plan_path: <absolute plan>
ledger_path: <absolute ledger>
completion_contract: <sibling .completion.json>
active_task: <id or none>
last_verified_task: <id or none>
updated_at: <ISO-8601 timestamp>
next_instruction: Read <ledger path> first, then continue <task>.
```

任務狀態為 pending、in_progress、done_verified、blocked、skipped。done_verified 任務引用實際證據，只有證據過期或使用者要求時才重做。保留 Eliminated 區段，記錄已推翻的假設與證據。

階段結束時更新專案狀態與 next_instruction；未解工作保持 active／blocked，符合完成契約才標 complete，明確停止追蹤才標 archived。長期未更新只是需要盤點，不自動結案；project_status 不使用任務層的 done_verified。

## 執行

依依賴與寫入衝突安排工作；互不相依的探索可並行，checkpoint 記錄實際進度，不把一次一項當作固定限制。子 agent 協作依 AGENTS.md。

納入正式實作前解決影響契約、ownership 或可觀察行為的設計決策；取證可依 [受控實驗](../agent-core-lite/references/architecture-preflight.md#受控實驗) 在既有授權內進行。新證據推翻計畫時，先更新 plan／ledger 再繼續。未修改且已有足夠 enforcement 的程式路徑，不需要另一套框架。

獨立 review 的觸發與證據標準依共用 verification contract；不因使用 Project 再增加一輪同內容 review。

不可逆工作前確認恢復方式並遵守既有授權。將未解依賴標為 blocked，只繼續獨立任務。

## 共用完成契約

使用單一 project-ledger-completion.schema.json 與 validate-project-ledger.mjs。新契約採 schemaVersion 4、evidencePolicyVersion 1，透過 `verificationPolicy:{mode,reason,strictTriggers}` 記錄與風險相稱的層級。Native 記錄實際檢查與相關受測輸入；strict 使用共用 runner，並以 verification 引用 receipt：

```json
{"artifactBase":"contract","artifact":"evidence/receipt.json","artifactSha256":"<actual SHA-256>"}
```

兩種層級都保留 requiredEvidence 的產物與雜湊，Findings 與 preflights 使用穩定 id；例外須有 owner、reason 與 evidence。Native 的欄位與來源新鮮度要求見 [verification](../agent-core-lite/references/verification.md#project-的原生驗證)。Strict 不在 sidecar 重複 receipt 的完整 plan。

舊 v1–v3 契約仍可供續接與非嚴格 CLI 檢視；Stop 結案維持原有嚴格要求，不因升級工作流自動降級。已明示或被 session 觀察到的 strict 要求不能藉改寫成 native 規避。Stop 檢查綁定 session 及新完成／有變更的 ledgers，可要求一次續行；它不代替風險判斷。

遠端檢查與本機證據分開。已授權 push 後，記錄適用政策、精確完整 revision、必要檢查、狀態與證據 URL。Pending／failed／unknown 或過期 revision 會阻擋完成。只有附上實際政策／理由時才使用 not_applicable。Validator 檢查提供的證據，不自行查詢服務提供者。

## 驗證與結案

依 [verification](../agent-core-lite/references/verification.md) 執行。每項主張需有相應證據；native 核對列出的受測輸入，strict 核對完整 source snapshot。相關原始碼／測試變更後，重新執行受影響驗證。

更新 sidecar 並執行：

```text
node ~/.codex/hooks/validate-project-ledger.mjs --ledger <ledger> --require-evidence-policy --require-completion-policy
```

只有 errors／blockers 都為零，且原始碼、證據與適用遠端檢查均為目前狀態，才允許 complete。Runtime provenance 記錄觀察到的檔案，不代表原生 skill 已啟用或語意上遵循。SessionStart 後建立的 ledger 仍須明確驗證。

## 交接

停止或 compaction 前，更新 ledger 的任務狀態、已驗證證據、blockers 與 next_instruction。以已授權 commits／stashes，或 tracked diff 加 untracked manifest 保留可重建的原始碼；單有 digest 不是可恢復快照。

階段已完成且後續目標不同，或壓縮後反覆重建同一背景時，提出階段交接；不按回合數強制換 session，建立或封存對話仍依使用者授權。

判斷與表述依 AGENTS.md。交付已完成項目、各項 blocker 與下一步，引用必要的 ledger 與證據；Git 狀態以實際 diff／status 為準。完成條件依共用契約判定，ledger 保存完整續接資訊，下一個 session 先讀取該 ledger 續接。
