#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  access,
  copyFile,
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(scriptDir);
const sourceRoot = path.join(repoRoot, "codex");

function parseArgs(argv) {
  const options = {
    home: os.homedir(),
    backupRetention: 5,
    forceConfig: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--home") {
      options.home = path.resolve(argv[++index]);
    } else if (argument === "--backup-retention") {
      options.backupRetention = Number.parseInt(argv[++index], 10);
    } else if (argument === "--force-config") {
      options.forceConfig = true;
    } else {
      throw new Error("未知參數：" + argument);
    }
  }

  if (!Number.isInteger(options.backupRetention) || options.backupRetention < 0) {
    throw new Error("--backup-retention 必須是 0 或正整數");
  }

  return options;
}

function timestamp() {
  const value = new Date();
  const pad = (number) => String(number).padStart(2, "0");
  return (
    value.getFullYear() +
    pad(value.getMonth() + 1) +
    pad(value.getDate()) +
    "_" +
    pad(value.getHours()) +
    pad(value.getMinutes()) +
    pad(value.getSeconds())
  );
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function assertInside(target, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(target));
  if (relative === "" || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
    throw new Error("拒絕操作非預期路徑：" + target);
  }
}

async function copyItem(source, destination) {
  const sourceStat = await stat(source);
  if (sourceStat.isDirectory()) {
    await cp(source, destination, { recursive: true, force: true });
  } else {
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }
}

async function uniqueBackupPath(basePath) {
  if (!(await exists(basePath))) {
    return basePath;
  }
  return basePath + "." + randomUUID();
}

async function pruneBackups(target, backupRoot, retention) {
  if (retention < 1) {
    return;
  }

  const directory = backupRoot ?? path.dirname(target);
  if (!(await exists(directory))) {
    return;
  }

  const prefix = path.basename(target) + ".bak.";
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => {
      if (!entry.name.startsWith(prefix)) {
        return false;
      }
      const suffix = entry.name.slice(prefix.length);
      return /^\d{8}_\d{6}(?:\.[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})?$/.test(suffix);
    })
    .sort((left, right) => right.name.localeCompare(left.name));

  for (const entry of entries.slice(retention)) {
    const candidate = path.join(directory, entry.name);
    assertInside(candidate, directory);
    await rm(candidate, { recursive: true, force: true });
    console.log("  [清理] " + candidate);
  }
}

async function pruneBackupsAfterReplacement(target, backupRoot, retention) {
  try {
    await pruneBackups(target, backupRoot, retention);
  } catch (error) {
    console.error(
      "  [警告] replacement 已成功，但舊備份清理失敗：" + error.message
    );
  }
}

async function backupIfExists(target, backupRoot) {
  if (!(await exists(target))) {
    return null;
  }

  if (backupRoot) {
    await mkdir(backupRoot, { recursive: true });
  }

  const initial = backupRoot
    ? path.join(backupRoot, path.basename(target) + ".bak." + timestamp())
    : target + ".bak." + timestamp();
  const backupPath = await uniqueBackupPath(initial);
  await copyItem(target, backupPath);
  console.log("  [備份] " + target + " -> " + backupPath);
  return backupPath;
}

async function restoreBackup(backupPath, target) {
  await rm(target, { recursive: true, force: true });
  if (!backupPath) return;
  await copyItem(backupPath, target);
  console.error("  [回復] " + backupPath + " -> " + target);
}

async function deployContent(content, target, options = {}) {
  await mkdir(path.dirname(target), { recursive: true });
  const staged = path.join(path.dirname(target), "." + path.basename(target) + ".deploying." + randomUUID());
  const existed = await exists(target);
  let backupPath = null;
  try {
    await writeFile(staged, content);
    backupPath = await backupIfExists(target, options.backupRoot);
    try {
      await rm(target, { recursive: true, force: true });
      await rename(staged, target);
    } catch (error) {
      await restoreBackup(backupPath, target);
      throw error;
    }
    return { target, existed, backupPath, backupRoot: options.backupRoot, retention: options.retention };
  } finally {
    await rm(staged, { recursive: true, force: true });
  }
}

async function deployFile(source, target, options = {}) {
  const content = options.transform
    ? Buffer.from(options.transform(await readFile(source, "utf8")), "utf8")
    : await readFile(source);
  const entry = await deployContent(content, target, options);
  console.log("  [OK] " + path.relative(sourceRoot, source) + " -> " + target);
  return entry;
}

async function deployDirectory(source, target, backupRoot, retention) {
  await mkdir(path.dirname(target), { recursive: true });
  const staged = path.join(path.dirname(target), "." + path.basename(target) + ".deploying." + randomUUID());
  const existed = await exists(target);
  let backupPath = null;
  try {
    await cp(source, staged, { recursive: true, force: true });
    backupPath = await backupIfExists(target, backupRoot);
    try {
      await rm(target, { recursive: true, force: true });
      await rename(staged, target);
    } catch (error) {
      await restoreBackup(backupPath, target);
      throw error;
    }
    console.log("  [OK] " + path.relative(sourceRoot, source) + "/ -> " + target + "/");
    return { target, existed, backupPath, backupRoot, retention };
  } finally {
    await rm(staged, { recursive: true, force: true });
  }
}

async function deployTopLevelFiles(sourceDirectory, targetDirectory, journal, options = {}) {
  if (!(await exists(sourceDirectory))) return;
  await mkdir(targetDirectory, { recursive: true });
  const entries = await readdir(sourceDirectory, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (options.extension && path.extname(entry.name) !== options.extension) continue;
    journal.push(await deployFile(
      path.join(sourceDirectory, entry.name),
      path.join(targetDirectory, entry.name),
      { backupRoot: options.backupRoot, retention: options.retention }
    ));
  }
}

async function rollbackJournal(journal) {
  const errors = [];
  for (const entry of [...journal].reverse()) {
    try {
      await rm(entry.target, { recursive: true, force: true });
      if (entry.existed && entry.backupPath) await copyItem(entry.backupPath, entry.target);
    } catch (error) {
      errors.push(entry.target + ": " + error.message);
    }
  }
  return errors;
}

async function commitJournal(journal) {
  for (const entry of journal) {
    await pruneBackupsAfterReplacement(entry.target, entry.backupRoot, entry.retention);
  }
}

async function moveLegacySkillBackups(skillsDirectory, backupRoot) {
  if (!(await exists(skillsDirectory))) {
    return;
  }

  await mkdir(backupRoot, { recursive: true });
  const entries = await readdir(skillsDirectory, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !/\.bak\.\d{8}_\d{6}$/.test(entry.name)) {
      continue;
    }

    const source = path.join(skillsDirectory, entry.name);
    const destination = await uniqueBackupPath(path.join(backupRoot, entry.name));
    await rename(source, destination);
    console.log("  [移出] " + source + " -> " + destination);
  }
}

function executableNames(name) {
  if (process.platform !== "win32") {
    return [name];
  }

  if (path.extname(name)) {
    return [name];
  }

  return [name + ".exe", name + ".cmd", name + ".bat", name];
}

function findExecutable(name) {
  const directories = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  for (const directory of directories) {
    for (const candidateName of executableNames(name)) {
      const candidate = path.join(directory, candidateName);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error || result.status !== 0) {
    const detail = [result.stdout, result.stderr]
      .filter(Boolean)
      .join("\n")
      .trim();
    throw new Error(
      "指令失敗：" + command + " " + args.join(" ") + (detail ? "\n" + detail : "")
    );
  }

  return result.stdout.trim();
}

async function resolveSerenaCommand() {
  const installed = findExecutable("serena");
  if (installed) return installed;
  const uv = findExecutable("uv");
  if (uv) {
    try {
      const binaryDirectory = run(uv, ["tool", "dir", "--bin"]);
      const serena = path.join(binaryDirectory, process.platform === "win32" ? "serena.exe" : "serena");
      if (await exists(serena)) return serena;
    } catch {
      // Optional tool discovery must not install, upgrade, or migrate other projects.
    }
  }
  return null;
}

async function renderConfigTemplate() {
  const templatePath = path.join(sourceRoot, "config.toml");
  let text = await readFile(templatePath, "utf8");
  const npx = findExecutable("npx");
  if (!npx) {
    throw new Error("找不到 npx，無法展開 Codex MCP command");
  }

  const serena = await resolveSerenaCommand();
  if (!serena) {
    const start = text.indexOf("[mcp_servers.serena]");
    if (start < 0) throw new Error("找不到 Serena template 區段");
    const end = text.indexOf("\n[", start + 1);
    text = text.slice(0, start) + (end < 0 ? "" : text.slice(end + 1));
    console.log("  [略過] Serena 尚未安裝；本輪不加入 Serena MCP，安裝／升級及專案遷移須另行執行。");
  }
  const terminalShell =
    process.platform === "win32"
      ? "powershell"
      : process.platform === "darwin"
        ? "zsh"
        : "bash";

  text = text
    .replaceAll("__SERENA_COMMAND__", serena ? serena.split(path.sep).join("/") : "")
    .replaceAll("__NPX_COMMAND__", npx.split(path.sep).join("/"))
    .replaceAll("__CODEX_TERMINAL_SHELL__", terminalShell);

  if (process.platform === "win32") {
    const systemRoot = process.env.SystemRoot || "C:\\\\Windows";
    text = text.replaceAll("__SYSTEM_ROOT__", systemRoot);
  } else {
    text = text
      .replace(/^SystemRoot\s*=\s*["\x27]__SYSTEM_ROOT__["\x27]\r?\n?/m, "")
      .replace(/^runCodexInWindowsSubsystemForLinux\s*=\s*false\r?\n?/m, "");
  }

  return text;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const codexHome = path.join(options.home, ".codex");
  const skillsSource = path.join(sourceRoot, "skills");
  const skillsTarget = path.join(codexHome, "skills");
  const skillBackupRoot = path.join(codexHome, "backups", "skills");

  await mkdir(codexHome, { recursive: true });
  const activeConfig = path.join(codexHome, "config.toml");
  const shouldDeployConfig = !(await exists(activeConfig)) || options.forceConfig;
  const renderedConfig = shouldDeployConfig ? await renderConfigTemplate() : null;

  console.log("Codex 部署來源：" + sourceRoot);
  console.log("Codex 部署目標：" + codexHome);
  const journal = [];

  try {
    journal.push(await deployFile(path.join(sourceRoot, "AGENTS.md"), path.join(codexHome, "AGENTS.md"), { retention: options.backupRetention }));
    await deployTopLevelFiles(path.join(sourceRoot, "compact-prompts"), path.join(codexHome, "compact-prompts"), journal, { retention: options.backupRetention });
    await deployTopLevelFiles(path.join(sourceRoot, "profiles"), codexHome, journal, { extension: ".toml", retention: options.backupRetention });

    await moveLegacySkillBackups(skillsTarget, skillBackupRoot);
    await mkdir(skillsTarget, { recursive: true });
    for (const entry of await readdir(skillsSource, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        journal.push(await deployDirectory(path.join(skillsSource, entry.name), path.join(skillsTarget, entry.name), skillBackupRoot, options.backupRetention));
      }
    }

    await deployTopLevelFiles(path.join(sourceRoot, "agents"), path.join(codexHome, "agents"), journal, { extension: ".toml", retention: options.backupRetention });
    await deployTopLevelFiles(path.join(sourceRoot, "hooks"), path.join(codexHome, "hooks"), journal, { retention: options.backupRetention });

    const hooksTemplate = path.join(sourceRoot, "hooks.json");
    if (await exists(hooksTemplate)) {
      journal.push(await deployFile(hooksTemplate, path.join(codexHome, "hooks.json"), {
        retention: options.backupRetention,
        transform: (value) => value.replaceAll("__CODEX_HOME__", codexHome.split(path.sep).join("/")),
      }));
    }

    if (renderedConfig === null) {
      console.log("  [跳過] config.toml 已存在；使用 --force-config 才覆蓋");
    } else {
      journal.push(await deployContent(Buffer.from(renderedConfig, "utf8"), activeConfig, { retention: options.backupRetention }));
      console.log("  [OK] config.toml -> " + activeConfig);
    }

    await commitJournal(journal);
  } catch (error) {
    const rollbackErrors = await rollbackJournal(journal);
    const suffix = rollbackErrors.length > 0
      ? "\nRollback failures:\n" + rollbackErrors.join("\n")
      : "\n本輪已 replacement 的 managed targets 已回滾。";
    throw new Error(error.message + suffix);
  }

  console.log("Codex 部署完成");
}

main().catch((error) => {
  console.error("Codex 部署失敗：" + error.message);
  process.exitCode = 1;
});
