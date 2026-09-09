# 互動效能前置檢查

只有互動延遲會受高頻事件、高密度／虛擬化 surface、shared queue 或 background sync 競爭影響時讀本檔。

## 觸發

- pointermove、mousemove、mouseover、scroll、wheel、drag、touch move、resize 等連續事件驅動 state、render、layout 或 paint。
- 修改超寬、高密度、虛擬化、sticky、大量 cell／row 的 selection、scroll、geometry 或 render path。
- 單次互動成本隨 rows、columns、selection size 或 mounted DOM 成長。
- Geometry 同時依賴 width、height、zoom、scroll、sticky、virtualizer spacer 或 overscan。
- User-visible mutation、sync、retry 或 queue 與 background scan／worker 共用 lock、token bucket、upstream capacity 或其他排程資源。

## 必答

1. 定義 representative maximum load 與使用者可接受的 budget；受控對照、樣本與 receipt 使用 [shared verification](verification.md)，不另定量測程序。
2. Bounded event update strategy，例如 rAF、coalescing、throttle、ref 或 imperative overlay；高頻事件不得無界驅動 React commit。
3. 每次 event／render 與整段互動的時間、空間複雜度；不得在 hot path 引入未量測的 O(rows × columns)。
4. Transient interaction state 與 committed application state 的 owner。
5. Width、height、zoom、scroll、sticky、virtualizer 的 canonical geometry contract 與 intentional divergence。
6. Runtime evidence：UI 任務驗最大資料量、快速互動／捲動、zoom／字級、virtualization 邊界、blank frame、render／layout／paint；mutation／sync 任務分離 queue wait、upstream、local processing、write、verify 與 settlement。
7. 若 contention 本身是目標，明確設計 overlap／no-overlap 對照，辨識 CPU、I/O、DB、browser main thread、lock 或 upstream queue 的競爭來源。

這是條件式效能設計，不以固定 DOM 數、所有 frontend 修改或一般 CRUD 作為觸發。狀態收斂與 uncertain outcome 仍由 async-mutation-convergence reference 負責；本檔只擁有效能風險、領域判準與 acceptance targets，通用證據方法由 shared verification 負責。
