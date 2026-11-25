# 架構前置檢查

當變更涉及共享 state／contract、跨 ownership boundary、資料來源擴張或非同步時序時，使用本檔。單一 consumer 的局部修改若不影響這些契約，不套完整前置檢查；不以入口數、檔案數或出現某個關鍵字機械觸發。

## 在 Act 前解決相關決策

- **方案與複雜度：** 尚未定案且選擇會增加共享狀態、同步／恢復責任或抽象層時，對照能滿足相同硬性條件的簡單替代方案；比較呼叫端規則、ownership、失敗與維護成本，不只程式碼量。已定案且沒有新反證時不重開選型，不要求固定方案或 agent 數。
- **權威與生命週期：** canonical source 是誰；draft、committed、cached、persisted state 的 owner；原始 mutation、observer、completion、retry／rollback 各有何權限。區分 cache validity、live freshness、mutation safety 與 UI observability。
- **契約與可達入口：** producer → shared contract → production consumers；UI、serializer、API、storage／preset round-trip；需要一致與 intentional divergence。能力擴張時檢查首次建立、尚無資料及既有資料入口，不只已存在物件的成功路徑。產品替換／退場依 [verification](verification.md) 的既有契約。
- **參與範圍與失敗邊界：** 在既有權限與安全檢查內，依業務契約判定資料是否參與本次操作，再決定業務驗證與阻擋範圍。每個阻擋都應對應具體的失敗情境，在會造成該錯誤的操作前攔住，不阻塞與該風險無關的操作；例如，比對已載入的原文與草稿不必等待寫入鎖。已證實無關的資料不應阻擋有效項目；影響參與、去重或一致性的關鍵資料未知時，不能當成無關而略過。契約允許獨立成功的項目可隔離失敗並明示部分結果；有原子性或跨項目一致性要求時，不能用繼續處理弱化契約。
- **時序與版本：** 依實際來源定義 initialization、hydration、selection、request／event 的先後關係，涵蓋實際預設模式與關鍵反向順序。說清楚 cancellation、stale response、supersession、cache invalidation，以及 generation／revision／snapshot 的 immutable、publish、pinning、lock 與恢復責任。異步異動需持久化收斂時才讀 [async](async-mutation-convergence.md)。
- **使用者可見行為：** UI 任務才處理 portal、overflow、loading／error、close／cancel 與 focus restoration；效能風險成立才讀 [interaction performance](interaction-performance.md)。Server filtering／pagination 應明確定義 option 範圍、query 狀態及快取責任。

這些是依風險選用的設計問題，不是每次必答的十欄表。已有明確契約時引用並檢查本次變更，不重新設計；同一決策不在 plan、ledger、review 重複填寫。將本次適用決策轉為 [verification](verification.md) 的不變條件與真正入口檢查。

Race、torn read、lost update、duplicate side effect、deadlock、supersession、restart recovery 等主張須有可達 timeline，標明 mutable source、I/O、version／lock、commit 與 observable failure；否則只列 hypothesis。

無法由現有證據解決、且會實質影響 contract、ownership 或 downstream behavior 的決策才阻擋 Act。可沿用既有模式的實作細節直接完成，不因缺少不適用的表格欄位而停工。

## 受控實驗

為釐清上述決策，可在既有授權內，以隔離副本或暫存目錄執行可丟棄的原型或量測；先界定要區分的假設、觀察結果與副作用範圍，不必先定案才能取得證據。明確 read-only 或禁止寫檔的要求仍須遵守。

隔離目錄不等於副作用隔離：確認實驗不會使用正式資料或憑證產生未授權的外部寫入、費用或共享狀態變更；超出授權的步驟仍須確認。實驗不覆寫既有未提交變更，不自動納入正式程式碼。依結果更新設計；原型要正式採用時，仍須完成適用的規劃、變更審查與驗證，不能把原型成功當成正式整合已完成。
