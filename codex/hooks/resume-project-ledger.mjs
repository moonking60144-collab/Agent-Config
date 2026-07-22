import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

async function findGitRoot(start) {
  let current = path.resolve(start);
  while (true) {
    try {
      await fs.access(path.join(current, ".git"));
      return current;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return null;
      current = parent;
    }
  }
}

function cleanValue(value) {
  return value.trim().replace(/^['"`]|['"`]$/g, "");
}

function readField(content, key) {
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replaceAll("**", "").replaceAll("`", "").trim().replace(/^[-*]\s+/, "");
    const prefix = `${key}:`;
    if (line.toLowerCase().startsWith(prefix.toLowerCase())) return cleanValue(line.slice(prefix.length));

    if (line.startsWith("|") && line.endsWith("|")) {
      const cells = line.slice(1, -1).split("|").map((cell) => cell.trim());
      if (cells[0]?.toLowerCase() === key.toLowerCase() && cells[1]) return cleanValue(cells[1]);
    }
  }
  return null;
}

function expandHome(value) {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

async function canonicalPath(value) {
  const resolved = path.resolve(expandHome(value));
  try {
    return await fs.realpath(resolved);
  } catch {
    return resolved;
  }
}

async function collectMarkdownFiles(root, depth = 0) {
  if (depth > 2) return [];
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await collectMarkdownFiles(entryPath, depth + 1));
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) files.push(entryPath);
  }
  return files;
}

async function findLedgerRoots(cwd, scopeRoot) {
  const roots = new Set([
    path.join(cwd, ".codex", "ledgers"),
    path.join(cwd, "docs", "codex", "ledgers"),
    path.join(scopeRoot, ".codex", "ledgers"),
    path.join(scopeRoot, "docs", "codex", "ledgers"),
  ]);

  const projectsRoot = path.join(os.homedir(), ".codex", "projects");
  try {
    for (const entry of await fs.readdir(projectsRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) roots.add(path.join(projectsRoot, entry.name, "ledgers"));
    }
  } catch {
    // No durable project directory exists yet.
  }
  return [...roots];
}

async function parseLedger(filePath, scopeRoot) {
  const content = await fs.readFile(filePath, "utf8");
  const status = readField(content, "project_status")?.toLowerCase();
  if (!status || !["active", "blocked", "pending", "in_progress"].includes(status)) return null;

  const repoPath = readField(content, "repo_path");
  if (!repoPath) return null;

  const [ledgerRepo, currentScope] = await Promise.all([canonicalPath(repoPath), canonicalPath(scopeRoot)]);
  if (ledgerRepo !== currentScope) return null;

  const stat = await fs.stat(filePath);
  return {
    filePath,
    planPath: readField(content, "plan_path"),
    nextInstruction: readField(content, "next_instruction"),
    updatedAt: stat.mtimeMs,
  };
}

async function main() {
  const input = await readInput();
  const cwd = path.resolve(input.cwd || process.cwd());
  const scopeRoot = await findGitRoot(cwd) || cwd;
  const roots = await findLedgerRoots(cwd, scopeRoot);
  const files = (await Promise.all(roots.map((root) => collectMarkdownFiles(root)))).flat();
  const ledgers = (await Promise.all(files.map(async (filePath) => {
    try {
      return await parseLedger(filePath, scopeRoot);
    } catch {
      return null;
    }
  }))).filter(Boolean).sort((left, right) => right.updatedAt - left.updatedAt);

  const ledger = ledgers[0];
  if (!ledger) return;

  const context = [
    `Unfinished project ledger detected: ${ledger.filePath}.`,
    "Read this ledger first and treat it as the durable source of truth.",
    "Then inspect git log, skip tasks marked done_verified, preserve eliminated hypotheses, and restore the active task's consumer matrix before acting.",
    ledger.planPath ? `The recorded plan is ${ledger.planPath}; read it only when the ledger points to missing scope or task detail.` : null,
    ledger.nextInstruction ? `Recorded next instruction: ${ledger.nextInstruction}` : null,
  ].filter(Boolean).join(" ");

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: context,
    },
  }));
}

main().catch(() => {
  process.exitCode = 0;
});
