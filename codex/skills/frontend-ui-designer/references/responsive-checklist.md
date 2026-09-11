# 響應式與可用性檢查

只選本次版面、裝置、輸入方式、色彩或文字／控制項辨識會影響的項目；純配色修改也須檢查相關對比與狀態辨識，不必因此檢查無關的版面項目。測量結果不是完整無障礙認證。沿用既有產品策略，不強制每次重寫 mobile-first 或套固定裝置表。

## 版面與輸入

- 依真實目標 viewport、內容折行與縮放檢查布局；一般閱讀區可限制行寬，寬表則保留有意義的水平捲動，不一律壓進 65ch。
- 在窄視窗、放大文字、橫向低高度及需要時的螢幕鍵盤下，主要操作與必要資訊仍可達；避免 fixed bar 或 modal 遮住焦點與內容。
- 檢查真實 pointer／touch／keyboard 操作。Hover 不是觸控替代；需要 hover 才可見的功能應有可點擊或鍵盤入口。
- 表單確認 label、focus、validation 與長內容；iOS 等瀏覽器的輸入縮放以目標 runtime 觀察，不把單一 font-size 門檻當跨瀏覽器保證。
- 合適時使用 safe-area inset 與動態 viewport 單位；沿用專案已支援的瀏覽器範圍。

## 尺寸與對比

- 觸控密集的主要操作優先以 44×44 CSS px 或更大為設計目標；不能把這個偏好冒稱所有 UI 的 WCAG AA 下限。
- [WCAG 2.2 的 Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) 為 24×24 CSS px 或符合其 spacing／equivalent／inline 等例外。密集桌機工具列依實際條件檢查，不機械放大所有控制項；44×44 是 [Enhanced](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced) 要求。
- [一般文字對比](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) 以 4.5:1、大字以 3:1 檢查；muted／placeholder 不因名稱而自動豁免，inactive controls 等例外依標準判斷。
- 必要的控制項及圖形辨識依 [Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)；不要混用文字與非文字門檻，狀態不能只靠顏色區分。

## 捲動、Sticky 與 Overlay

- [Sticky](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/position) 依最近有捲動機制的祖先定位，並受 containing block 邊界限制；檢查實際 overflow、inset、容器高度與捲動方向，不能宣稱父層一律必須 `overflow: visible`。
- 不用放寬整張表 overflow 來修局部選單裁切；依既有 portal／定位元件處理，驗證關閉、滾動、切頁與 focus restoration。
- 全域背景、root、loading 或暫態樣式，須檢查掛載／退出後及 light／dark 主題；不能只看 overlay 出現時。

## 素材與效能

- 圖片保留比例與適當尺寸，避免 layout shift；依位置選 eager／lazy，不讓首屏重要素材被不必要地延遲。
- 字體 fallback、載入與中文換行須可讀；高 DPI 不代表應把所有 1px 線改細。
- 動效尊重 reduced-motion，測量對 render／layout／paint 的影響；使用 transform／opacity 不等於已證明 GPU 加速或不卡。
- 高密度／虛擬化 UI 使用 [interaction performance](../../agent-core-lite/references/interaction-performance.md) 的代表性負載；正常 viewport 的截圖不代替快速捲動與框選證據。

回報實際檢查的 viewport、theme、輸入方式與狀態；未測目標列為限制，不由桌機模擬推定實體裝置全部正常。
