# Interaction Performance Preflight

只有高頻事件或高密度／虛擬化 surface 的成本會隨資料量、DOM 或互動範圍成長時讀本檔。

## 觸發

- pointermove、mousemove、mouseover、scroll、wheel、drag、touch move、resize 等連續事件驅動 state、render、layout 或 paint。
- 修改超寬、高密度、虛擬化、sticky、大量 cell／row 的 selection、scroll、geometry 或 render path。
- 單次互動成本隨 rows、columns、selection size 或 mounted DOM 成長。
- Geometry 同時依賴 width、height、zoom、scroll、sticky、virtualizer spacer 或 overscan。

## 必答

1. Representative maximum load、baseline 與可量測 budget。
2. Bounded event update strategy，例如 rAF、coalescing、throttle、ref 或 imperative overlay；高頻事件不得無界驅動 React commit。
3. 每次 event／render 與整段互動的時間、空間複雜度；不得在 hot path 引入未量測的 O(rows × columns)。
4. Transient interaction state 與 committed application state 的 owner。
5. Width、height、zoom、scroll、sticky、virtualizer 的 canonical geometry contract 與 intentional divergence。
6. Browser evidence：最大資料量、快速互動／捲動、zoom／字級、virtualization 邊界、blank frame、render／layout／paint。

這是條件式效能設計，不以固定 DOM 數或所有 frontend 修改作為觸發。
