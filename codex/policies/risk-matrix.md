# Codex Risk Matrix

> 目的：把高風險操作的判斷收斂成一頁規則，避免規則分散在不同 skill 或臨場判斷裡。
> 本檔只定義風險語言與最低證據，不引入 schema、runner 或額外治理框架。

## 使用原則

- `AGENTS.md` 仍是 skill routing 的唯一 canonical。
- 日常小任務不要升級成 enterprise workflow；只有遇到檔案、git、設定、外部服務或秘密資料風險時才套用本表。
- 明確 read-only、review、先分析、不要改檔時，不得寫檔、commit 或 push。
- 使用者已明確要求 commit / push 時，可照 scope 執行；不得自行升級成 force push 或 destructive reset。
- 除非同類錯誤真實重複至少 2 次，且會造成實際損害，否則不要新增新的 risk class。

## 風險分類

| risk_class | 預設行為 | 例子 | 執行前最低證據 |
| --- | --- | --- | --- |
| `read_only` | 直接允許 | `rg`、讀檔、`git status`、`git diff`、查 log、官方文件查證 | cwd / repo / 目標檔或目標來源 |
| `local_reversible_write` | 可執行；完成後要有 diff 與驗證 | 修改 repo 文件、skill、設定 template、測試檔、可回復的小型程式碼改動 | 目標檔、scope、`git diff`、對應驗證命令 |
| `local_destructive` | 先取得明確確認 | 刪檔、覆寫、大量搬移、清 cache、`Remove-Item -Recurse` | 絕對目標路徑、影響範圍、備份或回復方式 |
| `git_shared_or_irreversible` | 先取得明確確認 | `git reset --hard`、`git push --force`、刪 branch、覆寫未提交變更 | current branch、remote、uncommitted diff、rollback path |
| `external_side_effect` | 先取得明確確認；使用者已明確要求時仍需先確認 scope | send email、改 Google Drive、發 PR、deploy、改 CI/CD、推送 shared repo | 目標服務、帳號或 remote、影響範圍、可回復方式 |
| `secret_bearing` | 避免輸出；必要時只做最小讀取 | token、cookie、credential、OAuth state、auth config | 為何必須讀取、如何避免回顯、是否能用 redacted evidence 替代 |

## 停止條件

遇到以下情況時，先停下來，不要靠猜測繼續：

- 目標路徑、branch、remote 或影響範圍不明。
- 使用者要求 read-only，但任務看起來需要寫入。
- destructive / force / external side effect 的 rollback path 不存在。
- 同一錯誤或同一假設已失敗兩次。
- 驗證只能證明格式正確，不能證明 active consumer 已採用變更。
