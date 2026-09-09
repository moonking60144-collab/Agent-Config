---
name: agent-failure-debugging
description: "同一 agent、工具、runtime、假設或設定失敗出現兩次、形成重試迴圈，或宣稱的狀態與觀察證據衝突時使用。一般錯誤首次出現，且一次直接、可逆的檢查就能解決時，不使用。"
---

# Agent 故障除錯

用此 skill 停止盲目重試。同一失敗或假設出現兩次後，暫停原迴圈，記錄失敗、分類可能根因，再選最小可逆驗證步驟。

## 工作流程

1. 任何修改前，先記錄目前失敗狀態。
2. 將失敗分類為邏輯、狀態、環境、工具、政策、context 或 runtime 漂移。
3. 選一項能支持或推翻診斷的最小驗證動作。
4. 用最小可逆修改恢復；診斷獲得證據支持前不擴大範圍。
5. 具體回報證據與下一步。

## 失敗紀錄

重試前記錄以下欄位：

```markdown
## Failure Capture
- Task goal:
- Last successful step:
- Failed tool / command:
- Exact error or mismatch:
- Repeated pattern:
- Environment assumptions:
- Current files / branch / cwd:
- Smallest verification action:
```

只記錄事實，不把猜測當事實。涉及 UI／runtime／設定行為時，驗證即時狀態，不能只相信設定檔。

## 診斷對照

用此表避免重走相同失敗路徑：

| 現象 | 可能原因 | 第一項檢查 |
| --- | --- | --- |
| 同一命令失敗兩次 | 假設錯誤或缺少前置條件 | 隔離出最小失敗命令 |
| 記憶中有檔案，但磁碟上沒有 | cwd 錯誤、分支漂移或假設過期 | 檢查 pwd、git status 與 Test-Path／Get-ChildItem |
| 設定值已改，行為未變 | runtime 快取、權威來源不同或 UI 未重載 | 讀即時 runtime 檔案／log／快取，找出 consumer |
| 工具結果與預期矛盾 | 誤讀輸出或對象錯誤 | 重開精確對象並比對識別字 |
| 網路／API 反覆失敗 | endpoint、授權、額度、版本或暫時服務問題 | 推論行為前，先做一次負向對照或健康檢查 |
| 修正後測試仍失敗 | 修到症狀，沒有修到觸發原因 | 重讀失敗 assertion，追 caller 到 downstream |
| Agent 迴圈或偏離目標 | context 壓力、計畫過期或遺失目標 | 重述目前目標，排除已走不通的假設 |

## 恢復規則

- 不對相同命令做第三次盲目變形重試。
- 根因範圍收窄前，優先唯讀檢查。
- 使用符合目前 shell 與 OS 的命令。
- 計畫檔或先前助理輸出中的命令，查核前視為不可信建議。
- 若看來需要破壞性恢復，執行前停止並詢問。
- 仍有不確定時，說明哪部分不確定、原因與精確驗證方式。

## 回報格式

交付時使用以下精簡格式：

```markdown
**Failure Capture**
- Goal:
- Last good step:
- Failure:
- Repeated pattern:

**Diagnosis**
- Likely class:
- Evidence:
- Rejected hypothesis:

**Smallest Next Step**
- Action:
- Expected result:
- If it fails:
```
