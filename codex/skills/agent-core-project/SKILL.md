---
name: agent-core-project
description: "適用於需要跨可獨立驗證子系統或跨 context 持久保存拆解、進度與交接的工作、不可逆且影響範圍大的操作，或須先審計才能確定工作清單的實作。不適用於一般範圍明確的跨檔工作或純 review。"
---

# Agent Core Project

負責 Lite 之上的持久化執行。流程為受理（Intake）→ 盤點與拆解（Map & Decompose）→ 計畫／ledger → 逐任務執行 → 驗證 → 交接。領域 skill 不取代這項責任。

## 受理與續接

只有需要子系統獨立驗收、compaction／交接、不可逆／高影響範圍操作，或多階段實作清單必須探索後才知道時，才使用 Project。計算可獨立測試的行為，而非檔案、層數或工具數。不需持久化執行時降級至 Lite。

建立產物前，檢查 `~/.codex/projects/<repo-slug>/ledgers/` 及專案規則或先前交接指定的精確 repo-local 路徑，尋找相符的未完成 ledger。目標相符時從 next_instruction 續接；不重新探索 done_verified 工作。只有多份 ledger 確實衝突時才詢問。

純 Review 維持唯讀。使用者要求的盤點由 Onboarding 負責；已授權實作則在此流程內做有限範圍盤點。重複失敗使用 agent-failure-debugging。自訂 runtime 工作採用 Engine 技術契約，Project 仍保有計畫、ledger 與最終驗收責任。

## 產物歸屬

預設路徑是 `~/.codex/projects/<repo-slug>/plans/` 與 ledgers/。Repo 名稱衝突時附加簡短路徑 hash。只有使用者要求且符合共用 [verification 放置契約](../agent-core-lite/references/verification.md) 時，才使用 repo-local 控制產物。無專案工作使用 `projectless-<thread-id>` 與外部控制產物；相同 runner 支援沒有 Git HEAD 的目前檔案快照。給使用者的報告可放在暫存輸出目錄；控制狀態留在 ledger。

## 盤點、計畫與 Ledger

每項可獨立測試的交付都記錄：

- 目標、檔案、依賴、輸入／輸出契約與驗收標準。
- 權威來源、受影響 consumer 與具體的刻意差異。
- 適用的架構／非同步／效能設計決策；只在相關時使用 Lite references。
- 共用 [verification contract](../agent-core-lite/references/verification.md) 的驗證 plan／receipt 路徑、oracle 來源及探索範圍限制。
- 前置條件、回復／恢復方式與阻塞決策。

驗證計畫是檢查定義與 consumer 覆蓋的唯一權威；ledger 引用它，不複製清單。領域決策放在 plan。Config 規則修改還須依 Config repo 治理提供事故／負向案例／誤觸邊界／退役證據。

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

## 執行

一次處理一個任務，立即更新狀態。有幫助時使用獨立 reviewer 或有限範圍探索 agent，提供原始任務／diff／產物。主 agent 仍須自行驗證。

Act 前解決影響契約、ownership 或可觀察行為的設計決策。新證據推翻計畫時，先更新 plan／ledger 再繼續。未修改且已有足夠 enforcement 的程式路徑，不需要另一套框架。

跨邊界架構或異動工作，須由新的 reviewer 檢查一條真實 producer → consumer 失敗時間線。共用 verification contract 定義 reviewer 證據的限制與必要行為檢查。

不可逆工作前確認恢復方式並遵守既有授權。將未解依賴標為 blocked，只繼續獨立任務。

## 共用完成契約

使用單一 project-ledger-completion.schema.json 與 validate-project-ledger.mjs；v2／v3 共用證據驗證，遠端要求依版本區分。目前 Project 完成採用 schemaVersion 3、evidencePolicyVersion 1，並以 verification 引用通過的共用 receipt：

```json
{"artifactBase":"contract","artifact":"evidence/receipt.json","artifactSha256":"<actual SHA-256>"}
```

Receipt 記錄檢查、原始碼與覆蓋範圍。既有 requiredEvidence 項目標示 receipt 未取代的必要業務、runtime 或 review 產物。不在 sidecar 重複 receipt 的完整 plan。Findings 與 preflights 保留穩定 id；例外須有 owner、reason 與 evidence。產物大小、路徑包含關係、完整性與狀態語意由共用 validator 強制檢查。

舊契約仍可供續接與非嚴格 CLI 檢視。新完成的工作必須滿足目前的嚴格驗證。Stop hook 檢查綁定 session 及新完成／有變更的 ledgers，可要求一次續行；這是有限度的強制檢查，並非不可繞過的保證。

遠端檢查與本機證據分開。已授權 push 後，記錄適用政策、精確完整 revision、必要檢查、狀態與證據 URL。Pending／failed／unknown 或過期 revision 會阻擋完成。只有附上實際政策／理由時才使用 not_applicable。Validator 檢查提供的證據，不自行查詢服務提供者。

## 驗證與結案

依 [verification](../agent-core-lite/references/verification.md) 執行。每項行為主張都須有跨越所聲稱邊界的證據。原始碼／測試變更會使 receipt 失效；完成前須重新產生並執行受影響驗證。

更新 sidecar 並執行：

```text
node ~/.codex/hooks/validate-project-ledger.mjs --ledger <ledger> --require-evidence-policy --require-verification
```

只有 errors／blockers 都為零，且原始碼、證據與適用遠端檢查均為目前狀態，才允許 complete。Runtime provenance 記錄觀察到的檔案，不代表原生 skill 已啟用或語意上遵循。SessionStart 後建立的 ledger 仍須明確驗證。

## 交接

停止或 compaction 前，更新 ledger 的任務狀態、已驗證 receipts、blockers 與 next_instruction。以已授權 commits／stashes，或 tracked diff 加 untracked manifest 保留可重建的原始碼；單有 digest 不是可恢復快照。

最終交付引用 ledger 與證據、指出未完成邊界，並以實際 Git diff／status 為準。下一個 session 的第一步是讀取該 ledger，不是重新探索。
