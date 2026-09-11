---
name: frontend-ui-designer
description: "適用於新 UI、視覺改版、原型、圖片／URL 轉程式、landing page、dashboard 或前端精修，且目標涉及版面、字體排印、色彩、動效、響應式行為或設計 QA。不適用於不涉及視覺或互動設計決策的一般前端邏輯 bug。"
---

# 前端 UI 設計

交付符合使用者任務、產品語境與既有系統的可用畫面。設計判斷應改善資訊層級與操作，不為追求個性重做已合適的元件，也不把此 skill 的建議變成額外授權門檻。

## 依任務選擇切入點

- **既有介面修改：** 從受影響元件、tokens 與畫面確認現況，保留既有字體、密度、版面與互動契約。小改不先做整站盤點、品牌提案或外部案例搜尋。
- **新頁面／改版／原型：** 確認目標使用者、主要操作、內容、品牌／裝置限制及交付型態。資訊足夠就選定方向並實作；只有會實質改變成果、又不能合理推斷的缺口才詢問。
- **Screenshot／URL／Figma 還原：** 依 [產品設計整合](references/product-design-integration.md) 取得來源、區分已看到與推測的狀態，並記錄必要替換。
- **唯讀視覺 audit：** 由 Review 保有唯讀邊界；輸出綁定畫面、步驟與狀態的 findings，不擅自進實作。

References 按需載入：新視覺方向可看 [visual directions](references/visual-directions.md)；檢討制式設計時看 [anti-generic patterns](references/anti-generic-patterns.md)；版面、裝置、輸入方式、色彩或文字／控制項辨識受影響時看 [responsive checklist](references/responsive-checklist.md)。不要求每次依序讀完所有 references。

## 設計判斷

先讓核心資訊與主要操作清楚，再決定 typography、色彩、密度、surface 與動效。Landing page 面向訪客的需求、信任與行動；內部工具優先資料可讀性、狀態可辨識及操作效率。不要把行銷頁的 hero、展示字體或大量留白強套到高密度表格。

整頁沿用一致的 tokens、文字層級與 surface language。只有任務明確要求新方向時才改變品牌語言。外部案例搜尋限需要新方向或使用者要求時，用足以支持決策的參考，不固定搜尋數量、不照搬品牌素材。

### 容器與語意色

- 一般 card、panel、callout 與設定容器，需要邊界時使用中性 `1px` border；不為了套樣式把所有內容都包成卡片。
- 禁止用 accent color 頂線、左線、rail、色帶、glow 或漸層線做無功能意義的裝飾。移除色線後不要換成淡色線、shadow、icon rail 或等價裝飾。
- 狀態用 dot、badge、icon、文字或淡語意背景；避免同一狀態同時疊彩色框、底色與文字。操作由 primary／destructive button 表達；敏感資料使用 code surface／monospace，不讓整張卡片取得 accent border。
- 例外僅限既有 design system 的明確模式、selected tab／navigation indicator、progress、chart／legend 或必要的 critical alert；仍提供文字、icon 等非顏色線索。

### 文案與素材

前台文案直接服務使用者，不放「頁面定位」「FAQ 的角色」「設計策略」等交付分析。不捏造電話、營業時間、評價、客戶數、年資、保固或合作關係；未知資訊省略或明確標成待確認，不用模糊措辭包裝成事實。

沿用合法取得的品牌素材、字體與適合的 icon library。圖片／logo 還原不能拿 emoji、文字方塊或臨時 CSS 圖形冒充；來源不足時說明替代。程式原生的圖表、幾何與既有 SVG 資產依任務正常使用，不一律改成生成圖片。

## 實作與互動

- 延續既有技術棧、元件庫與 spacing／type scale；新增 tokens 只限本次需要，不為局部變更重建整套設計系統。
- 功能 UI 與原型的主要 controls 應可操作；除非要求靜態 mock，不能只畫成功畫面。依受影響行為處理 focus、disabled、loading、empty、error、長內容與權限狀態。
- 驗證從真實可達入口開始，包括適用的首次建立／空資料狀態；後端能力存在不代表前端能啟動。共享 query／filter／sort 沿用 canonical state，不另建一份正式狀態。
- 響應式策略依產品目標選擇；桌機內部工具不強制從手機版重新設計，但須檢查受影響窄寬度、縮放與捲動。不要固定每個元件的 line-height、padding 或動畫毫秒數。
- 動效有必要才加，優先不擾亂閱讀與操作的屬性；避免 `transition: all`，尊重 `prefers-reduced-motion`。調整既有動效不得破壞必要 feedback。
- 修改 root、全域 CSS、sticky、portal 或暫態 overlay 時，確認掛載、退出與主題切換後的既有契約，不要求其他頁面補丁來適應局部功能。

## 驗收與交付

在已授權範圍內，以相同 viewport、theme、state 與內容比對來源及實作；操作主要流程，不只截 default state。版面、裝置與色彩／文字／控制項辨識的檢查依 responsive checklist，來源還原依產品設計整合 reference。無法執行的畫面或互動明確標示未驗證。

行為與跨 consumer 證據依 Lite 的 [verification](../agent-core-lite/references/verification.md)；高頻／高密度 UI 或共享資源競爭才讀 [interaction performance](../agent-core-lite/references/interaction-performance.md)。視覺通過不代替效能、資料流或正式寫入證據。

交付實際可開啟的位置、完成的行為、必要設計取捨與驗證邊界。小改不固定輸出九欄設計報告；重大改版才解釋關鍵 typography／色彩／版面決策。設計分析留在交付說明，不塞進產品畫面。
