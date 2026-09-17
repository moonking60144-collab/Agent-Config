---
name: review
description: "適用於唯讀 review、審計、檢查、PR／diff／架構／整合／安全／資料流／UI 評估，或要求列出問題。優先回報有證據支持的 findings；使用者未授權修改時不實作。"
---

# 審查（Review）

採用 issue-first、唯讀立場。找可達 bug、回歸、資料流／部署風險與缺漏證據；不要把風格偏好或無證據推測當 finding。延續 task 已明確約定的審查任務：使用者貼作者交付說明，不代表改成文案評論；明確要求只審文字時才以文字為範圍。

## 範圍與方法

1. 確認模式與實際對象：uncommitted、branch/PR、system audit、re-review。沿本輪要求與已知路徑定位 checkout、base／snapshot；task cwd 不是唯一候選。Uncommitted 看實際 status、staged/unstaged diff 和相關新檔；PR 用 merge-base；system audit 依系統邊界。已指定目標可直接唯讀查看，不因目前 worktree 為空就要求使用者搬檔；仍有多個合理目標時才問。
2. 讀 governing instructions 與現有模式，用 rg／symbol graph／test names 索引後追 caller → implementation → downstream。事故／根因調查依共用 verification 的因果定位方法反查來源；一般 diff review 不因此擴成全面事故調查。作者摘要與舊 finding 用來定位，不能代替實際程式與證據；廣義 audit 不得縮成只看 diff。
3. 從 producer／contract 反查 consumers，包含 sibling/history/detail/admin/不同裝置入口；盤點依據與排除理由依 [verification](../agent-core-lite/references/verification.md)。Agent 自填的完整清單不是 discovery proof。
4. 以需求與獨立 oracle 判斷行為；看實際輸入、輸出、狀態、I/O、副作用及 guards。共享架構／並發問題讀 architecture-preflight；符合 async 適用條件才讀 async-mutation-convergence；互動效能風險才讀 interaction-performance。
5. 使用 shared verification contract 評估既有 checks、生成反例、故障敏感度與效能證據。可執行已授權的唯讀測試或隔離 fixtures；不因 Review 自動執行 mutation、部署、formatter --write、migration 或外部寫入。
6. 分開記錄程式正確性、test discovery、實際 runner 結果、runtime 與未驗證邊界；artifact 存在／hash 正確不代表內容足以支持 claim。

## Finding 標準

每個 finding 必須有：

- 優先級 P0/P1/P2/P3，精準檔案與行號。
- 來源：本次引入、既有被放大、既有順帶發現。
- 驗證：已重現或已追可達路徑；推測另列。
- 入口 → 狀態／I/O／呼叫鏈 → observable failure；確認 caller guards、feature flags、權限與例外是否已擋住。
- 影響、證據與最小修正方向。

P0 是 production/data/security 阻塞；P1 是常見路徑錯誤且無合理 workaround；P2 是 edge case 或有 workaround；P3 是輕微維護問題。兩級間取低級；blast radius 只作同級排序。P0/P1 先嘗試推翻自己的觸發鏈。

Race、torn read、stale write、duplicate side effect、deadlock、supersession 與 recovery 主張必須有可達 timeline；無法構造時只列 hypothesis。測試失敗也要歸因；PR/re-review 不把無關既有環境問題算成本次回歸。

PR/branch 只列本次引入與既有被放大；system audit 可列既有問題並標明。Re-review 檢查原 finding、修補直接回歸及同一失敗機制尚可達的相鄰路徑，不擴張無關 backlog。若同族缺口反覆出現，重建一次該契約的 producer／consumers 與狀態／事件順序，不逐條補完就宣稱整族閉合。合併同 root cause，不湊 finding 數量。

## 證據審核

[Verification contract](../agent-core-lite/references/verification.md) 是共同方法來源；Review 不擁有另一份 evidence checklist 或 completion implementation。

特別核對：

- Discovery 是否真能找出 diff 未提及的 consumer，動態入口是否有相應 trace／registration 證據。
- Oracle 是否來自需求與權威契約，而非 mock 對實作選擇的重述；核心結果仍錯時是否也會通過。生成序列是否可重播，fault 是否真正到達目標 assertion。
- Helper／unit 是否被冒稱跨邊界 proof；參考相同 producer/wrapper/consumer 的 composed execution。
- 效能是否有可比較的負載、環境、原始樣本與 budget；功能綠燈不是效能證據。
- Receipt 與目前 source/test snapshot 是否一致；實際 command、timeout、失敗及未知狀態是否如實呈現。另一 task 仍在修改時，結論綁定讀到的 snapshot，不宣稱後續版本已通過。

## 風險地圖

依 task 選取：API/serializer/read model、ownership/authority、auth/secret、state/cache/invalidation、events/retry/recovery、test discovery、deployment/rollback、觀測性、UI lifecycle與高負載互動。不要每個任務機械填完整張地圖，也不要只查 helper 就替系統下結論。

外部版本/API/產品行為查一手來源。OS、shell、runner 命令沿目前環境。必要時分區審核並寫清楚覆蓋邊界。

## 子 Agent

大型或可分區 review、獨立驗證與對抗檢查可使用 read-only reviewers。傳 raw task/diff/path，不餵 expected finding；主 agent 直接核對所有引用證據。小範圍本地完成即可，工具不可用時用 rg 與分區閱讀。

## 輸出與停止

Findings 先按嚴重度排列，再說明範圍、證據／測試、殘餘風險與必要的定義改善。沒有 finding 時明確說明已覆蓋的範圍；沒有 runtime 證據不能包裝成完整驗證。只有使用者要求行內 review 時才加 actionable inline comments。

使用者要求 cleanup/inconsistency 或觀察到具體維護衝突時，列有位置及修法的改善建議，與 behavioral findings 分開。範圍查完即停，不擴張與 re-review 無關的 backlog。沒有實作授權時不寫檔、stage、commit、push。
