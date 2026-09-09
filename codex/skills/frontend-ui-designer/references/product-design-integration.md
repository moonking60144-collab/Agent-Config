# 產品設計整合參考

這份文件把 Product Design plugin 裡值得長期吸收的工作方式，轉成 `frontend-ui-designer` 的可執行規則。目標不是複製外部 plugin，而是讓前端設計任務更像產品設計流程：先鎖定 brief、確認視覺來源、做可互動原型、用證據 QA，再交付。

參考來源：

- OpenAI Product Design plugin：`role-specific-plugins/plugins/product-design`
- OpenAI role-specific plugins README：role-specific plugins 是可自訂的 domain-specific skills、connectors、assets package
- Product Design README：將 idea、URL、screenshot、design image 轉成 prototype，支援 audit、URL-to-code、image-to-code、share
- Product Design skills：`get-context`、`prototype`、`url-to-code`、`image-to-code`、`audit`、`design-qa`

---

## 1. Design Brief Gate

設計 / 重設計 / prototype / clone / image-to-code / URL-to-code 任務開始前，先確認 brief。若資訊已足夠，就用 playback mode 簡短回放；不要重新問已提供的內容。

Brief 至少包含：

- 產品或畫面：要做哪個 app、feature、flow、component、page。
- 使用者任務：使用者來這裡要完成什麼。
- 視覺來源：現有 codebase、design system、Figma、screenshot、URL、reference image、brand tokens，或明確說沒有。
- 互動層級：完整可互動、重點互動、或靜態 mock。
- 成功條件：這次是探索方向、落地 production UI、 faithful recreation、還是 critique/audit。

如果 brief 缺失會改變設計方向，先問。若只是可合理推斷的細節，直接推斷並在交付摘要說明。

---

## 2. Visual Target Rule

文字 brief 不是 visual target。

以下才算 visual target：

- 使用者提供的 screenshot、mockup、image、Figma frame。
- 已開啟並截圖驗證過的 live URL。
- codebase 中既有頁面或元件的實際 render。
- ImageGen 或其他工具產出的候選設計，且使用者已選定。

沒有 visual target 時：

- 新產品 / 大改版：先產生或描述 2 到 3 個明確 visual direction，讓使用者選方向後再 build。
- 小改 / polish / 既有 design system：可直接沿用現有系統，不需要額外產 mock。
- 使用者明確要求快速落地時，也不能把「抽象風格詞」當成 visual target；至少要用現有 codebase 與產品語境當來源。

---

## 3. Source Capture Contract

從 URL、screenshot、Figma 或既有畫面實作時，要先取得來源證據，再寫 UI。

來源證據應包含：

- Desktop 與 mobile 主要 viewport。
- Header、navigation、footer、主內容區、sticky elements。
- 可見互動：button、link、form、menu、drawer、modal、tab、filter、carousel、tooltip。
- 狀態：hover、focus、active、loading、empty、error、disabled、success。
- Asset：logo、image、icon、font、illustration、video、texture、background。
- Token：color、spacing、radius、shadow、typography scale、motion duration。

不要從記憶、單張截圖或猜測 CSS 開始實作。如果來源無法取得，要把缺口明確列為限制。

---

## 4. Prototype Build Contract

Prototype 不是靜態截圖轉 HTML。除非使用者指定純靜態，否則第一屏與主要流程的 controls 要可操作。

Prototype 至少要有：

- 可點擊 navigation、CTA、tab、filter、modal、drawer 或當前畫面明示的主要互動。
- 表單有 focus、validation、error/success feedback。
- 列表、dashboard 或資料畫面有 realistic mock data、empty state、loading state。
- Icon / image / illustration 不能用 emoji、文字符號、placeholder block、CSS art 或隨手畫的 inline SVG 假裝。使用專案既有 asset、可授權 icon library，或生成 / 擷取合適 bitmap asset。
- 不新增使用者沒要求的 routes；若只做當前 screen，就把當前 screen 做完整。

---

## 5. Design QA Gate

交付 UI 前要做 evidence-based QA。小改可輕量檢查，大型 prototype / image-to-code / URL-to-code 必須用 browser screenshot 檢查。

QA 要比較：

- 來源 visual target 與 implementation 是否同一 viewport、theme、state、content。
- Typography：font family、weight、size、line-height、wrapping、中文 fallback。
- Layout：alignment、spacing、grid、section rhythm、surface hierarchy。
- Color tokens：背景、文字、accent、semantic status、contrast。
- Assets：圖片清晰度、裁切、logo/icon fidelity、透明邊緣、比例。
- Copy：畫面文字是否是對使用者說話，不是把設計策略寫進前台。
- Responsive：至少 mobile / desktop；必要時加 tablet。
- Interaction states：hover、focus、disabled、loading、empty、error。

若還有 P0/P1/P2 等級的版面破裂、主要互動壞掉、來源明顯不符、文字重疊、不可讀、資產缺失，就不要把任務回報為完成。

---

## 6. Audit vs. Design QA

兩者不要混用：

- Audit：使用者要你 critique、review、inspect、evaluate 某個 flow / screen / product experience。輸出 findings，重點是 UX、accessibility、product clarity。
- Design QA：你已經實作完 UI，交付前拿 source visual target 對 implementation 做 fidelity check。輸出 fix list，重點是有沒有做到位。

Audit 要先 capture flow，findings 必須綁定 screenshot / step / state，不是憑空評論。

---

## 7. Handoff Contract

交付時要讓下一輪可繼續，不只說「完成」。

對實作任務回報：

- 可開啟的 URL 或檔案位置。
- 視覺方向與設計系統關係。
- 實作到哪些互動 / state。
- QA 做了哪些 viewport / state。
- 仍未驗證或刻意留下的 P3 polish。

如果是 prototype，可以補一句可用 annotations 或指定畫面元素做下一輪微調；不要把這種提示寫進 app 畫面。
