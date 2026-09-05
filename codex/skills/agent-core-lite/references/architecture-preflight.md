# Architecture Preflight

只有 shared-state／shared-contract 或 ownership-boundary 風險成立時讀本檔；單一 consumer、單一 local state、無跨 boundary 的外科式修改不使用。

## 觸發

- Canonical state／shared contract 有 3 個以上操作入口或 production consumers。
- 修改共享 UI state、資料模型、serializer、parser、API、localStorage、preset、cache 或 invalidation。
- 行為跨 frontend、backend、storage、background request 或其他 ownership boundary。
- 涉及 server filtering、pagination、request race、stale response、optimistic 或 draft/committed state。
- 擴大 entity visibility／ownership，或讓 local／remote entity 共用 controller、tracker、poller、completion flow。
- 修改 generation、revision、snapshot、lock、publish、retry、supersession 或 restart recovery。
- 改變 live freshness、point-in-time validation、multi-source composition，或 controller 同時讀 state 並做 completion side effect。

## 必答

1. Canonical source of truth。
2. Draft、committed、cached、persisted state 的 owner 與邊界。
3. Producer、contract、production consumers，以及 must-align／intentional-divergence。
4. UI、serializer、API、storage、preset round-trip。
5. Race、cancellation、supersession、stale response 與 cache invalidation。
6. UI lifecycle 適用時的 portal、overflow、loading、error、cancel、focus restoration。
7. Version／revision／snapshot 的 immutable、publish、pinning、supersession。
8. Originating mutation、observer、completion、retry、rollback authority。
9. Cache validity、live freshness、mutation safety 與 UI observability 是否由不同機制正確負責。
10. 將以上 decision 轉為 [shared verification](verification.md) 的 invariant 與 boundary check；本檔定義架構判準，不另維護驗證程序。

Race、torn read、lost update、duplicate side effect、deadlock、supersession、restart recovery 等主張必須畫可達 timeline，標明 mutable source、I/O、version／lock、commit 與 observable failure。畫不出來時只能列 hypothesis。

未決事項若會影響 contract、ownership 或 downstream behavior，先列 blocking decision，不進 Act。純實作細節依既有模式處理。
