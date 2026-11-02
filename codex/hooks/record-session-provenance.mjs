import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  findMatchingLedgers,
  ledgerRequiresStrictVerification,
  readSessionProvenance,
  resolveSessionLedger,
  sessionProvenancePath,
  readBoundedRegularFile,
  readHookInput,
} from "./project-ledger-lib.mjs";

async function digestFile(filePath) {
  try {
    return createHash("sha256").update(await readBoundedRegularFile(filePath)).digest("hex");
  } catch {
    return null;
  }
}

async function preferredInstruction(directory) {
  for (const name of ["AGENTS.override.md", "AGENTS.md"]) {
    const filePath = path.join(directory, name);
    try {
      const content = await fs.readFile(filePath);
      if (content.toString("utf8").trim()) {
        return { path: filePath, sha256: createHash("sha256").update(content).digest("hex") };
      }
    } catch {
      // Try the next standard instruction filename.
    }
  }
  return null;
}

async function collectFiles(root) {
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name.startsWith(".") || entry.name === "backups") continue;
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(entryPath));
    if (entry.isFile()) files.push(entryPath);
  }
  return files;
}

async function digestTree(root) {
  const hash = createHash("sha256");
  for (const filePath of await collectFiles(root)) {
    hash.update(path.relative(root, filePath));
    hash.update("\0");
    hash.update(await fs.readFile(filePath));
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function projectAgentDigests(scopeRoot, cwd) {
  const files = [];
  let current = path.resolve(scopeRoot);
  const target = path.resolve(cwd);
  while (target === current || target.startsWith(`${current}${path.sep}`)) {
    const instruction = await preferredInstruction(current);
    if (instruction) files.push(instruction);
    if (current === target) break;
    const relative = path.relative(current, target).split(path.sep)[0];
    if (!relative) break;
    current = path.join(current, relative);
  }
  return files;
}

function codexVersion() {
  try {
    return execFileSync("codex", ["--version"], { encoding: "utf8", timeout: 1500 }).trim();
  } catch {
    return null;
  }
}

async function atomicWrite(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, filePath);
}

async function main() {
  const input = await readHookInput();
  const cwd = path.resolve(input.cwd || process.cwd());
  const { scopeRoot, ledgers } = await findMatchingLedgers(cwd);
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  const filePath = sessionProvenancePath(scopeRoot, input.session_id);
  if (!filePath) return;
  const previous = await readSessionProvenance(scopeRoot, input.session_id);
  let { ledgerPath } = resolveSessionLedger(previous, ledgers);
  if (Object.hasOwn(input, "ledger_path")) {
    if (typeof input.ledger_path !== "string" || !input.ledger_path.trim()) throw new Error("ledger_path must not be blank");
    const selected = ledgers.find((candidate) => path.resolve(candidate.filePath) === path.resolve(input.ledger_path));
    if (!selected) throw new Error("ledger_path must identify a ledger for the current checkout");
    ledgerPath = selected.filePath;
  }
  const [globalInstruction, config, hooks, skills, projectAgents] = await Promise.all([
    preferredInstruction(codexHome),
    digestFile(path.join(codexHome, "config.toml")),
    digestFile(path.join(codexHome, "hooks.json")),
    digestTree(path.join(codexHome, "skills")),
    projectAgentDigests(scopeRoot, cwd),
  ]);
  const event = {
    recordedAt: new Date().toISOString(),
    source: input.source || null,
    model: input.model || null,
    permissionMode: input.permission_mode || null,
    cwd,
    scopeRoot,
    ledgerPath,
    instructionDiscoveryEvidence: "observed_standard_files_only",
    digests: {
      globalAgents: globalInstruction?.sha256 || null,
      config,
      hooks,
      skills,
      projectAgents,
    },
  };

  const baselineLedgers = previous?.baselineLedgers || await Promise.all(
    ledgers.map(async (candidate) => ({
      filePath: candidate.filePath,
      status: candidate.status,
      updatedAt: candidate.updatedAt,
      strictVerificationRequired: await ledgerRequiresStrictVerification(candidate),
      contentSha256: createHash("sha256").update(candidate.content).digest("hex"),
      completionContractSha256: candidate.completionContract
        ? await digestFile(candidate.completionContract)
        : null,
    })),
  );

  const strictLedgerPaths = [...new Set([
    ...(previous?.strictLedgerPaths || []),
    ...baselineLedgers.filter((item) => item.strictVerificationRequired).map((item) => item.filePath),
    ...(await Promise.all(ledgers.map(async (candidate) => await ledgerRequiresStrictVerification(candidate) ? candidate.filePath : null))).filter(Boolean),
  ])];

  await atomicWrite(filePath, {
    schemaVersion: 1,
    sessionId: input.session_id || null,
    ledgerPath,
    startedAt: previous?.startedAt || event.recordedAt,
    baselineLedgers,
    strictLedgerPaths,
    codexVersion: previous?.codexVersion || codexVersion(),
    nativeSkillActivationObserved: false,
    selectedProcessSkill: null,
    loadedConditionalReferences: null,
    observabilityLimit: "Codex hooks expose active files and lifecycle input, not native skill/reference activation telemetry.",
    events: [...(Array.isArray(previous?.events) ? previous.events : []), event],
  });
}

main().catch((error) => {
  process.stderr.write(`Session provenance was not updated: ${error.message}\n`);
  process.exitCode = 1;
});
