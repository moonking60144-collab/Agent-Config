import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validateCompletionContract } from "../codex/hooks/validate-project-ledger.mjs";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const guardPath = path.join(repoRoot, "codex", "hooks", "guard-project-completion.mjs");
const provenancePath = path.join(repoRoot, "codex", "hooks", "record-session-provenance.mjs");
const validatorPath = path.join(repoRoot, "codex", "hooks", "validate-project-ledger.mjs");

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-ledger-hooks-"));
  const home = path.join(root, "home");
  const repo = path.join(root, "repo");
  const ledgerDir = path.join(home, ".codex", "projects", "repo", "ledgers");
  await fs.mkdir(path.join(repo, ".git"), { recursive: true });
  await fs.mkdir(ledgerDir, { recursive: true });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { home, repo, ledgerDir };
}

function baseContract(ledgerPath) {
  return { schemaVersion: 1, ledgerPath, findings: [], requiredEvidence: [], preflights: [] };
}

function runHook(script, cwd, home, input) {
  const result = spawnSync(process.execPath, [script], {
    cwd,
    input: JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, HOME: home, USERPROFILE: home, CODEX_HOME: path.join(home, ".codex") },
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout ? JSON.parse(result.stdout) : null;
}

test("completion contract blocks open findings and missing evidence", () => {
  const ledgerPath = "/tmp/project.md";
  const contract = baseContract(ledgerPath);
  contract.findings.push({ id: "P1-state", severity: "P1", status: "open", blockingCompletion: true, evidence: [] });
  contract.requiredEvidence.push({ id: "representative-runtime", status: "missing" });
  const result = validateCompletionContract(contract, ledgerPath);
  assert.deepEqual(result.errors, []);
  assert.equal(result.blockers.length, 2);
});

test("completion contract requires evidence for exception states", () => {
  const ledgerPath = "/tmp/project.md";
  const contract = baseContract(ledgerPath);
  contract.findings.push({ id: "P2-deferred", severity: "P2", status: "deferred", blockingCompletion: false, evidence: [] });
  const result = validateCompletionContract(contract, ledgerPath);
  assert.match(result.errors.join("\n"), /owner is required/);
  assert.match(result.errors.join("\n"), /reason is required/);
  assert.match(result.errors.join("\n"), /evidence must contain/);
});

test("completion contract accepts evidenced non-blocking exceptions", () => {
  const ledgerPath = "/tmp/project.md";
  const contract = baseContract(ledgerPath);
  contract.findings.push({
    id: "P2-risk",
    severity: "P2",
    status: "accepted_risk",
    blockingCompletion: false,
    owner: "operator",
    reason: "Accepted for this phase.",
    evidence: ["decision:2026-09-01"],
  });
  assert.deepEqual(validateCompletionContract(contract, ledgerPath), { errors: [], blockers: [] });
});

test("completion contract enforces the canonical schema and stable ids", () => {
  const ledgerPath = "/tmp/project.md";
  const extraProperty = { ...baseContract(ledgerPath), typo: true };
  assert.match(validateCompletionContract(extraProperty, ledgerPath).errors.join("\n"), /typo is not allowed/);

  const invalidEvidence = baseContract(ledgerPath);
  invalidEvidence.findings.push({
    id: "P2-null-evidence",
    severity: "P2",
    status: "resolved",
    blockingCompletion: false,
    evidence: [null],
  });
  assert.match(validateCompletionContract(invalidEvidence, ledgerPath).errors.join("\n"), /evidence\[0\] must be string/);

  const duplicateIds = baseContract(ledgerPath);
  duplicateIds.requiredEvidence.push(
    { id: "runtime", status: "present", artifact: "first" },
    { id: "runtime", status: "present", artifact: "second" },
  );
  assert.match(validateCompletionContract(duplicateIds, ledgerPath).errors.join("\n"), /duplicates/);
});

test("Stop hook continues an invalid complete ledger once", async (t) => {
  const { home, repo, ledgerDir } = await fixture(t);
  const ledgerPath = path.join(ledgerDir, "project.md");
  const contractPath = path.join(ledgerDir, "project.completion.json");
  await fs.writeFile(ledgerPath, [
    "project_status: active",
    `repo_path: ${repo}`,
    `ledger_path: ${ledgerPath}`,
    `completion_contract: ${contractPath}`,
  ].join("\n") + "\n");
  const contract = baseContract(ledgerPath);
  contract.preflights.push({ id: "interaction-performance", status: "open" });
  await fs.writeFile(contractPath, JSON.stringify(contract));

  runHook(provenancePath, repo, home, {
    cwd: repo,
    session_id: "completion-session",
    hook_event_name: "SessionStart",
  });
  await fs.writeFile(ledgerPath, [
    "project_status: complete",
    `repo_path: ${repo}`,
    `ledger_path: ${ledgerPath}`,
    `completion_contract: ${contractPath}`,
  ].join("\n") + "\n");

  const first = runHook(guardPath, repo, home, { cwd: repo, session_id: "completion-session", hook_event_name: "Stop", stop_hook_active: false });
  assert.equal(first.decision, "block");
  assert.match(first.reason, /interaction-performance/);
  assert.deepEqual(runHook(guardPath, repo, home, { cwd: repo, session_id: "completion-session", hook_event_name: "Stop", stop_hook_active: true }), { continue: true });
});

test("Stop hook ignores an older invalid complete ledger when the newest ledger is active", async (t) => {
  const { home, repo, ledgerDir } = await fixture(t);
  const completeLedger = path.join(ledgerDir, "older.md");
  const contractPath = path.join(ledgerDir, "older.completion.json");
  await fs.writeFile(completeLedger, [
    "project_status: complete",
    `repo_path: ${repo}`,
    `completion_contract: ${contractPath}`,
  ].join("\n") + "\n");
  const contract = baseContract(completeLedger);
  contract.requiredEvidence.push({ id: "runtime", status: "missing" });
  await fs.writeFile(contractPath, JSON.stringify(contract));
  const activeLedger = path.join(ledgerDir, "newer.md");
  await fs.writeFile(activeLedger, `project_status: active\nrepo_path: ${repo}\n`);
  await fs.utimes(completeLedger, new Date(1_000), new Date(1_000));
  await fs.utimes(activeLedger, new Date(2_000), new Date(2_000));

  runHook(provenancePath, repo, home, {
    cwd: repo,
    session_id: "active-session",
    hook_event_name: "SessionStart",
  });

  assert.deepEqual(runHook(guardPath, repo, home, { cwd: repo, session_id: "active-session", hook_event_name: "Stop", stop_hook_active: false }), { continue: true });
});

test("Stop hook evaluates the session-bound ledger instead of the newest ledger", async (t) => {
  const { home, repo, ledgerDir } = await fixture(t);
  const boundLedger = path.join(ledgerDir, "bound.md");
  const boundContract = path.join(ledgerDir, "bound.completion.json");
  await fs.writeFile(boundLedger, `project_status: active\nrepo_path: ${repo}\ncompletion_contract: ${boundContract}\n`);
  const contract = baseContract(boundLedger);
  contract.requiredEvidence.push({ id: "bound-runtime", status: "missing" });
  await fs.writeFile(boundContract, JSON.stringify(contract));
  runHook(provenancePath, repo, home, {
    cwd: repo,
    session_id: "bound-session",
    hook_event_name: "SessionStart",
  });
  await fs.writeFile(boundLedger, `project_status: complete\nrepo_path: ${repo}\ncompletion_contract: ${boundContract}\n`);
  await fs.utimes(boundLedger, new Date(1_000), new Date(1_000));

  const newerLedger = path.join(ledgerDir, "newer.md");
  const newerContract = path.join(ledgerDir, "newer.completion.json");
  await fs.writeFile(newerLedger, `project_status: complete\nrepo_path: ${repo}\ncompletion_contract: ${newerContract}\n`);
  await fs.writeFile(newerContract, JSON.stringify(baseContract(newerLedger)));
  await fs.utimes(newerLedger, new Date(3_000), new Date(3_000));

  const result = runHook(guardPath, repo, home, {
    cwd: repo,
    session_id: "bound-session",
    hook_event_name: "Stop",
    stop_hook_active: false,
  });
  assert.equal(result.decision, "block");
  assert.match(result.reason, /bound-runtime/);
});

test("validator resolves scope from ledger repo_path without --repo", async (t) => {
  const { home, repo, ledgerDir } = await fixture(t);
  const ledgerPath = path.join(ledgerDir, "project.md");
  const contractPath = path.join(ledgerDir, "project.completion.json");
  await fs.writeFile(ledgerPath, [
    "project_status: complete",
    `repo_path: ${repo}`,
    `completion_contract: ${contractPath}`,
  ].join("\n") + "\n");
  await fs.writeFile(contractPath, JSON.stringify(baseContract(ledgerPath)));
  const result = spawnSync(process.execPath, [validatorPath, "--ledger", ledgerPath], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).valid, true);
});

test("SessionStart hook writes provenance with explicit activation limit", async (t) => {
  const { home, repo, ledgerDir } = await fixture(t);
  await fs.mkdir(path.join(home, ".codex", "skills", "fixture"), { recursive: true });
  await fs.writeFile(path.join(home, ".codex", "AGENTS.md"), "fixture\n");
  await fs.writeFile(path.join(home, ".codex", "config.toml"), "personality = \"pragmatic\"\n");
  await fs.writeFile(path.join(home, ".codex", "hooks.json"), "{}\n");
  await fs.writeFile(path.join(home, ".codex", "skills", "fixture", "SKILL.md"), "fixture\n");
  await fs.writeFile(path.join(ledgerDir, "project.md"), `project_status: active\nrepo_path: ${repo}\n`);

  runHook(provenancePath, repo, home, {
    cwd: repo,
    session_id: "session-1",
    hook_event_name: "SessionStart",
    source: "startup",
    model: "gpt-test",
  });
  const outputPath = path.join(home, ".codex", "projects", "repo", "sessions", "session-1.json");
  const provenance = JSON.parse(await fs.readFile(outputPath, "utf8"));
  assert.equal(provenance.nativeSkillActivationObserved, false);
  assert.equal(provenance.selectedProcessSkill, null);
  assert.equal(provenance.events[0].model, "gpt-test");
  assert.equal(provenance.events[0].instructionDiscoveryEvidence, "observed_standard_files_only");
  assert.match(provenance.events[0].digests.globalAgents, /^[a-f0-9]{64}$/);
});

test("SessionStart hook does not write provenance without an unfinished ledger", async (t) => {
  const { home, repo } = await fixture(t);
  runHook(provenancePath, repo, home, {
    cwd: repo,
    session_id: "read-only-session",
    hook_event_name: "SessionStart",
  });
  await assert.rejects(
    fs.access(path.join(home, ".codex", "projects", "repo", "sessions", "read-only-session.json")),
  );
});

test("Stop hook reports a corrupt provenance file while failing open", async (t) => {
  const { home, repo } = await fixture(t);
  const sessionDirectory = path.join(home, ".codex", "projects", "repo", "sessions");
  await fs.mkdir(sessionDirectory, { recursive: true });
  await fs.writeFile(path.join(sessionDirectory, "corrupt-session.json"), "{");
  const result = runHook(guardPath, repo, home, {
    cwd: repo,
    session_id: "corrupt-session",
    hook_event_name: "Stop",
    stop_hook_active: false,
  });
  assert.equal(result.continue, true);
  assert.match(result.systemMessage, /failed open/);
});

test("repo-local ledger still stores provenance under user-level projects", async (t) => {
  const { home, repo } = await fixture(t);
  const localLedgerDir = path.join(repo, "docs", "codex", "ledgers");
  const localLedger = path.join(localLedgerDir, "project.md");
  await fs.mkdir(localLedgerDir, { recursive: true });
  await fs.writeFile(localLedger, `project_status: active\nrepo_path: ${repo}\n`);

  runHook(provenancePath, repo, home, {
    cwd: repo,
    session_id: "session-local-ledger",
    hook_event_name: "SessionStart",
    source: "startup",
  });
  const userLevelPath = path.join(home, ".codex", "projects", "repo", "sessions", "session-local-ledger.json");
  assert.equal(JSON.parse(await fs.readFile(userLevelPath, "utf8")).events[0].ledgerPath, localLedger);
  await assert.rejects(fs.access(path.join(repo, "docs", "codex", "sessions", "session-local-ledger.json")));
});
