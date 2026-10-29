---
name: agent-core-lite
description: "適用於範圍明確的實作、設定／runtime 漂移、同步／部署／commit／push，依風險選擇領域契約與驗證。不適用於純唯讀 review，或需要持久化 Project ledger 的工作。"
---

# Agent Core Lite

負責範圍明確的實作；依證據與相依關係安排觀察、規劃、執行及驗證，不把階段名稱當固定儀式。局部修改依風險選用相關契約，不因步數少就略過必要邊界。

Process 選擇與授權依 AGENTS.md。已授權實作中的有限盤點由 Lite 接續完成，不因需要讀檔就另開 audit；領域 skill 不取代本流程的交付責任。

## 觀察與界定範圍

讀取適用規範、實際 diff、呼叫端（caller）、產生端（producer）、使用端（consumer）及既有測試。先對齊本輪修改目標、實際 checkout 與 runtime；沿用已確認的上下文，不把 task 初始 cwd、舊摘要或另一個 task 的完成宣稱當作目前狀態。

共用行為與事故調查採用 [verification](references/verification.md) 的探索、因果定位與覆蓋方法。事故先對齊來源與結果，再決定修正或緩解範圍；一般局部修改不因此擴成系統審計。人工填完 consumer 清單不構成完整性證據。交代探索到的候選與尚未解決的動態路徑，明確標記刻意保留的差異。

修改前列明檔案、行為與成功標準。保留工作樹內無關的變更。全域資產留在 Config repo 與使用者層級的 Codex 目錄。

## 規劃

有相依交付、範圍演進或 checkpoint 需求時，依 AGENTS.md 使用簡短計畫；以可驗證行為組織工作，安裝、設定與文件併入它們支援的交付。

進入 Act 前，只讀取相關的設計參考：

- [架構](references/architecture-preflight.md)：共享狀態／契約、權威、版本、並行與責任歸屬。
- [非同步異動](references/async-mutation-convergence.md)：不確定結果與持久化的結果收斂／恢復。
- [互動效能](references/interaction-performance.md)：高頻／高密度 UI 或共享排程資源。

記錄會改變契約的未決設計事項，並在納入正式實作前解決；需要取得證據時，可依 [受控實驗](references/architecture-preflight.md#受控實驗) 在既有授權內驗證。這些參考提供領域不變條件；verification 提供證據方法。

## 執行

保持既有契約與整合一致性，限定修改範圍；既有模式是起點，不是唯一解法。新證據支持替換方法時，在授權內核對相容性並保留必要結果。子 agent、重複失敗與副作用邊界依 AGENTS.md，不另設一套執行規則。

## 驗證

依 [verification 的適用層級](references/verification.md#適用層級) 選擇原生檢查或嚴格 runner，並使用與主張相稱的 oracle、真正入口及必要敏感度／效能檢查；重用有效證據，不為固定流程增加測試。需要嚴格 receipt 時使用 scripts/verify-change.mjs，不另建 Project ledger；規則文字不能代替 repo enforcement。

Commit、push 與遠端驗證是不同狀態。已授權 push 且有適用遠端檢查時，必須驗證精確 revision 才能宣稱完成。Pending／failed／unknown 檢查仍須明列為未完成工作。

## 回報

依 AGENTS.md「回答偏好」正面說明變更、實際行為與支持結論的證據。原生檢查回報必要的命令、結果與受測版本；使用嚴格 runner 時引用 receipt。影響使用、決策或下一步的缺口與 runtime 重新載入需求，放在相關結果旁具體交代；其餘查核細節留在工作紀錄，避免重播 log 或例行附上否定式保留聲明。

最終交付前：核對實際 diff／status，直接檢查採納的 reviewer findings，確認每項需求都有適當證據，或明確標示尚未解決的邊界。
