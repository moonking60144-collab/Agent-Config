import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

async function readInput() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  return raw.trim() ? JSON.parse(raw) : {};
}

function findGitRoot(start) {
  let current = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(current, ".git"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function normalizeSlug(value) {
  return value.trim().replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "");
}

function collectMarkdownFiles(directory, depth = 0) {
  if (!fs.existsSync(directory) || depth > 2) return [];

  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectMarkdownFiles(target, depth + 1));
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) files.push(target);
  }
  return files;
}

function isUnfinishedLedger(text) {
  return (
    /(?:^|\|)\s*(?:pending|in[_ -]?progress|blocked)\s*(?:\||$)/im.test(text) ||
    /^\s*(?:status|state)\s*[:=]\s*(?:pending|in[_ -]?progress|blocked)\b/im.test(text) ||
    /^\s*-\s*\[ \]/m.test(text)
  );
}

try {
  const input = await readInput();
  const cwd = path.resolve(input.cwd || process.cwd());
  const gitRoot = findGitRoot(cwd);
  const scopeRoot = gitRoot || cwd;
  const codexHome = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const ledgerDirectories = new Set([
    path.join(cwd, "ledgers"),
    path.join(cwd, ".codex", "ledgers"),
    path.join(cwd, "docs", "codex", "ledgers"),
    path.join(cwd, "outputs"),
    path.join(scopeRoot, ".codex", "ledgers"),
    path.join(scopeRoot, "docs", "codex", "ledgers")
  ]);

  const slugCandidates = new Set([
    path.basename(scopeRoot).toLowerCase(),
    normalizeSlug(path.basename(scopeRoot)).toLowerCase()
  ]);
  const projectsRoot = path.join(codexHome, "projects");
  if (fs.existsSync(projectsRoot)) {
    for (const entry of fs.readdirSync(projectsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (slugCandidates.has(entry.name.toLowerCase()) || slugCandidates.has(normalizeSlug(entry.name).toLowerCase())) {
        ledgerDirectories.add(path.join(projectsRoot, entry.name, "ledgers"));
      }
    }
  }

  const unfinished = [];
  for (const directory of ledgerDirectories) {
    for (const file of collectMarkdownFiles(directory)) {
      const text = fs.readFileSync(file, "utf8");
      if (isUnfinishedLedger(text)) unfinished.push({ file, mtimeMs: fs.statSync(file).mtimeMs });
    }
  }

  unfinished.sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (unfinished.length > 0) {
    const ledger = unfinished[0].file;
    const gitInstruction = gitRoot
      ? `Then inspect current history with git -C ${JSON.stringify(gitRoot)} log --oneline -20.`
      : "Then inspect git log if the current directory belongs to a repository.";
    const additionalContext = [
      `An unfinished project ledger was detected: ${ledger}`,
      "Before continuing any task, read that ledger and treat it as the source of truth.",
      gitInstruction,
      "Do not repeat tasks marked done_verified. Read the Eliminated section before testing another hypothesis, then resume from Next Action or the first non-complete task."
    ].join(" ");

    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext
      }
    }));
  }
} catch {
  process.exitCode = 0;
}
