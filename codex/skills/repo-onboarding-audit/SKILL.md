---
name: repo-onboarding-audit
description: "使用者要求唯讀盤點陌生 repo 或子系統，且技術棧、入口、測試、工具、慣例或第一條資料流尚不清楚時使用。目前脈絡已指出相關實作路徑，或使用者要求立即實作時，不使用。"
---

# Repo 入門盤點

相關實作脈絡未知，且使用者要求唯讀導覽時，使用此 skill。依磁碟實際檔案建立精簡地圖。已授權實作時，有限範圍盤點仍是負責執行的 Lite 或 Project 步驟，不另變成 onboarding 交付，也不重新要求實作批准。

## 基本規則

- 除非使用者明確要求實作，否則維持唯讀。
- 先讀 AGENTS.md、README 與鄰近專案規則。只有使用者明確要求比較或匯入其他 agent 慣例時才讀 CLAUDE.md；不能把它當成 Codex 的適用規範。
- 探索優先使用 rg／rg --files 及平行讀取。
- 盤點時忽略大型生成目錄：.git、node_modules、vendor、dist、build、.next、coverage、__pycache__、virtualenvs 與 IDE 快取。
- 不憑單一檔名推定框架；以 manifests、設定與入口確認。

## 初步盤點

深入讀取實作前，收集以下線索：

1. 套件 manifests：package.json、pnpm-lock.yaml、yarn.lock、pyproject.toml、requirements.txt、pom.xml、build.gradle、go.mod、Cargo.toml、composer.json、Gemfile。
2. 框架特徵：Next／Vite／Nuxt／Angular 設定、Spring Boot／Quarkus 依賴、Django／FastAPI／Flask 入口、Rails／Laravel 設定、Docker 與部署檔案。
3. 入口：main、index、app、server、cmd/、routes、controllers、workers、排程工作與 CLI 入口檔。
4. 頂層目錄樹：深入兩層，排除生成目錄。
5. 工具：formatter、lint、typecheck、build scripts、task runners、Makefile、CI workflows、Docker compose、.env.example。
6. 測試：目錄、命名模式、runner 設定、fixtures、e2e 設定與覆蓋工具。
7. Git 慣例：位於 Git repo 時，查看近期 commit 訊息與分支狀態。

## 架構盤點

初步盤點後，追一條具代表性的資料流：

```text
entry point -> validation / parser -> business logic -> persistence or external API -> response / UI / side effect
```

辨識：

- manifests 可見的技術棧與版本
- 前後端分離或單體架構
- API 風格與 route 責任歸屬
- 持久化層與權威來源
- 錯誤在哪裡處理
- 輸入驗證在哪裡執行
- 測試接在資料流的哪些位置

## 辨識慣例

提出修改建議前，辨識既有本地模式：

- 檔案命名與目錄責任
- 依賴注入或直接 import 風格
- 錯誤處理風格
- 測試風格與命名
- 狀態／快取／失效模式
- commit 訊息語言與格式
- scripts 或 CI 已使用的 build／test 命令

優先遵守專案慣例；只有它造成具體 bug、安全問題，或與使用者需求相關的可維護性風險時才例外。

## 輸出格式

依適用全域規範直接交付已確認的 repo 結構、慣例與建議方向。以下為可選欄位，依本次需求取用；Risks / Unknowns 只列會影響使用或下一步的具體缺口，沒有就省略，不因其他部分未知而弱化已確認的地圖：

```markdown
**Repo Map**
- Stack:
- Entry points:
- Key directories:
- Test surface:
- Build / validation commands:

**Observed Conventions**
- Code style:
- Data flow:
- Error handling:
- Git / CI:

**Risks / Unknowns**
- ...

**Recommended Next Step**
- ...
```
