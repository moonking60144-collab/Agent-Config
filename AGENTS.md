# Config Repository Governance

> 僅適用於本 Config repo。不要把本檔複製或部署到 user-level codex/AGENTS.md。

- 本 repo 的目標是減少重複規則、降低 always-loaded context，並把可編碼的 invariant 移到 script、schema、eval、CI 或 runtime enforcement。
- 事故不得直接翻譯成新 global gate。新增或擴張規則前，先確認既有 AGENTS、skill、conditional reference、validator、deployer 與 eval 無法涵蓋。
- 新規則必須有可重現 incident 或 failure artifact、positive case、negative control、false-positive boundary 與 retirement condition；原始 prompt／diff可得時做 historical backtest。同一 incident 衍生規則的重播最多標為 `incident_lineage_backtest`，不得冒充 autonomous detection。
- Stochastic routing replay 預設至少 3 次並記錄 hits/runs、Codex version、actual model、reasoning與 config／instruction digest；單次命中不能支持穩定性。
- 同族模型 self-review 只能作 supporting evidence；結論需標示信心上限，引用的檔案、diff、runtime 或 artifact仍由主 agent直接驗證。
- Repo enforcement 已穩定攔住問題時，縮短、合併或退役對應 prompt rule；不要保留「以防萬一」的重複 instruction。
- 若缺少 enforcement 會讓本次變更不安全，列為 blocking decision；若只屬後續 hardening，記錄 proposal，不擴大本次 scope。
- 修改 routing、AGENTS、skill description、conditional reference或 eval contract後，至少執行 Node validator與相關 classifier cases；無法執行時明確記錄未驗證邊界。
- Commit／push前以 staged diff、validator輸出與 result artifact為準，不依賴對話記憶敘述變更。
