import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(scriptDir);
const homeArgIndex = process.argv.indexOf("--home");
const home = homeArgIndex >= 0 && process.argv[homeArgIndex + 1]
  ? path.resolve(process.argv[homeArgIndex + 1])
  : os.homedir();
const retentionArgIndex = process.argv.indexOf("--backup-retention");
const backupRetentionRaw = retentionArgIndex >= 0 ? process.argv[retentionArgIndex + 1] : "5";
if (!/^\d+$/.test(backupRetentionRaw ?? "")) {
  throw new Error("--backup-retention must be a non-negative integer");
}
const backupRetention = Number.parseInt(backupRetentionRaw, 10);
const sourceDir = path.join(repoRoot, "claude");
const targetDir = path.join(home, ".claude");
const hookTarget = path.join(targetDir, "hooks", "check-traditional.mjs");
const evidenceHookTarget = path.join(targetDir, "hooks", "check-evidence.mjs");
const managedHookPaths = ["lib/prose.mjs", "check-traditional.mjs", "check-evidence.mjs"];
const backupDir = path.join(targetDir, "backups", "deploy-claude");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

async function readJson(filePath, { optional = false } = {}) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (optional && error?.code === "ENOENT") return {};
    throw new Error(`Cannot read valid JSON from ${filePath}`, { cause: error });
  }
}

async function backup(filePath) {
  try {
    await fs.access(filePath);
  } catch {
    return;
  }
  await fs.mkdir(backupDir, { recursive: true });
  await fs.copyFile(filePath, path.join(backupDir, `${path.basename(filePath)}.${timestamp}.bak`));
}

async function atomicWrite(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.deploying-${process.pid}`;
  await fs.writeFile(temporary, content, "utf8");
  await fs.rename(temporary, filePath);
}

async function pruneBackups(fileName) {
  if (backupRetention === 0) return;
  let entries;
  try {
    entries = await fs.readdir(backupDir);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  const backups = entries
    .filter((entry) => entry.startsWith(`${fileName}.`) && entry.endsWith(".bak"))
    .sort()
    .reverse();
  await Promise.all(backups.slice(backupRetention).map((entry) => fs.rm(path.join(backupDir, entry))));
}

await fs.mkdir(path.dirname(hookTarget), { recursive: true });

const settingsTarget = path.join(targetDir, "settings.json");
const instructionsTarget = path.join(targetDir, "CLAUDE.md");
const [existing, template, instructions] = await Promise.all([
  readJson(settingsTarget, { optional: true }),
  readJson(path.join(sourceDir, "settings.json")),
  fs.readFile(path.join(sourceDir, "CLAUDE.md"), "utf8"),
]);

const hooks = await Promise.all(managedHookPaths.map(async (relativePath) => ({
  target: path.join(targetDir, "hooks", relativePath),
  content: await fs.readFile(path.join(sourceDir, "hooks", relativePath), "utf8"),
})));
const hookTokens = new Map([
  ["__CLAUDE_STOP_HOOK_PATH__", hookTarget],
  ["__CLAUDE_EVIDENCE_HOOK_PATH__", evidenceHookTarget],
]);
for (const group of template.hooks.Stop) {
  for (const hook of group.hooks) {
    if (Array.isArray(hook.args)) {
      hook.args = hook.args.map((argument) => hookTokens.get(argument) ?? argument);
    }
  }
}
const merged = {
  $schema: template.$schema,
  ...existing,
  ...template,
  permissions: { ...(existing.permissions ?? {}), ...(template.permissions ?? {}) },
  attribution: { ...(existing.attribution ?? {}), ...(template.attribution ?? {}) },
  hooks: template.hooks,
};
delete merged.skipWorkflowUsageWarning;

const targets = [settingsTarget, instructionsTarget, ...hooks.map((hook) => hook.target)];
await Promise.all(targets.map(backup));
// Publish dependencies before enabling their hook registrations.
for (const hook of hooks) await atomicWrite(hook.target, hook.content);
await atomicWrite(instructionsTarget, instructions);
await atomicWrite(settingsTarget, `${JSON.stringify(merged, null, 2)}\n`);
await Promise.all(targets.map((target) => pruneBackups(path.basename(target))));

process.stdout.write([
  `Claude settings deployed to ${settingsTarget}`,
  `Claude instructions deployed to ${instructionsTarget}`,
  `Claude Stop hooks deployed to ${hookTarget} and ${evidenceHookTarget}`,
  `Claude hook helper deployed to ${path.join(targetDir, "hooks", "lib", "prose.mjs")}`,
  `Claude backup retention: ${backupRetention === 0 ? "unlimited" : backupRetention}`,
  "Existing local-only settings such as model are preserved unless the portable template overrides them.",
].join("\n"));
