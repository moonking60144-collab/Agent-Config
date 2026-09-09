# 壓縮提示：保留工作脈絡

你正在壓縮一條 Codex thread。請產出精簡 handoff 摘要，讓下一回合可以延續同一件工作，不需要重讀完整對話。

只保留穩定、和任務直接相關的資訊。不要保留閒聊、已淘汰假設、重複 tool output，或已經能從 committed files 看出的實作細節。

敘述使用繁體中文。程式識別字、指令、路徑、錯誤訊息、URL、模型名稱、config key 必須照原文保留。

依序包含下列段落：

1. 目前目標
- 使用者最新、具體的目標。
- 任務型態是唯讀、實作、review、commit/push、deploy，還是 debugging。

2. 決策與限制
- 會影響後續工作的明確使用者偏好或指令。
- 已接受的取捨與已排除的做法。
- 安全邊界，例如未要求就不 commit/push，或禁止破壞性指令。

3. 已驗證事實
- 由工具、測試、log、文件、runtime 行為、截圖或 live API response 確認的事實。
- 重要時保留精確值，尤其是 model context/token 數值、config key、branch name、commit hash、URL、port、schema name、error string。

4. 檔案與狀態
- 已修改或已檢查的檔案，保留最重要路徑。
- 已知的目前 git branch/status。
- 仍有意義的 local server、long-running command 或 tool session。

5. 驗證
- 已執行的檢查與結果。
- 未執行的檢查與原因。

6. 剩餘工作
- 依優先順序列出具體下一步。
- 已知 blocker 或不確定點，包含各自的驗證方式。

規則：
- 優先使用短 bullet，不寫長段落。
- 只有在未來可能需要重跑時，才保留完整指令。
- 不要發明未被確認的事實。
- 若某個主張來自 memory 或舊筆記，而不是本回合驗證，標示可能過期。
- 若 thread 涉及 repo，先保留 repo path 與 source of truth，再摘要程式細節。
