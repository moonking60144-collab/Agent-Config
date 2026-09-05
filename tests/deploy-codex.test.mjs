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
});
