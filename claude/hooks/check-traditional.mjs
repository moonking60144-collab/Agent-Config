import { readInput, assistantMessage, visibleProse } from "./lib/prose.mjs";

// 簡體專用字。只收「在正體中文裡不是獨立合法字」的，誤擋成本高於漏擋。
const SIMPLIFIED_SOURCE =
  "个这发应让来设计划间数据国简体对级说过还风动谁问题点线给变产电识记报达长东车马买卖价钱码术专业务际监视户连断独创实现";

// 2026-08-20 移出：這些字在正體中文是獨立字，不是簡化字。
//   划 —— 划算、划船（與「劃」不同字）
//   据 —— 拮据（與「據」不同字）
// 實際誤擋過「比較划算」這種技術取捨用語。
const LEGITIMATE_TRADITIONAL = new Set(["划", "据"]);

const simplifiedOnly = new Set(
  [...SIMPLIFIED_SOURCE].filter((character) => !LEGITIMATE_TRADITIONAL.has(character)),
);

const input = await readInput();

// 已經因為這個 hook 重試過一輪就放行，否則會無界重試。
if (input.stop_hook_active === true) process.exit(0);

const message = await assistantMessage(input);

const matches = [...new Set([...visibleProse(message)].filter((character) => simplifiedOnly.has(character)))].slice(0, 8);
if (matches.length) {
  process.stdout.write(JSON.stringify({
    decision: "block",
    reason: `偵測到疑似簡體字（${matches.join("、")}）。請以繁體中文與台灣用語重新輸出。`
      + `豁免範圍只有反引號 inline code、三反引號圍欄內容與 http(s) 網址；`
      + `散文裡引用外部系統的原文（欄位名、錯誤訊息、資料值）請一併包成反引號。`,
  }));
}
