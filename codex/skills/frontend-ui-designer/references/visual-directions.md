# 視覺方向參考

每個方向包含：氣質描述、核心設計決策、字體策略、色彩策略、動效策略、適用場景、禁止退化成什麼。

---

## 1. Editorial Minimal

**氣質**：文字是唯一的設計元素。版面依靠 size、weight、spacing 建立秩序，沒有裝飾，沒有背景圖，沒有 shadow。拿掉任何一個元素都會讓整體崩壞。

**核心決策**：
- 標題用極大字號（`clamp(3.5rem, 8vw, 7rem)`），對齊線精確
- 非對稱排版：文字區塊刻意偏置，留白是主動設計的一部分
- 水平線或輕量 border 做 section 分隔，不用色塊
- 單色或接近單色的配色，accent 色只出現在一個地方

**字體策略**：
- Display：高對比 serif，如 Playfair Display、Freight Display、或 variable serif
- Body：幾何感 sans-serif，如 DM Sans、Sora、或 Instrument Sans
- 字重對比極大：展示用 300 或 800，body 用 400

**色彩策略**：
- 背景：接近白（#fafaf8）或深黑（#0d0d0d），不用純白純黑
- 文字：接近但不是黑（#1a1a1a）或白（#f0f0f0）
- Accent：單一顏色，可以是墨水藍、深赭紅、或橄欖綠，僅用於 1-2 個元素

**動效策略**：
- 頁面載入：文字從下方 20px fade + translate，stagger 80ms
- Hover：僅改變 opacity 或 text-decoration，duration 100ms
- 禁止：任何背景動畫、視差、粒子效果

**適用**：內容平台、作品集、出版品介紹、品牌官網（文字強勢品牌）

**禁止退化成**：白底 + 灰色 card + 小標題 + 等寬三欄 feature 的「乾淨版 SaaS」

---

## 2. Premium Minimal

**氣質**：精緻、克制、有錢但不炫耀。每個細節都被仔細處理，但不讓人感覺被設計。像是高端飯店大廳，什麼都沒有，但就是貴。

**核心決策**：
- 極大的 padding 和 margin，density 低
- 細節精緻：button 的 border-radius 精確到 px、hover 的色彩偏移量精確
- Surface hierarchy 靠亮度差異（±3-5% 亮度），不用 border
- 圖片處理：高品質、低飽和、統一色調

**字體策略**：
- Display：高品質 sans-serif，如 Neue Haas Grotesk、Aktiv Grotesk、或 GT Walsheim
- Body：與 Display 同族或配對協調，字重 300-400
- Letter-spacing 偏寬（0.02-0.05em），特別是 heading

**色彩策略**：
- 背景：暖白（#f8f6f1）或深炭（#121212）
- 通常選一個金屬感 accent：玫瑰金、古銅、或冷金
- 色彩飽和度整體壓低，所有顏色像是加過灰

**動效策略**：
- Hover：慢速、從容，duration 300ms ease
- 圖片 hover：輕微 scale(1.02) + 亮度微調
- Scroll reveal：opacity fade，無 translate，duration 600ms

**適用**：精品品牌、高端服務、豪宅或車款介紹、奢侈品電商

**禁止退化成**：Apple.com 的仿製品、白色 + 黑字 + SF Pro Text + 大圖的「高端感公式」

---

## 3. Bold Campaign

**氣質**：第一眼就要衝擊。飽和色、大字、非對稱、動效強。不給人思考的空間，直接把訊息打進去。

**核心決策**：
- Hero 用滿版色塊或高對比撞色，不用漸層
- 標題要大到「有點不舒服」才算到位（`clamp(4rem, 12vw, 10rem)`）
- 版型刻意破格：文字超出 container、元素重疊、傾斜或旋轉的文字作為裝飾
- CTA 按鈕要讓人一眼找到，不能「融入」設計

**字體策略**：
- 展示字體要有個性：condensed、extended、或有顯著特徵的字體
- 如 Bebas Neue（free）、Anton、Barlow Condensed
- Body 反而要普通，讓標題更突出
- 中文搭配思源黑體或 Noto Sans TC Bold

**色彩策略**：
- 主色飽和度 80-100%，不選「安全」的顏色
- 對比 accent：補色或高對比色，不是類似色
- 背景可以是飽和的深色（深靛藍、深紫、深綠），不必是黑色

**動效策略**：
- 標題入場：clip-path reveal 或從底部 translate + fade，duration 500-800ms
- Scroll：視差（parallax）背景
- Hover：色彩反轉、文字位移

**適用**：活動頁、產品 launch、行銷 campaign、音樂 / 演唱會官網

**禁止退化成**：漸層 hero + 白色大標 + 兩個並排按鈕 + 三欄 feature grid 的「預設 landing page」

---

## 4. Data-Dense Console

**氣質**：為了效率而存在，不為了好看。資訊密度高，不浪費空間，但有清晰的 visual hierarchy。dark mode 為主，因為長時間使用眼睛負擔低。

**核心決策**：
- 明確的 grid 結構，所有元素對齊
- 資訊用 density level 區分：primary（大、亮）、secondary（中、灰）、tertiary（小、更暗）
- Monospace font 用於數字、code、狀態值
- Border 輕但存在：`rgba(255,255,255,0.06)`，用來劃分區域
- 狀態顏色語言要一致：success green、warning amber、error red、info blue

**字體策略**：
- UI 文字：Geist、JetBrains Mono（數值）、或 IBM Plex Sans
- 數字必須用 tabular nums：`font-variant-numeric: tabular-nums`
- 字號要小但要清晰：12px（caption）、13px（body）、14px（primary）

**色彩策略**：
- 背景：#0a0a0a 或 #0e1117（GitHub dark 那個深度）
- Surface：比背景亮 8-10%（#141414 -> #1e1e1e）
- Text：三層：#f0f0f0 / #808080 / #484848
- Accent：不飽和，偏灰藍或灰青：#4a9eff 那個調子

**動效策略**：
- 幾乎沒有動效，只有狀態切換的 150ms transition
- Loading state：skeleton screen，不用 spinner
- Toast / notification：slide + fade，200ms

**適用**：監控 dashboard、開發者工具、後台管理系統、log viewer

**禁止退化成**：Tailwind 預設 dark mode（zinc-900 底 + zinc-800 card + 所有元素等 weight）

---

## 5. Playful Product

**氣質**：有趣、有個性、讓人想繼續用。不是幼稚，是「聰明地輕鬆」。圓潤、顏色大膽，但有品味。

**核心決策**：
- 圓角大：`--radius-lg: 20-24px`，button border-radius 可以到 50px
- 顏色大膽但搭配精準：通常有 3-4 個主色，都是 high saturation but carefully picked
- Illustration 或 icon 比文字先出現
- 微互動豐富：button click 有 scale / bounce，hover 有色彩變化

**字體策略**：
- 圓潤 sans-serif：Nunito、Plus Jakarta Sans、Outfit
- 中文：圓體（但要小心，圓體在小字號可讀性差）
- 避免用尖銳的字體，否則和圓潤的 UI 衝突

**色彩策略**：
- 配色靈感來自：蠟筆盒、馬卡龍、Framer 風格配色
- 背景：不用純白，用 cream（#fefcf7）或淡灰藍（#f0f4ff）
- 每個 section 可以用不同的淺背景色增加層次

**動效策略**：
- Hover：scale(1.04) + 輕微 shadow 增強
- 互動回饋：spring physics，bounce effect
- 成功狀態：confetti 或 checkmark 動畫

**適用**：消費者產品、SaaS for 非技術用戶、EdTech、健康 app

**禁止退化成**：Notion 仿製品、圓角白卡 + emoji icon + 藍色按鈕的「friendly SaaS 公式」

---

## 6. Technical Brutalist

**氣質**：原始、直接、不修飾。一切都暴露出來：border 可見、結構可見、資料直接呈現。有種「不需要說服你」的自信。

**核心決策**：
- Border 明顯：1-2px solid，黑色或對比色，不用 shadow
- 全大寫 label、monospace 數值
- Grid 線條可見，表格感強
- 顏色很少：通常黑白 + 一個高飽和 accent
- 不用圓角或極少（2px）

**字體策略**：
- Monospace 或 condensed grotesque：Space Mono、Courier、Suisse Int'l Mono
- 或強烈的 grotesque：Akzidenz Grotesk、Helvetica Neue
- 字距可以很寬（0.08-0.15em）在 label 和 heading

**色彩策略**：
- 白底黑線為主，或黑底白線
- Accent 只有一個：高飽和黃（#ffe600）、紅（#ff3300）、或綠（#00ff88）
- 不用半透明，不用漸層

**動效策略**：
- 極少動效，或刻意做 0ms（即時切換）體現「機器感」
- 如果有動效：線性（linear），不用 ease

**適用**：開發者工具官網、技術部落格、藝術 / 設計類作品集、反設計宣言類網站

**禁止退化成**：「我覺得這個不用設計」的藉口。Brutalism 是風格，不是放棄設計。

---

## 7. Warm Editorial

**氣質**：像一本做工精良的雜誌或書。有溫度、有人味、讓人想停留。色彩是暖的，字體是有個性的，留白是刻意的。

**核心決策**：
- 版型有雜誌感：文字與圖片的混排、pull quote、大 drop cap
- 多欄排版，但不是等寬的 grid
- 色調統一偏暖：米、赭、棕、橄欖
- 適當的 texture：輕微 grain overlay 增加紙質感

**字體策略**：
- Serif 主導：Lora、Cormorant Garamond、或 Freight Text
- 搭配一個有個性的 sans-serif 做 caption 和 label
- 可以混用 italic 增加文學感

**色彩策略**：
- 背景：#f5f0e8、#faf7f2 一類的暖白
- 文字：#2c2018 一類的暖棕黑，不是純黑
- Accent：深赭紅（#8b2c2c）或墨綠（#2d4a3e）

**動效策略**：
- Scroll reveal：緩慢 fade（600-800ms）
- 幾乎不用其他動效，讓內容說話

**適用**：食物 / 旅遊內容、獨立品牌、文化機構、書籍 / 出版品介紹

**禁止退化成**：米色 + 圓角卡片 + "organic" 手寫字體的「Instagram 風格小品牌」

---

## 8. Systematic Product

**氣質**：清晰、一致、可延伸。不強調個性，強調可信與效率。每個決策都基於系統，而不是單次美感判斷。這是大型 SaaS 或企業產品應有的樣子。

**核心決策**：
- 明確定義 design tokens；沿用既有 tokens，僅補足本次所需，實作原則見 [SKILL.md](../SKILL.md)。
- 一致的 component API：spacing、variant、state 都可預測
- 色彩語義化：action / status / surface / text 各有專屬 token
- 每個互動狀態都設計到：default / hover / active / focus / disabled / loading / error

**字體策略**：
- 系統字體或中性 sans-serif：Geist、Inter（在此允許，因為語境是系統設計）
- 但必須建立完整的 type scale，不是隨意使用字號

**色彩策略**：
- 建立完整的 color scale：primary-50 到 primary-900
- Semantic mapping 明確：`--color-action` -> primary-600

**動效策略**：
- 一致的 transition duration scale：`--duration-fast: 100ms`、`--duration-base: 200ms`、`--duration-slow: 300ms`
- 元件動效遵循同一套規則，不各自設計

**適用**：大型 SaaS、企業內部系統、設計系統建立、多人協作的 codebase

**禁止退化成**：MUI 或 Ant Design 的 default theme，沒有自己的 visual identity
