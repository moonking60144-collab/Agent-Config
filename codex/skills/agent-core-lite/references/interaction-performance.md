# Interaction Performance Preflight

只有互動延遲會受高頻事件、高密度／虛擬化 surface、shared queue 或 background sync 競爭影響時讀本檔。

## 觸發

- pointermove、mousemove、mouseover、scroll、wheel、drag、touch move、resize 等連續事件驅動 state、render、layout 或 paint。
- 修改超寬、高密度、虛擬化、sticky、大量 cell／row 的 selection、scroll、geometry 或 render path。
- 單次互動成本隨 rows、columns、selection size 或 mounted DOM 成長。
- Geometry 同時依賴 width、height、zoom、scroll、sticky、virtualizer spacer 或 overscan。
- User-visible mutation、sync、retry 或 queue 與 background scan／worker 共用 lock、token bucket、upstream capacity 或其他排程資源。

## 必答

1. Representative maximum load、controlled baseline 與可量測 budget；記錄資料規模、程序、PID、auto-sync／worker 狀態與測量環境。
2. Bounded event update strategy，例如 rAF、coalescing、throttle、ref 或 imperative overlay；高頻事件不得無界驅動 React commit。
3. 每次 event／render 與整段互動的時間、空間複雜度；不得在 hot path 引入未量測的 O(rows × columns)。
4. Transient interaction state 與 committed application state 的 owner。
5. Width、height、zoom、scroll、sticky、virtualizer 的 canonical geometry contract 與 intentional divergence。
6. Runtime evidence：UI 任務驗最大資料量、快速互動／捲動、zoom／字級、virtualization 邊界、blank frame、render／layout／paint；mutation／sync 任務分離 queue wait、upstream、local processing、write、verify 與 settlement。
7. Controlled comparison：量測期間不平行執行無關 test／build 或其他會污染 CPU、I/O、DB、browser main thread、lock 或 upstream queue 的工作；若 contention 本身是目標，明確設計 overlap／no-overlap 對照。
8. Evidence limit：correlation 不冒充 causation；沒有 representative runtime 不得標 performance complete，無法執行時保持 open／unverified。

這是條件式效能設計，不以固定 DOM 數、所有 frontend 修改或一般 CRUD 作為觸發。狀態收斂與 uncertain outcome 仍由 async-mutation-convergence reference 負責，本檔只處理量測與效能 acceptance。
