---
name: task-handoff
description: "使用者要求把目前工作交接到新的 task、session 或 thread 時使用，常見說法是「開新 task，名稱和模型跟目前一樣，交接完成後封存這個 task」；預設在新 task 接手後封存目前這個。只要交接摘要、要 fork 保留完整歷史，或只是在同一個 task 繼續時不使用。"
---

# Task Handoff

把目前工作交接到乾淨的新 task，確認新 task 接手後才封存來源；Claude Code 桌面版無法開新 session 時，改成在原 session 清除對話後續接。Codex 與 Claude Code 共用這份流程：task 在 Codex 是 thread，在 Claude Code 是 session；工具對照在最後三節。

## 先分清需求

- 新 task 只帶交接內容、不帶歷史：用本 skill。使用者本人要求交接到新 task 就代表同意接手後封存來源（Claude Code 桌面版改走原地清除時是清除原 session 的對話），即使只輸入 skill 名稱、沒有其他文字；使用者明說保留來源時才不封存或清除。使用者沒提出交接、只是模型判斷可能需要時，先問使用者，不建立、不封存也不清除。
- Fork 並保留完整歷史：改用該 surface 的 fork，不用本 skill。
- 只要交接摘要：直接寫摘要，不建立也不封存。

## 流程

1. 讀來源：用工具讀出目前 task 的 ID、名稱、模型、effort／reasoning、權限模式與工作環境（repo、branch、cwd 或雲端環境）。以工具回傳值為準，不用全域預設模型、設定檔或記憶代替；讀不到的欄位標為未知，模型讀不到時先問使用者。
2. 保住工作狀態：新 task 不在同一台機器或同一個 checkout 時（例如 Claude Code 雲端 session 會開新容器），未提交或未推送的變更新 task 看不到，封存後也會跟著來源消失。這時先問使用者要 commit／push 還是先保留來源；沒有授權不自行 commit、push 或 stash。
3. 寫交接內容：目標與成功標準、已定案的決定與理由、目前進度與驗證到哪裡、相關路徑與 branch、未完成工作與第一步、授權範圍與限制、未解問題，以及來源 task 的 ID。只放續接需要的內容，不貼整串歷史或工具輸出。有 Project ledger 時先依 agent-core-project 的交接段落更新 ledger，交接內容指向 ledger 路徑與 next_instruction，不另寫一份進度。
4. 建立新 task：名稱與模型照使用者要求，沒指定就與來源完全相同，不自行加「接續」之類的後綴；沿用同一個 repo 與 branch，不擅自建立 worktree、換 checkout 或開新 branch。交接內容作為新 task 的第一則訊息。
5. 確認接手：用工具讀回新 task，核對它存在、名稱與模型符合、狀態不是失敗，且已收到交接內容並開始處理。開始處理就算接手，不必等它讀完或回覆。還在建立、模型不明或結果不確定時再讀一次；仍不確定就不封存，回報目前狀態讓使用者決定。
6. 先回報，最後才封存：回報新 task 的 ID 或連結、實際名稱與模型，以及沒能沿用的設定（例如 effort、權限模式）；沒有封存時寫出是哪個條件擋下。封存來源是最後一個動作；封存可能直接結束目前 session，所以回報要在它之前寫完。封存失敗只回報或重試封存，不重新建立新 task。

## 各 surface 的做法

| Surface | 做法 |
| --- | --- |
| Claude Code，有 claude-code-remote 工具（雲端 session） | 用 `get_session`、`create_session`、`archive_session`，細節見下節。 |
| Claude Code 桌面版（Code 分頁） | 有 `start_session` 時用 `get_session`、`start_session`、`list_events`、`detach_session`、`archive_session` 開新 session 接手；沒有或不能用時在原 session 寫交接檔再用 `clear_session` 清除對話。細節見「Claude Code 桌面版」一節。 |
| Codex app | 用目前 session 提供的 thread 工具建立、讀回與封存；工具名稱以實際工具清單為準。 |
| 沒有建立 task 工具的 surface（即使有封存工具） | 完成流程 1–3，把交接內容交給使用者自己開新 task；明說沒有建立、也沒有封存。 |

## Claude Code（claude-code-remote）

- 讀來源：`get_session` 不帶 `session_id`。名稱在 `title`；模型以 `session_context.model` 為準，它和 `configured_model`、`external_metadata.last_served_model` 不一致時三者都回報。Effort 在 `session_context.effort_level`，repo 在 `session_context.sources`，branch 在 `external_metadata.current_branches`。
- 建立：`create_session` 傳 `title`、`model`、`prompt`（交接內容）、`source_url`（來源 repo），`source_revision` 與 `outcome_branch` 都設為目前 branch。`environment_id` 與 `permission_mode` 省略即沿用來源。
- 新 session 從遠端 checkout，只看得到已推送的 commit。
- `create_session` 不能指定 effort；讀回後與來源不同就寫進回報。
- 讀回：`get_session` 帶新 session 的 ID。`status_bucket` 是 working、blocked、review_ready 或 completed（原始值形如 `SESSION_STATUS_BUCKET_WORKING`）算已開始；failed 或仍在建立都不封存。連結是 `https://claude.ai/code/<session ID>`。
- 封存：`archive_session` 帶來源 session 的 ID。封存後新 session 才失敗時，可用 `unarchive_session` 還原來源。

## Claude Code 桌面版

- 讀來源：`get_session` 帶 `"self"`。名稱、模型、effort、權限模式在 `title`、`model`、`effort`、`permissionMode`；另看 `pinned` 與 worktree／branch 資訊。
- 選做法：沒有 `start_session`、來源在 worktree 裡，或 `start_session` 被拒（例如這一輪不是使用者本人的訊息觸發）時，改走下面的「原地清除」。來源在 worktree 裡不開新 session：與來源共用 worktree 的 side session 不能 detach，之後封存來源時還會連同 worktree 一起被清掉；另開 worktree 又違反流程 4。
- 建立：`start_session` 帶 `initiation: "user_asked"`、`context: "fresh"`、`use_worktree: false`，`title` 用來源的名稱；`prompt` 放交接內容，`background` 寫至少 80 字的目標與限制摘要。`model`、`effort`、`permission_mode` 不填就沿用來源；`model` 只接受同級或更便宜的模型。`"fork"` 會帶入整段對話，不符合本 skill。參數以實際工具說明為準。
- 讀回：`get_session` 帶新 session 的 ID，核對名稱、模型、effort 與權限模式；用 `list_events` 確認它已收到交接內容並開始處理。
- 封存前先 `detach_session` 帶新 session 的 ID：新 session 掛在來源底下成為 side session，閒置後會跟著來源被封存。被拒絕就不封存來源，回報原因。
- 封存：`archive_session` 帶 `"self"`，工具回傳後對話就結束。來源已釘選（`pinned` 為 true）時 app 不會封存，不呼叫，回報請使用者取消釘選後自己封存；封存被拒（例如來源開在畫面上、使用者沒在 app 卡片上允許）也只回報。建立新 session 後就不再改走原地清除。封存後新 session 才出問題時，可從 Archived 清單還原來源。

### 原地清除

取代流程 4–6：不建立新 session，也不封存；`clear_session` 清除後 session 的名稱、資料夾、模型、權限與設定都留著，舊對話可從「Resume previous session」找回。

- 寫交接檔：用 Write 工具把流程 3 的交接內容存成一般文字檔（例如 scratchpad 裡的 `handoff.md`），再執行 `node ~/.claude/hooks/resume-handoff.mjs --write <文字檔路徑>`（PowerShell 寫成 `node "$HOME\.claude\hooks\resume-handoff.mjs"`）。它以這個 session 的 `CLAUDE_CODE_HOST_SESSION_ID` 命名交接檔並印出路徑；exit code 不是 0 就不清除，回報錯誤。不要自己手寫交接檔的 JSON。
- 先回報：交接重點、即將清除、舊對話怎麼找回，以及清除後要送一則訊息（例如「繼續」）新對話才會開始，隔多久再送都可以。
- 清除：`clear_session` 帶 `"self"`，這是最後一個動作，這一輪結束後才執行。被拒絕時（例如這個 session 正透過 Remote Control 連線）刪掉 `--write` 印出的交接檔並回報原因。
- 清除沒有發生、下一輪仍在同一段對話時（例如清除前使用者又送了訊息），也刪掉那個交接檔，避免日後再清除時注入舊內容。
- 新對話：同一個 session 清除後第一次啟動時，SessionStart hook 會把交接內容與寫入時間注入 context，注入後改名為 `.consumed`；內容明顯過時就先跟使用者確認。
