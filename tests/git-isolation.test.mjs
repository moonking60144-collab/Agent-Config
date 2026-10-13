import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gitEnvForRepo } from "../codex/skills/agent-core-lite/scripts/verify-change.mjs";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const verifyChange = pathToFileURL(path.join(repoRoot, "codex/skills/agent-core-lite/scripts/verify-change.mjs")).href;
const identity = ["-c", "user.name=fixture", "-c", "user.email=fixture@example.test", "-c", "commit.gpgsign=false"];

function git(args) {
  const result = spawnSync("git", args, { encoding: "utf8", env: gitEnvForRepo() });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

async function tempRoot(t, prefix) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), prefix)));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

async function committedRepo(directory, file, gitDir) {
  await fs.mkdir(directory, { recursive: true });
  git(gitDir ? ["init", "-q", `--separate-git-dir=${gitDir}`, directory] : ["init", "-q", directory]);
  await fs.writeFile(path.join(directory, file), file);
  git(["-C", directory, "add", "."]);
  git(["-C", directory, ...identity, "commit", "-qm", "fixture"]);
}

test("Verification snapshots read the requested repository even when Git exports another one", async (t) => {
  const root = await tempRoot(t, "git-isolation-");
  const decoyGitDir = path.join(root, "decoy.git");
  const target = path.join(root, "target");
  await committedRepo(path.join(root, "decoy"), "decoy.txt", decoyGitDir);
  await committedRepo(target, "target.txt");
  const script = `const { snapshot } = await import(${JSON.stringify(verifyChange)}); const captured = await snapshot(process.argv[1]); console.log(JSON.stringify({ head: captured.head, files: captured.files.map((file) => file.path) }));`;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script, target], {
    encoding: "utf8", env: { ...gitEnvForRepo(), GIT_DIR: decoyGitDir },
  });
  assert.equal(result.status, 0, result.stderr);
  const observed = JSON.parse(result.stdout);
  assert.deepEqual(observed.files, ["target.txt"]);
  assert.equal(observed.head, git(["-C", target, "rev-parse", "HEAD"]));
});

test("Pre-push hook keeps test Git commands inside their own repositories", async (t) => {
  const root = await tempRoot(t, "git-hook-isolation-");
  const outer = path.join(root, "outer");
  const outerGitDir = path.join(root, "outer.git");
  const probeRepo = path.join(root, "probe");
  const remote = path.join(root, "remote.git");
  for (const directory of ["tests", "scripts", ".githooks"]) await fs.mkdir(path.join(outer, directory), { recursive: true });
  await fs.mkdir(probeRepo);
  await fs.copyFile(path.join(repoRoot, ".githooks/pre-push"), path.join(outer, ".githooks/pre-push"));
  await fs.chmod(path.join(outer, ".githooks/pre-push"), 0o755);
  await fs.writeFile(path.join(outer, "scripts/validate-codex.mjs"), "");
  await fs.writeFile(path.join(outer, "tests/ui-ux-pro-max.test.py"), "");
  // Like an ordinary repository test, the probe trusts -C and inherits whatever environment the hook provides.
  await fs.writeFile(path.join(outer, "tests/probe.test.mjs"), [
    'import assert from "node:assert/strict";',
    'import { spawnSync } from "node:child_process";',
    'const result = spawnSync("git", ["-C", process.env.PROBE_REPO, "init", "-q"], { encoding: "utf8" });',
    "assert.equal(result.status, 0, result.stderr);",
  ].join("\n"));
  // A separate Git directory reproduces the submodule layout, where hooks export an absolute GIT_DIR.
  git(["init", "-q", `--separate-git-dir=${outerGitDir}`, outer]);
  git(["-C", outer, "config", "core.hooksPath", ".githooks"]);
  git(["-C", outer, "add", "."]);
  git(["-C", outer, ...identity, "commit", "-qm", "fixture"]);
  git(["init", "-q", "--bare", remote]);
  const env = { ...gitEnvForRepo(), PROBE_REPO: probeRepo };
  // The parent test runner marks its children; the hook must start an independent runner.
  delete env.NODE_TEST_CONTEXT;
  const push = spawnSync("git", ["-C", outer, "push", "-q", remote, "HEAD:refs/heads/main"], { encoding: "utf8", env, timeout: 60000 });
  assert.equal(push.status, 0, push.stderr);
  assert.equal(git(["--git-dir", outerGitDir, "config", "--get", "core.bare"]), "false");
  assert.ok(existsSync(path.join(probeRepo, ".git")), "probe repository was not initialized");
});
