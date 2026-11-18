// The first rollout header identifies its writer, not the process resuming it.
import { constants, promises as fs } from "node:fs";
import path from "node:path";

export async function readRolloutCreationCliVersion(home, input) {
  if (!input.session_id || typeof input.transcript_path !== "string" || !path.isAbsolute(input.transcript_path)) return null;
  let handle;
  try {
    const root = await fs.realpath(path.join(home, "sessions"));
    const file = await fs.realpath(input.transcript_path);
    const relative = path.relative(root, file);
    if (!relative || relative.startsWith(".." + path.sep) || path.isAbsolute(relative) || path.extname(file) !== ".jsonl") return null;
    handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | constants.O_NONBLOCK);
    if (!(await handle.stat()).isFile()) return null;
    // Never parse the conversation. Only consider a complete, bounded first JSONL record.
    const buffer = Buffer.alloc(128 * 1024);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const end = buffer.subarray(0, bytesRead).indexOf(10);
    if (end < 0) return null;
    const header = JSON.parse(buffer.toString("utf8", 0, end));
    const { id, cli_version: version } = header.payload ?? {};
    return header.type === "session_meta" && id === input.session_id && typeof version === "string" && version.trim()
      ? version.trim() : null;
  } catch {
    return null;
  } finally {
    await handle?.close();
  }
}
