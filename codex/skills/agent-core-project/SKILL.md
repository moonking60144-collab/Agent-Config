---
name: agent-core-project
description: "Use for work requiring durable decomposition, progress and handoff across independently verifiable subsystems or contexts, irreversible high-blast-radius operations, or audit-first implementation with an unknown worklist. Not for ordinary bounded cross-file work or pure review."
---

# Agent Core Project

Own durable execution above Lite. The process is Intake → Map & Decompose → Plan/Ledger → Execute per Task → Verify → Handoff. Domain skills do not replace this ownership.

## Intake and Resume

Use Project only when the work requires independent subsystem acceptance, compaction/handoff, irreversible/high-blast-radius operations, or discovery before a multi-phase implementation worklist is known. Count independently testable behaviors, not files, layers or tools. Downgrade to Lite when durable execution is unnecessary.

Before creating artifacts, inspect matching unfinished ledgers under `~/.codex/projects/<repo-slug>/ledgers/` and exact repo-local paths named by project rules or an earlier handoff. Resume a matching objective from next_instruction; do not rediscover done_verified work. Ask only if multiple ledgers genuinely conflict.

Pure Review remains read-only. Requested mapping belongs to Onboarding; authorized implementation includes bounded reconnaissance here. Repeated failure invokes agent-failure-debugging. Custom runtime work uses Engine as a technical contract while Project keeps the plan, ledger and final acceptance.

## Artifact Ownership

Default paths are `~/.codex/projects/<repo-slug>/plans/` and `ledgers/`. Append a short path hash when repo names collide. Use repo-local control artifacts only when requested and compatible with the shared [verification placement contract](../agent-core-lite/references/verification.md). Projectless work uses `projectless-<thread-id>` and external control artifacts; the same runner supports current-file snapshots without Git HEAD. User-facing reports may live in a scratch output directory; control state stays in the ledger.

## Map, Plan and Ledger

For each independently testable deliverable record:

- Goal, files, dependencies, consumes/produces contract and acceptance criteria.
- Source of truth, affected consumers and concrete intentional divergence.
- Applicable architecture/async/performance design decisions, using Lite references only when relevant.
- Verification plan/receipt path, oracle provenance and discovered-scope limitations from the shared [verification contract](../agent-core-lite/references/verification.md).
- Preconditions, rollback/recovery and blocking decisions.

The verification plan is canonical for check definitions and consumer coverage; the ledger references it rather than duplicating those lists. Domain decisions belong in the plan. Config rule changes also require incident/negative/false-positive/retirement evidence under the Config repo governance.

A ledger starts with:

```text
project_status: active | blocked | complete | archived
repo_path: <absolute root>
plan_path: <absolute plan>
ledger_path: <absolute ledger>
completion_contract: <sibling .completion.json>
active_task: <id or none>
last_verified_task: <id or none>
updated_at: <ISO-8601 timestamp>
next_instruction: Read <ledger path> first, then continue <task>.
```

Task states: pending, in_progress, done_verified, blocked, skipped. A done_verified task references actual evidence and is repeated only when it becomes stale or the user requests it. Keep an Eliminated section with disproved hypotheses and evidence.

## Execute

Work one task at a time and update its state immediately. Use independent reviewers or bounded exploratory agents when useful; provide raw task/diff/artifacts. Main agent verification remains necessary.

Before Act, resolve design decisions affecting contracts, ownership or observable behavior. If new evidence invalidates the plan, update the plan/ledger before continuing. An unchanged code path that already has adequate enforcement does not require another framework.

For cross-boundary architecture or mutation work, a fresh reviewer must inspect a real producer-to-consumer failure timeline. The shared verification contract defines the limits of reviewer evidence and the required behavioral checks.

Confirm recovery before irreversible work and respect existing authorization. Mark unresolved dependencies blocked and continue only independent tasks.

## Shared Completion Contract

Use the single `project-ledger-completion.schema.json` and `validate-project-ledger.mjs`; v2/v3 consume common evidence validation, with version-specific remote requirements. Current project completion uses schemaVersion 3, evidencePolicyVersion 1 and a `verification` reference to a passed shared receipt:

```json
{"artifactBase":"contract","artifact":"evidence/receipt.json","artifactSha256":"<actual SHA-256>"}
```

The receipt is the check/source/coverage record. Existing requiredEvidence items identify necessary business, runtime or review artifacts not replaced by the receipt. Do not repeat the receipt's full plan in the sidecar. Findings and preflights keep stable ids; exceptions require owner, reason and evidence. Artifact bounds, containment, integrity and status semantics are enforced by the shared validator.

Legacy contracts remain readable for resume and non-strict CLI inspection. Newly completed work must satisfy current strict verification. The Stop hook checks session-bound and newly completed/changed ledgers and can request one continuation; it is bounded enforcement, not an unbypassable guarantee.

Remote checks are separate from local proof. After an authorized push, record applicable policy, exact full revision, required checks, state and evidence URL. Pending/failed/unknown or stale revision blocks completion. Use not_applicable only with the actual policy/reason. The validator checks the supplied evidence; it does not independently query the provider.

## Verify and Close

Follow [verification](../agent-core-lite/references/verification.md). Every behavioral claim needs evidence crossing the claimed boundary. A source/test change invalidates the receipt; regenerate and rerun affected verification before completion.

Update the sidecar and run:

```text
node ~/.codex/hooks/validate-project-ledger.mjs --ledger <ledger> --require-evidence-policy --require-verification
```

Only zero errors/blockers with current source, evidence and applicable remote checks permits complete. Runtime provenance records observed files, not native skill activation or semantic compliance. A ledger created after SessionStart still requires explicit validation.

## Handoff

Before stopping or compaction, update the ledger with task state, verified receipts, blockers and next_instruction. Preserve source reconstruction using authorized commits/stashes or a tracked diff plus untracked manifest; a digest alone is not a recoverable snapshot.

Final delivery references the ledger and evidence, identifies unfinished boundaries and uses actual Git diff/status. The next session's first action is reading that ledger, not repeating discovery.
