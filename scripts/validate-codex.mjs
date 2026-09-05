#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  access,
  readFile,
  readdir,
  stat,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(scriptDir);
const sourceRoot = path.join(repoRoot, "codex");
const failures = [];

function parseArgs(argv) {
  const options = {
    home: os.homedir(),
    codexHome: null,
    skipActive: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--home") {
      options.home = path.resolve(argv[++index]);
    } else if (argument === "--codex-home") {
      options.codexHome = path.resolve(argv[++index]);
    } else if (argument === "--skip-active") {
      options.skipActive = true;
    } else {
      throw new Error("未知參數：" + argument);
    }
  }

  return options;
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function ok(message) {
  console.log("  [OK] " + message);
}

function fail(message) {
  failures.push(message);
  console.error("  [失敗] " + message);
}

async function requireFile(target, label) {
  if (!(await exists(target))) {
    fail(label + " 不存在：" + target);
    return false;
  }

  const targetStat = await stat(target);
  if (!targetStat.isFile()) {
    fail(label + " 不是檔案：" + target);
    return false;
  }

  ok(label + " 存在");
  return true;
}

function resolvePython() {
  const names = process.platform === "win32"
    ? ["python3.exe", "python.exe", "py.exe"]
    : ["python3", "python"];
  const directories = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  const probeCode =
    "import sys, tomllib; " +
    "assert sys.version_info >= (3, 11), sys.version";

  for (const name of names) {
    for (const directory of directories) {
      const command = path.join(directory, name);
      const prefix = name === "py.exe" ? ["-3"] : [];
      const result = spawnSync(
        command,
        [...prefix, "-c", probeCode],
        {
          encoding: "utf8",
          shell: false,
          stdio: ["ignore", "pipe", "pipe"],
        }
      );

      if (!result.error && result.status === 0) {
        return { command, prefix };
      }
    }
  }

  throw new Error(
    "找不到可執行且支援 tomllib 的 Python 3.11+ native interpreter"
  );
}

function runPython(python, code, args) {
  return spawnSync(
    python.command,
    [...python.prefix, "-c", code, ...args],
    {
      encoding: "utf8",
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
}

function validateTomlFile(target, label, python) {
  const code =
    "import pathlib, sys, tomllib; " +
    "tomllib.loads(pathlib.Path(sys.argv[1]).read_text(encoding=\"utf-8-sig\"))";
  const result = runPython(python, code, [target]);

  if (result.error || result.status !== 0) {
    const detail = [result.stdout, result.stderr]
      .filter(Boolean)
      .join("\n")
      .trim();
    fail(label + " TOML parse 失敗" + (detail ? "：" + detail : ""));
    return;
  }

  ok(label + " TOML parse OK");
}

function validateActiveConfigContract(target, python) {
  const code = `
import json, os, shutil, sys, tomllib
with open(sys.argv[1], encoding="utf-8-sig") as handle:
    expected = tomllib.loads(handle.read())
with open(sys.argv[2], encoding="utf-8-sig") as handle:
    actual = tomllib.loads(handle.read())
errors = []
def compare(wanted, observed, key):
    if isinstance(wanted, dict):
        if not isinstance(observed, dict):
            errors.append(key + " must be a table")
            return
        for name, value in wanted.items():
            compare(value, observed.get(name), key + "." + name if key else name)
    elif type(wanted) is not type(observed) or wanted != observed:
        errors.append(key + " differs from the repo-managed value")

# Session selections and machine/UI state are intentionally not portable defaults.
runtime_roots = {"model", "model_reasoning_effort", "service_tier", "desktop", "plugins", "hooks", "projects", "marketplaces", "mcp_servers"}
for key, value in expected.items():
    if key not in runtime_roots:
        compare(value, actual.get(key), key)
if "review_model" in actual:
    errors.append("review_model must not pin a separate review model")

servers = actual.get("mcp_servers", {})
if not isinstance(servers, dict):
    errors.append("mcp_servers must be a table")
    servers = {}
for name, settings in expected.get("mcp_servers", {}).items():
    prefix = "mcp_servers." + name
    live = servers.get(name)
    if not isinstance(live, dict):
        errors.append(prefix + " is missing")
        continue
    for key, value in settings.items():
        if key == "command":
            continue
        if key == "env":
            value = dict(value)
            if value.get("SystemRoot") == "__SYSTEM_ROOT__":
                if os.name == "nt":
                    value["SystemRoot"] = os.environ.get("SystemRoot", "C:\\\\Windows")
                else:
                    value.pop("SystemRoot")
        compare(value, live.get(key, {} if isinstance(value, dict) else None), prefix + "." + key)
    if "command" in settings:
        command = live.get("command")
        if not isinstance(command, str) or not command or not shutil.which(command):
            errors.append(prefix + ".command cannot resolve to an executable")
print(json.dumps(errors))
`;
  const result = runPython(python, code, [path.join(sourceRoot, "config.toml"), target]);
  if (result.error || result.status !== 0) {
    fail("active config contract 無法驗證：" + (result.stderr || result.error?.message || result.stdout));
    return;
  }
  const errors = JSON.parse(result.stdout);
  for (const error of errors) fail(error);
  if (errors.length === 0) ok("active portable config／managed MCP contract 一致且 command 可解析");
}

function parseYamlScalar(raw, label) {
  const value = raw.trim();
  if (!value) {
    throw new Error(label + " 的 value 不可為空");
  }

  if (value.startsWith("\"")) {
    if (!value.endsWith("\"")) {
      throw new Error(label + " 的雙引號未閉合");
    }
    const parsed = JSON.parse(value);
    if (typeof parsed !== "string") {
      throw new Error(label + " 必須是字串");
    }
    return parsed;
  }

  if (value.startsWith("'")) {
    if (!value.endsWith("'")) {
      throw new Error(label + " 的單引號未閉合");
    }

    const inner = value.slice(1, -1);
    let parsed = "";
    for (let index = 0; index < inner.length; index += 1) {
      if (inner[index] !== "'") {
        parsed += inner[index];
        continue;
      }
      if (inner[index + 1] !== "'") {
        throw new Error(label + " 的內部單引號必須寫成兩個單引號");
      }
      parsed += "'";
      index += 1;
    }
    return parsed;
  }

  if (
    /^[\[\]{},&*!|>@?#%:-]/.test(value) ||
    value.charCodeAt(0) === 96 ||
    value.includes(": ") ||
    value.includes(" #")
  ) {
    throw new Error(label + " 使用不支援或可能無效的 YAML scalar");
  }

  return value;
}

function parseStrictFrontmatter(text, label) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) {
    throw new Error(label + " 缺少 frontmatter boundary");
  }

  const allowed = new Set([
    "name",
    "description",
    "license",
    "allowed-tools",
    "metadata",
  ]);
  const result = {};

  for (const [index, line] of match[1].split(/\r?\n/).entries()) {
    if (!line.trim()) {
      continue;
    }
    if (/^\s/.test(line) || line.trimStart().startsWith("#")) {
      throw new Error(
        label + " 第 " + (index + 1) + " 行超出 strict scalar mapping subset"
      );
    }

    const property = line.match(/^([a-z][a-z0-9-]*):\s+(.+)$/);
    if (!property) {
      throw new Error(label + " 第 " + (index + 1) + " 行不是 key: scalar");
    }

    const key = property[1];
    if (!allowed.has(key)) {
      throw new Error(label + " 含不允許的 key：" + key);
    }
    if (Object.hasOwn(result, key)) {
      throw new Error(label + " 含重複 key：" + key);
    }
    result[key] = parseYamlScalar(property[2], label + "." + key);
  }

  if (typeof result.name !== "string" || !result.name) {
    throw new Error(label + " 缺少字串 name");
  }
  if (typeof result.description !== "string" || !result.description) {
    throw new Error(label + " 缺少字串 description");
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result.name)) {
    throw new Error(label + " name 必須是 hyphen-case");
  }

  return result;
}

function parseJsonLinesText(text, label) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) {
    throw new Error(label + " 不可為空");
  }

  lines.forEach((line, index) => {
    try {
      JSON.parse(line);
    } catch (error) {
      throw new Error(
        label + " 第 " + (index + 1) + " 行 JSON 無效：" + error.message
      );
    }
  });

  return lines.length;
}

function validateTomlPolicy(text, label, options = {}) {
  const requiredSections = [
    "features",
    "agents",
    "mcp_servers.context7",
    "mcp_servers.serena",
  ];

  for (const section of requiredSections) {
    const escaped = section.replace(/[.*+?^()|[\]\\{}$]/g, "\\$&");
    const pattern = new RegExp(
      "^\\s*\\[" + escaped + "\\]\\s*(?:#.*)?$",
      "m"
    );
    if (!pattern.test(text)) {
      fail(label + " 缺少 section [" + section + "]");
    }
  }

  if (!/^model_context_window\s*=\s*\d+\s*(?:#.*)?$/m.test(text)) {
    fail(label + " 缺少 model_context_window");
  }

  const tokens = [
    "__NPX_COMMAND__",
    "__SERENA_COMMAND__",
    "__SYSTEM_ROOT__",
    "__CODEX_TERMINAL_SHELL__",
  ];

  if (options.template) {
    for (const token of tokens) {
      if (!text.includes(token)) {
        fail(label + " 缺少 template token " + token);
      }
    }
    if (/^\s*\[mcp_servers\.node_repl\]\s*(?:#.*)?$/m.test(text)) {
      fail(label + " 不應保存 machine-specific node_repl");
    }
  } else {
    for (const token of tokens) {
      if (text.includes(token)) {
        fail(label + " 尚有未展開 token " + token);
      }
    }
  }
}

function runNegativeSelfTests(python) {
  const invalidFrontmatters = [
    "---\nname: valid-name\ndescription: [unterminated\n---\n",
    "---\nname: valid-name\nname: duplicate\ndescription: test\n---\n",
    "---\nname: valid-name\ndescription: # comment only\n---\n",
    "---\nname: valid-name\ndescription: %directive\n---\n",
    "---\nname: valid-name\ndescription: 'foo'bar'\n---\n",
  ];

  for (const value of invalidFrontmatters) {
    let rejected = false;
    try {
      parseStrictFrontmatter(value, "negative frontmatter");
    } catch {
      rejected = true;
    }
    if (!rejected) {
      throw new Error("validator 未拒絕 malformed frontmatter");
    }
  }

  const validEscapedQuote = parseStrictFrontmatter(
    "---\nname: valid-name\ndescription: 'foo''bar'\n---\n",
    "escaped quote frontmatter"
  );
  if (validEscapedQuote.description !== "foo'bar") {
    throw new Error("validator 未正確解析合法 YAML escaped single quote");
  }

  let rejectedEmptyJsonl = false;
  try {
    parseJsonLinesText("", "empty JSONL");
  } catch {
    rejectedEmptyJsonl = true;
  }
  if (!rejectedEmptyJsonl) {
    throw new Error("validator 未拒絕 empty JSONL");
  }

  const invalidTomlCode = [
    "import sys, tomllib",
    "try:",
    "    tomllib.loads(sys.argv[1])",
    "except tomllib.TOMLDecodeError:",
    "    sys.exit(42)",
    "except Exception:",
    "    sys.exit(43)",
    "sys.exit(0)",
  ].join("\n");
  const invalidToml = runPython(
    python,
    invalidTomlCode,
    ["key = \""]
  );

  if (invalidToml.error || invalidToml.status !== 42) {
    throw new Error(
      "malformed TOML negative self-test 未得到 TOMLDecodeError"
    );
  }

  ok(
    "malformed TOML/frontmatter、YAML indicators/quotes、duplicate key、empty JSONL negative self-test"
  );
}

async function collectFiles(directory) {
  if (!(await exists(directory))) {
    return [];
  }

  const files = [];
  async function walk(current, prefix) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const relative = path.join(prefix, entry.name);
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute, relative);
      } else if (entry.isFile()) {
        files.push(relative);
      }
    }
  }

  await walk(directory, "");
  return files.sort();
}

async function compareFile(expected, actual, label) {
  if (!(await exists(actual))) {
    fail(label + " active 檔案不存在：" + actual);
    return;
  }

  const expectedContent = await readFile(expected);
  const actualContent = await readFile(actual);
  if (!expectedContent.equals(actualContent)) {
    fail(label + " repo／active 不一致");
    return;
  }

  ok(label + " repo／active 一致");
}

async function compareDirectory(expected, actual, label) {
  if (!(await exists(actual))) {
    fail(label + " active 目錄不存在：" + actual);
    return;
  }

  const expectedFiles = await collectFiles(expected);
  const actualFiles = await collectFiles(actual);
  if (JSON.stringify(expectedFiles) !== JSON.stringify(actualFiles)) {
    fail(label + " 檔案清單不一致");
    return;
  }

  for (const relative of expectedFiles) {
    const expectedContent = await readFile(path.join(expected, relative));
    const actualContent = await readFile(path.join(actual, relative));
    if (!expectedContent.equals(actualContent)) {
      fail(label + " 內容不一致：" + relative);
      return;
    }
  }

  ok(label + " repo／active 目錄一致");
}

async function compareManagedFiles(expectedDirectory, actualDirectory, label) {
  if (!(await exists(expectedDirectory))) {
    return;
  }

  const entries = await readdir(expectedDirectory, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    await compareFile(
      path.join(expectedDirectory, entry.name),
      path.join(actualDirectory, entry.name),
      label + "/" + entry.name
    );
  }
}

async function validateRepo(python) {
  console.log("[1/2] Repo Codex 設定");

  const agentsPath = path.join(sourceRoot, "AGENTS.md");
  const configPath = path.join(sourceRoot, "config.toml");
  const skillsPath = path.join(sourceRoot, "skills");
  await requireFile(agentsPath, "codex/AGENTS.md");

  if (await requireFile(configPath, "codex/config.toml")) {
    validateTomlFile(configPath, "codex/config.toml", python);
    validateTomlPolicy(
      await readFile(configPath, "utf8"),
      "codex/config.toml",
      { template: true }
    );
  }

  if (!(await exists(skillsPath))) {
    fail("codex/skills 不存在");
  } else {
    const skillEntries = await readdir(skillsPath, { withFileTypes: true });
    const skills = skillEntries.filter((entry) => entry.isDirectory());
    if (skills.length === 0) {
      fail("codex/skills 沒有 repo-managed skill");
    }

    for (const skill of skills) {
      const skillPath = path.join(skillsPath, skill.name, "SKILL.md");
      if (!(await requireFile(skillPath, "skills/" + skill.name + "/SKILL.md"))) {
        continue;
      }

      try {
        const frontmatter = parseStrictFrontmatter(
          await readFile(skillPath, "utf8"),
          "skills/" + skill.name
        );
        if (frontmatter.name !== skill.name) {
          fail(
            "skills/" +
              skill.name +
              " 的 frontmatter name 不等於目錄名稱：" +
              frontmatter.name
          );
        } else {
          ok("skills/" + skill.name + " frontmatter strict subset valid");
        }
      } catch (error) {
        fail(error.message);
      }
    }
  }

  const hooksPath = path.join(sourceRoot, "hooks.json");
  if (await requireFile(hooksPath, "codex/hooks.json")) {
    try {
      JSON.parse(await readFile(hooksPath, "utf8"));
      ok("codex/hooks.json JSON 有效");
    } catch (error) {
      fail("codex/hooks.json JSON 無效：" + error.message);
    }
  }

  for (const hookAsset of [
    "project-ledger-lib.mjs",
    "record-session-provenance.mjs",
    "guard-project-completion.mjs",
    "validate-project-ledger.mjs",
    "project-ledger-completion.schema.json",
  ]) {
    await requireFile(path.join(sourceRoot, "hooks", hookAsset), "codex/hooks/" + hookAsset);
  }
  try {
    JSON.parse(await readFile(path.join(sourceRoot, "hooks", "project-ledger-completion.schema.json"), "utf8"));
    ok("project ledger completion schema JSON 有效");
  } catch (error) {
    fail("project ledger completion schema JSON 無效：" + error.message);
  }

}

async function validateActive(codexHome, python) {
  console.log("[2/2] Active Codex 設定");
  await compareFile(
    path.join(sourceRoot, "AGENTS.md"),
    path.join(codexHome, "AGENTS.md"),
    "AGENTS.md"
  );

  const skillsSource = path.join(sourceRoot, "skills");
  const skillEntries = await readdir(skillsSource, { withFileTypes: true });
  for (const entry of skillEntries) {
    if (!entry.isDirectory()) {
      continue;
    }
    await compareDirectory(
      path.join(skillsSource, entry.name),
      path.join(codexHome, "skills", entry.name),
      "skills/" + entry.name
    );
  }

  await compareManagedFiles(
    path.join(sourceRoot, "compact-prompts"),
    path.join(codexHome, "compact-prompts"),
    "compact-prompts"
  );
  await compareManagedFiles(
    path.join(sourceRoot, "profiles"),
    codexHome,
    "profiles"
  );
  await compareManagedFiles(
    path.join(sourceRoot, "agents"),
    path.join(codexHome, "agents"),
    "agents"
  );
  await compareManagedFiles(
    path.join(sourceRoot, "hooks"),
    path.join(codexHome, "hooks"),
    "hooks"
  );

  const hooksTemplate = await readFile(
    path.join(sourceRoot, "hooks.json"),
    "utf8"
  );
  const expectedHooks = hooksTemplate.replaceAll(
    "__CODEX_HOME__",
    codexHome.split(path.sep).join("/")
  );
  const activeHooksPath = path.join(codexHome, "hooks.json");
  if (!(await exists(activeHooksPath))) {
    fail("hooks.json active 檔案不存在");
  } else if ((await readFile(activeHooksPath, "utf8")) !== expectedHooks) {
    fail("hooks.json repo／active 展開結果不一致");
  } else {
    ok("hooks.json repo／active 展開結果一致");
  }

  const activeConfigPath = path.join(codexHome, "config.toml");
  if (await requireFile(activeConfigPath, "~/.codex/config.toml")) {
    validateTomlFile(activeConfigPath, "~/.codex/config.toml", python);
    validateTomlPolicy(
      await readFile(activeConfigPath, "utf8"),
      "~/.codex/config.toml"
    );
    validateActiveConfigContract(activeConfigPath, python);
  }

  const activeSkillsRoot = path.join(codexHome, "skills");
  if (await exists(activeSkillsRoot)) {
    const activeEntries = await readdir(activeSkillsRoot, {
      withFileTypes: true,
    });
    const leakedBackups = activeEntries
      .filter(
        (entry) => entry.isDirectory() && /\.bak\.\d{8}_\d{6}/.test(entry.name)
      )
      .map((entry) => entry.name);
    if (leakedBackups.length > 0) {
      fail("active skill registry 含備份目錄：" + leakedBackups.join(", "));
    } else {
      ok("active skill registry 無備份目錄");
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const python = resolvePython();
  runNegativeSelfTests(python);
  await validateRepo(python);
  const hookTests = spawnSync(
    process.execPath,
    ["--test", "--test-concurrency=1", path.join(repoRoot, "tests", "resume-project-ledger.test.mjs"), path.join(repoRoot, "tests", "project-ledger-hooks.test.mjs"), path.join(repoRoot, "tests", "verification-pipeline.test.mjs"), path.join(repoRoot, "tests", "deploy-codex.test.mjs")],
    { cwd: repoRoot, encoding: "utf8", shell: false }
  );
  if (hookTests.error || hookTests.status !== 0) {
    fail(
      "project ledger hook tests 失敗：" +
        (hookTests.stderr || hookTests.stdout || hookTests.error?.message)
    );
  } else {
    ok("project ledger／verification pipeline／deployment tests 全部通過");
  }
const evalValidation = spawnSync(
  process.execPath,
  [path.join(scriptDir, "run-codex-evals.mjs"), "--validate"],
  { cwd: repoRoot, encoding: "utf8", shell: false }
);
if (evalValidation.error || evalValidation.status !== 0) {
  fail(
    "workflow eval contract 失敗：" +
      (evalValidation.stderr || evalValidation.stdout || evalValidation.error?.message)
  );
} else {
  ok(evalValidation.stdout.trim());
}
  if (!options.skipActive) {
    await validateActive(options.codexHome ?? path.join(options.home, ".codex"), python);
  }

  if (failures.length > 0) {
    console.error("Codex 驗證失敗：" + failures.length + " 項");
    process.exitCode = 1;
    return;
  }

  console.log("Codex 驗證完成：全部通過");
}

main().catch((error) => {
  console.error("Codex 驗證失敗：" + error.message);
  process.exitCode = 1;
});
