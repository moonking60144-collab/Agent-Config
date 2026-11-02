import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { prepareClaudeWorkflow } from "../scripts/claude-workflow.mjs";
import { attachVerification } from "./fixtures/verification-receipt.mjs";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const digest = (value) => createHash("sha256").update(value).digest("hex");

async function fixture(t, runtime = "codex") {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "native-completion-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const repo = path.join(root, "repo"), home = path.join(root, "home");
  const active = path.join(home, `.${runtime}`);
  let hooks = path.join(repoRoot, "codex/hooks");
  if (runtime === "claude") {
    hooks = path.join(active, "hooks");
    const { files } = await prepareClaudeWorkflow(repoRoot, active);
    for (const file of files.filter((item) => /[\\/]hooks[\\/]|[\\/]agent-core-lite[\\/]scripts[\\/]/.test(item.target))) {
      await fs.mkdir(path.dirname(file.target), { recursive: true });
      await fs.writeFile(file.target, file.content);
    }
  }
  const ledgerDir = path.join(active, runtime === "codex" ? "projects" : "workflow/projects", "repo", "ledgers");
  await fs.mkdir(ledgerDir, { recursive: true });
  await fs.mkdir(repo, { recursive: true });
  const ledger = path.join(ledgerDir, "task.md"), sidecar = path.join(ledgerDir, "task.completion.json");
  const source = "export const pageSize = 20;\n";
  await fs.writeFile(path.join(repo, "config.mjs"), source);
  const checked = spawnSync(process.execPath, ["--check", "config.mjs"], { cwd: repo, encoding: "utf8" });
  assert.equal(checked.status, 0, checked.stderr);
  const output = JSON.stringify({ stdout: checked.stdout, stderr: checked.stderr, exitCode: checked.status });
  await fs.writeFile(path.join(ledgerDir, "check.json"), output);
  const contract = {
    schemaVersion: 4, evidencePolicyVersion: 1, ledgerPath: ledger, findings: [], preflights: [],
    verificationPolicy: { mode: "native", reason: "Syntax-only validation of a local configuration change.", strictTriggers: [] },
    requiredEvidence: [{ id: "syntax", status: "present", claim: "The final module parses in Node.", claimScope: "static", evidenceClass: "static", artifactBase: "contract", artifact: "check.json", artifactSha256: digest(output) }],
    nativeVerification: {
      sourceInputs: [{ path: "config.mjs", state: "present", sha256: digest(source) }, { path: "removed.mjs", state: "absent" }],
      checks: [{ evidenceId: "syntax", command: [process.execPath, "--check", "config.mjs"], cwd: ".", exitCode: 0, checkedAt: new Date().toISOString() }],
    },
    remoteChecks: { applicable: false, status: "not_applicable", reason: "Local, non-Git fixture.", checks: [] },
  };
  const env = { ...process.env, HOME: home, USERPROFILE: home, CODEX_HOME: path.join(home, ".codex") };
  async function save(status = "active", extra = "") {
    await fs.writeFile(ledger, `project_status: ${status}\nrepo_path: ${repo}\ncompletion_contract: ${sidecar}\n${extra}`);
    await fs.writeFile(sidecar, JSON.stringify(contract));
  }
  function hook(name, extra = {}) {
    const result = spawnSync(process.execPath, [path.join(hooks, name)], { cwd: repo, env, encoding: "utf8", timeout: 10000, input: JSON.stringify({ cwd: repo, session_id: "native-session", ...extra }) });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim() ? JSON.parse(result.stdout) : null;
  }
  function cli(extra = []) {
    const result = spawnSync(process.execPath, [path.join(hooks, "validate-project-ledger.mjs"), "--ledger", ledger, "--require-evidence-policy", "--require-completion-policy", ...extra], { cwd: repo, env, encoding: "utf8", timeout: 10000 });
    return { status: result.status, ...JSON.parse(result.stdout) };
  }
  await save();
  return { root, repo, contract, save, hook, cli, ledger, ledgerDir, sidecar };
}

for (const runtime of ["codex", "claude"]) {
  test(`${runtime}: low-risk Project completes through CLI and Stop without a full-repo receipt`, async (t) => {
    const f = await fixture(t, runtime);
    const unrelated = await fs.open(path.join(f.repo, "unrelated-large-asset.bin"), "w");
    await unrelated.truncate(33 * 1024 * 1024); await unrelated.close();
    f.hook("record-session-provenance.mjs", { ledger_path: f.ledger });
    await f.save("complete");
    const result = f.cli();
    assert.equal(result.valid, true, JSON.stringify(result));
    assert.equal(f.hook("guard-project-completion.mjs").decision, undefined, "NATIVE_COMPLETION_ASSERT");
    assert.equal(f.cli(["--require-verification"]).valid, false);
  });

  test(`${runtime}: compact resumes only the explicitly bound Project`, async (t) => {
    const f = await fixture(t, runtime);
    await f.save("active", "next_instruction: Continue task A only.\n");
    f.hook("record-session-provenance.mjs", { ledger_path: f.ledger });
    const other = path.join(f.ledgerDir, "other.md");
    await fs.writeFile(other, `project_status: active\nrepo_path: ${f.repo}\nnext_instruction: Continue task B only.\n`);
    await fs.utimes(f.ledger, new Date(1000), new Date(1000));
    await fs.utimes(other, new Date(2000), new Date(2000));
    f.hook("record-session-provenance.mjs", { source: "compact" });
    const resumed = f.hook("resume-project-ledger.mjs", { source: "compact" }).hookSpecificOutput.additionalContext;
    assert.match(resumed, /Continue task A only\./);
    assert.doesNotMatch(resumed, /Continue task B only\./);
    const unbound = f.hook("resume-project-ledger.mjs", { session_id: "unbound" }).hookSpecificOutput.additionalContext;
    assert.doesNotMatch(unbound, /Continue task [AB] only\./);
  });
}

for (const change of ["edit", "delete", "create-absent", "artifact"]) {
  test(`native completion rejects stale ${change} evidence`, async (t) => {
    const f = await fixture(t); await f.save("complete");
    assert.equal(f.cli().valid, true);
    if (change === "edit") await fs.writeFile(path.join(f.repo, "config.mjs"), "export const pageSize = 40;\n");
    if (change === "delete") await fs.unlink(path.join(f.repo, "config.mjs"));
    if (change === "create-absent") await fs.writeFile(path.join(f.repo, "removed.mjs"), "restored");
    if (change === "artifact") await fs.writeFile(path.join(f.ledgerDir, "check.json"), "invented success");
    assert.equal(f.cli().valid, false, "NATIVE_FRESHNESS_ASSERT");
  });
}

const invalidCases = [
  ["empty sources", (c) => { c.nativeVerification.sourceInputs = []; }],
  ["empty checks", (c) => { c.nativeVerification.checks = []; }],
  ["failed check", (c) => { c.nativeVerification.checks[0].exitCode = 1; }],
  ["blank reason", (c) => { c.verificationPolicy.reason = " \t"; }],
  ["blank command", (c) => { c.nativeVerification.checks[0].command = [" "]; }],
  ["source escape", (c) => { c.nativeVerification.sourceInputs[0].path = "../secret"; }],
  ["artifact escape", (c) => { c.requiredEvidence[0].artifact = "../secret"; }],
  ["missing execution", (c) => { c.nativeVerification.checks[0].evidenceId = "unrelated"; }],
  ["declared strict risk", (c) => { c.verificationPolicy.strictTriggers = ["shared-state"]; }],
  ["strict without receipt", (c) => { c.verificationPolicy.mode = "strict"; delete c.nativeVerification; c.requiredEvidence[0].claimScope = "local"; c.requiredEvidence[0].evidenceClass = "unit"; }],
];
for (const [name, mutate] of invalidCases) {
  test(`native contract rejects ${name}`, async (t) => {
    const f = await fixture(t); mutate(f.contract); await f.save("complete");
    assert.equal(f.cli().valid, false);
  });
}

test("an explicit strict ledger requirement cannot be downgraded by native policy", async (t) => {
  const f = await fixture(t); await f.save("complete", "verification_mode: strict\n");
  assert.equal(f.cli().valid, false);
});

test("v4 strict completion accepts a current runner receipt and rejects subsequent source changes", async (t) => {
  const f = await fixture(t);
  f.contract.verificationPolicy = { mode: "strict", reason: "This task explicitly requires a runner receipt.", strictTriggers: ["explicit-contract"] };
  delete f.contract.nativeVerification;
  f.contract.requiredEvidence = [];
  await f.save("complete");
  const reference = await attachVerification(f.repo, f.sidecar);
  f.contract.verification = reference;
  f.contract.requiredEvidence = [{ id: "marker", status: "present", claim: "The process reads a healthy fixture marker.", claimScope: "local", evidenceClass: "unit", ...reference, verificationChecks: ["fixture-marker"] }];
  await f.save("complete");
  assert.equal(f.cli().valid, true);
  await fs.writeFile(path.join(f.repo, "verification-marker.txt"), "changed");
  assert.equal(f.cli().valid, false);
});

test("Stop remembers an observed strict policy even if the sidecar is rewritten", async (t) => {
  const f = await fixture(t);
  const native = structuredClone(f.contract);
  f.contract.verificationPolicy.mode = "strict";
  delete f.contract.nativeVerification;
  await f.save(); f.hook("record-session-provenance.mjs", { ledger_path: f.ledger });
  Object.assign(f.contract, native); await f.save("complete");
  assert.equal(f.hook("guard-project-completion.mjs").decision, "block");
});

for (const version of [2, 3]) {
  test(`legacy v${version} completion still requires the shared receipt`, async (t) => {
    const f = await fixture(t);
    f.contract.schemaVersion = version;
    delete f.contract.verificationPolicy; delete f.contract.nativeVerification;
    if (version === 2) delete f.contract.remoteChecks;
    f.contract.requiredEvidence[0].claimScope = "local";
    f.contract.requiredEvidence[0].evidenceClass = "unit";
    await f.save(); f.hook("record-session-provenance.mjs", { ledger_path: f.ledger });
    await f.save("complete");
    assert.equal(f.cli().valid, false);
    assert.equal(f.hook("guard-project-completion.mjs").decision, "block");
  });
}
