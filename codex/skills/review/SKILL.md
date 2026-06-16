---
name: review
description: Issue-first code, architecture, integration, pull request, and change review. Use when the user asks Codex to review, audit, inspect, check, critique, find issues, list problems, evaluate architecture/integration, review or re-review a PR/diff/branch, or assess correctness, regressions, security, test coverage, deployment risk, UI behavior, data flow, API contracts, automation/workflow behavior, or domain-specific system changes before implementation.
---

# Review

## 核心立場

採取 code-review stance。優先找 bugs、行為回歸、資料流或整合風險、安全問題、缺漏測試、部署風險與可觀察性缺口。不要把摘要、稱讚、風格偏好或可選 refactor 放在 findings 前面。

預設唯讀。除非使用者明確要求「修」、「改」、「execute」、「implement」、「直接做」，不要修改檔案、不要 stage、不要 commit、不要 push。

## 審查流程

1. 先確認審查範圍：使用者指定的檔案、diff、branch、PR、功能或錯誤路徑。若範圍不明且會影響方向，先問一個必要問題；若可從 repo 狀態推斷，直接查。
2. 具體化 scope mode：
   - Uncommitted review：先看 `git status -sb`、`git diff`、`git diff --cached`，再檢查相關 untracked files。
   - Branch/PR review：先找 merge-base，再看相對 base 的 diff；使用者給明確命令時照命令。
   - Audit/system review：以使用者指定的系統邊界、資料流、模組或風險面為 scope，不以 diff 為唯一來源。
   - Re-review：驗證修補 diff 是否消除原 finding 的觸發條件，並檢查修補 diff 是否直接引入新的 P0/P1 風險；不要發散新增 P3 或無關 backlog。
3. 不要把廣義 audit 降格成 diff review。若使用者要求「掃整個系統」、「找所有 bug」、「flag conflicts」、「inconsistencies」、「system-wide refactor opportunities」、「architecture/integration 全面檢查」或類似語意，預設是 Audit/system review；不能只檢查 uncommitted changes 後宣稱沒有問題。一般「review this refactor」或「看這次 refactor diff」仍是 PR/diff/branch review，除非使用者明確要求系統級重構盤點。若系統邊界過大到無法一次完成，先提出分區掃描計畫或問一個必要問題。
4. 命令要符合目前 OS 與 shell。先依環境、路徑與使用者語境判斷是 macOS/Linux 的 zsh/bash、Windows PowerShell、CMD、WSL 或 Git Bash；不要在 Windows PowerShell 情境輸出只適用 Bash 的語法，例如 `VAR=value cmd`、`2>/dev/null`、`/tmp/...`、`rm -rf`、`sed/awk` pipeline、process substitution，也不要在 Windows PowerShell 5.1 假設 `cmd1 && cmd2` 可用。若命令需要跨平台交付，優先用 npm scripts、git、Node/Python 小片段或同時列 PowerShell 與 zsh/bash 版本；使用者給明確命令時照命令。
5. 先索引後讀取。用 `rg`、symbol search、test names、route names 或 diff hunk 先定位高風險區，再讀必要檔案；確認高風險後才擴大到完整檔案或完整 caller/downstream。
6. 讀專案規範與現有模式。優先看 `AGENTS.md`、相關 README、鄰近實作、測試、呼叫端與 downstream。
7. 追完整路徑。對每個高風險點，至少追 caller -> changed function/module -> downstream consumer/test/UI/API/storage/deploy effect。
8. Audit/system review 要先建立風險地圖，再抽查與追路徑。依 scope 搜尋 feature flags/config/env keys、互斥狀態、重複 source of truth、frontend/backend contract、cache/invalidation、event/SSE/watchers、DB/schema/read model、background jobs、test discovery、deployment scripts 與錯誤處理；不能只用 build/lint 綠燈替代系統審查。
9. 比對使用者意圖與實際行為。確認 edge cases、錯誤處理、快取/並發、狀態同步、資料格式、權限、安全邊界與部署環境。
10. 能實測就實測，但維持唯讀邊界。可跑 test/build/typecheck/lint；不要跑 formatter `--write`、lint `--fix`、codegen、migration、會改資料的腳本或外部系統寫入。若測試產生檔案或快取，在驗證結果中註明。
11. 測試先精準 scope；若 runner 無法 scope、pattern 被忽略、glob 不含新測試、custom runner 其實跑全測、或 dist/generated/nested tests 沒被 discovery，要明確回報。測試失敗先歸因：PR/diff/branch/re-review 中，確認失敗是確定性、可隔離、且由本次變更造成，再列為 finding；audit/system review 中，可列確定性的既有失敗，但要標成 `既有順帶發現`；flaky、資源搶佔或既有環境問題要標明，不混進變更風險。
12. 對外部 API、規格、workflow/automation API、版本行為或產品功能的主張，不憑印象；查官方文件或一手來源後再下結論。
13. 不確定時明確標示不確定點、原因、驗證方式。不要把猜測包裝成 finding。

## Findings 標準

只列可辯護、可重現、會造成實際風險的問題。每個 finding 必須包含：

- 嚴重度：`[P0]`、`[P1]`、`[P2]`、`[P3]`，依下方校準。
- 精準位置：檔案與行號；沒有行號時給出最小可定位的符號、route、component、workflow 或設定 key。
- 來源：`本次引入`、`既有被放大`、或 `既有順帶發現`。
- 驗證程度：`已重現` 或 `已追路徑`。`推測` 不進 findings，改列待確認問題或丟掉。
- 觸發鏈：進入點 -> 狀態/資料流轉 -> 錯誤結果。列不出可達觸發鏈就不要列為 finding；無法證實可達時，改列待確認問題或丟掉；只有「可達但影響程度不確定」時才允許降級。P0/P1 必須先嘗試推翻自己，確認沒有被 guard、feature flag、schema、caller contract、權限或環境條件擋掉。
- 問題機制：說明機制來自讀到的程式碼、設定、log、測試或文件，不是依常識腦補。
- 影響：說明實際破壞的使用者行為、資料正確性、安全性、部署或維運結果。
- 修正方向：簡短指出可行修法或需要補的測試。

嚴重度校準：

- `P0`：資料遺失、安全外洩、弄壞 production、或必須擋 merge 的問題。
- `P1`：常見路徑行為錯，且沒有合理 workaround。
- `P2`：edge case、低頻路徑、或有合理 workaround。
- `P3`：輕微問題，不影響行為或只影響維護成本。
- 兩級之間猶豫時取低一級，並說明為何不是更高級。
- Blast radius 只作同級排序的 tie-breaker：影響面較大者先列，但不要用它覆寫上面的 P0-P3 定義。

避免列：

- 單純個人風格偏好。
- 沒有證據的「可能會壞」。
- 沒有行為風險的命名、排版或微重構。
- 同一 root cause 的重複 findings；合併成一條，列出多個位置。

依 review mode 過濾來源：

- PR/diff/branch review：只列 `本次引入` 與 `既有被放大`。
- Audit/system review：可列 `既有順帶發現`，但要明確標記，避免混成必修 PR blocker。

若使用者明確要求 refactor、inconsistency、cleanup、architecture smell 或 flag conflict：

- 會造成錯誤行為、資料風險、安全風險或部署風險的，仍列 findings。
- 不足以構成 finding、但會增加維護風險或讓後續 bug 更容易發生的，列在 `改善建議`，不要硬塞 P3，也不要省略。
- `改善建議` 需要有具體位置、衝突點與整理方向；不要列個人偏好。

停止準則：範圍掃完就停；trigger 證明可達即可；不要為湊數繼續挖無關區，也不要因為找到一個問題就停止看同一風險面的直接 downstream。

## 輸出格式

有 finding 時，先列 findings，依嚴重度排序：

```text
發現問題
- 3 findings：1xP1、2xP2
- [P1] path/to/file.ts:123 - 標題
  來源：本次引入；驗證程度：已重現。
  觸發鏈：進入點 -> 狀態/資料流轉 -> 錯誤結果。
  說明機制、影響與修正方向。
```

接著列：

```text
審查範圍與覆蓋
- mode、base/diff 或 audit system boundary。
- 已索引/抽查/追路徑的區域、關鍵檔案、測試與入口。
- 未涵蓋區域與原因。Audit/system review 若只看 uncommitted changes，必須明確說「這不是完整 system audit」。

改善建議
- 只在使用者要求 refactor/inconsistency/cleanup/architecture smell/flag conflict，或審查中看到具體維護風險時列出；若使用者明確要求但沒有具體建議，要寫「沒有發現具體改善建議」。

待確認問題
- 只列會影響判斷或修法的問題；合理但未證實可達的觸發鏈放這裡，不放 findings。

驗證
- 已跑的檢查與結果。
- 未跑的檢查與原因。

摘要
- 只在最後用 1-3 句補充整體判斷。
```

沒有 finding 時，直接說「沒有發現需要阻擋的問題」，但仍必須列 `審查範圍與覆蓋`、測試缺口或殘餘風險。若使用者要求 refactor/inconsistency/cleanup/architecture smell/flag conflict，也必須列 `改善建議`；沒有具體建議時明確說沒有。若使用者要求的是 Audit/system review，而實際只檢查 diff、少數檔案或只跑 build/lint，不得用「沒有發現需要阻擋的問題」包裝成完整結論；要明確說明目前只完成哪一段掃描。

## 行內 Comment

若環境支援 inline code comments，且使用者要求行內 review，才對 actionable findings 加行內 comment；不要把摘要、測試缺口、待確認問題或低信心推測寫成行內 comment。

## 常見審查焦點

- Correctness：輸入輸出、邊界條件、資料格式、時間/時區、null/undefined、錯誤分支。
- Integration：frontend/backend contract、API response shape、DB schema/read model、cache invalidation、事件/SSE/watchers、背景刷新與 stale response。
- Data ownership：誰是 source of truth、誰是 read model/cache、同步與 invalidation 責任是否清楚。
- Concurrency：request race、in-flight key、abort/cancel、重試、idempotency、all-or-nothing 行為。
- Security：SQL/XSS/command injection、權限檢查、secret exposure、trusted boundary、server-side validation。
- Tests：測試是否真的被 test runner discovery、是否覆蓋失敗路徑、是否只測 helper 沒測使用者流程。
- Deployment：env key、`.env.example`、migration、build package、feature flag、rollback、dirty worktree impact。
- Observability：錯誤是否被吞掉、log context 是否足夠、metrics/tracing/alert 是否能看出新失敗模式。
- UI：實際畫面、loading/disabled/error state、background refresh flicker、responsive layout、表單互動與可用性。
- Domain workflow/API：automation 是否循環觸發、side effect 是否可重入、欄位/資源 ID 是否正確、dry-run/apply 是否共用錯誤路徑、canonical 值是否被 round-trip 破壞。

## 子 Agent 使用

不要預設使用子 agent。只有在下列情境才考慮：

- 審查範圍很大，且可切成互不污染的 frontend/backend/security/data-flow 子問題。
- 已有 P0/P1 候選 finding，需要第二個獨立 pass 依 `觸發鏈` 欄位標準驗證路徑與機制。
- 使用者明確要求多 agent 或獨立交叉審查。

使用子 agent 時，傳 raw artifact、diff、檔案路徑與任務，不傳自己的結論、預期答案或懷疑點。要求子 agent 使用本 skill 做獨立 review，回收結果後再由主 agent 去重、校準嚴重度與決定是否上報。

## 回覆約束

用繁體中文回覆，保留程式碼、CLI、路徑、API 名稱與錯誤原文。檔案位置用 markdown link 或清楚的路徑加行號。CLI 指令要符合使用者目前 OS/shell；若不確定，標明假設或提供 PowerShell 與 zsh/bash 兩版。保持精簡，但 findings 的證據鏈要完整。
