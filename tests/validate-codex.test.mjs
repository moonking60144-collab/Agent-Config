import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const source = path.join(repoRoot, "codex");

test("Canonical validator distinguishes portable drift from runtime selections", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "validate-codex-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const name of ["AGENTS.md", "skills", "agents", "hooks", "compact-prompts"]) {
    await fs.cp(path.join(source, name), path.join(root, name), { recursive: true });
  }
  for (const name of await fs.readdir(path.join(source, "profiles"))) {
    await fs.copyFile(path.join(source, "profiles", name), path.join(root, name));
  }
  await fs.writeFile(path.join(root, "hooks.json"), (await fs.readFile(path.join(source, "hooks.json"), "utf8")).replaceAll("__CODEX_HOME__", root.split(path.sep).join("/")));
  const executable = process.execPath.split(path.sep).join("/");
  let config = (await fs.readFile(path.join(source, "config.toml"), "utf8"))
    .replaceAll("__NPX_COMMAND__", executable)
    .replaceAll("__SERENA_COMMAND__", executable)
    .replaceAll("__CODEX_TERMINAL_SHELL__", process.platform === "win32" ? "powershell" : "bash");
  if (process.platform === "win32") config = config.replaceAll("__SYSTEM_ROOT__", process.env.SystemRoot || "C:\\Windows");
  else config = config.replace(/^SystemRoot\s*=.*\r?\n/m, "");
  const run = async (text) => {
    await fs.writeFile(path.join(root, "config.toml"), text);
    return spawnSync(process.execPath, [path.join(repoRoot, "scripts", "validate-codex.mjs"), "--codex-home", root], {
      cwd: repoRoot, encoding: "utf8", timeout: 60000,
    });
  };
  const baseline = await run(config);
  assert.equal(baseline.status, 0, baseline.stderr || baseline.stdout);
  const bom = await run("\uFEFF" + config);
  assert.equal(bom.status, 0, bom.stderr || bom.stdout);

  const runtime = 'model = "runtime-selected-model"\nservice_tier = "priority"\n' + config.replace(/model_reasoning_effort = "[^"]+"/, 'model_reasoning_effort = "low"') + '\n[projects."test"]\ntrust_level = "trusted"\n[hooks.state."test"]\ntrusted_hash = "test"\n[plugins."runtime-plugin"]\nenabled = true\n[mcp_servers.runtime_only]\ncommand = "not-managed-by-repo"\n';
  const allowed = await run(runtime);
  assert.equal(allowed.status, 0, allowed.stderr || allowed.stdout);

  const missingCommand = path.join(root, "missing-serena").split(path.sep).join("/");
  const corrupted = config.replace(/^tool_output_token_limit = \d+/m, "tool_output_token_limit = 1234")
    .replace(/(\[mcp_servers\.serena\]\s*\r?\ncommand\s*=\s*)'[^']*'/, `$1'${missingCommand}'`);
  const invalid = await run(corrupted);
  assert.equal(invalid.status, 1, invalid.stdout);
  assert.match(invalid.stderr, /tool_output_token_limit/);
  assert.match(invalid.stderr, /mcp_servers\.serena\.command/);
});
