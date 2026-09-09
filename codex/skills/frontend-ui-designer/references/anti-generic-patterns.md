# 避免制式設計的模式

這份文件的用途：當你準備開始寫 code，先對照這份清單。如果你的方案落入任何一個「退化模式」，停下來，重新決策。若既有產品已經採用其中某種模式，先判斷它是品牌選擇、系統限制，還是單純因為缺少設計判斷。

---

## 結構性退化（最常見、最嚴重）

### ❌ 三欄等寬 Feature Grid
```text
[ Icon ] [ Icon ] [ Icon ]
  標題     標題     標題
  描述     描述     描述
```
退化訊號：三個完全相同 weight 的 feature，沒有主次之分。

✅ 正確方向：
- 建立視覺主次：一個 primary feature 用大版面，其他用小版面
- 或改成 bento grid：大小不等的卡片組合
- 或改成純文字列表，用 typography hierarchy 取代圖示
- 或改成橫排 scroll 的 feature strip（行動裝置友好）

---

### ❌ 漸層 Hero + 白色大標 + 兩個並排按鈕
```text
╔══════════════════════════════╗
║  [漸層背景圖]                ║
║  H1 Your Headline Here       ║
║  Subtitle text goes here     ║
║  [Primary CTA] [Secondary]   ║
╚══════════════════════════════╝
```
退化訊號：看起來像任何一個 2018 年後的 SaaS 首頁。

✅ 正確方向：
- 背景改用純色、強色、或有設計感的幾何圖形
- 標題破格：讓文字超出 container 或跨越背景邊界
- CTA 只給一個，另一個用 text link 表達
- 或完全移除 CTA 在 Hero，改在 scroll 後才出現

---

### ❌ 白底圓角卡片 + 輕 Shadow + Grid 排列
所有內容放進白色圓角卡片，然後 grid 排列。這是「我不知道怎麼設計」的預設輸出。

✅ 正確方向：
- 重新問：這些內容的語意關係是什麼？用排版關係表達，不用卡片
- 如果需要卡片：定義 surface 語言（背景色、border、shadow 三選一，不要三個都用）
- 嘗試把卡片變成「區塊」：撐滿欄寬，靠背景色差異區分

---

### ❌ Footer 五欄連結 + Logo + 社群 icon
退化訊號：你在填空，不是在設計。

✅ 正確方向：
- 問：footer 的核心目的是什麼？通常是「讓找不到東西的人能找到」
- 連結按重要度分層，不是全部等 weight
- Footer 也可以是品牌表達的空間：配色、文案、圖形

---

## 字體排印退化

### ❌ 全站 Inter，只靠 font-weight 做差異
退化訊號：H1 是 700，body 是 400，其他都是 600，看起來沒有任何設計個性。

✅ 正確方向：
- 至少設計兩個字體角色：Display（展示用）/ Text（閱讀用）
- 或選一個有個性的字體，讓字體本身說話
- 中文網站：考慮 serif + sans-serif 混用策略

---

### ❌ `font-size: 16px` 全站統一，用 margin 撐空間
退化訊號：沒有 type scale，字號是隨意指定的。

✅ 正確方向：定義 type scale，至少包含：
```css
--text-xs: 0.75rem; /* 12px */
--text-sm: 0.875rem; /* 14px */
--text-base: 1rem; /* 16px */
--text-lg: 1.125rem; /* 18px */
--text-xl: 1.25rem; /* 20px */
--text-2xl: 1.5rem; /* 24px */
--text-3xl: 1.875rem; /* 30px */
--text-4xl: 2.25rem; /* 36px */
--text-5xl: 3rem; /* 48px */
--text-6xl: 3.75rem; /* 60px */
--text-7xl: clamp(3rem, 8vw, 6rem); /* 展示用，流體縮放 */
```

---

### ❌ 所有文字顏色只有黑和灰
退化訊號：text 顏色只有 #000000 和 #666666，沒有其他層次。

✅ 正確方向：至少定義三層文字色：
- `--color-text-primary`：主要閱讀文字（高對比）
- `--color-text-secondary`：輔助說明、subtitle（中對比）
- `--color-text-muted`：caption、placeholder、disabled（低對比，仍需過 3:1）

---

## 色彩退化

### ❌ Primary 用藍色 / 紫色，Accent 用綠色
退化訊號：這是訓練資料的 majority color，不是你的設計決策。

✅ 正確方向：配色要從情境出發：
- 這是什麼產品？給誰用？
- 要傳達什麼感受：信任感、活力、精緻感、親切感？
- 競品用什麼顏色？你要差異化還是對齊行業語境？

---

### ❌ 漸層背景（linear-gradient purple to blue）
退化訊號：2019 年以後最氾濫的視覺決策。

✅ 正確方向：
- 純色背景 + 強排版
- 或改用 mesh gradient（但要有品味，不要過飽和）
- 或用 geometric 色塊組合取代漸層

---

### ❌ 每個 section 背景交替白/淺灰
退化訊號：沒有視覺節奏感，只是在物理上區分 section。

✅ 正確方向：
- Section 分隔用 spacing 或 typography 節奏，而不是色塊交替
- 如果要用背景色：讓顏色有意義，不是機械式交替

---

## 間距退化

### ❌ `padding: 20px` 全元件統一
退化訊號：spacing 沒有邏輯，是隨意選的數字。

✅ 正確方向：使用 spacing scale（4px 基底）：
```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-6: 24px;
--space-8: 32px;
--space-12: 48px;
--space-16: 64px;
--space-24: 96px;
--space-32: 128px;
```

---

### ❌ 所有 section 垂直間距一樣
退化訊號：整個頁面呼吸節奏是平的，沒有高潮低谷。

✅ 正確方向：
- 主要 section 間距：`clamp(6rem, 12vw, 10rem)`
- 次要 section 間距：`clamp(3rem, 6vw, 5rem)`
- 視覺上「重要」的轉場給更多空間

---

## 動效退化

### ❌ `transition: all 0.3s ease`
退化訊號：這會讓所有屬性都過渡，包括你不想過渡的，而且效能很差。

✅ 正確方向：
```css
/* 明確指定要過渡的屬性 */
transition: color 200ms ease, background-color 200ms ease, opacity 200ms ease;
/* 需要 GPU 加速的用 transform */
transition: transform 200ms ease, opacity 200ms ease;
```

---

### ❌ Scroll reveal 動效用在每個元素上
退化訊號：整個頁面每個 div 都在飛進來，讓人眼花撩亂，也傷效能。

✅ 正確方向：
- 只對第一次出現在畫面中「有意義」的內容用 scroll reveal
- 一個 section 通常只需要 1-2 個 reveal，不是每個子元素都要

---

## 元件退化

### ❌ Button 只有 Primary + Secondary，顏色是藍色和白色
退化訊號：button 是品牌表達的重要元素，不應該是預設值。

✅ 正確方向：
- Button 顏色要和整體配色系統連結
- 考慮 ghost button 的 border 顏色、hover 行為是否有設計感
- 大型 CTA button 可以比 `font-size: 16px` 更大、padding 更寬

---

### ❌ Input field 只有 border-bottom 或完整 border box，focus 是藍色
退化訊號：最預設的 HTML input 樣式。

✅ 正確方向：
- Focus state 的色彩要和 accent 色連結
- Error / success state 要設計到，不要等需要了再加
- Placeholder 顏色要和 label 區分清楚

---

## 自我檢核問題

在交付前問自己：

1. **如果把我的設計放到另一個產品上，它違不違和？** 如果不違和，代表沒有設計個性。
2. **我的字體選擇是因為「這個情境適合」，還是因為「沒想太多」？**
3. **我的配色有沒有具體的情境依據，還是只是訓練資料的 majority pattern？**
4. **我的 spacing 有沒有語義？相關的東西距離近，不相關的距離遠？**
5. **我的動效有沒有目的，還是只是「加了動效感覺比較有設計感」？**

如果有一題答不上來，停下來，重新決策。
