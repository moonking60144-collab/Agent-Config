import { readFile } from "node:fs/promises";

const simplifiedOnly = new Set("个这发应让来设计划间数据国简体对级说过还风动谁问题点线给变产电识记报达长东车马买卖价钱码术专业务际监视户连断独创实现");

async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

function visibleProse(text) {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`\n]*`/g, "")
    .replace(/https?:\/\/\S+/g, "");
}

const input = await readInput();
if (input.stop_hook_active === true) process.exit(0);

let message = typeof input.last_assistant_message === "string" ? input.last_assistant_message : "";

if (!message && typeof input.transcript_path === "string") {
  try {
    const lines = (await readFile(input.transcript_path, "utf8")).trim().split(/\r?\n/).slice(-120);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const item = JSON.parse(lines[index]);
      if (item.type !== "assistant" || !Array.isArray(item.message?.content)) continue;
      message = item.message.content
        .filter((part) => part?.type === "text" && typeof part.text === "string")
        .map((part) => part.text)
        .join("");
      if (message.trim()) break;
    }
  } catch {
    message = "";
  }
}

const matches = [...new Set([...visibleProse(message)].filter((character) => simplifiedOnly.has(character)))].slice(0, 8);
if (matches.length) {
  process.stdout.write(JSON.stringify({
    decision: "block",
    reason: `偵測到疑似簡體字（${matches.join("、")}）。請以繁體中文與台灣用語重新輸出；程式碼、指令、路徑與原文引用可保留原樣。`,
  }));
}
