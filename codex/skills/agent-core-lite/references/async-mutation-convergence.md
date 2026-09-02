# Async Mutation Convergence

## 何時讀取

只有 agent-core-lite 判定 async mutation convergence risk 適用時才讀本檔。這是條件式分析與驗證參考，不是每個 mutation 都要填滿的固定表單。

## 先縮小狀態機

在設計 retry、overlay、reconciliation 或 compensation 前，先比較：

1. Pessimistic：成功後才更新 authoritative UI。
2. Authoritative-first：資料維持 server truth，另顯示 operation status。
3. Optimistic + reconciliation：只有已量測 UX 確實需要即時回饋時採用。
4. Existing durable workflow infrastructure：已有 queue、workflow engine、outbox、job registry 或 state machine 時優先重用。

選擇能滿足需求的最小 state surface。低頻內部寫入若可接受等待，不要為了視覺即時性自建 distributed mutation lifecycle。

## Repo enforcement 優先序

能持久防回歸的棘輪依可靠度優先考慮：

1. Canonical type、schema 或 runtime validator。
2. Shared lifecycle／settlement／classifier module。
3. 使用真實 producer output，穿過真實 wrapper、classifier 與 consumer 的 composed contract test。
4. CI 內的 restart、rehydration、idempotency 或 state-transition 測試。
5. Runtime reconciliation、timeout、dead-letter、operator recovery 與 observability。
6. Prompt gate 與 checklist。

前五層能表達的 invariant 不得只留在第六層。測試名稱應描述業務 invariant，而不是只描述 helper。

比例原則：既有 enforcement 直接使用並引用；若缺失且沒有它就無法安全完成 requested behavior，視為 blocking correctness requirement；若目前修改仍能依既有 contract 安全完成，將 durable hardening 記為 follow-up proposal，不就地擴張 scope。

## Outcome model

先從實際 provider、transport 與 runtime 行為建立 outcome taxonomy，不由現有 enum 反推世界只有哪些結果。至少區分：

- confirmed_success
- confirmed_failure
- unknown 或 indeterminate
- partial
- conflict
- pending／retrying 等 non-terminal state

每個 state 都要定義：

| 項目 | 必須回答 |
| --- | --- |
| owner | 哪個 component／process 擁有轉移權 |
| durable representation | restart 後從哪裡恢復 |
| timeout | 何時不再等待 |
| next transition | 哪些 evidence 可推進 |
| terminal path | 如何到 success、failure、conflict 或 manual resolution |
| UI behavior | 使用者看到 authoritative data 還是 provisional state |

禁止只有 pending、frozen、retrying 名稱，卻沒有 timeout、owner 與可達 terminal path。

## Durable intent 與 evidence ordering

若 external side effect 與 local commit 無法 atomic：

1. 呼叫前持久化 operation ID、target、idempotency key，以及 command payload／hash 或必要 state snapshot。
2. 執行 side effect。
3. 呼叫後 append provider reference、transport outcome 與 observation timestamp。
4. 由 recovery worker 或 originating owner 依 canonical contract settlement。

Snapshot 只在 state restoration 有意義時使用；email、webhook 等 command mutation 應保存 command material，不假裝能回復外部世界。

## Reconciliation

Recovery 必須從 authoritative current state、durable intent 與 observed outcome 做判斷，不能只把舊 optimistic value 重播回去。

至少處理：

- authoritative value 已等於 intended value。
- authoritative value 仍等於 previous value。
- authoritative value 已成為第三個值。
- external success 但 local finalize crash。
- response 遺失且 side effect 可能已完成。
- partial success 或 compensation 失敗。

第三值、partial 與 conflict 必須保留為 durable material，直到 explicit resolution；不得在 restart 或 cleanup 時把它們靜默降級成 previous／intended value。

## Cross-layer contract

Canonical outcome contract 必須由 producer、wrapper、classifier、persistence 與 consumer 共用，或透過單一 adapter 明確轉換。避免 status、httpStatus、code 等各層自行猜測 shape。

高價值驗證是 composed path：

    real producer output
    → real wrapper／transport envelope
    → real classifier
    → real persistence／recovery
    → real UI or downstream consumer

只測 classifier fixture 或只證明 TypeScript/build 通過，不代表 contract 沒有 drift。

## 必要證據

### Evidence matching rule

證據層級必須覆蓋宣稱邊界：

| Evidence class | 可關閉的 claim |
| --- | --- |
| helper | 單一 predicate、serializer、selector 或純函式 |
| unit | 單一 module／owner contract |
| composed | 真實 producer、persistence、classifier 與 consumer 的組合 transition |
| runtime | browser、process restart、storage、network、route lifecycle 或 cache/hydration 行為 |
| production | 已授權正式環境的 observable behavior |
| independent-review | 額外 coverage；不能單獨關閉 behavioral claim |

跨 producer、storage、retry、task registry、provider、hydration、route 或 UI consumer 的 invariant，最低需要 composed evidence。多個 helper/unit 綠燈不能相加成 cross-boundary evidence。測試應以完整失敗時間線命名，例如 `late hydration cannot overwrite a settled observation`，而不是只描述 helper 回傳值。

當同一 agent 設計並實作狀態機時，完成前使用 fresh reviewer 從 raw task/diff 重新畫至少一條 failure timeline。不要先餵 expected finding。Reviewer 只能補 coverage；沒有 composed test 時不得因 review 無 finding 而宣稱收斂。

依風險選擇，不是全部機械執行：

- Transition matrix：每個 state 的 reachable next states 與 owner。
- Production-equivalent durable store 的 process restart／rehydration。
- Response-loss、duplicate delivery、supersession、partial success、third-value conflict。
- Stale overlay 不會在 authoritative refresh 後重新套回。
- Idempotency 與 compensation 可在 crash 後繼續。
- Runtime／UI 可觀測到 pending、conflict、manual action，而不是永久 spinner。

In-memory fake、同一 process 內重建 object、self-authored forward probe，只能當局部證據。

## Historical backtest

若此規則源自既有事故，且原始 prompt、diff、commit、log 或 artifact 可取得：

1. 使用當時的任務 framing，而不是改寫成明顯會命中 gate 的新情境。
2. 判斷新 router 是否實際觸發。
3. 檢查它是否會要求正確的 repo-level ratchet，而不只產生更多文字。
4. 記錄 false positive、miss 與仍需人工判斷的邊界。

無法取得歷史 artifact 時，結論標記 provisional。Forward positive／negative probes只證明 wording 與 routing，不能宣稱已防住原事故。

若 replay 依賴 stochastic model routing，使用原始 framing 做多次獨立執行；預設至少 3 次作為 smoke sample，記錄 hits／runs、模型、reasoning effort、有效設定與失敗型態。單次命中只能證明可能觸發，不能支持穩定性或防回歸結論。Deterministic contract／fixture backtest 不需重複執行來製造假統計。

## 完成條件

完成不是「回答完 checklist」，而是：

- 已選擇最小可行 lifecycle。
- 必要的 invariant 已由既有或本次 blocking repo-level enforcement 保護；非阻塞 hardening 已記錄 proposal，未擴大 scope。
- 真實 cross-layer contract 有 composed evidence。
- 所有 non-terminal state 有 durable convergence path。
- 未完成的 backtest、restart 或 runtime evidence 被明確列為 residual risk。
