---
name: agent-core-lite
description: "適用於一般跨檔或 3 步以上的實作、設定／runtime 漂移、同步／部署／commit／push，以及依證據驗證的工作。選用適當的領域契約時，仍保有執行責任。不適用於純唯讀 review，或需要持久化 Project ledger 的工作。"
---

# Agent Core Lite

負責範圍明確的實作，依序進行觀察（Observe）→ 界定範圍（Scope）→ 規劃（Plan）→ 執行（Act）→ 驗證（Verify）→ 回報（Report）。簡單問答與單步修改不需要此流程。

## 責任歸屬

- 純唯讀審查由 Review 負責。
- 使用者要求導覽且缺少實作脈絡時，由 Onboarding 負責。已授權的實作則在 Observe 內進行有限範圍的盤點，接著完成原本交付。
- 重複失敗轉交 agent-failure-debugging。
- 只有涉及可獨立驗證的子系統、必要的持久化交接、不可逆／高影響範圍工作，或須先審計才能確定工作清單的實作，才升級至 Project。檔案數或層數本身不足以構成升級理由。
- Engine 與 frontend skills 提供技術／領域契約；不取代執行、授權或驗證責任。

## 觀察與界定範圍

讀取適用規範、實際 diff、呼叫端（caller）、產生端（producer）、使用端（consumer）及既有測試。確認真正的權威來源，區分 repo、active 設定、runtime／快取與外部狀態。

共用行為採用 [verification](references/verification.md) 的探索與覆蓋方法。人工填完 consumer 清單不構成完整性證據。交代探索到的候選與尚未解決的動態路徑，明確標記刻意保留的差異。

修改前列明檔案、行為與成功標準。保留工作樹內無關的變更。全域資產留在 Config repo 與使用者層級的 Codex 目錄。

## 規劃

多步工作在 update_plan 可用時使用它；否則在對話中保留簡潔明確的計畫。每個任務交付可獨立測試的行為，所需安裝、設定與文件併入它們支援的任務。

進入 Act 前，只讀取相關的設計參考：

- [架構](references/architecture-preflight.md)：共享狀態／契約、權威、版本、並行與責任歸屬。
- [非同步異動](references/async-mutation-convergence.md)：不確定結果與持久化的結果收斂／恢復。
- [互動效能](references/interaction-performance.md)：高頻／高密度 UI 或共享排程資源。

記錄會改變契約的未決設計事項，並在實作前解決。這些參考提供領域不變條件；verification 提供證據方法。

## 執行

沿用既有模式並限定修改範圍。獨立讀取可平行執行；寫入、Git 與外部副作用依序執行。有限範圍的唯讀子 agent 能增加覆蓋時可使用，傳遞原始產物而非預期答案。主 agent 整合 findings，並負責寫入與最終驗證。

同一假設或動作失敗兩次後，停止盲試，以一次可觀測、可逆的檢查診斷。

## 驗證

為程式修改範圍定義證據前，讀取 [verification](references/verification.md)。使用同一條探索 → 判定依據／不變條件 → 實際檢查 → 敏感度／效能 → 驗證紀錄（receipt）流程。

部署後的入口是 scripts/verify-change.mjs。重用專案原生測試與追蹤；runner 將實際結果綁定至擷取的原始碼。依不變條件選方法，不機械套用所有技術。Probe 失敗、consumer 未交代、原始碼過期、有意義的故障挑戰未被攔截，或缺少必要效能量測，都不得產生通過的 receipt。

Lite 與 Project 使用同一方法。Lite receipt 不需要 Project ledger。既有 repo enforcement 仍是主要保護；全域指令不能證明業務不變條件。

Commit、push 與遠端驗證是不同狀態。已授權 push 且有適用遠端檢查時，必須驗證精確 revision 才能宣稱完成。Pending／failed／unknown 檢查仍須明列為未完成工作。

## 回報

說明變更、支持它的證據、剩餘邊界與必要的 runtime 重新載入。詳細結果引用 receipt。不重播 log，也不把測試說成超出它能支持範圍的證明。

最終交付前：核對實際 diff／status，直接檢查採納的 reviewer findings，確認每項需求都有適當證據，或明確標示尚未解決的邊界。
