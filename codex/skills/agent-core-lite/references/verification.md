# 驗證契約

程式修改範圍及其證據審查使用此方法。Lite 負責執行；Project 持久保存相同 plan／receipt；Review 維持唯讀。領域 references 定義應守住哪些不變條件，本檔定義如何驗證。單純文字或格式修改直接檢查即可，不需要生成測試／mutation 測試活動。

## 單一證據流程

1. 從已核准需求、實際 diff、靜態引用／註冊與 runtime 觀察探索。不能只靠 agent 自填的 consumer 清單起頭與結案。實作改變共享元素、狀態、資源或生命週期責任時，重新判定受影響 consumer 與驗證範圍；任務名稱和修改位置不能限定影響。暫態行為須驗證退出、取消或交還控制權後，既有 consumer 契約仍成立。實際影響仍屬局部時，驗證維持局部。
2. 以使用者必要結果及權威契約定義判定依據（oracle），可用簡單參考模型、差異行為或變形關係；另一個 agent 本身不是 oracle。預期結果不能由受測實作或 mock 自設條件決定。對結果主張，問「即使核心結果仍錯，這個 assertion 是否也會通過？」；只檢查方法被呼叫、flag 或成功訊息，不足以證明資料／行為已正確，須有能區分正誤結果的檢查。
3. 選擇跨越主張邊界的檢查。跨層主張須由真正入口走過 producer 與 consumers，包含適用的預設設定、首次使用／恢復入口及多來源負載；不能只手動建立已就緒 state 或改掉預設 flag。狀態／並行風險用可重播序列涵蓋關鍵事件的相反到達順序與晚到結果；大量輸入組合再用生成資料，保留 seed 與最小反例。彼此獨立的 unit fixtures 不代替 composed path。
4. 高風險不變條件或本次主張測試敏感度時，挑戰檢查本身：正常基準須通過；刻意注入的行為 mutation／fault 須到達目標 assertion 並失敗。未被攔截或未套用的修改、語法錯誤、缺依賴及無關 timeout 都不能證明敏感度。等價 mutation 換成有意義的挑戰。不要為可逆、低影響修改製造只重述實作的測試；已採用 receipt check 的必要條件仍須滿足，不得繞過 runner。
5. 效能主張須在相同負載、指標、單位與環境下，依序執行受控 baseline／candidate probes。保留重複量測原始樣本，以及事先宣告的絕對／相對預算。一般測試耗時、截圖、runtime 標籤與只取多次最佳結果都不足。
6. 依目前原始碼快照驗證 receipt，再回報已證明範圍與限制。原始碼／測試變更會使先前 receipt 失效。

純重構先識別原有輸入、輸出、驗證與副作用契約，透過仍適用的外部入口檢查行為保持；不要用函式數量、內部呼叫形狀或同步改寫的 mock 證明等價。移除 helper／guard 時，確認原本拒絕的輸入及錯誤處理仍有等價去處，必要時查其歷史理由。需求明確要求的行為變更另列刻意差異，不把舊 bug 固定成正確答案。

測試隨契約一起收斂，不只疊加新測試。對只綁定已淘汰內部呼叫形狀的測試，先確認其要求已不適用，或仍必要的行為、錯誤與回歸情境已有可執行覆蓋，再於授權範圍內替換或移除；不能只因重構後測試失敗就刪掉。保留有獨立判定價值的純運算、邊界、回歸與效能測試，新增 integration test 不自動取代它們。Mock 優先用於外部或不確定性邊界，不替換本次要證明的核心行為，也不把 mock 自設的 provider 語意當成外部契約證據。

產品定案已明確要求替換或退場時，定義新行為、必須停止提供的行為，以及須保留的舊資料／恢復能力。由被取代的契約反查可達入口，包括未修改的 routes、預設分支、fallbacks 與背景 consumers；只看 diff 的盤點可能漏掉它們。驗證淘汰操作不能繞過新政策，且保留的恢復功能仍可運作。保留舊資料不代表保留舊建立或管理能力。不自行發明相容性需求，不從單純新增功能要求推定舊功能退場，也不由本規則推定刪除授權。確認剩餘用途與遷移／恢復依賴後，才在授權範圍內移除淘汰實作。分階段退場時，回報尚存入口與退出條件；必要退場工作仍未完成，不得宣稱替換完成。

## 事故與根因定位

本輪要求解釋原因、追查復發，或修正依賴事故歸因時使用；不強制每個局部修改完整重建歷史。

- 以穩定資料身分、事故時間與版本對齊來源、衍生值及 consumer。顯示編號、列序與當前狀態不能代替事故當時的同一筆資料；清單異常比較成員／身分的變更，不只筆數，不能用後發事件倒推先前原因。
- 找到 stale JSON、cache 或錯誤中間狀態後，反查產生它的 producer、輸入與觸發操作，定位最後正確到首次錯誤的必要事件順序。重載已存值、重查來源、重算欄位與重建衍生結果不是同一件事；以實際輸出判斷，不能只看方法名稱。缺少事故直接證據的鏈節標為假設，不用合理機制冒充已證實原因。
- 替換資料來源或入口前，比對原有篩選、權限、更新方式及副作用；修改行數少不代表行為等價。必要產生步驟不能因「簡化」被停用；涉及額外副作用時先處理授權邊界，而非把無法達成結果的版本當成修復。
- 有證據支持的觸發操作／事件已能解釋錯誤，且關鍵替代解釋已處理時停止，不無限向上追查。可取得的關鍵證據仍未查時，不能只因已有合理說法而結案；證據或權限不可得時，交代已證實鏈節、具體缺口及可區分假設的下一項觀察。已授權的緊急緩解可先做，但須區分「症狀緩解」與「來源根治」，不強迫先找完根因才止損。

## Lite 與 Project 共用入口

部署後的 scripts 位於 ~/.codex/skills/agent-core-lite/scripts/：

執行依賴為 Node.js、Git 與 ripgrep 的可執行檔，不接受 shell alias／function 代替。Consumer discovery 預設從 PATH 尋找 `rg`，macOS 另接受 `/opt/homebrew/bin/rg` 與 `/usr/local/bin/rg`；其他位置以 `VERIFICATION_RG` 指定絕對路徑，指定後不自動換用其他版本。缺少依賴會明確失敗，不跳過 discovery 或改用未證明等價的搜尋。macOS 可用 `brew install ripgrep` 安裝；套件安装成功不代表各啟動環境與完整 receipt 流程已驗收。

```text
node verify-change.mjs discover --repo <scope-root> --output <external-control-dir>/discovery.json
node verify-change.mjs run --repo <scope-root> --plan <external-control-dir>/plan.json --output <external-control-dir>/receipt.json
node verify-change.mjs validate --repo <scope-root> --result <external-control-dir>/receipt.json
```

唯一權威的可執行契約是 scripts/verification-contract.mjs；runner 與 completion evaluator 匯入同一實作。不在其他 skill、schema adapter 或版本專屬 validator 複製驗證規則。

Plan 結構：

```json
{
  "version": 1,
  "discovery": "replace this string with the complete machine-generated discovery object",
  "coverage": [{"path":"src/consumer.mjs","checks":["ownership"]}],
  "checks": [{
    "id":"ownership", "kind":"property",
    "command":["node","tests/ownership-probe.mjs"],
    "invariants":["unrelated nodes cannot change ownership"],
    "oracle":{"basis":"reference","source":"docs/ownership-contract.md","reason":"Expected descendants are computed by an independent forward model."},
    "seeds":[1,17,99], "iterations":200,
    "challenges":[{"id":"wrong-owner","file":"src/owner.mjs","find":"an exact unique source fragment","replace":"a valid but behaviorally wrong fragment","assertion":"OWNERSHIP_INVARIANT"}]
  }],
  "limitations":["Record unresolved dynamic discovery and environment boundaries here."]
}
```

範例須依實際 repo 調整；placeholder 會被拒絕。命令陣列使用 shell:false，因此 shell pipeline 必須是已明確審查的 script／command。引數中的 ${REPO} 會解析為執行中的工作根目錄，包括 challenge 副本。命令不得嵌入指回受測 live source 的絕對路徑。Runner 負責協調執行，不是權限 sandbox；工具與使用者既有授權仍約束副作用。

Git repo 的 scope-root 必須是 repo 根目錄；探索記錄 tracked／untracked 且未被忽略的檔案，結合 HEAD／current symbols，使已刪 exports／檔案仍保有 caller 線索。沒有 HEAD 時，同一 runner 擷取所有目前候選：unborn repo 使用 Git 檔案清單；非 Git 資料夾則使用排除 Git metadata 的實際檔案樹。Receipt 記錄 head:null，不聲稱有歷史探索能力；命令、trace、challenges 與目前檔案完整性仍使用同一契約。不需要初始化 Git 或使用 skip-verification 旗標。

Ledger、sidecar、plan 與 receipt 預設放在 source scope 外。Repo-local 控制產物只有在 discovery 前已是 untracked 且 Git-ignored 才受支援；CLI 允許輸出到該處，完成驗證採相同放置檢查。Tracked 控制產物須移到 scope 外，不能靜默排除於原始碼 hashes。非 Git 資料夾使用外部控制產物。如此更新完成狀態才不會使自己的快照失效。

每個探索出的候選都須對應檢查或具體排除理由。文字式 performance／stateful 提示須有 riskDecisions:[{kind,checks,reason}]，指定適用檢查或具體不適用理由。文字提示不是完整語意探索：重要時使用 compiler／LSP references、registrations 與 runtime traces。Snapshot 目前拒絕 symlinks、非一般檔案及超過 32 MiB 的檔案。原生測試可補充證據，但不能繞過這些限制或嚴格完成檢查；沒有合適、受支援的 adapter 前，該 scope 保持未驗證。不為取得通過而靜默縮小任務範圍。

預設 trace adapter 從實際 subprocess tree 收集 Node V8 executed-file coverage。列入覆蓋但未被觀察到的 consumer 會阻擋 receipt。檔案執行覆蓋只能證明模組跑過，不代表每個分支或必要副作用都發生。其他語言可使用 trace:"probe"，由原生 coverage／trace adapter 輸出 observedConsumers；這是 probe 回報的證據，須對照實際 producer 審查。手填陣列不構成 trace 證據。

Property／stateful probes 讀取 VERIFICATION_SEED 與 VERIFICATION_ITERATIONS，斷言其不變條件，最後輸出含 kind、seed、cases 的 JSON。Runner 檢查這些紀錄；測試實作本身必須真的生成案例。Python 使用既有 Hypothesis／原生 coverage；JS／TS 使用既有 generators 或 fast-check。既有測試能表達該性質時，不安裝新框架。

敏感度挑戰在擷取原始碼的獨立副本執行，永遠不 patch live source。Pristine control 必須先通過相同命令／seed；mutant 從另一份乾淨副本開始，避免 control 產物導致假攔截。目標須使用精確的 canonical snapshot paths，且不能透過別名指向 oracle。每次替換須精確匹配一次。共用失敗分類拒絕 stdout 或 stderr 中的 parse／import failures。複製隔離不是 OS sandbox。被忽略的依賴／build 輸出不會複製：使用自足的 probe 或 repo 原生隔離測試環境；前置條件不可用時，回報未驗證。

效能檢查使用 kind:"performance" 與 performance:{baselineCommand,metric,unit,workload,repeats,maxValue,maxRatio}。至少三組依序執行的 baseline／candidate 配對都須輸出 JSON {metric,unit,workload,environment,samples}。樣本是指定單位的量測值；除非明確以程序啟動時間為目標，否則不能用程序啟動時間代替。Runner 重新計算 p95 與預算結果，拒絕缺漏或不一致的 payload。在 probe 環境證據中記錄硬體、瀏覽器／程序版本、worker／queue 狀態與競爭控制。環境字串相同不能證明沒有無關負載；須獨立控制並檢查。

## 完成與審查

Project completion 在既有共用完成契約中，以 verification:{artifactBase,artifact,artifactSha256} 引用通過的 receipt。每項 behavioral requiredEvidence 透過 verificationChecks 連結實際 check IDs；純 static checks 不能滿足行為證據，跨邊界證據需要 integration／stateful／performance checks。使用相對於 repo 或 contract 的路徑。嚴格完成驗證檢查內容、連結、彙總及目前 source，不只檢查外層 hash。CLI：

```text
node ~/.codex/hooks/validate-project-ledger.mjs --ledger <ledger> --require-evidence-policy --require-verification
```

Stop hook 使用相同檢查。舊完成紀錄仍可透過非嚴格 CLI／resume 讀取；新完成範圍須產生目前證據。Lite 使用相同 runner，不為保存 receipt 而建立 Project ledger。純 Review 可執行唯讀檢查與檢視 receipts，但沒有實作授權時，絕不啟動 mutation／部署命令。

當同一 agent 設計並實作 async reference 涵蓋的狀態機時，完成前須由新的 reviewer 重建至少一條 producer → consumer 失敗時間線；Lite 與 Project 都適用。獨立 review 評估遺漏 consumers、oracle 獨立性、mutation 關聯性、trace 邊界與代表性負載，作為真實量測與 composed tests 的補充。Receipts 是可重現證據，不是模型誠實度的密碼學證明，也不能證明任意程式語意；模型仍可能選錯不變條件或 probe。保留此限制，不新增聲稱全面完整的布林值。

依主張選足夠的證據：局部判斷可用聚焦案例；狀態／恢復看必要操作序列，UI 成本看代表性 runtime。生成、mutation 與額外 reviewer 只在適用風險或證據缺口成立時使用，已採用的嚴格 receipt 條件不因此豁免。相同快照與前置條件的有效證據可重用；只有新變更、失敗、證據過期或具體未解疑慮才擴大／重跑，不把測試數量或反覆全綠當新證明。
