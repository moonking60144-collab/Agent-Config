import { parseLog } from "../claude/plugins/claim-check/hooks/register.ts";
import { readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Each array is a single session. Legacy logs had counts but no addressable finding IDs.
export function summarize(sessions) {
  const stats = { sessions: sessions.length, checks: 0, checkMs: 0, forwarded: 0, legacyForwardedWithoutIds: 0,
    pending: 0, mainReportedConfirmed: 0, mainReportedDismissed: 0, inconclusive: 0,
    mainReportedCorrections: 0, correctionExcerptObserved: 0, correctionOrderUnknown: 0, correctionToolCallObserved: 0, reportedUsage: {}, attemptsWithoutUsage: 0 };
  for (const rows of sessions) {
    const findings = new Map(), quotes = new Set();
    for (const row of rows) {
      if (row.event === "correction_order_unknown") { stats.correctionOrderUnknown++; continue; }
      if (row.event === "correction_in_answer") { quotes.add(row.id); continue; }
      if (row.event === "main_review") {
        if (findings.has(row.id)) findings.set(row.id, row);
        continue;
      }
      if (!row.kind) continue;
      stats.checks++;
      stats.checkMs += row.ms ?? 0;
      stats.forwarded += row.fed ?? 0;
      if (!row.forwardedIds) stats.legacyForwardedWithoutIds += row.fed ?? 0;
      for (const id of row.forwardedIds ?? []) if (!findings.has(id)) findings.set(id, null);
      for (const attempt of row.attempts ?? [row]) {
        if (!attempt.usage) { stats.attemptsWithoutUsage++; continue; }
        for (const [key, count] of Object.entries(attempt.usage)) {
          if (typeof count === "number" && key.endsWith("_tokens")) stats.reportedUsage[key] = (stats.reportedUsage[key] ?? 0) + count;
        }
      }
    }
    for (const [id, latest] of findings) {
      if (!latest) stats.pending++;
      else if (latest.verdict === "confirmed") {
        stats.mainReportedConfirmed++;
        if (latest.correction) stats.mainReportedCorrections++;
        if (quotes.has(id)) stats.correctionExcerptObserved++;
        if (latest.observedToolRef) stats.correctionToolCallObserved++;
      } else if (latest.verdict === "dismissed") stats.mainReportedDismissed++;
      else stats.inconclusive++;
    }
  }
  return stats;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] ?? path.join(os.homedir(), ".claude", "workflow", "claim-check");
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch (error) { if (error.code !== "ENOENT") throw error; entries = []; }
  const sessions = [];
  for (const entry of entries.filter(x => x.isFile() && x.name.endsWith(".jsonl"))) {
    const text = await readFile(path.join(dir, entry.name), "utf8");
    sessions.push(parseLog(text).rows);
  }
  console.log(JSON.stringify(summarize(sessions), null, 2));
}
