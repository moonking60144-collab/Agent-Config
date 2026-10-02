import { readFile } from "node:fs/promises";

export async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

// 取這一輪 assistant 的可見文字。tool_use block 不算，只看 type === "text"。
export async function assistantMessage(input) {
  if (typeof input.last_assistant_message === "string" && input.last_assistant_message.trim()) {
    return input.last_assistant_message;
  }
  if (typeof input.transcript_path !== "string") return "";
  try {
    const lines = (await readFile(input.transcript_path, "utf8")).trim().split(/\r?\n/).slice(-120);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const item = JSON.parse(lines[index]);
      if (item.type !== "assistant" || !Array.isArray(item.message?.content)) continue;
      const text = item.message.content
        .filter((part) => part?.type === "text" && typeof part.text === "string")
        .map((part) => part.text)
        .join("");
      if (text.trim()) return text;
    }
  } catch {
    return "";
  }
  return "";
}

// 逐行掃圍欄開關狀態，不用正規式成對比對。
//
// 舊版是 /```[\s\S]*?```/g。散文裡只要出現一個落單的三反引號序列（例如在說明
// 這兩支 hook 自己的剝除規則時），配對就從那裡錯位，後面真正的圍欄內容整段外露。
// 2026-08-20 實際踩到：一則報告 hook 誤判的回覆被自己的圍欄外露內容擋下。
//
// 圍欄未關閉時吞掉剩餘全文，是刻意的 fail-safe：寧可少檢查，不要誤擋。
export function visibleProse(text) {
  const kept = [];
  let fence = null;
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const marker = line.match(/^[ \t]*(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (marker && /^ {0,3}\S/.test(line) && marker[1][0] === fence.character
        && marker[1].length >= fence.length && /^[ \t]*$/.test(marker[2])) {
        fence = null;
      }
      continue;
    }
    if (marker && (marker[1][0] === "~" || !marker[2].includes("`"))) {
      fence = { character: marker[1][0], length: marker[1].length };
      continue;
    }
    kept.push(line.replace(/`[^`\n]*`/g, "").replace(/https?:\/\/\S+/g, ""));
  }
  return kept.join("\n");
}
