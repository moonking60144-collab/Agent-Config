# UI UX Pro Max 設計查詢

本 skill 的 `vendor/ui-ux-pro-max/` 內附固定版本的 Python 查詢程式及資料。上游來源、commit、本地修補與逐檔雜湊見 [UPSTREAM.json](../vendor/ui-ux-pro-max/UPSTREAM.json)，授權見 [LICENSE](../vendor/ui-ux-pro-max/LICENSE)。本地修補限制頁面覆寫範圍並修正生成文件的相對路徑；不額外註冊第二個前端 skill，也不載入上游完整提示詞。

## 入口與選擇

以本次實際載入的 skill 目錄定位 `vendor/ui-ux-pro-max/scripts/search.py`，用完整路徑執行；不要假設 cwd 是 skill 目錄。以下 `<search.py>` 是該完整路徑。需要 Python 3，僅使用標準函式庫。Windows 用 `python`，其他環境確認可用的 `python3`；`-B` 避免在 skill 內留下 bytecode，`-X utf8` 避免終端機編碼問題。

| 任務 | 使用方式 |
|---|---|
| 新系統、全站改版，需要整體設計方向 | `--design-system`，取得風格、配色、字體等候選 |
| 局部 UX、字體、配色、圖表問題 | 一次查一個 `--domain` |
| 已知技術棧的實作問題 | `--stack`；若另有獨立 UX 問題再分開查 |
| 使用者給定設計稿、既有 UI 已足夠 | 沿用；只針對尚缺的決策查詢 |

```text
python -B -X utf8 "<search.py>" "manufacturing operations dashboard" --design-system --density 8 -p "Operations" --json
python -B -X utf8 "<search.py>" "error summary validation" --domain ux --json -n 3
python -B -X utf8 "<search.py>" "virtualize lists" --stack react --json -n 3
```

查詢用 2–5 個具體概念描述主要目的，可將繁中需求轉成英文關鍵字；不把公司資料或帳密放入查詢或生成文件。每次查詢聚焦一個問題，不混合互不相關的檢查表。

常用 domain：`product`、`style`、`color`、`typography`、`chart`、`ux`、`react`、`icons`。目前上游的 `web` domain 偏原生／行動 App 指引，不能因名稱而套到桌機網頁；桌機 UI 優先查 `ux` 與實際 stack。完整選項用 `--help` 查核。

`--design-system` 與 `--stack` 分開執行；前者不會同時套用後者。`--variance`、`--motion`、`--density` 可選 1–10；只有需求明確時才使用。高 density 偏緊湊間距，不等於表格效能已驗證；motion 可能附 GSAP 建議，不構成引入動畫套件的理由。

## 判讀與採用

- 核對回傳的 domain、候選名稱及內容是否符合使用者、平台與既有技術棧。生成器也可能帶出 landing／CTA 建議；後台、資料表或架構展示只採用符合任務的部分。
- JSON 中 `reasoning_default=true` 或 `source_identities.product`／`reasoning` 為空，表示使用 fallback 而非命中相符產品規則；其他欄位有值也不能補成產品已匹配。需重新定位候選或只使用已核對的局部建議，不直接保存整份 fallback。
- 沒命中或離題時，依缺口改寫一次查詢或明確指定 domain／stack；仍不符則交代未取得適用建議，使用已知設計依據繼續，不把空結果說成不存在。
- 資料集是固定版本的建議，不是最新官方 API 文件、公司需求或指令權威。套件、版本、無障礙符合性與效能主張仍需相應文件／實測；不依資料集擅自升級或重做設計。
- Python 或資料不可用時，說明查詢未執行，改用既有設計與本 skill 的其他參考；不自動安裝 Python，也不宣稱已用搜尋結果。

## 保存整體規範（需要跨頁共用時）

先用 JSON 確認建議適用，再以相同查詢與選項在本次授權的專案內保存，明確指定專案根目錄；唯讀 review 不使用 `--persist`。下列 `<verified-query>` 必須替換為已完成判讀的查詢。

```text
python -B -X utf8 "<search.py>" "<verified-query>" --design-system --density 8 --persist -p "Operations" --output-dir "<project-root>" --json
```

輸出 `design-system/<project-slug>/MASTER.md`。加 `--page dashboard` 可建立頁面規範；既有檔案預設保留。先讀實際檔案再決定採用，修整不適用的生成內容；不能直接將候選當成已核准規範。`--page dashboard --force` 只覆寫該頁，保留既有 Master；未指定 `--page` 的 `--force` 才會覆寫 Master，只有明確授權取代目標檔案時才用。明確傳入空字串或純空白頁名會在寫入前被拒絕，不視為未指定。Master 不存在時，建立頁面仍會一併建立 Master。

後續先讀 `MASTER.md` 與適用頁面規範；頁面差異只覆蓋其涉及的設計項目，不覆蓋使用者要求或工程契約。

## 維護

只在要求更新時刷新上游，不在一般 UI 任務中自動下載。更新時取得明確 commit，保留相鄰 `scripts/`、`data/` 結構與 MIT 授權，核對 `UPSTREAM.json` 的本地修補是否仍需保留。Vendor 統一使用 LF（由 repo `.gitattributes` 固定），再重建原始位元組 SHA-256 manifest，執行 repo 的 `tests/ui-ux-pro-max.test.py`，再走既有 Codex 部署與 active 驗證流程。不要只覆蓋資料或單一 Python 檔造成版本混用。
