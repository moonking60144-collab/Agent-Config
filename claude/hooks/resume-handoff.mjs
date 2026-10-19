import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 桌面版清除後要等下一則訊息才冷啟動新對話，source 也只是 "startup"；
// 跨清除不變的只有 host session ID，交接檔用它命名，才不會因為隔太久或同資料夾的其他 session 而遺失。
const handoffDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "workflow", "handoffs");
const owner = process.env.CLAUDE_CODE_HOST_SESSION_ID ?? "";
const handoffPath = /^[\w-]+$/.test(owner) ? path.join(handoffDir, `${owner}.json`) : null;

if (process.argv[2] === "--write") {
  if (!handoffPath) {
    console.error("CLAUDE_CODE_HOST_SESSION_ID is missing or invalid; in-place handoff needs a Claude Code Desktop session.");
    process.exit(1);
  }
  if (!process.argv[3]) {
    console.error("usage: node resume-handoff.mjs --write <handoff-text-file>");
    process.exit(1);
  }
  const content = (await fs.readFile(process.argv[3], "utf8")).trim();
  if (!content) {
    console.error("handoff text file is empty");
    process.exit(1);
  }
  await fs.mkdir(handoffDir, { recursive: true });
  await fs.writeFile(handoffPath, JSON.stringify({ writtenAt: new Date().toISOString(), content }));
  console.log(handoffPath);
  process.exit(0);
}

if (!handoffPath) process.exit(0);
let handoff;
try {
  handoff = JSON.parse(await fs.readFile(handoffPath, "utf8"));
} catch {
  process.exit(0);
}

// 先改名再輸出：同一份交接只注入一次，改名失敗代表已被別的程序取走。
const consumedPath = `${handoffPath}.consumed`;
try {
  await fs.rename(handoffPath, consumedPath);
} catch {
  process.exit(0);
}

const context = [
  `Handoff written at ${handoff.writtenAt} by the previous conversation of this session, which was cleared on purpose.`,
  "Continue from it without asking the user to repeat it; if it is clearly outdated for what the user now asks, say so before acting.",
  `Handoff file: ${consumedPath}`,
  "",
  handoff.content,
].join("\n");

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: context,
  },
}));
