import { readFile } from "node:fs/promises";
import MarkdownIt from "./vendor/markdown-it-15.0.3.mjs";

const parser = new MarkdownIt("commonmark");

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

// Preserve source text for the language check while excluding the complete
// code blocks identified by CommonMark, including their list/quote containers.
export function visibleProse(text) {
  const source = String(text ?? "");
  const lines = source.split(/\r\n?|\n/);
  for (const token of parser.parse(source, {})) {
    if (token.type === "code_block" || token.type === "fence") lines.fill("", ...token.map);
  }
  return lines.map(line => line.replace(/`[^`\n]*`/g, "").replace(/https?:\/\/\S+/g, "")).join("\n");
}
