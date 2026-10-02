# Config Repository Governance

> 僅適用於本 Config repo。不要把本檔複製或部署到 user-level codex/AGENTS.md。

- 目標是減少常駐規則與重複維護，讓可編碼的不變條件優先由 repo 的型別、共用實作、測試或 runtime 保護。
- 事故先判斷是既有要求未落實、工具／資料缺口，還是新的通用失敗模式；只有現有規則與 enforcement 不足時才擴張。以原始案例和適用／不適用邊界支持修改，不為每次文字整理建立完整事故表格。
- 優先替換、合併或退役重複條款；repo enforcement 已承接責任時，縮短對應 prompt。授權、資料 ownership 與證據誠實度不是可刪的流程裝飾。
- Enforcement 缺口只有在影響本次安全交付時才阻擋；其他 hardening 留為建議，不順帶擴大範圍。

## 驗收依變更主張選擇

- 文字／引用／格式由靜態檢查與 Node validator 覆蓋；routing 變更才補相關 classifier cases；行為改變看真實任務輸出與操作紀錄。Classifier、同步 hash、規則文字存在均不能代替行為證據。
- 要判斷新規則或刪減是否改善品質時，對照現行版與候選版，固定相關模型設定、工具、資料及授權條件；執行前定義必要結果與不可接受的退化。單純修字不跑模型比較。
- 案例包含會觸發的任務與接近但不應觸發的情境，保留未用於調整規則的案例。歷史 prompt／快照可得才稱精確 replay；同源重建只算 incident-lineage 證據，不冒充自主發現新事故。
- 比較者不看新舊標籤；可執行的結果用獨立 oracle，其餘核對原始產物與 trace。必要正確性先於風格分數，允許無差異、兩者皆失敗或證據不足，不強迫選贏家。
- 依變異與決策風險安排重播，記錄 hits/runs、實際模型、reasoning、執行工具版本與受測 instruction digest；少量通過不證明穩定性。同族模型判讀只作補充，未執行或受限的項目如實交代。
- 必要行為與授權邊界仍成立、且沒有可辨識收益時，優先較簡單的版本；沒有證據不等於可任意移除保護。已有有效證據可引用，不每次 commit／push 重跑整套評估。

採用 [Anthropic skill-creator](https://github.com/anthropics/skills/tree/main/skills/skill-creator) 的 baseline／盲比方法，不照搬其評分權重或部署方式；模組設計參考 [Matt Pocock codebase-design](https://github.com/mattpocock/skills/blob/main/skills/engineering/codebase-design/SKILL.md)，不引入新 skill 或 framework。
