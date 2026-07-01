# Responsive Design Checklist

這份清單是設計完成後的驗證工具，不是設計過程的起點。先完成主要設計與實作，再對照這份清單確認有無遺漏；若任務很小，至少快速掃過與該畫面直接相關的項目。

---

## 基礎策略原則

- **Mobile-first**：先寫 375px 的樣式，用 `min-width` media query 往上覆寫
- **流體優先，斷點為輔**：能用 `clamp()` 解決的，不用 media query
- **不死記斷點數字**：根據內容折行點決定斷點，而不是預設 576 / 768 / 1024 / 1280

常用流體縮放寫法：
```css
/* 字型：從 1rem 到 1.25rem，在 320px 到 1200px 之間流體縮放 */
font-size: clamp(1rem, 0.875rem + 0.625vw, 1.25rem);

/* 展示標題：從 2.5rem 到 5rem */
font-size: clamp(2.5rem, 5vw + 1rem, 5rem);

/* Section padding：從 3rem 到 8rem */
padding-block: clamp(3rem, 8vw, 8rem);
```

---

## 觸控裝置檢核

### 觸控目標
- [ ] 所有可點擊元素（button、link、icon button）最小尺寸 **44x44px**
- [ ] 相鄰觸控目標之間至少 **8px 間距**，避免誤觸
- [ ] Icon-only button 必須有足夠 padding 讓觸控面積達標，不只是 icon 本身的尺寸

### 觸控互動
- [ ] Hover state 在觸控裝置上的行為確認（第一次點擊 = hover，第二次 = click）
- [ ] 需要 hover 才能顯示的內容（tooltip、下拉選單）在行動裝置上有替代方案
- [ ] Drag / swipe 操作有 touch event 支援（不只是 mouse event）

---

## 排版檢核

### 字型縮放
- [ ] 標題在 375px 不超出螢幕寬度
- [ ] 展示字型在行動裝置上是否過大導致折行不好看
- [ ] `font-size` 不小於 **14px**（部分 iOS 會自動放大 12px 以下的 input）
- [ ] input 欄位的 `font-size` 至少 **16px**，避免 iOS Safari 自動縮放

### 文字長度
- [ ] 閱讀區域的行寬：`max-width: 65ch`（最佳閱讀寬度）
- [ ] 行動裝置上沒有 overflow hidden 的文字被截斷
- [ ] `white-space: nowrap` 的地方確認行動裝置不溢出

---

## Layout 檢核

### Flexbox / Grid
- [ ] 桌機的多欄 Grid 在行動裝置有正確折成單欄或雙欄
- [ ] `flex-wrap` 在行動裝置上的折行是否美觀
- [ ] 橫向 scroll 是否是刻意設計的，而不是意外 overflow

### 固定元素
- [ ] Fixed header 在行動裝置上的高度是否佔用過多垂直空間
- [ ] Sticky 元素在 iOS Safari 的行為確認（`position: sticky` 需要 overflow: visible 的父層）
- [ ] Modal / overlay 在行動裝置上是否有正確的 scroll 行為

### 圖片
- [ ] 所有 `<img>` 有 `width` 和 `height` 屬性（避免 layout shift）
- [ ] 使用 `srcset` 或 `<picture>` 提供不同解析度的圖片
- [ ] 裝飾性圖片在行動裝置是否考慮縮小或隱藏

---

## 常見 Viewport 確認

| 裝置 | 寬度 | 確認項目 |
|------|------|----------|
| iPhone SE | 375px | 最小的主流 iPhone，Hero 字型、CTA button 觸控目標 |
| iPhone 14 Pro | 393px | 主流 iPhone，整體體驗 |
| iPad | 768px | 通常是最難設計的中間尺寸，確認兩欄排版 |
| iPad Pro | 1024px | 確認是否觸發桌機版 layout |
| 桌機 | 1440px | 主要桌機寬度，確認 max-width 和置中 |
| 寬螢幕 | 1920px | 確認沒有過度延伸，有 max-width 限制 |

---

## 特殊情境

### 橫向模式（Landscape）
- [ ] 行動裝置橫向模式下，高度很小（568px 或更小），確認 hero / modal 不會被截斷
- [ ] `min-height: 100vh` 在橫向模式下的效果

### 安全區域（Safe Area）
- [ ] iPhone notch / Dynamic Island 區域：`padding: env(safe-area-inset-top)`
- [ ] iPhone home indicator 區域：`padding-bottom: env(safe-area-inset-bottom)`
- [ ] 適用於 fixed bottom bar、modal、全螢幕元素

### 高解析度螢幕
- [ ] 1px border 在 Retina 螢幕上是否太細（考慮用 `0.5px` 或 box-shadow 模擬）
- [ ] SVG icon 確認在高 DPI 下清晰

---

## 效能檢核（影響行動裝置體驗）

- [ ] 字體：使用 `font-display: swap`，避免 FOIT
- [ ] 圖片：使用 `loading="lazy"` 對 below-fold 圖片
- [ ] 動效：確認使用 `transform` 和 `opacity` 而非 `top/left/width/height`（GPU 加速）
- [ ] 避免大型 JavaScript bundle 阻塞首屏渲染

---

## 快速自測 Snippet

在 browser console 貼入，快速檢查觸控目標尺寸：

```javascript
document.querySelectorAll('a, button, [role="button"], input, select, textarea').forEach(el => {
  const rect = el.getBoundingClientRect();
  if (rect.width < 44 || rect.height < 44) {
    el.style.outline = '2px solid red';
    console.warn('觸控目標過小：', el, `${rect.width.toFixed(0)}x${rect.height.toFixed(0)}px`);
  }
});
```
