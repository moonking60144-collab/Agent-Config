import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const deployer = path.join(repoRoot, "scripts", "deploy-codex.mjs");

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "deploy-codex-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const active = path.join(root, ".codex");
  await fs.mkdir(path.join(active, "hooks"), { recursive: true });
  await fs.writeFile(path.join(active, "config.toml"), "model_context_window = 1234\n");
  await fs.writeFile(path.join(active, "AGENTS.md"), "old instructions\n");
  await fs.writeFile(path.join(active, "hooks", "guard-project-completion.mjs"), "old hook\n");
  return { root, active };
}

test("Codex deployment preserves existing config and installs every managed hook", async (t) => {
  const { root, active } = await fixture(t);
  const result = spawnSync(process.execPath, [deployer, "--home", root, "--backup-retention", "0"], {
    cwd: repoRoot, encoding: "utf8", timeout: 30000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await fs.readFile(path.join(active, "config.toml"), "utf8"), "model_context_window = 1234\n");
  for (const name of await fs.readdir(path.join(repoRoot, "codex", "hooks"))) {
    assert.deepEqual(await fs.readFile(path.join(active, "hooks", name)), await fs.readFile(path.join(repoRoot, "codex", "hooks", name)));
  }
});

test("A later hook failure restores earlier replacements in the same batch", async (t) => {
  const { root, active } = await fixture(t);
  const retired = path.join(active, "skills", "codex-task-handoff", "SKILL.md");
  await fs.mkdir(path.dirname(retired), { recursive: true });
  await fs.writeFile(retired, "legacy handoff sentinel\n");
  const preload = path.join(root, "fail-second-hook.cjs");
  await fs.writeFile(preload, [
    'const fs = require("node:fs"), path = require("node:path");',
    'const original = fs.promises.readFile;',
    'fs.promises.readFile = async function (file, ...args) {',
    '  if (String(file).split(path.sep).join("/").endsWith("/codex/hooks/project-ledger-completion.schema.json")) throw new Error("injected source read failure");',
    '  return original.call(this, file, ...args);',
    '};',
    'require("node:module").syncBuiltinESMExports();',
  ].join("\n"));
  const result = spawnSync(process.execPath, ["--require", preload, deployer, "--home", root, "--backup-retention", "0"], {
    cwd: repoRoot, encoding: "utf8", timeout: 30000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /injected source read failure/);
  assert.equal(await fs.readFile(path.join(active, "AGENTS.md"), "utf8"), "old instructions\n");
  assert.equal(await fs.readFile(path.join(active, "hooks", "guard-project-completion.mjs"), "utf8"), "old hook\n");
  assert.equal(await fs.readFile(path.join(active, "config.toml"), "utf8"), "model_context_window = 1234\n");
  assert.equal(await fs.readFile(retired, "utf8"), "legacy handoff sentinel\n");
});

test("Codex deployment retires the duplicate handoff even when an old source draft remains", async (t) => {
  const { root, active } = await fixture(t);
  const isolated = path.join(root, "source");
  await fs.mkdir(path.join(isolated, "scripts"), { recursive: true });
  await fs.copyFile(deployer, path.join(isolated, "scripts", "deploy-codex.mjs"));
  for (const name of ["task-handoff", "codex-task-handoff"]) {
    await fs.mkdir(path.join(isolated, "codex", "skills", name), { recursive: true });
    await fs.writeFile(path.join(isolated, "codex", "skills", name, "SKILL.md"), name);
  }
  await fs.writeFile(path.join(isolated, "codex", "AGENTS.md"), "fixture instructions");
  for (const name of ["codex-task-handoff", "foreign-skill"]) {
    await fs.mkdir(path.join(active, "skills", name), { recursive: true });
    await fs.writeFile(path.join(active, "skills", name, "SKILL.md"), `${name} sentinel`);
  }
  for (let run = 0; run < 2; run++) {
    const result = spawnSync(process.execPath, [path.join(isolated, "scripts", "deploy-codex.mjs"), "--home", root, "--backup-retention", "0"], { encoding: "utf8", timeout: 30000 });
    assert.equal(result.status, 0, result.stderr);
    await assert.rejects(fs.access(path.join(active, "skills", "codex-task-handoff")), { code: "ENOENT" });
    assert.equal(await fs.readFile(path.join(active, "skills", "task-handoff", "SKILL.md"), "utf8"), "task-handoff");
    assert.equal(await fs.readFile(path.join(active, "skills", "foreign-skill", "SKILL.md"), "utf8"), "foreign-skill sentinel");
  }
  const backups = (await fs.readdir(path.join(active, "backups", "skills"))).filter(name => name.startsWith("codex-task-handoff.bak."));
  assert.equal(backups.length, 1);
  assert.equal(await fs.readFile(path.join(active, "backups", "skills", backups[0], "SKILL.md"), "utf8"), "codex-task-handoff sentinel");
});

async function isolatedToolDiscovery(root, { installed = true, failLater = false } = {}) {
  const bin = path.join(root, "bin"), uvBin = path.join(root, "uv-bin");
  const calls = path.join(root, "tool-calls.jsonl"), preload = path.join(root, "tool-discovery.cjs");
  const suffix = process.platform === "win32" ? ".exe" : "";
  await fs.mkdir(bin); await fs.mkdir(uvBin);
  for (const name of ["uv", "npx"]) await fs.writeFile(path.join(bin, name + suffix), "fixture only");
  const serena = path.join(uvBin, "serena" + suffix);
  if (installed) await fs.writeFile(serena, "existing version sentinel");
  const registry = path.join(root, ".serena", "serena_config.yml");
  const project = path.join(root, "other-project", ".serena", "project.yml");
  for (const file of [registry, project]) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, "unrelated project sentinel\n");
  }
  await fs.writeFile(preload, [
    'const fs = require("node:fs"), path = require("node:path"), child = require("node:child_process");',
    'child.spawnSync = function (command, args) {',
    '  fs.appendFileSync(process.env.TEST_TOOL_CALLS, JSON.stringify({command, args}) + "\\n");',
    '  if (path.basename(command).startsWith("uv") && JSON.stringify(args) === JSON.stringify(["tool", "dir", "--bin"])) return {status: 0, stdout: process.env.TEST_UV_BIN + "\\n", stderr: ""};',
    '  throw new Error("Unexpected external command during settings deployment");',
    '};',
    'if (process.env.TEST_FAIL_LATER === "yes") {',
    '  const original = fs.promises.readFile;',
    '  fs.promises.readFile = async function (file, ...args) {',
    '    if (String(file).split(path.sep).join("/").endsWith("/codex/hooks/project-ledger-completion.schema.json")) throw new Error("injected source read failure");',
    '    return original.call(this, file, ...args);',
    '  };',
    '}',
    'require("node:module").syncBuiltinESMExports();',
  ].join("\n"));
  const env = { ...process.env, PATH: bin, HOME: root, USERPROFILE: root, TEST_TOOL_CALLS: calls, TEST_UV_BIN: uvBin, TEST_FAIL_LATER: failLater ? "yes" : "no" };
  return { preload, env, serena, async verify() {
    const observed = (await fs.readFile(calls, "utf8")).trim().split("\n").map(JSON.parse);
    assert.deepEqual(observed.map((call) => call.args), [["tool", "dir", "--bin"]], "DEPLOY_DISCOVERY_ONLY_ASSERT");
    for (const file of [registry, project]) assert.equal(await fs.readFile(file, "utf8"), "unrelated project sentinel\n");
    if (installed) assert.equal(await fs.readFile(serena, "utf8"), "existing version sentinel");
  } };
}

for (const mode of ["first-install", "force-config", "later-failure", "missing-serena"]) {
  test(`settings deployment uses read-only tool discovery: ${mode}`, async (t) => {
    const { root, active } = await fixture(t);
    const first = mode === "first-install" || mode === "missing-serena";
    if (first) await fs.unlink(path.join(active, "config.toml"));
    const tools = await isolatedToolDiscovery(root, { installed: mode !== "missing-serena", failLater: mode === "later-failure" });
    const result = spawnSync(process.execPath, ["--require", tools.preload, deployer, "--home", root, "--backup-retention", "0", ...(first ? [] : ["--force-config"])], {
      cwd: repoRoot, env: tools.env, encoding: "utf8", timeout: 30000,
    });
    await tools.verify();
    const config = await fs.readFile(path.join(active, "config.toml"), "utf8");
    if (mode === "later-failure") {
      assert.equal(result.status, 1, result.stdout);
      assert.match(result.stderr, /injected source read failure/);
      assert.equal(config, "model_context_window = 1234\n");
      assert.equal(await fs.readFile(path.join(active, "AGENTS.md"), "utf8"), "old instructions\n");
    } else {
      assert.equal(result.status, 0, result.stderr);
      assert.doesNotMatch(config, /__SERENA_COMMAND__|__NPX_COMMAND__/);
      assert.match(config, /\[mcp_servers\.context7\]/);
      if (mode === "missing-serena") assert.doesNotMatch(config, /\[mcp_servers\.serena\]/);
      else assert.ok(config.includes(tools.serena.split(path.sep).join("/")));
    }
  });
}
