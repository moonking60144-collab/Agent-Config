---
name: agent-core-lite
description: "Use for ordinary cross-file or 3+ step implementation, config/runtime drift, sync/deploy/commit/push, and evidence-driven verification. Keeps execution ownership while selecting applicable domain contracts. Do not use for pure read-only review or work requiring a durable Project ledger."
---

# Agent Core Lite

Own a bounded implementation through Observe → Scope → Plan → Act → Verify → Report. Simple questions and single-step edits do not need this process.

## Ownership

- Pure read-only review belongs to Review.
- Requested orientation with missing implementation context belongs to Onboarding. During authorized implementation, perform bounded reconnaissance in Observe and continue the requested deliverable.
- Repeated failures route to agent-failure-debugging.
- Escalate to Project only for independently verifiable subsystems, required durable handoff, irreversible/high-blast-radius work, or audit-first implementation with an unknown worklist. File or layer count alone does not justify escalation.
- Engine and frontend skills supply technical/domain contracts; they do not replace execution ownership, authorization or verification responsibility.

## Observe and Scope

Read the governing instructions, actual diff, callers, producers, consumers and existing tests. Identify the real source of truth and distinguish repo, active settings, runtime/cache and external state.

For shared behavior, use the discovery and coverage method in [verification](references/verification.md). A manually completed consumer list is not completeness evidence. Account for discovered candidates and unresolved dynamic paths; mark concrete intentional divergence.

Name the files, behaviors and success criteria before edits. Preserve unrelated working-tree changes. Keep global assets in the Config repo and user-level Codex directories.

## Plan

Use update_plan when available for multi-step work; otherwise keep a concise explicit plan in the conversation. Each task delivers independently testable behavior, with setup/config/docs included in the task they support.

Read only the relevant design reference before Act:

- [Architecture](references/architecture-preflight.md): shared state/contracts, authority, versions, concurrency and ownership.
- [Async mutation](references/async-mutation-convergence.md): uncertain outcomes and durable settlement/recovery.
- [Interaction performance](references/interaction-performance.md): high-frequency/high-density UI or shared scheduling resources.

Record unresolved design decisions that change the contract; resolve them before implementation. These references supply domain invariants, while verification supplies the evidence method.

## Act

Follow existing patterns and make scoped edits. Parallelize independent reads; serialize writes, Git and external side effects. Use bounded read-only subagents when they increase coverage, passing raw artifacts rather than expected answers. The main agent integrates findings and owns writes and final verification.

When a hypothesis or action fails twice, stop blind retries and diagnose with one observable reversible check.

## Verify

Read [verification](references/verification.md) before defining evidence for a code-changing slice. Use its single discover → oracle/invariant → actual checks → sensitivity/performance → receipt flow.

The deployed entrypoint is `scripts/verify-change.mjs`. Reuse native tests and traces; the runner binds their actual results to the captured source. Select methods by the invariant rather than applying every technique mechanically. A failed probe, unaccounted consumer, stale source, surviving meaningful challenge, or missing required performance measurement prevents a passed receipt.

Use the same method for Lite and Project. A Lite receipt does not require a Project ledger. Existing repo enforcement remains the primary protection; global instructions do not prove a business invariant.

Commit, push and remote validation are separate states. After an authorized push with applicable remote checks, verify the exact revision before claiming completion. Pending/failed/unknown checks remain explicit unfinished work.

## Report

State what changed, the evidence that supports it, remaining boundaries and required runtime reload. Reference the receipt for detailed results. Do not replay logs or present tests as broader proof than they provide.

Before final delivery: verify the actual diff/status, inspect accepted reviewer findings directly, and confirm every requirement has appropriate evidence or an explicitly unresolved boundary.
