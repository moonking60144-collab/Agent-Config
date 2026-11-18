import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "workflow", "handoffs");
const host = process.env.CLAUDE_CODE_HOST_SESSION_ID || "";
const validHost = /^[\w-]+$/.test(host);
const pending = (token) => path.join(directory, `${host}.${token}.json`);

async function main() {
  if (process.argv[2] === "--write") {
    if (!validHost || !process.argv[3]) throw new Error("A Desktop host session and a handoff text file are required.");
    const content = (await fs.readFile(process.argv[3], "utf8")).trim();
    if (!content) throw new Error("handoff text file is empty");
    const token = randomUUID(), file = pending(token);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    await fs.writeFile(file, JSON.stringify({ writtenAt: new Date().toISOString(), content }), { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ path: file, resumePrompt: `續接交接 ${token}` }));
    return;
  }
  if (!validHost) return;
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  if (!chunks.length) return;
  const event = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (event.hook_event_name !== "UserPromptSubmit" || typeof event.prompt !== "string") return;
  const match = /^續接交接 ([\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12})$/.exec(event.prompt.trim());
  if (!match) return;

  const file = pending(match[1]), consumed = file + ".consumed";
  // Claim this exact ticket once. Another write gets its own filename, even for the same host.
  try {
    await fs.rename(file, consumed);
  } catch (error) {
    if (error.code === "ENOENT") {
      const saved = await fs.lstat(consumed).catch((failure) => {
        if (failure.code === "ENOENT") return null;
        throw failure;
      });
      emit(saved?.isFile()
        ? `此交接碼已取用。若上次未收到摘要，請讀取 ${JSON.stringify(consumed)} 的 content 欄位，接續同一份交接；不要選其他檔案。`
        : "此交接碼在這個 session 沒有可恢復的摘要。不要改用其他摘要。");
      return;
    }
    throw error;
  }
  const handoff = JSON.parse(await fs.readFile(consumed, "utf8"));
  emit(`使用者指定續接這份交接摘要（${handoff.writtenAt}）：\n\n${handoff.content}`);
}

function emit(additionalContext) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext } }));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
