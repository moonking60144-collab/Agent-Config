import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const hookPath = path.join(repoRoot, "codex", "hooks", "resume-project-ledger.mjs");

async function createFixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "resume-project-ledger-"));
  const home = path.join(root, "home");
  const repo = path.join(root, "repo");

  await fs.mkdir(path.join(repo, ".git"), { recursive: true });
  await fs.mkdir(home, { recursive: true });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  return { home, repo };
}

async function writeLedger(home, name, fields) {
  const ledgerDir = path.join(home, ".codex", "projects", "fixture", "ledgers");
  const ledgerPath = path.join(ledgerDir, `${name}.md`);
  const lines = [
    fields.status ? `project_status: ${fields.status}` : null,
    fields.repoPath ? `repo_path: ${fields.repoPath}` : null,
    fields.planPath ? `plan_path: ${fields.planPath}` : null,
    fields.nextInstruction ? `next_instruction: ${fields.nextInstruction}` : null,
  ].filter(Boolean);

  await fs.mkdir(ledgerDir, { recursive: true });
  await fs.writeFile(ledgerPath, `${lines.join("\n")}\n`, "utf8");
  return ledgerPath;
}

function runHook(repo, home) {
  const result = spawnSync(process.execPath, [hookPath], {
    cwd: repo,
    input: JSON.stringify({ cwd: repo }),
    encoding: "utf8",
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });

  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function readAdditionalContext(stdout) {
  return JSON.parse(stdout).hookSpecificOutput.additionalContext;
}

test("emits no context when no unfinished ledger exists", async (t) => {
  const { home, repo } = await createFixture(t);
  assert.equal(runHook(repo, home), "");
});

test("restores an active ledger for the current repository", async (t) => {
  const { home, repo } = await createFixture(t);
  const ledgerPath = await writeLedger(home, "active", {
    status: "active",
    repoPath: repo,
    planPath: path.join(home, "plan.md"),
    nextInstruction: "Continue from task-2.",
  });

  const context = readAdditionalContext(runHook(repo, home));
  assert.match(context, new RegExp(ledgerPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(context, /Continue from task-2\./);
});

test("restores a blocked ledger for the current repository", async (t) => {
  const { home, repo } = await createFixture(t);
  await writeLedger(home, "blocked", {
    status: "blocked",
    repoPath: repo,
    nextInstruction: "Resolve the blocker.",
  });

  assert.match(readAdditionalContext(runHook(repo, home)), /Resolve the blocker\./);
});

for (const status of ["pending", "in_progress"]) {
  test(`restores a legacy ${status} ledger for the current repository`, async (t) => {
    const { home, repo } = await createFixture(t);
    await writeLedger(home, status, {
      status,
      repoPath: repo,
      nextInstruction: `Continue ${status}.`,
    });

    assert.match(readAdditionalContext(runHook(repo, home)), new RegExp(`Continue ${status}\\.`));
  });
}

test("ignores a ledger owned by another repository", async (t) => {
  const { home, repo } = await createFixture(t);
  await writeLedger(home, "wrong-repo", {
    status: "active",
    repoPath: path.join(path.dirname(repo), "other-repo"),
  });

  assert.equal(runHook(repo, home), "");
});

test("ignores a completed ledger", async (t) => {
  const { home, repo } = await createFixture(t);
  await writeLedger(home, "complete", { status: "complete", repoPath: repo });
  assert.equal(runHook(repo, home), "");
});

test("ignores malformed ledger headers", async (t) => {
  const { home, repo } = await createFixture(t);
  await writeLedger(home, "malformed", { status: "active" });
  assert.equal(runHook(repo, home), "");
});

test("selects the newest matching unfinished ledger", async (t) => {
  const { home, repo } = await createFixture(t);
  const older = await writeLedger(home, "older", {
    status: "active",
    repoPath: repo,
    nextInstruction: "Use the older ledger.",
  });
  const newer = await writeLedger(home, "newer", {
    status: "blocked",
    repoPath: repo,
    nextInstruction: "Use the newer ledger.",
  });

  await fs.utimes(older, new Date(1_000), new Date(1_000));
  await fs.utimes(newer, new Date(2_000), new Date(2_000));

  const context = readAdditionalContext(runHook(repo, home));
  assert.match(context, /Use the newer ledger\./);
  assert.doesNotMatch(context, /Use the older ledger\./);
});
