# 介入紀錄（歷史樣本）

觀察期：2026-10-13 至 2026-11-03，已結束。原訂期間只修故障、不新增 gate、skill 或 reference；實際期間仍有功能變更，紀錄只持續至 10/14，未形成固定版本的完整對照。

2026-11-17 回顧：以下樣本可定位個別失誤，不用來估計整體改善率、缺陷率或 skill 去留。停止維護這份獨立台帳，保留既有紀錄；後續在相關工作紀錄引用原始 artifact，依 [治理規則](AGENTS.md) 判斷修正、整合或退役，不追補無原始證據的事件。

類別：

- **規則未遵守**：規則已寫，agent 沒照做。
- **工具或資料不可用**：環境、權限或資料缺口。
- **新的通用失誤**：既有規則與 enforcement 都沒有涵蓋。

| 日期 | Agent／session | 漏了什麼 | 類別 | 證據 |
|---|---|---|---|---|
| 2026-10-13 | Claude Code／b06c4ffc | 唯讀 review 任務符合 review skill 卻未呼叫；輸出未標嚴重度、findings 未置頂、未讀未提交的 diff | 規則未遵守 | 該 session transcript 沒有任何 Skill 呼叫；對照 review skill 內文 |
| 2026-10-13 | Claude Code／b06c4ffc | 寫 pre-push hook 前沒讀 git 對 hook 執行環境的官方說明；hook 讓測試繼承 GIT_DIR，改寫了正式 repo 的設定 | 規則未遵守 | githooks 官方文件；git-isolation 測試 |
| 2026-10-13 | Claude Code／b06c4ffc | 沒有入口盤點就宣稱「目前沒有路徑會觸發」 | 規則未遵守 | 另一個 agent 的 review 指出；事後以入口盤點補證 |
| 2026-10-14 | Claude Code／b06c4ffc | 只讀 40 個 plugin 的一行說明，就宣稱官方 marketplace「沒有其他值得裝的」，漏掉 typescript-lsp | 規則未遵守 | 使用者追問後重新檢查：LSP 工具支援 findReferences 與 incomingCalls，ragic-report 有 1,034 個 TypeScript 檔 |
| 2026-10-14 | Claude Code／b06c4ffc | 把 claim-check 交給主模型的判斷當成要回報給使用者的內容，每輪把查證過程寫成表格；交付指示也要求向使用者說明不成立的項目 | 規則未遵守 | 使用者指出這是讓主模型補漏、不是給使用者看的；改為 v0.3.0（`2717bdd`） |
| 2026-10-14 | Claude Code／b06c4ffc | claim-check 的規則與回報說得過滿：「理由是證據裡沒有就標無法確認」比標籤定義寬，會吞掉真正的證據不足；「直接更正、不必說明」可能讓已交付的錯誤被默默改掉；把自己判定的 15 項稱為命中率 | 規則未遵守 | 使用者貼來的外部評論指出；修正於 `eafb2cb`、`f3303c9` |
| 2026-10-14 | Claude Code／b06c4ffc | 把個人工作流的 marketplace 取名 funda-config，作者與 owner 照公司電腦的 git 身分填 FD0287，沒有分清資料歸屬 | 規則未遵守 | 使用者指出這是個人工作流、不是公司專屬；改為 agent-config 與 GitHub 帳號 |
