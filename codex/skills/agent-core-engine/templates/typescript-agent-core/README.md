# TypeScript Agent Core 範本

本範本是用來建立專案自有 agent runtime 的全域 Codex 資產。除非使用者明確要求在某 repo 實作 runtime，否則不複製進去。

## 結構

- AgentEngine 執行確定性的生命週期 ticks。
- QueryConfig 在同一 session 內不可變。
- TickContext 只能透過生命週期轉移修改。
- ToolDefinition 宣告 schema、permissions、安全 metadata、timeout 與結果正規化。
- ToolRunner 將批次依序分段：只有連續、安全且唯讀的工具可平行執行；異動工具保留原始順序。
- ErrorClassifier 只重試暫時性失敗。
- ContextCompactor 在摘要壓縮前先裁剪工具輸出。
- 若加入 hook 支援，須採 typed lifecycle events，明確定義 timeout、阻塞與輸出路由語意。
- 若加入 resume 支援，須持久保存 append-only transcripts，包含 compact 邊界與可安全續接的 metadata。

## 最小檔案集

```text
src/agent-core/
  core.ts
  index.ts
tests/agent-core/
  agentCore.test.ts
```

只有目標 repo 的真實用途或測試足以支持拆分，才將 core.ts 拆成多個 modules。

## 實作注意事項

- Model providers、shell 執行、檔案 IO 與 UI 的 adapters 放在核心外。
- 未知工具視為會異動、不可安全並行且需要權限。
- 工具並行執行時，仍保持 transcript 按序整合。
- 未知工具、輸入 parse failures 與確定性的工具 setup failures 轉為標準工具結果，不以拋錯中止整批。
- 重試分類前，將 tool timeout、request timeout 與 stream idle timeout 轉成明確 timeout errors。
- 超大輸出放在 prompt 外，提供模型可見預覽。
- 壓縮成功後，重設因 compact 邊界失效的快取與追蹤狀態，保留已啟用 skill 內容及使用者目前目標。
- Compact 摘要連結完整 transcript 路徑，保留足夠 message identity metadata 供 resume 重建。
- 同類 retry 或 compaction 失敗連續 3 次後停止。
