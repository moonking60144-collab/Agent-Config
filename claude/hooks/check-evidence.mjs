import { readInput, assistantMessage, visibleProse } from "./lib/prose.mjs";

// Optional project-level heuristic, not a semantic evidence validator or a completion gate.
// 行動指示：叫使用者去改資料／設定的祈使語氣
const ACTION_WORDS = /(改成|填入|設為|要改|應該填|建議改|正確(?:值|數量|答案)?是|應該改成)/g;

// 數值＋單位。行動指示後方鄰近出現才算「帶著具體數字要人動手」
const VALUE_NEAR = /\d[\d,]*(?:\.\d+)?\s*(?:kg|pc|g|支|筆|列|包|箱|桶|元|公斤|公克|%)/;

// 來源標記。2026-08-20 把裸的「公式」換成「公式推導／公式定義」：
// 在 Ragic 專案「公式」是最高頻詞，任何一句提到公式欄位就等於全篇通行證。
const EVIDENCE_MARK = /(實測|API 讀|API 實測|definitions|欄位定義|公式推導|公式定義|歷史記錄|history=true|已確認事實)/;
const UNCERTAIN_MARK = /(推論|推測|未確認|尚未確認|待確認|假設|無法確定|要問|需確認|不確定|未驗證)/;

const input = await readInput();

// 已經因為這個 hook 重試過一輪就放行，否則會無界重試。
if (input.stop_hook_active) process.exit(0);

const message = await assistantMessage(input);
const prose = visibleProse(message);

// 標記必須跟行動指示落在同一個段落。
//
// 舊版比對整篇 prose，於是文末隨便一句「這是公式欄位」或「不確定」就替全篇解禁 ——
// 連 hook 自己 reason 裡的「不要把推論寫成定論」被抄回去都能通關。
// 2026-08-20 收斂成段落作用域。
let offense = null;
for (const paragraph of prose.split(/\n\s*\n/)) {
  if (EVIDENCE_MARK.test(paragraph) || UNCERTAIN_MARK.test(paragraph)) continue;
  for (const match of paragraph.matchAll(ACTION_WORDS)) {
    const window = paragraph.slice(match.index, match.index + 40);
    if (VALUE_NEAR.test(window)) {
      offense = window.split(/\n/)[0].trim();
      break;
    }
  }
  if (offense) break;
}

if (offense) {
  process.stdout.write(JSON.stringify({
    systemMessage: `數值用詞提醒：「${offense}」。這只是字詞比對，無法判斷計算、使用者要求或測試是否已有充分依據；不阻擋回答，也不要求為通過檢查補上標籤。`,
  }));
}
