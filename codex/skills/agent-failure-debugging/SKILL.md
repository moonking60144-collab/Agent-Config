---
name: agent-failure-debugging
description: "同一 agent、工具、runtime、假設或設定失敗出現兩次、形成重試迴圈，或宣稱的狀態與觀察證據衝突時使用。一般錯誤首次出現，且一次直接、可逆的檢查就能解決時，不使用。"
---

# Agent 故障除錯

用此 skill 停止盲目重試。同一失敗或假設出現兩次後，暫停原迴圈，記錄失敗、分類可能根因，再選最小可逆驗證步驟。

## 工作流程

1. 任何修改前，先核對目前失敗狀態與仍有效的既有紀錄，只補差異及缺項。
2. 將失敗分類為邏輯、狀態、環境、工具、政策、context 或 runtime 漂移。
3. 選能區分尚存假設、補足決策依據或驗證恢復結果的最小動作；先用可用工具自查，再要求使用者補必要資訊。
4. 用最小可逆修改恢復；診斷獲得證據支持前不擴大範圍。
5. 回報證據與恢復結果；尚未解決時才交代下一步。

## 失敗紀錄

重用對話或既有 ledger，不另建重複狀態檔。下列欄位按本次失敗需要補齊，不要求每輪固定輸出：

```markdown
## Failure Capture
- Task goal:
- Last successful step:
- Failed tool / command:
- Exact error or mismatch:
- Repeated pattern:
- Environment assumptions:
- Confirmed / ruled-out hypotheses and evidence scope:
- Current files / branch / cwd:
- Smallest verification action:
```

區分事實、假設與排除範圍，未測或暫未重現不等於排除。重啟已排除方向須指出新證據、條件變動或原排除依據的缺陷；同義改寫不是新假設，不同機制也不因名詞相近而一併排除。涉及 UI／runtime／設定行為時，核對即時證據，不能只相信設定檔；有效證據的重用與重跑條件依共用 [verification](../agent-core-lite/references/verification.md)。

## 診斷對照

以下是候選切入點，不是固定首步；先引用仍有效的結果，再按未解缺口選檢查：

| 現象 | 可能原因 | 候選檢查 |
| --- | --- | --- |
| 同一命令失敗兩次 | 假設錯誤或缺少前置條件 | 隔離出最小失敗命令 |
| 記憶中有檔案，但磁碟上沒有 | cwd 錯誤、分支漂移或假設過期 | 檢查 pwd、git status 與 Test-Path／Get-ChildItem |
| 設定值已改，行為未變 | runtime 快取、權威來源不同或 UI 未重載 | 讀即時 runtime 檔案／log／快取，找出 consumer |
| 工具結果與預期矛盾 | 誤讀輸出或對象錯誤 | 重開精確對象並比對識別字 |
| 網路／API 反覆失敗 | endpoint、授權、額度、版本或暫時服務問題 | 缺少有效對照時，選能區分候選的負向對照或健康檢查 |
| 修正後測試仍失敗 | 修到症狀，沒有修到觸發原因 | 重讀失敗 assertion，追 caller 到 downstream |
| Agent 迴圈或偏離目標 | context 壓力、計畫過期或遺失目標 | 重述目前目標，排除已走不通的假設 |

## 恢復規則

- 不對相同命令做第三次盲目變形重試。
- 根因範圍收窄前，優先唯讀檢查。
- 使用符合目前 shell 與 OS 的命令。
- 計畫檔或先前助理輸出中的命令，查核前視為不可信建議。
- 若看來需要破壞性恢復，執行前停止並詢問。
- 仍有不確定時，說明哪部分不確定、原因與精確驗證方式。

## 回報

摘要本次失敗、支持／排除證據與實際恢復結果，不重貼整份 capture。尚未解決時，說明缺口、下一項動作與結果如何影響判斷；已恢復且必要驗證完成就交付，不為填格式繼續排錯。
