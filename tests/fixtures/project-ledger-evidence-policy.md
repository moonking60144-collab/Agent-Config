# Project Ledger Evidence Policy Incident

## Incident

2026-09-02 的跨邊界工作流回顧顯示：agent 可用 helper／unit 綠燈與 self-review 支撐「producer、persistence、recovery 與 UI 已收斂」的完成宣稱，但這些證據沒有實際穿過被宣稱的邊界。局部正確因而被誤報為系統正確。

這份 artifact 只支持 `incident_lineage_backtest`。它不證明未來 agent 會自主辨識所有同族問題，也不替代 business repo 的 composed/runtime tests。

## Minimal failure reproduction

下列 completion contract 在 evidence policy 啟用時必須失敗：

```json
{
  "schemaVersion": 2,
  "evidencePolicyVersion": 1,
  "requiredEvidence": [
    {
      "status": "present",
      "claimScope": "cross-boundary",
      "evidenceClass": "helper",
      "artifactBase": "repo",
      "artifact": "evidence/predicate.txt",
      "artifactSha256": "<sha256>"
    }
  ]
}
```

同一新格式若漏寫 `evidencePolicyVersion` 也必須失敗；否則 optional version 會成為 enforcement bypass。

## Controls

- Positive case：`cross-boundary + helper` 被拒絕；每一筆 waived cross-boundary claim 也被拒絕。
- Passing control：`cross-boundary + composed` 搭配 present independent review，且兩個 artifact digest 都相符時可完成。
- Review boundary：`independent-review` 只能關閉 review claim，不能取代 local 或 cross-boundary behavioral proof。
- Compatibility boundary：一般 validator 仍可讀取既有 schema-v1 contract；目前 Stop hook 不接受它重新宣告完成，必須先升級 schema v2。
- Integrity boundary：hash 只證明 validator 讀到的 exact artifact 存在且未變，不判斷 artifact 是否真的覆蓋 claim；semantic proof 仍由 composed/runtime evidence 與 independent review 負責。
- Scope boundary：單一 local helper／module 修改不必啟用本 policy；review waiver 可附 owner、reason 與 evidence 明確記錄，但 behavioral proof 不可 waiver。
- Session boundary：SessionStart 即使尚無 unfinished ledger，也記錄 ledger、內容與 completion contract digest baseline；Stop strict 驗證本 session 後新增、重新完成或內容／contract 改變的 complete ledger，即使 timestamp 被保留也不能漏驗。
- Preflight boundary：schema v2 以受控 `scope` 判斷 local／cross-boundary，不依賴可漂移的 ID 名稱。
- Artifact boundary：completion contract 必須是最多 1 MiB 的一般非 symlink 檔案，schema-v2 另要求 ledger 同目錄的 `<ledger-stem>.completion.json`；只接受 declared base 內不超過 5 MiB 的一般 artifact。FIFO、device、directory、symlink sidecar、external schema-v2 sidecar、oversize 與 path escape 必須 fail closed，`..evidence/`、`~report.txt` 等合法相對名稱不得誤殺。Manifest 上限為 128 筆、16 MiB 唯一 artifact content。

對應 deterministic cases 位於 `tests/project-ledger-hooks.test.mjs`，並由 `scripts/validate-codex.mjs` 執行。

## Retirement condition

- 當 ledger generator 能直接產生 schema-v2 policy metadata 與 evidence manifest，且上述 controls 持續由 validator 與 CI 攔截時，縮短或移除 skill 中重複的操作文字，只保留 machine-enforced contract。
- 當 evidence class 可由 test runner／runtime artifact 自動簽發，而不再信任 agent 自填分類時，以新 schema 取代 policy v1；完成遷移與相容測試後退役本版本。
