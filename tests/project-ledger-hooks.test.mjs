import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function runHook(script, cwd, home, input) {
  const result = spawnSync(process.execPath, [script], {
    cwd,
    input: JSON.stringify(input),
    encoding: "utf8",
    timeout: 3_000,
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

test("evidence policy rejects helper proof for cross-boundary claims", () => {
  const ledgerPath = "/tmp/project.md";
  const contract = {
    ...baseContract(ledgerPath),
    evidencePolicyVersion: 1,
    requiredEvidence: [
      {
        id: "mutation-timeline",
        status: "present",
        claim: "retry through hydration converges",
        claimScope: "cross-boundary",
        evidenceClass: "helper",
        artifact: "predicate.test.ts",
      },
      {
        id: "independent-review",
        status: "present",
        claim: "fresh reviewer reconstructed the mutation timeline",
        claimScope: "review",
        evidenceClass: "independent-review",
        artifact: "review.md",
      },
    ],
    preflights: [{ id: "async-mutation-convergence", scope: "cross-boundary", status: "resolved" }],
  };

  assert.match(
    validateCompletionContract(contract, ledgerPath).errors.join("\n"),
    /cross-boundary claim requires composed/
  );
});

test("evidence policy accepts composed async evidence plus independent review", () => {
  const ledgerPath = "/tmp/project.md";
  const contract = {
    ...baseContract(ledgerPath),
    evidencePolicyVersion: 1,
    requiredEvidence: [
      {
        id: "mutation-timeline",
        status: "present",
        claim: "retry through hydration converges",
        claimScope: "cross-boundary",
        evidenceClass: "composed",
        artifact: "mutation-convergence.test.ts",
      },
      {
        id: "independent-review",
        status: "present",
        claim: "fresh reviewer reconstructed the mutation timeline",
        claimScope: "review",
        evidenceClass: "independent-review",
        artifact: "review.md",
      },
    ],
    preflights: [{ id: "async-mutation-convergence", scope: "cross-boundary", status: "resolved" }],
  };

  assert.deepEqual(validateCompletionContract(contract, ledgerPath), { errors: [], blockers: [] });
});

test("evidence policy requires independent review for async mutation completion", () => {
  const ledgerPath = "/tmp/project.md";
  const contract = {
    ...baseContract(ledgerPath),
    evidencePolicyVersion: 1,
    requiredEvidence: [
      {
        id: "mutation-timeline",
        status: "present",
        claim: "retry through hydration converges",
        claimScope: "cross-boundary",
        evidenceClass: "composed",
        artifact: "mutation-convergence.test.ts",
      },
    ],
    preflights: [{ id: "async-mutation-convergence", scope: "cross-boundary", status: "resolved" }],
  };

  assert.match(
    validateCompletionContract(contract, ledgerPath).errors.join("\n"),
    /requires independent review evidence/
  );
});

test("evidence policy does not allow a waived claim to replace behavioral proof", () => {
  const ledgerPath = "/tmp/project.md";
  const contract = {
    ...baseContract(ledgerPath),
    evidencePolicyVersion: 1,
    requiredEvidence: [
      {
        id: "mutation-timeline",
        status: "waived",
        claim: "retry through hydration converges",
        claimScope: "cross-boundary",
        evidenceClass: "helper",
        owner: "operator",
        reason: "runtime unavailable",
        evidence: ["decision:2026-09-02"],
      },
      {
        id: "independent-review",
        status: "present",
        claim: "fresh reviewer reconstructed the mutation timeline",
        claimScope: "review",
        evidenceClass: "independent-review",
        artifact: "review.md",
      },
    ],
    preflights: [{ id: "async-mutation-convergence", scope: "cross-boundary", status: "resolved" }],
  };

  assert.match(
    validateCompletionContract(contract, ledgerPath).errors.join("\n"),
    /requires present composed, runtime, or production evidence/
  );
});

test("evidence policy requires review for cross-boundary architecture claims", () => {
  const ledgerPath = "/tmp/project.md";
  const contract = {
    ...baseContract(ledgerPath),
    evidencePolicyVersion: 1,
    requiredEvidence: [
      {
        id: "architecture-transition",
        status: "present",
        claim: "state round-trip crosses producer and UI",
        claimScope: "cross-boundary",
        evidenceClass: "composed",
        artifact: "architecture-transition.test.ts",
      },
    ],
    preflights: [{ id: "architecture-ownership", scope: "cross-boundary", status: "resolved" }],
  };

  assert.match(
    validateCompletionContract(contract, ledgerPath).errors.join("\n"),
    /requires independent review evidence/
  );
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

test("SessionStart hook records an empty ledger baseline when no unfinished ledger exists", async (t) => {
  const { home, repo } = await fixture(t);
  runHook(provenancePath, repo, home, {
    cwd: repo,
    session_id: "read-only-session",
    hook_event_name: "SessionStart",
  });
  const sessionPath = path.join(home, ".codex", "projects", "repo", "sessions", "read-only-session.json");
  const provenance = JSON.parse(await fs.readFile(sessionPath, "utf8"));
  assert.equal(provenance.ledgerPath, null);
  assert.deepEqual(provenance.baselineLedgers, []);
  assert.match(provenance.startedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("Stop hook strict-validates a ledger created after SessionStart", async (t) => {
  const { home, repo, ledgerDir } = await fixture(t);
  runHook(provenancePath, repo, home, {
    cwd: repo,
    session_id: "late-ledger-session",
    hook_event_name: "SessionStart",
  });

  const ledgerPath = path.join(ledgerDir, "late.md");
  const contractPath = path.join(ledgerDir, "late.completion.json");
  await fs.writeFile(ledgerPath, `project_status: complete\nrepo_path: ${repo}\ncompletion_contract: ${contractPath}\n`);
  await fs.writeFile(contractPath, JSON.stringify(baseContract(ledgerPath)));

  const result = runHook(guardPath, repo, home, {
    cwd: repo,
    session_id: "late-ledger-session",
    hook_event_name: "Stop",
    stop_hook_active: false,
  });
  assert.equal(result.decision, "block");
  assert.match(result.reason, /requires schemaVersion 2/);
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

test("evidence policy rejects an individually waived cross-boundary claim", () => {
  const ledgerPath = "/tmp/project-ledger-cross-boundary-waiver.md";
  const result = validateCompletionContract(
    {
      schemaVersion: 1,
      evidencePolicyVersion: 1,
      ledgerPath,
      findings: [],
      requiredEvidence: [
        {
          id: "producer-consumer",
          status: "present",
          claim: "producer reaches consumer A",
          claimScope: "cross-boundary",
          evidenceClass: "composed",
          artifact: "producer-consumer.test.ts",
        },
        {
          id: "recovery-consumer",
          status: "waived",
          claim: "recovery reaches consumer B",
          claimScope: "cross-boundary",
          evidenceClass: "composed",
          owner: "operator",
          reason: "not tested",
          evidence: ["decision-record.md"],
        },
        {
          id: "fresh-review",
          status: "present",
          claim: "fresh independent review",
          claimScope: "review",
          evidenceClass: "independent-review",
          artifact: "review.md",
        },
      ],
      preflights: [],
    },
    ledgerPath
  );

  assert.match(result.errors.join("\n"), /behavioral evidence cannot be waived/);
});

test("evidence policy rejects an individually waived local behavioral claim", () => {
  const ledgerPath = "/tmp/project-ledger-local-waiver.md";
  const result = validateCompletionContract(
    {
      schemaVersion: 2,
      evidencePolicyVersion: 1,
      ledgerPath,
      findings: [],
      requiredEvidence: [
        {
          id: "present-local",
          status: "present",
          claim: "serializer preserves values",
          claimScope: "local",
          evidenceClass: "unit",
          artifactBase: "repo",
          artifact: "evidence/present.txt",
          artifactSha256: "0".repeat(64),
        },
        {
          id: "waived-local",
          status: "waived",
          claim: "selector preserves null state",
          claimScope: "local",
          evidenceClass: "unit",
          owner: "operator",
          reason: "not tested",
          evidence: ["decision.md"],
        },
      ],
      preflights: [],
    },
    ledgerPath,
    { requireEvidencePolicy: true },
  );

  assert.match(result.errors.join("\n"), /behavioral evidence cannot be waived/);
});

test("evidence policy rejects independent review as non-review proof", () => {
  const ledgerPath = "/tmp/project-ledger-review-as-proof.md";
  const result = validateCompletionContract(
    {
      schemaVersion: 1,
      evidencePolicyVersion: 1,
      ledgerPath,
      findings: [],
      requiredEvidence: [
        {
          id: "cross-boundary-behavior",
          status: "present",
          claim: "producer reaches the persisted consumer",
          claimScope: "cross-boundary",
          evidenceClass: "composed",
          artifact: "composed.test.ts",
        },
        {
          id: "local-behavior",
          status: "present",
          claim: "local helper preserves the outcome",
          claimScope: "local",
          evidenceClass: "independent-review",
          artifact: "review.md",
        },
        {
          id: "fresh-review",
          status: "present",
          claim: "fresh independent review",
          claimScope: "review",
          evidenceClass: "independent-review",
          artifact: "review.md",
        },
      ],
      preflights: [],
    },
    ledgerPath
  );

  assert.match(result.errors.join("\n"), /independent-review evidence can only satisfy a review claim/);
});

test("evidence policy rejects new evidence fields when the policy version is omitted", () => {
  const ledgerPath = "/tmp/project-ledger-missing-evidence-policy-version.md";
  const result = validateCompletionContract(
    {
      schemaVersion: 1,
      ledgerPath,
      findings: [],
      requiredEvidence: [
        {
          id: "cross-boundary-helper",
          status: "present",
          claim: "retry through hydration converges",
          claimScope: "cross-boundary",
          evidenceClass: "helper",
          artifact: "predicate.test.ts",
        },
      ],
      preflights: [],
    },
    ledgerPath
  );

  assert.match(result.errors.join("\n"), /evidencePolicyVersion must be 1/);
  assert.match(result.errors.join("\n"), /cross-boundary claim requires composed/);
});

test("current Stop policy rejects an otherwise valid schema-v1 contract", async (t) => {
  const { home, repo, ledgerDir } = await fixture(t);
  const ledgerPath = path.join(ledgerDir, "legacy.md");
  const contractPath = path.join(ledgerDir, "legacy.completion.json");
  await fs.writeFile(ledgerPath, `project_status: active\nrepo_path: ${repo}\ncompletion_contract: ${contractPath}\n`);
  await fs.writeFile(contractPath, JSON.stringify(baseContract(ledgerPath)));

  runHook(provenancePath, repo, home, {
    cwd: repo,
    session_id: "legacy-completion-session",
    hook_event_name: "SessionStart",
  });
  await fs.writeFile(ledgerPath, `project_status: complete\nrepo_path: ${repo}\ncompletion_contract: ${contractPath}\n`);

  const result = runHook(guardPath, repo, home, {
    cwd: repo,
    session_id: "legacy-completion-session",
    hook_event_name: "Stop",
    stop_hook_active: false,
  });
  assert.equal(result.decision, "block");
  assert.match(result.reason, /requires schemaVersion 2/);
});

test("schema-v2 policy requires a present behavioral claim", () => {
  const ledgerPath = "/tmp/project-ledger-review-only.md";
  const contract = {
    schemaVersion: 2,
    evidencePolicyVersion: 1,
    ledgerPath,
    findings: [],
    requiredEvidence: [
      {
        id: "review-only",
        status: "present",
        claim: "fresh review completed",
        claimScope: "review",
        evidenceClass: "independent-review",
        artifactBase: "repo",
        artifact: "evidence/review.txt",
        artifactSha256: "0".repeat(64),
      },
    ],
    preflights: [],
  };

  assert.match(
    validateCompletionContract(contract, ledgerPath, { requireEvidencePolicy: true }).errors.join("\n"),
    /requires at least one present behavioral claim/,
  );
});

test("cross-boundary preflight cannot be closed with local-only evidence", () => {
  const ledgerPath = "/tmp/project-ledger-local-only.md";
  const contract = {
    schemaVersion: 2,
    evidencePolicyVersion: 1,
    ledgerPath,
    findings: [],
    requiredEvidence: [
      {
        id: "local-helper",
        status: "present",
        claim: "local helper is correct",
        claimScope: "local",
        evidenceClass: "unit",
        artifactBase: "repo",
        artifact: "evidence/unit.txt",
        artifactSha256: "0".repeat(64),
      },
    ],
    preflights: [{ id: "async-mutation-convergence", scope: "cross-boundary", status: "resolved" }],
  };

  assert.match(
    validateCompletionContract(contract, ledgerPath, { requireEvidencePolicy: true }).errors.join("\n"),
    /requires at least one cross-boundary evidence claim/,
  );
});

test("Stop hook accepts schema-v2 evidence only when artifact digests match", async (t) => {
  const { home, repo, ledgerDir } = await fixture(t);
  const evidenceDir = path.join(repo, "evidence");
  const composedContent = "producer -> persistence -> consumer\n";
  const reviewContent = "fresh reviewer reconstructed a failure timeline\n";
  await fs.mkdir(evidenceDir, { recursive: true });
  await fs.writeFile(path.join(evidenceDir, "composed.txt"), composedContent);
  await fs.writeFile(path.join(evidenceDir, "review.txt"), reviewContent);

  const ledgerPath = path.join(ledgerDir, "strict.md");
  const contractPath = path.join(ledgerDir, "strict.completion.json");
  await fs.writeFile(ledgerPath, `project_status: active\nrepo_path: ${repo}\ncompletion_contract: ${contractPath}\n`);
  await fs.writeFile(contractPath, JSON.stringify({
    schemaVersion: 2,
    evidencePolicyVersion: 1,
    ledgerPath,
    findings: [],
    requiredEvidence: [
      {
        id: "composed-transition",
        status: "present",
        claim: "producer reaches the persisted consumer",
        claimScope: "cross-boundary",
        evidenceClass: "composed",
        artifactBase: "repo",
        artifact: "evidence/composed.txt",
        artifactSha256: sha256(composedContent),
      },
      {
        id: "fresh-review",
        status: "present",
        claim: "fresh reviewer reconstructed the transition",
        claimScope: "review",
        evidenceClass: "independent-review",
        artifactBase: "repo",
        artifact: "evidence/review.txt",
        artifactSha256: sha256(reviewContent),
      },
    ],
    preflights: [{ id: "async-mutation-convergence", scope: "cross-boundary", status: "resolved" }],
  }));

  runHook(provenancePath, repo, home, {
    cwd: repo,
    session_id: "strict-completion-session",
    hook_event_name: "SessionStart",
  });
  await fs.writeFile(ledgerPath, `project_status: complete\nrepo_path: ${repo}\ncompletion_contract: ${contractPath}\n`);

  assert.deepEqual(runHook(guardPath, repo, home, {
    cwd: repo,
    session_id: "strict-completion-session",
    hook_event_name: "Stop",
    stop_hook_active: false,
  }), { continue: true });
});

test("Stop hook blocks evidence whose artifact changed after hashing", async (t) => {
  const { home, repo, ledgerDir } = await fixture(t);
  const evidenceDir = path.join(repo, "evidence");
  const originalContent = "verified output\n";
  await fs.mkdir(evidenceDir, { recursive: true });
  await fs.writeFile(path.join(evidenceDir, "unit.txt"), originalContent);

  const ledgerPath = path.join(ledgerDir, "tampered.md");
  const contractPath = path.join(ledgerDir, "tampered.completion.json");
  await fs.writeFile(ledgerPath, `project_status: active\nrepo_path: ${repo}\ncompletion_contract: ${contractPath}\n`);
  await fs.writeFile(contractPath, JSON.stringify({
    schemaVersion: 2,
    evidencePolicyVersion: 1,
    ledgerPath,
    findings: [],
    requiredEvidence: [
      {
        id: "local-unit",
        status: "present",
        claim: "local module behavior is verified",
        claimScope: "local",
        evidenceClass: "unit",
        artifactBase: "repo",
        artifact: "evidence/unit.txt",
        artifactSha256: sha256(originalContent),
      },
    ],
    preflights: [],
  }));

  runHook(provenancePath, repo, home, {
    cwd: repo,
    session_id: "tampered-completion-session",
    hook_event_name: "SessionStart",
  });
  await fs.writeFile(path.join(evidenceDir, "unit.txt"), "changed output\n");
  await fs.writeFile(ledgerPath, `project_status: complete\nrepo_path: ${repo}\ncompletion_contract: ${contractPath}\n`);

  const result = runHook(guardPath, repo, home, {
    cwd: repo,
    session_id: "tampered-completion-session",
    hook_event_name: "Stop",
    stop_hook_active: false,
  });
  assert.equal(result.decision, "block");
  assert.match(result.reason, /artifactSha256 does not match/);
});

test("Stop hook blocks evidence artifacts that escape their declared base", async (t) => {
  const { home, repo, ledgerDir } = await fixture(t);
  const outsideContent = "outside evidence\n";
  const outsidePath = path.join(path.dirname(repo), "outside.txt");
  await fs.writeFile(outsidePath, outsideContent);

  const ledgerPath = path.join(ledgerDir, "escape.md");
  const contractPath = path.join(ledgerDir, "escape.completion.json");
  await fs.writeFile(ledgerPath, `project_status: active\nrepo_path: ${repo}\ncompletion_contract: ${contractPath}\n`);
  await fs.writeFile(contractPath, JSON.stringify({
    schemaVersion: 2,
    evidencePolicyVersion: 1,
    ledgerPath,
    findings: [],
    requiredEvidence: [
      {
        id: "escaped-unit",
        status: "present",
        claim: "local module behavior is verified",
        claimScope: "local",
        evidenceClass: "unit",
        artifactBase: "repo",
        artifact: "../outside.txt",
        artifactSha256: sha256(outsideContent),
      },
    ],
    preflights: [],
  }));

  runHook(provenancePath, repo, home, {
    cwd: repo,
    session_id: "escape-completion-session",
    hook_event_name: "SessionStart",
  });
  await fs.writeFile(ledgerPath, `project_status: complete\nrepo_path: ${repo}\ncompletion_contract: ${contractPath}\n`);

  const result = runHook(guardPath, repo, home, {
    cwd: repo,
    session_id: "escape-completion-session",
    hook_event_name: "Stop",
    stop_hook_active: false,
  });
  assert.equal(result.decision, "block");
  assert.match(result.reason, /escapes or does not name a file/);
});

test("schema-v2 preflight requires controlled scope instead of inferring from id", () => {
  const ledgerPath = "/tmp/project-ledger-preflight-scope.md";
  const contract = {
    schemaVersion: 2,
    evidencePolicyVersion: 1,
    ledgerPath,
    findings: [],
    requiredEvidence: [
      {
        id: "local-unit",
        status: "present",
        claim: "local module behavior is verified",
        claimScope: "local",
        evidenceClass: "unit",
        artifactBase: "repo",
        artifact: "evidence/unit.txt",
        artifactSha256: "0".repeat(64),
      },
    ],
    preflights: [{ id: "async-convergence", status: "resolved" }],
  };

  assert.match(
    validateCompletionContract(contract, ledgerPath, { requireEvidencePolicy: true }).errors.join("\n"),
    /preflights\[0\]\.scope is required/,
  );
});

test("arbitrary cross-boundary preflight id still requires cross-boundary evidence", () => {
  const ledgerPath = "/tmp/project-ledger-arbitrary-preflight-id.md";
  const contract = {
    schemaVersion: 2,
    evidencePolicyVersion: 1,
    ledgerPath,
    findings: [],
    requiredEvidence: [
      {
        id: "local-unit",
        status: "present",
        claim: "local module behavior is verified",
        claimScope: "local",
        evidenceClass: "unit",
        artifactBase: "repo",
        artifact: "evidence/unit.txt",
        artifactSha256: "0".repeat(64),
      },
    ],
    preflights: [{ id: "async-convergence", scope: "cross-boundary", status: "resolved" }],
  };

  assert.match(
    validateCompletionContract(contract, ledgerPath, { requireEvidencePolicy: true }).errors.join("\n"),
    /requires at least one cross-boundary evidence claim/,
  );
});

test("Stop hook rejects FIFO evidence without blocking on read", { skip: process.platform === "win32" }, async (t) => {
  const { home, repo, ledgerDir } = await fixture(t);
  const fifoPath = path.join(repo, "evidence.pipe");
  const mkfifo = spawnSync("mkfifo", [fifoPath], { encoding: "utf8" });
  assert.equal(mkfifo.status, 0, mkfifo.stderr);

  const ledgerPath = path.join(ledgerDir, "fifo.md");
  const contractPath = path.join(ledgerDir, "fifo.completion.json");
  await fs.writeFile(ledgerPath, `project_status: active\nrepo_path: ${repo}\ncompletion_contract: ${contractPath}\n`);
  await fs.writeFile(contractPath, JSON.stringify({
    schemaVersion: 2,
    evidencePolicyVersion: 1,
    ledgerPath,
    findings: [],
    requiredEvidence: [
      {
        id: "fifo-unit",
        status: "present",
        claim: "local module behavior is verified",
        claimScope: "local",
        evidenceClass: "unit",
        artifactBase: "repo",
        artifact: "evidence.pipe",
        artifactSha256: "0".repeat(64),
      },
    ],
    preflights: [],
  }));

  runHook(provenancePath, repo, home, {
    cwd: repo,
    session_id: "fifo-completion-session",
    hook_event_name: "SessionStart",
  });
  await fs.writeFile(ledgerPath, `project_status: complete\nrepo_path: ${repo}\ncompletion_contract: ${contractPath}\n`);

  const result = runHook(guardPath, repo, home, {
    cwd: repo,
    session_id: "fifo-completion-session",
    hook_event_name: "Stop",
    stop_hook_active: false,
  });
  assert.equal(result.decision, "block");
  assert.match(result.reason, /regular file/);
});

test("Stop hook rejects evidence artifacts larger than 5 MiB", async (t) => {
  const { home, repo, ledgerDir } = await fixture(t);
  const oversizedPath = path.join(repo, "oversized.bin");
  await fs.writeFile(oversizedPath, Buffer.alloc(5 * 1024 * 1024 + 1));

  const ledgerPath = path.join(ledgerDir, "oversized.md");
  const contractPath = path.join(ledgerDir, "oversized.completion.json");
  await fs.writeFile(ledgerPath, `project_status: active\nrepo_path: ${repo}\ncompletion_contract: ${contractPath}\n`);
  await fs.writeFile(contractPath, JSON.stringify({
    schemaVersion: 2,
    evidencePolicyVersion: 1,
    ledgerPath,
    findings: [],
    requiredEvidence: [
      {
        id: "oversized-unit",
        status: "present",
        claim: "local module behavior is verified",
        claimScope: "local",
        evidenceClass: "unit",
        artifactBase: "repo",
        artifact: "oversized.bin",
        artifactSha256: "0".repeat(64),
      },
    ],
    preflights: [],
  }));

  runHook(provenancePath, repo, home, {
    cwd: repo,
    session_id: "oversized-completion-session",
    hook_event_name: "SessionStart",
  });
  await fs.writeFile(ledgerPath, `project_status: complete\nrepo_path: ${repo}\ncompletion_contract: ${contractPath}\n`);

  const result = runHook(guardPath, repo, home, {
    cwd: repo,
    session_id: "oversized-completion-session",
    hook_event_name: "Stop",
    stop_hook_active: false,
  });
  assert.equal(result.decision, "block");
  assert.match(result.reason, /exceeds the 5242880-byte limit/);
});

test("Stop hook accepts legal relative names that only begin with dot-dot or tilde", async (t) => {
  const { home, repo, ledgerDir } = await fixture(t);
  const dottedContent = "dotted directory evidence\n";
  const tildeContent = "tilde filename evidence\n";
  await fs.mkdir(path.join(repo, "..evidence"), { recursive: true });
  await fs.writeFile(path.join(repo, "..evidence", "output.txt"), dottedContent);
  await fs.writeFile(path.join(repo, "~report.txt"), tildeContent);

  const ledgerPath = path.join(ledgerDir, "legal-prefixes.md");
  const contractPath = path.join(ledgerDir, "legal-prefixes.completion.json");
  await fs.writeFile(ledgerPath, `project_status: active\nrepo_path: ${repo}\ncompletion_contract: ${contractPath}\n`);
  await fs.writeFile(contractPath, JSON.stringify({
    schemaVersion: 2,
    evidencePolicyVersion: 1,
    ledgerPath,
    findings: [],
    requiredEvidence: [
      {
        id: "dotted-unit",
        status: "present",
        claim: "dotted directory artifact is verified",
        claimScope: "local",
        evidenceClass: "unit",
        artifactBase: "repo",
        artifact: "..evidence/output.txt",
        artifactSha256: sha256(dottedContent),
      },
      {
        id: "tilde-unit",
        status: "present",
        claim: "tilde filename artifact is verified",
        claimScope: "local",
        evidenceClass: "unit",
        artifactBase: "repo",
        artifact: "~report.txt",
        artifactSha256: sha256(tildeContent),
      },
    ],
    preflights: [],
  }));

  runHook(provenancePath, repo, home, {
    cwd: repo,
    session_id: "legal-prefixes-session",
    hook_event_name: "SessionStart",
  });
  await fs.writeFile(ledgerPath, `project_status: complete\nrepo_path: ${repo}\ncompletion_contract: ${contractPath}\n`);

  assert.deepEqual(runHook(guardPath, repo, home, {
    cwd: repo,
    session_id: "legal-prefixes-session",
    hook_event_name: "Stop",
    stop_hook_active: false,
  }), { continue: true });
});

test("Stop hook evaluates a late complete ledger even when an active ledger is session-bound", async (t) => {
  const { home, repo, ledgerDir } = await fixture(t);
  const boundLedgerPath = path.join(ledgerDir, "bound-active.md");
  await fs.writeFile(boundLedgerPath, `project_status: active\nrepo_path: ${repo}\n`);

  runHook(provenancePath, repo, home, {
    cwd: repo,
    session_id: "bound-plus-late-session",
    hook_event_name: "SessionStart",
  });

  const lateLedgerPath = path.join(ledgerDir, "late-complete.md");
  const lateContractPath = path.join(ledgerDir, "late-complete.completion.json");
  await fs.writeFile(lateLedgerPath, `project_status: complete\nrepo_path: ${repo}\ncompletion_contract: ${lateContractPath}\n`);
  await fs.writeFile(lateContractPath, JSON.stringify(baseContract(lateLedgerPath)));

  const result = runHook(guardPath, repo, home, {
    cwd: repo,
    session_id: "bound-plus-late-session",
    hook_event_name: "Stop",
    stop_hook_active: false,
  });
  assert.equal(result.decision, "block");
  assert.match(result.reason, /late-complete\.md/);
  assert.match(result.reason, /schemaVersion 2/);
});

test("Stop hook aggregates every invalid ledger into its single continuation", async (t) => {
  const { home, repo, ledgerDir } = await fixture(t);
  runHook(provenancePath, repo, home, {
    cwd: repo,
    session_id: "multiple-invalid-session",
    hook_event_name: "SessionStart",
  });

  for (const name of ["first-invalid", "second-invalid"]) {
    const ledgerPath = path.join(ledgerDir, `${name}.md`);
    const contractPath = path.join(ledgerDir, `${name}.completion.json`);
    await fs.writeFile(ledgerPath, `project_status: complete\nrepo_path: ${repo}\ncompletion_contract: ${contractPath}\n`);
    await fs.writeFile(contractPath, JSON.stringify(baseContract(ledgerPath)));
  }

  const result = runHook(guardPath, repo, home, {
    cwd: repo,
    session_id: "multiple-invalid-session",
    hook_event_name: "Stop",
    stop_hook_active: false,
  });
  assert.equal(result.decision, "block");
  assert.match(result.reason, /2 project ledger\(s\)/);
  assert.match(result.reason, /first-invalid\.md/);
  assert.match(result.reason, /second-invalid\.md/);
});

test("Stop hook rejects evidence manifests above the bounded item limit", async (t) => {
  const { home, repo, ledgerDir } = await fixture(t);
  const content = Buffer.alloc(5 * 1024 * 1024, 97);
  await fs.writeFile(path.join(repo, "shared-evidence.bin"), content);
  const ledgerPath = path.join(ledgerDir, "too-many-evidence.md");
  const contractPath = path.join(ledgerDir, "too-many-evidence.completion.json");
  await fs.writeFile(ledgerPath, `project_status: active\nrepo_path: ${repo}\ncompletion_contract: ${contractPath}\n`);
  await fs.writeFile(contractPath, JSON.stringify({
    schemaVersion: 2,
    evidencePolicyVersion: 1,
    ledgerPath,
    findings: [],
    requiredEvidence: Array.from({ length: 129 }, (_, index) => ({
      id: `bounded-unit-${index}`,
      status: "present",
      claim: "local behavior is verified",
      claimScope: "local",
      evidenceClass: "unit",
      artifactBase: "repo",
      artifact: "shared-evidence.bin",
      artifactSha256: sha256(content),
    })),
    preflights: [],
  }));

  runHook(provenancePath, repo, home, {
    cwd: repo,
    session_id: "too-many-evidence-session",
    hook_event_name: "SessionStart",
  });
  await fs.writeFile(ledgerPath, `project_status: complete\nrepo_path: ${repo}\ncompletion_contract: ${contractPath}\n`);

  const result = runHook(guardPath, repo, home, {
    cwd: repo,
    session_id: "too-many-evidence-session",
    hook_event_name: "Stop",
    stop_hook_active: false,
  });
  assert.equal(result.decision, "block");
  assert.match(result.reason, /no more than 128 items/);
});

test("Stop hook caches repeated artifact digests within the bounded manifest", async (t) => {
  const { home, repo, ledgerDir } = await fixture(t);
  const content = Buffer.alloc(5 * 1024 * 1024, 97);
  await fs.writeFile(path.join(repo, "cached-evidence.bin"), content);
  const ledgerPath = path.join(ledgerDir, "cached-evidence.md");
  const contractPath = path.join(ledgerDir, "cached-evidence.completion.json");
  await fs.writeFile(ledgerPath, `project_status: active\nrepo_path: ${repo}\ncompletion_contract: ${contractPath}\n`);
  await fs.writeFile(contractPath, JSON.stringify({
    schemaVersion: 2,
    evidencePolicyVersion: 1,
    ledgerPath,
    findings: [],
    requiredEvidence: Array.from({ length: 128 }, (_, index) => ({
      id: `cached-unit-${index}`,
      status: "present",
      claim: "local behavior is verified",
      claimScope: "local",
      evidenceClass: "unit",
      artifactBase: "repo",
      artifact: "cached-evidence.bin",
      artifactSha256: sha256(content),
    })),
    preflights: [],
  }));

  runHook(provenancePath, repo, home, {
    cwd: repo,
    session_id: "cached-evidence-session",
    hook_event_name: "SessionStart",
  });
  await fs.writeFile(ledgerPath, `project_status: complete\nrepo_path: ${repo}\ncompletion_contract: ${contractPath}\n`);

  assert.deepEqual(runHook(guardPath, repo, home, {
    cwd: repo,
    session_id: "cached-evidence-session",
    hook_event_name: "Stop",
    stop_hook_active: false,
  }), { continue: true });
});

test("Stop hook rejects unique artifacts above the manifest byte budget", async (t) => {
  const { home, repo, ledgerDir } = await fixture(t);
  const artifactSize = 5 * 1024 * 1024;
  const requiredEvidence = [];
  for (let index = 0; index < 4; index += 1) {
    const content = Buffer.alloc(artifactSize, 97 + index);
    const artifact = `aggregate-${index}.bin`;
    await fs.writeFile(path.join(repo, artifact), content);
    requiredEvidence.push({
      id: `aggregate-unit-${index}`,
      status: "present",
      claim: "local behavior is verified",
      claimScope: "local",
      evidenceClass: "unit",
      artifactBase: "repo",
      artifact,
      artifactSha256: sha256(content),
    });
  }

  const ledgerPath = path.join(ledgerDir, "aggregate-budget.md");
  const contractPath = path.join(ledgerDir, "aggregate-budget.completion.json");
  await fs.writeFile(ledgerPath, `project_status: active\nrepo_path: ${repo}\ncompletion_contract: ${contractPath}\n`);
  await fs.writeFile(contractPath, JSON.stringify({
    schemaVersion: 2,
    evidencePolicyVersion: 1,
    ledgerPath,
    findings: [],
    requiredEvidence,
    preflights: [],
  }));

  runHook(provenancePath, repo, home, {
    cwd: repo,
    session_id: "aggregate-budget-session",
    hook_event_name: "SessionStart",
  });
  await fs.writeFile(ledgerPath, `project_status: complete\nrepo_path: ${repo}\ncompletion_contract: ${contractPath}\n`);

  const result = runHook(guardPath, repo, home, {
    cwd: repo,
    session_id: "aggregate-budget-session",
    hook_event_name: "Stop",
    stop_hook_active: false,
  });
  assert.equal(result.decision, "block");
  assert.match(result.reason, /16777216-byte manifest limit/);
});

test("canonical schema enforces the evidence item limit for legacy contracts", () => {
  const ledgerPath = "/tmp/project-ledger-schema-limit.md";
  const contract = baseContract(ledgerPath);
  contract.requiredEvidence = Array.from({ length: 129 }, (_, index) => ({
    id: `legacy-evidence-${index}`,
    status: "present",
    artifact: `proof-${index}.txt`,
  }));

  assert.match(
    validateCompletionContract(contract, ledgerPath).errors.join("\n"),
    /no more than 128 items/,
  );
});

test("Stop hook detects invalid recompletion when ledger timestamps are preserved", async (t) => {
  const { home, repo, ledgerDir } = await fixture(t);
  const content = "initial evidence\n";
  await fs.writeFile(path.join(repo, "initial-evidence.txt"), content);
  const ledgerPath = path.join(ledgerDir, "preserved-time.md");
  const contractPath = path.join(ledgerDir, "preserved-time.completion.json");
  const completeLedger = `project_status: complete\nrepo_path: ${repo}\ncompletion_contract: ${contractPath}\n`;
  await fs.writeFile(ledgerPath, completeLedger);
  await fs.writeFile(contractPath, JSON.stringify({
    schemaVersion: 2,
    evidencePolicyVersion: 1,
    ledgerPath,
    findings: [],
    requiredEvidence: [{
      id: "initial-unit",
      status: "present",
      claim: "local behavior is verified",
      claimScope: "local",
      evidenceClass: "unit",
      artifactBase: "repo",
      artifact: "initial-evidence.txt",
      artifactSha256: sha256(content),
    }],
    preflights: [],
  }));
  const baselineStat = await fs.stat(ledgerPath);

  runHook(provenancePath, repo, home, {
    cwd: repo,
    session_id: "preserved-time-session",
    hook_event_name: "SessionStart",
  });
  await fs.writeFile(ledgerPath, `project_status: active\nrepo_path: ${repo}\ncompletion_contract: ${contractPath}\n`);
  await fs.writeFile(contractPath, JSON.stringify(baseContract(ledgerPath)));
  await fs.writeFile(ledgerPath, completeLedger);
  await fs.utimes(ledgerPath, baselineStat.atime, baselineStat.mtime);

  const result = runHook(guardPath, repo, home, {
    cwd: repo,
    session_id: "preserved-time-session",
    hook_event_name: "Stop",
    stop_hook_active: false,
  });
  assert.equal(result.decision, "block");
  assert.match(result.reason, /schemaVersion 2/);
});

test("schema-v2 Stop rejects an external completion sidecar", async (t) => {
  const { home, repo, ledgerDir } = await fixture(t);
  const ledgerPath = path.join(ledgerDir, "external-sidecar.md");
  const contractPath = path.join(repo, "external-sidecar.completion.json");
  await fs.writeFile(ledgerPath, `project_status: active\nrepo_path: ${repo}\ncompletion_contract: ${contractPath}\n`);
  await fs.writeFile(contractPath, JSON.stringify({
    schemaVersion: 2,
    evidencePolicyVersion: 1,
    ledgerPath,
    findings: [],
    requiredEvidence: [],
    preflights: [],
  }));

  runHook(provenancePath, repo, home, {
    cwd: repo,
    session_id: "external-sidecar-session",
    hook_event_name: "SessionStart",
  });
  await fs.writeFile(ledgerPath, `project_status: complete\nrepo_path: ${repo}\ncompletion_contract: ${contractPath}\n`);

  const result = runHook(guardPath, repo, home, {
    cwd: repo,
    session_id: "external-sidecar-session",
    hook_event_name: "Stop",
    stop_hook_active: false,
  });
  assert.equal(result.decision, "block");
  assert.match(result.reason, /sibling sidecar/);
});

test("schema-v2 Stop accepts contract-relative evidence beside the ledger", async (t) => {
  const { home, repo, ledgerDir } = await fixture(t);
  const content = "contract-relative evidence\n";
  await fs.writeFile(path.join(ledgerDir, "contract-proof.txt"), content);
  const ledgerPath = path.join(ledgerDir, "contract-relative.md");
  const contractPath = path.join(ledgerDir, "contract-relative.completion.json");
  await fs.writeFile(ledgerPath, `project_status: active\nrepo_path: ${repo}\ncompletion_contract: ${contractPath}\n`);
  await fs.writeFile(contractPath, JSON.stringify({
    schemaVersion: 2,
    evidencePolicyVersion: 1,
    ledgerPath,
    findings: [],
    requiredEvidence: [{
      id: "contract-unit",
      status: "present",
      claim: "local behavior is verified",
      claimScope: "local",
      evidenceClass: "unit",
      artifactBase: "contract",
      artifact: "contract-proof.txt",
      artifactSha256: sha256(content),
    }],
    preflights: [],
  }));

  runHook(provenancePath, repo, home, {
    cwd: repo,
    session_id: "contract-relative-session",
    hook_event_name: "SessionStart",
  });
  await fs.writeFile(ledgerPath, `project_status: complete\nrepo_path: ${repo}\ncompletion_contract: ${contractPath}\n`);

  assert.deepEqual(runHook(guardPath, repo, home, {
    cwd: repo,
    session_id: "contract-relative-session",
    hook_event_name: "Stop",
    stop_hook_active: false,
  }), { continue: true });
});

test("schema-v2 Stop rejects a symlinked completion sidecar", { skip: process.platform === "win32" }, async (t) => {
  const { home, repo, ledgerDir } = await fixture(t);
  const ledgerPath = path.join(ledgerDir, "symlink-sidecar.md");
  const contractPath = path.join(ledgerDir, "symlink-sidecar.completion.json");
  const externalContractPath = path.join(repo, "external-contract.json");
  await fs.writeFile(ledgerPath, `project_status: active\nrepo_path: ${repo}\ncompletion_contract: ${contractPath}\n`);
  await fs.writeFile(externalContractPath, JSON.stringify({
    schemaVersion: 2,
    evidencePolicyVersion: 1,
    ledgerPath,
    findings: [],
    requiredEvidence: [],
    preflights: [],
  }));
  await fs.symlink(externalContractPath, contractPath);

  runHook(provenancePath, repo, home, {
    cwd: repo,
    session_id: "symlink-sidecar-session",
    hook_event_name: "SessionStart",
  });
  await fs.writeFile(ledgerPath, `project_status: complete\nrepo_path: ${repo}\ncompletion_contract: ${contractPath}\n`);

  const result = runHook(guardPath, repo, home, {
    cwd: repo,
    session_id: "symlink-sidecar-session",
    hook_event_name: "Stop",
    stop_hook_active: false,
  });
  assert.equal(result.decision, "block");
  assert.match(result.reason, /regular, non-symlink file/);
});

test("SessionStart and Stop reject a FIFO completion sidecar without blocking", { skip: process.platform === "win32" }, async (t) => {
  const { home, repo, ledgerDir } = await fixture(t);
  const ledgerPath = path.join(ledgerDir, "fifo-sidecar.md");
  const contractPath = path.join(ledgerDir, "fifo-sidecar.completion.json");
  await fs.writeFile(ledgerPath, `project_status: active\nrepo_path: ${repo}\ncompletion_contract: ${contractPath}\n`);
  const mkfifo = spawnSync("mkfifo", [contractPath], { encoding: "utf8" });
  assert.equal(mkfifo.status, 0, mkfifo.stderr);

  runHook(provenancePath, repo, home, {
    cwd: repo,
    session_id: "fifo-sidecar-session",
    hook_event_name: "SessionStart",
  });
  await fs.writeFile(ledgerPath, `project_status: complete\nrepo_path: ${repo}\ncompletion_contract: ${contractPath}\n`);

  const result = runHook(guardPath, repo, home, {
    cwd: repo,
    session_id: "fifo-sidecar-session",
    hook_event_name: "Stop",
    stop_hook_active: false,
  });
  assert.equal(result.decision, "block");
  assert.match(result.reason, /regular, non-symlink file/);
});

test("Stop hook still evaluates late ledgers when the session-bound ledger disappears", async (t) => {
  const { home, repo, ledgerDir } = await fixture(t);
  const boundLedgerPath = path.join(ledgerDir, "removed-bound.md");
  await fs.writeFile(boundLedgerPath, `project_status: active\nrepo_path: ${repo}\n`);
  runHook(provenancePath, repo, home, {
    cwd: repo,
    session_id: "removed-bound-session",
    hook_event_name: "SessionStart",
  });
  await fs.rm(boundLedgerPath);

  const lateLedgerPath = path.join(ledgerDir, "late-after-removal.md");
  const lateContractPath = path.join(ledgerDir, "late-after-removal.completion.json");
  await fs.writeFile(lateLedgerPath, `project_status: complete\nrepo_path: ${repo}\ncompletion_contract: ${lateContractPath}\n`);
  await fs.writeFile(lateContractPath, JSON.stringify(baseContract(lateLedgerPath)));

  const result = runHook(guardPath, repo, home, {
    cwd: repo,
    session_id: "removed-bound-session",
    hook_event_name: "Stop",
    stop_hook_active: false,
  });
  assert.equal(result.decision, "block");
  assert.match(result.reason, /late-after-removal\.md/);
});

function remoteCompletionContract(ledgerPath, remoteChecks) {
  return {
    schemaVersion: 3,
    evidencePolicyVersion: 1,
    ledgerPath,
    findings: [],
    requiredEvidence: [{
      id: "local-behavior",
      status: "present",
      claim: "local candidate behavior is verified",
      claimScope: "local",
      evidenceClass: "unit",
      artifactBase: "repo",
      artifact: "evidence/local.txt",
      artifactSha256: "0".repeat(64),
    }],
    preflights: [],
    remoteChecks,
  };
}

function applicableRemoteChecks(overrides = {}) {
  return {
    applicable: true,
    provider: "github-actions",
    repository: "example/project",
    ref: "refs/heads/main",
    revision: "a".repeat(40),
    policySource: "github-ruleset",
    status: "pending",
    checkedAt: "2026-09-04T10:00:00+08:00",
    checks: [],
    ...overrides,
  };
}

test("remote completion blocks pending, failed, and unknown states", () => {
  const ledgerPath = "/tmp/remote-blocked.md";
  for (const remoteChecks of [
    applicableRemoteChecks(),
    applicableRemoteChecks({
      status: "failed",
      evidenceUrl: "https://example.test/actions/failed",
      checks: [{ name: "Frontend", required: true, status: "failed" }],
    }),
    applicableRemoteChecks({ status: "unknown", reason: "required-check policy unavailable" }),
  ]) {
    const result = validateCompletionContract(
      remoteCompletionContract(ledgerPath, remoteChecks),
      ledgerPath,
      { requireRemoteChecks: true, currentRevision: "a".repeat(40) },
    );
    assert.deepEqual(result.errors, []);
    assert.equal(result.blockers.length, 1);
  }
});

test("remote completion accepts passed required checks for the exact revision", () => {
  const ledgerPath = "/tmp/remote-passed.md";
  const result = validateCompletionContract(
    remoteCompletionContract(ledgerPath, applicableRemoteChecks({
      status: "passed",
      evidenceUrl: "https://example.test/actions/passed",
      checks: [
        { name: "Backend", required: true, status: "passed" },
        { name: "Frontend", required: true, status: "passed" },
        { name: "Optional", required: false, status: "failed" },
      ],
    })),
    ledgerPath,
    { requireRemoteChecks: true, currentRevision: "a".repeat(40) },
  );
  assert.deepEqual(result, { errors: [], blockers: [] });
});

test("remote completion invalidates passed evidence from a stale revision", () => {
  const ledgerPath = "/tmp/remote-stale.md";
  const result = validateCompletionContract(
    remoteCompletionContract(ledgerPath, applicableRemoteChecks({
      status: "passed",
      evidenceUrl: "https://example.test/actions/passed",
      checks: [{ name: "Frontend", required: true, status: "passed" }],
    })),
    ledgerPath,
    { requireRemoteChecks: true, currentRevision: "b".repeat(40) },
  );
  assert.deepEqual(result.errors, []);
  assert.match(result.blockers.join("\n"), /is stale/);
});

test("remote completion allows evidenced not-applicable policy", () => {
  const ledgerPath = "/tmp/remote-not-applicable.md";
  const result = validateCompletionContract(
    remoteCompletionContract(ledgerPath, {
      applicable: false,
      status: "not_applicable",
      reason: "repository has no applicable remote validation policy",
      checks: [],
    }),
    ledgerPath,
    { requireRemoteChecks: true, currentRevision: "a".repeat(40) },
  );
  assert.deepEqual(result, { errors: [], blockers: [] });
});
