# 介入紀錄

觀察期：2026-10-13 至 2026-11-03。期間 Config 只修壞掉的東西，不新增 gate、skill 或 reference。

使用者需要出手糾正 agent 時記一行。觀察期結束後，只有「新的通用失誤」且有可重現 artifact 的項目，才依 [治理規則](AGENTS.md) 進 Config。

類別：

- **規則未遵守**：規則已寫，agent 沒照做。
- **工具或資料不可用**：環境、權限或資料缺口。
- **新的通用失誤**：既有規則與 enforcement 都沒有涵蓋。

| 日期 | Agent／session | 漏了什麼 | 類別 | 證據 |
|---|---|---|---|---|
| 2026-10-13 | Claude Code／b06c4ffc | 唯讀 review 任務符合 review skill 卻未呼叫；輸出未標嚴重度、findings 未置頂、未讀未提交的 diff | 規則未遵守 | 該 session transcript 沒有任何 Skill 呼叫；對照 review skill 內文 |
