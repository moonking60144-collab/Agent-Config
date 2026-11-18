import { createHash } from "node:crypto";
import { constants as fsConstants, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const VALID_STATUSES = new Set(["active", "blocked", "pending", "in_progress", "complete", "archived"]);
export const MAX_COMPLETION_CONTRACT_BYTES = 1024 * 1024;

export async function readBoundedRegularFile(
  filePath,
  { maxBytes = MAX_COMPLETION_CONTRACT_BYTES, label = "file" } = {},
) {
  const initialStat = await fs.lstat(filePath);
  if (!initialStat.isFile() || initialStat.isSymbolicLink()) {
    throw new Error(`${label} must be a regular, non-symlink file`);
  }
  if (initialStat.size > maxBytes) {
    throw new Error(`${label} exceeds the ${maxBytes}-byte limit`);
  }

  const noFollow = Number.isInteger(fsConstants.O_NOFOLLOW) ? fsConstants.O_NOFOLLOW : 0;
  const handle = await fs.open(filePath, fsConstants.O_RDONLY | fsConstants.O_NONBLOCK | noFollow);
  try {
    const openedStat = await handle.stat();
    if (!openedStat.isFile()) {
      throw new Error(`${label} must be a regular, non-symlink file`);
    }
    if (openedStat.size > maxBytes) {
      throw new Error(`${label} exceeds the ${maxBytes}-byte limit`);
    }

    const chunks = [];
    let totalBytes = 0;
    while (true) {
      const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, maxBytes + 1 - totalBytes));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      totalBytes += bytesRead;
      if (totalBytes > maxBytes) {
        throw new Error(`${label} exceeds the ${maxBytes}-byte limit`);
      }
      chunks.push(buffer.subarray(0, bytesRead));
    }
    return Buffer.concat(chunks, totalBytes);
  } finally {
    await handle.close();
  }
}

export async function readHookInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

export async function boundedFileSha256(filePath) {
  if (!filePath) return null;
  try {
    return createHash("sha256").update(await readBoundedRegularFile(filePath)).digest("hex");
  } catch {
    return null;
  }
}

export async function findGitRoot(start) {
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

export function readField(content, key) {
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

export function expandHome(value) {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

export async function canonicalPath(value) {
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

export async function parseLedger(filePath, scopeRoot) {
  const content = await fs.readFile(filePath, "utf8");
  const status = readField(content, "project_status")?.toLowerCase();
  if (!status || !VALID_STATUSES.has(status)) return null;

  const repoPath = readField(content, "repo_path");
  if (!repoPath) return null;

  const [ledgerRepo, currentScope] = await Promise.all([canonicalPath(repoPath), canonicalPath(scopeRoot)]);
  if (ledgerRepo !== currentScope) return null;

  const contractValue = readField(content, "completion_contract");
  const completionContract = contractValue
    ? path.resolve(path.dirname(filePath), expandHome(contractValue))
    : null;
  const stat = await fs.stat(filePath);
  return {
    filePath,
    status,
    content,
    planPath: readField(content, "plan_path"),
    nextInstruction: readField(content, "next_instruction"),
    completionContract,
    verificationMode: readField(content, "verification_mode"),
    updatedAt: stat.mtimeMs,
  };
}

export async function findMatchingLedgers(cwd, statuses = null) {
  const resolvedCwd = path.resolve(cwd);
  const scopeRoot = await findGitRoot(resolvedCwd) || resolvedCwd;
  const roots = await findLedgerRoots(resolvedCwd, scopeRoot);
  const files = (await Promise.all(roots.map((root) => collectMarkdownFiles(root)))).flat();
  const statusSet = statuses ? new Set(statuses) : null;
  const ledgers = (await Promise.all(files.map(async (filePath) => {
    try {
      const ledger = await parseLedger(filePath, scopeRoot);
      return ledger && (!statusSet || statusSet.has(ledger.status)) ? ledger : null;
    } catch {
      return null;
    }
  }))).filter(Boolean).sort((left, right) => right.updatedAt - left.updatedAt);

  return { scopeRoot, ledgers };
}

export async function findNewestMatchingLedger(cwd, statuses = null) {
  const { ledgers } = await findMatchingLedgers(cwd, statuses);
  return ledgers[0] || null;
}

export function sessionProvenancePath(scopeRoot, sessionId) {
  if (typeof sessionId !== "string" || !sessionId.trim()) return null;
  const name = sessionId.replace(/[^A-Za-z0-9._-]+/g, "-");
  return path.join(projectDirectoryFor(scopeRoot), "sessions", `${name}.json`);
}

export async function readSessionProvenance(scopeRoot, sessionId) {
  const filePath = sessionProvenancePath(scopeRoot, sessionId);
  if (!filePath) return null;
  try {
    const value = JSON.parse((await readBoundedRegularFile(filePath)).toString("utf8"));
    if (value.sessionId && value.sessionId !== sessionId) throw new Error("session identity mismatch");
    return value;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

// A repository and its newest file are not task identities. All lifecycle hooks use this binding.
export function resolveSessionLedger(provenance, ledgers) {
  const ledgerPath = provenance?.ledgerPath
    || [...(Array.isArray(provenance?.events) ? provenance.events : [])]
      .reverse().find((event) => event?.ledgerPath)?.ledgerPath || null;
  const ledger = ledgerPath
    ? ledgers.find((candidate) => path.resolve(candidate.filePath) === path.resolve(ledgerPath)) || null
    : null;
  return { ledgerPath, ledger };
}

// Only v1 sessions need this migration notice. A completion change is never proof of ownership.
export function legacyCompletionBaseline(record) {
  if (record?.schemaVersion !== 1) return record?.legacyCompletionBaseline ?? null;
  return (record.baselineLedgers ?? []).filter((item) => item.status === "complete")
    .map(({ filePath, updatedAt, contentSha256, completionContractSha256 }) =>
      ({ filePath, updatedAt, contentSha256, completionContractSha256 }));
}

export async function ledgerRequiresStrictVerification(ledger) {
  if (ledger.verificationMode === "strict") return true;
  if (!ledger.completionContract) return false;
  try {
    const contract = JSON.parse((await readBoundedRegularFile(ledger.completionContract)).toString("utf8"));
    return [1, 2, 3].includes(contract.schemaVersion) || contract.verificationPolicy?.mode === "strict"
      || (contract.verificationPolicy?.strictTriggers?.length ?? 0) > 0;
  } catch {
    return false; // Completion validates malformed/missing contracts; provenance does not certify them.
  }
}

export function projectDirectoryFor(scopeRoot, ledgerPath = null) {
  if (ledgerPath) {
    const projectsRoot = path.join(os.homedir(), ".codex", "projects");
    const resolvedLedger = path.resolve(ledgerPath);
    const ledgerDirectory = path.dirname(ledgerPath);
    if (
      (resolvedLedger === projectsRoot || resolvedLedger.startsWith(`${projectsRoot}${path.sep}`)) &&
      path.basename(ledgerDirectory) === "ledgers"
    ) {
      return path.dirname(ledgerDirectory);
    }
  }
  const slug = path.basename(scopeRoot).replace(/[^A-Za-z0-9._-]+/g, "-") || "projectless";
  return path.join(os.homedir(), ".codex", "projects", slug);
}
