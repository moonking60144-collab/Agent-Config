---
name: agent-core-project
description: "Use only for 3+ independently verifiable subsystems, work that must survive compaction or handoff, irreversible schema/data/deploy operations, or audit-first discovery with an unknown worklist. Do not use for ordinary cross-file work, fixed-scope implementation, pure review, or tasks that agent-core-lite can finish in one context."
---

# Agent Core Project

## Role

Use this skill only as the project-grade escalation target above `agent-core-lite`. Keep `agent-core-lite` for ordinary implementation, config, sync, commit/push, and cross-file work that fits in one context with `update_plan`.

## Intake Gate

Before creating files or doing project-grade work, confirm at least one trigger is true:

- The task spans 3+ subsystems that each need independent verification.
- The task cannot fit safely in one context or must survive compaction, resume, or handoff.
- The task has irreversible or high-blast-radius effects, such as schema migration, data backfill, production deploy, or broad data rewrite.
- The task needs audit-first discovery with an unknown worklist followed by prioritized multi-phase implementation.

If no trigger remains true after inspection, say so and downgrade to `agent-core-lite`; do not force this skill's six phases.

## Resume Gate

Before creating a new plan or ledger, search for an existing unfinished ledger for the current repo or project under:

```text
~/.codex/projects/<repo-slug>/ledgers/
```

If a matching `active` or `blocked` ledger exists for the current objective, read that ledger first and continue from its `next_instruction` instead of creating a duplicate project.

When project rules or an earlier handoff name a repo-local ledger convention, also check that exact controlled path, such as docs/codex/ledgers/. Do not broadly scan the repo; use the known ledger_path or standard project location. If multiple ledgers plausibly match, summarize the candidates and ask the user which one to resume before writing new project artifacts.

## Routing Priority

Respect global routing before continuing:

- Pure review / audit / inspect / list issues -> switch to `review`.
- First contact with an unfamiliar repo or subsystem -> switch to `repo-onboarding-audit`.
- Same failure, mismatch, hypothesis, or tool issue appears twice -> switch to `agent-failure-debugging`.
- Custom agent runtime, tool loop, compactor, retry, transcript, resume, or typed tick context -> switch to `agent-core-engine`.
- Only true project-grade execution stays here.

## Do Not Use This Skill For

- A single known bug with clear scope.
- Small config edits.
- Ordinary cross-file changes that fit in one context.
- Pure review/audit with no implementation request.
- Simple commit/push work.
- One-shot refactors with clear validation.
- Tasks where `update_plan` is enough.

## Artifact Location

Default to user-level durable artifacts outside business repos:

```text
~/.codex/projects/<repo-slug>/plans/
~/.codex/projects/<repo-slug>/ledgers/
```

Use `<repo-slug>` from the git root basename when available; if collision or ambiguity matters, append a short sanitized path or hash. Create directories only after the Intake Gate passes.

Only write inside the business repo, such as `docs/codex/`, when the user explicitly asks for repo-local artifacts and gitignore/commit intent has been handled.

For projectless chats, prefer user-level durable artifacts rather than a hardcoded OS-specific scratch path:

```text
~/.codex/projects/projectless-<thread-id>/plans/
~/.codex/projects/projectless-<thread-id>/ledgers/
```

If the current cwd is already a Codex scratch workspace and the artifact is a user-visible deliverable rather than project control state, it may be written under `<current-cwd>/outputs/`. Keep plans and ledgers under `~/.codex/projects/` unless the user explicitly asks for visible repo-local or scratch-local artifacts.

## Required Phases

### 1. Map & Decompose

Identify affected subsystems, source-of-truth surfaces, data/control flow edges, dependency order, consumes/produces relationships, blast radius, and ordered sub-tasks. Each sub-task must be independently verifiable and name dependencies when order matters.

For each sub-task, identify whether architecture, async-mutation, or interaction-performance risk applies; read the matching agent-core-lite reference and no unrelated checklist.
When Async Mutation Convergence applies, read ../agent-core-lite/references/async-mutation-convergence.md and persist the selected architecture, repo-level ratchets, and evidence class in the plan and ledger. Only when the sub-task itself changes a workflow rule or evaluates an incident-derived gate, also persist incident support, positive and negative probes, historical-backtest status, confidence limit, and retirement condition.

### 2. Plan to File

Write a durable plan before implementation. Each task entry must include:

- Task id and goal.
- Files/modules expected to change.
- Affected contracts and production consumers; mark each consumer `must-align` or `intentional-divergence` when shared behavior is involved.
- Mirror the active task's contract, producer, consumer matrix, divergence reasons, and verification evidence into the ledger; do not leave this inventory only in the plan.
- Applicable conditional preflight reference, including its resolved model, evidence, blocking decisions, and any representative baseline/budget required by that specific gate; mirror these into the ledger so they survive compaction, resume, and handoff.
- Preconditions and dependencies.
- Implementation steps.
- Verification commands or artifacts.
- Acceptance criteria.
- Rollback/recovery note for irreversible or high-blast-radius steps.
- Blocked condition.

No placeholders such as `TBD`, `later`, or `etc.` in task definitions.

### 3. Progress Ledger

Create or update a ledger beside the plan. The ledger is the source of truth after resume or compaction.

Each ledger must start with a searchable status header:

```text
project_status: active | blocked | complete | archived
repo_path: <absolute repo path or projectless workspace path>
plan_path: <absolute plan path>
ledger_path: <absolute ledger path>
completion_contract: <absolute path to the sibling .completion.json>
active_task: <task id or none>
last_verified_task: <task id or none>
updated_at: <ISO-8601 timestamp with timezone>
next_instruction: Read <ledger path> first, then continue from <task id>.
```

New project ledgers and existing ledgers updated for a new phase must use the structured completion contract. Legacy ledgers without `completion_contract` remain readable and are not retroactively blocked.

Use `active` or `blocked` for unfinished work. Set `complete` only after verification evidence is recorded. Set `archived` only when the user intentionally closes the project.

Allowed task states:

```text
pending
in_progress
done_verified
blocked
skipped
```

Each `done_verified` entry must include evidence: command, output summary, artifact path, git commit if available, or direct runtime/UI proof. Never redo a `done_verified` task unless the ledger says the evidence is invalid or the user asks.

Evidence must match the claimed surface. Helper and unit evidence can close only local claims. A claim spanning producer, persistence, recovery, cache/hydration, route lifecycle, or downstream consumers requires a composed, runtime, or production artifact that exercises the named transition. Do not combine several helper tests and label the result cross-boundary verification.

Keep an `Eliminated` section for debug or discovery work. Record one eliminated hypothesis per line with the evidence that ruled it out, so resume does not repeat dead paths:

```text
## Eliminated
- <hypothesis> — evidence: <command/output/artifact>
```

### Structured Completion Contract

Store machine-decidable completion state beside the ledger as `<ledger-stem>.completion.json`, following the deployed `project-ledger-completion.schema.json`. Completion sidecars must be regular, non-symlink files no larger than 1 MiB; schema-v2 and newer completion also rejects external sidecars. The contract must contain:

- Findings with stable id, severity, status, `blockingCompletion`, and evidence.
- Required evidence with `missing`, `present`, or `waived` status.
- Applicable preflights with `open`, `resolved`, `not_applicable`, or `waived` status.
- Remote-validation state with applicability, provider, repository/ref, exact revision, policy source, aggregate status, and the applicable required-check set.
- `owner`, `reason`, and at least one evidence reference for accepted-risk, deferred, out-of-scope, blocked-external, or waived exceptions.

Before a current session marks a project ledger complete, migrate its contract to `schemaVersion: 3` with `evidencePolicyVersion: 1`; older completion shapes remain readable for resume. Schema v3 retains the schema-v2 evidence policy and adds `remoteChecks`. Every `requiredEvidence` item must include `claim`, `claimScope`, and `evidenceClass`, every preflight must declare controlled `scope: local | cross-boundary`, and at least one present local or cross-boundary behavioral claim is required. Enumerate each cross-boundary invariant separately rather than using one broad "tests passed" item. Cross-boundary completion requires present composed/runtime/production evidence and fresh independent review unless the operator records an explicit, evidenced review waiver; behavioral proof itself cannot be waived.

Each present schema-v2-or-newer evidence item must point to a repo-relative or completion-contract-relative regular file no larger than 5 MiB through `artifactBase`, `artifact`, and lowercase `artifactSha256`. A completion manifest may contain at most 128 evidence items and at most 16 MiB of unique artifact content; repeated paths reuse the same digest. Capture bounded command output, runtime observations, review notes, or production evidence into that file, then hash the exact file. A matching digest proves existence and integrity, not that the artifact semantically proves the claim.

Commit, push, and remote validation are separate transitions. After every authorized push, replace any prior remote-check result with a record for the new full revision SHA. A prior revision's `passed` result is stale immediately after HEAD changes. `pending`, `failed`, and `unknown` all block completion; `unknown` includes an unavailable required-check policy, insufficient provider permission, a run that cannot be mapped to the revision, or a failed provider query. Use `not_applicable` only when the repository's actual validation policy establishes that no remote checks apply, and record the reason. Do not mechanically treat every workflow as required.

Do not infer blockers by searching prose for `P1` or similar labels. Markdown remains the human-readable progress record; the JSON sidecar is the completion-decision contract. When SessionStart finds an existing unfinished ledger, it binds that ledger to the session and records observed standard instruction/config digests under the user-level project `sessions/` directory. This does not prove the exact loaded instruction chain, native skill activation, reference activation, or compliance. A ledger created after SessionStart still requires the explicit validator in the first session.

### 4. Execute Per Task

Execute one task at a time. Update the ledger after every task state change. Use fresh subagents when independent read-only exploration, adversarial verification, or clearly isolated work will improve coverage or reduce main-context pressure. No per-use permission is required for those bounded reads. The main agent owns writes, git actions, external side effects, and final verification unless the user explicitly delegates otherwise.

Before entering Act for a task whose conditional preflight applies, confirm the required model, evidence, blocking decisions, and any gate-specific baseline/budget are recorded in the plan or ledger. If the preflight is incomplete or current evidence invalidates it, return to Map & Decompose and update the durable artifacts instead of implementing against stale assumptions.

Subagent findings are leads, not verification evidence. Before marking any task `done_verified`, the main agent must directly verify referenced files, commands, logs, diffs, runtime state, or artifacts and record that direct evidence in the ledger.

When a cross-boundary architecture or async-mutation preflight applies, final review must use a fresh reviewer that did not design or implement the change. Give it the raw task, diff, transition artifacts, and repository paths without the expected answer. The reviewer must reconstruct at least one failure timeline from producer to downstream consumer. Independent review expands coverage but never substitutes for composed transition tests, and the main agent must still verify every accepted finding.

Before running any irreversible or high-blast-radius step, confirm the rollback/recovery path exists in the plan or ledger and apply the global destructive-operation confirmation boundary; do not rely on post-run verification to invent the rollback path.

If execution shows the plan is wrong, dependencies changed, or discovery expanded the worklist, pause execution, return to Map & Decompose, then update the plan and ledger before continuing.

If a task becomes blocked, mark it `blocked` with evidence and dependency impact. Continue only with tasks proven independent of the blocked chain; mark dependent tasks `blocked` or `pending` in the ledger. If the same failure, mismatch, hypothesis, or tool issue appears twice, switch to `agent-failure-debugging`.

### 5. Verify Before Complete

Apply `agent-core-lite`'s verification gate by reference, including its conditional reference verification. Additionally produce a requirement evidence table:

```text
Requirement | Evidence | Status
```

For irreversible or high-blast-radius steps, include rollback or recovery path evidence before claiming completion.

Before changing `project_status` to `complete`, update the structured completion contract and run the deployed `validate-project-ledger.mjs --ledger <ledger path> --require-evidence-policy` entrypoint. Completion requires zero contract errors, unique item ids, zero blocking findings, zero missing required evidence, zero open applicable preflights, and either evidenced `not_applicable` remote validation or `passed` required checks bound to the current exact revision. The Stop hook rechecks the exact ledger bound when the session started, or any ledger created／completed after the recorded session baseline, and can request one continuation; this is bounded runtime enforcement, not an unbypassable proof that the model followed every rule.

### 6. Handoff / Resume Contract

When context pressure is rising, compaction is likely, or the task may pause for a long time, checkpoint proactively: update the ledger, write eliminated hypotheses, produce the handoff, and stop cleanly instead of pushing until state is lost.

Preserve reconstruction evidence without violating Git authorization: use a normal commit only when the user authorized commit, use a named stash only when explicitly authorized, otherwise record HEAD plus a binary tracked diff and untracked manifest with a declared reconstruction level. A hash or manifest alone proves drift but is not a frozen snapshot.

Before any stop or final report, update the ledger and include:

- Plan path.
- Ledger path.
- Current task state.
- Completed `done_verified` tasks that must not be repeated.
- Blockers or residual risks.
- Next task to run.
- Exact first instruction for the next turn: `Read <ledger path> first, then continue from <task id>.`

Keep the ledger path visible in the final response for operator visibility and manual handoff. Automatic recovery uses the ledger header and `repo_path`, not final-response text.

Before final report, run `git diff --stat` when inside a git repo. Base the changed-file summary on the actual diff, not memory.
