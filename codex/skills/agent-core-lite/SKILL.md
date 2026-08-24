---
name: agent-core-lite
description: "Use when AGENTS.md section 3.6 routes cross-file or 3+ step work, config/runtime drift, sync/deploy/commit/push, or external side effects. Skip simple questions and single-step edits."
---

# Agent Core Lite

## Trigger Rule

Invoke this skill only when the canonical routing in `AGENTS.md` section 3.6 matches. If the same failure or hypothesis has already appeared twice, route directly to `agent-failure-debugging` instead.

Do not trigger this skill solely because a task involves implementation, refactoring, architecture, data flow, production, or verification. Simple questions and single-file/single-step edits stay on the direct path.

## Iron Law

```text
NO COMPLEX ACTION WITHOUT SCOPE, EVIDENCE, AND A STOP CONDITION.
```

No edits before scope. No completion claim without direct evidence. No third blind retry after two similar failures.

## Internal Routing

This skill is not the canonical dispatch table. The canonical routing rules live in `AGENTS.md` section 3.6. After this skill is already invoked, check whether another process skill should take over:

- If this is pure code review or audit, switch to `review`.
- If this is first contact with an unfamiliar repo or subsystem, switch to `repo-onboarding-audit`.
- If the same failure, mismatch, or hypothesis has appeared twice, switch to `agent-failure-debugging`.
- If the task is about a custom runtime, tool loop, retry engine, compactor, transcript, resume, or typed tick context, switch to `agent-core-engine`.
- If the task exceeds lite scope because it spans 3+ independently verifiable subsystems, cannot fit safely in one context, requires a durable plan/ledger across compaction/resume/handoff, has irreversible or high-blast-radius effects such as schema migration, data backfill, or production deploy, or needs audit-first discovery with an unknown worklist followed by prioritized multi-phase implementation, switch to `agent-core-project`.

## Required Loop

Use this loop for every triggered task:

```text
Observe -> Scope -> Plan -> Act -> Verify -> Report
```

### Observe

Confirm the active goal, cwd/repo, governing instructions, current surface, available tools, and whether the problem depends on runtime/cache/state outside files. For config/context/token issues, identify the consumer: config, catalog, profile, session snapshot, app-server cache, state DB, log, account/server limit, or UI.

### Scope

State what this turn will touch and what it will not touch. Before edits, name the exact files or setting surfaces expected to change. Global Codex settings stay in `~/.codex` and the config repo; do not place global agent assets inside business repos.

### Plan

For 3+ steps, cross-file changes, review sweeps, or commit/push work, use `update_plan`. Each step needs a verifiable completion condition. Keep exactly one step in progress unless a true multi-agent workflow is active.

When the Architecture Preflight Gate in `AGENTS.md` section 3.1 triggers, complete that bounded preflight before entering Act.

### Act

Parallelize independent read-only checks. Keep writes, shell mutations, git, MCP side effects, and external calls sequential. Treat unknown tools as write-capable until proven otherwise. Avoid broad file dumps; keep large outputs as paths, summaries, or reproducible commands.

Use subagents when they are expected to improve coverage, reduce main-context pressure, or provide independent verification for large codebase scans, review/audit work, adversarial checks, or isolated project tasks. No per-use permission is required for bounded read-only subagent investigation, but the main agent owns scope, synthesis, writes, git actions, external side effects, and final verification.

### Verify

Verify the real source of truth for the task, not the easiest proxy. Code changes normally need the relevant lint/build/test or a stated reason if not run. Config changes need the active consumer or a clear reload/restart boundary. Review findings need a reachable trigger chain. Do not mark work complete with missing files, failed tests, stale state, or indirect evidence.

### Report

Report changed files/settings, verification evidence, residual risk, and required reload/restart/push steps. Keep it concise. If no edit was made, say what was inspected and what conclusion follows.

## Gates

These gates are blocking. If a gate is not satisfied, do not proceed as if it is.

| Gate | Must be true before proceeding |
| --- | --- |
| Scope gate | Target files/settings/surfaces are named before edits |
| Consumer coverage gate | When the production-consumer inventory rule in `AGENTS.md` section 3.1 triggers, the producer -> contract -> all production consumers inventory is complete and every consumer is marked `must-align` or `intentional-divergence` |
| Architecture preflight gate | When the Architecture Preflight Gate in `AGENTS.md` section 3.1 triggers, canonical source of truth, state boundaries, production consumer coverage, contract round-trips, async/cache behavior, and relevant UI lifecycle are resolved before Act |
| Read-only gate | If the user asked read-only/review/analysis, no writes happen |
| Evidence gate | Claims are backed by current files, logs, runtime output, official docs, or direct UI behavior |
| Config gate | The actual consumer is identified before saying a config change worked |
| Failure gate | After two similar failures, switch to `agent-failure-debugging` |
| Completion gate | Every explicit requirement has direct evidence or a stated remaining gap; otherwise do not claim completion |

## Quality Gates

Apply these gates when writing or reviewing code:

- Trace caller -> changed function/module -> downstream consumer before making correctness claims.
- Prefer project conventions over generic best practice unless there is a concrete risk.
- Make surgical edits; every changed line must map to the request.
- Do not add speculative abstractions, unused options, broad defensive wrappers, or style-only churn.
- Trust documented APIs and local dominant patterns; avoid redundant `typeof`, `getattr`, `isinstance`, broad `try/except`, or existence checks around known contracts.
- Use structured parsers/APIs for structured data instead of ad hoc string surgery when the project already provides them.
- Treat SQL injection, XSS, command injection, auth bypass, data loss, migration drift, and source-of-truth conflicts as blocker risks.
- For frontend work, verify actual rendered/user behavior when the task depends on layout, interaction, accessibility, or browser state.
- When tests are added, moved, renamed, nested, generated, or selected by custom globs or patterns, verify the intended test is discovered or direct-run it once; an aggregate green exit is not enough.
- Before changing an external black-box write payload, required field, idempotency rule, or create/update timing, apply the `AGENTS.md` section 3.1 baseline requirement and protect critical payload behavior with a focused contract test. If live writes are unavailable, use mock or staging evidence and report the live boundary.
- For external APIs, product limits, versions, specs, legal/financial/medical facts, or latest behavior, use official or primary sources.

## Good / Bad Patterns

| Situation | Good | Bad |
| --- | --- | --- |
| Config diagnosis | Identify `config`, `catalog`, `profile`, `session snapshot`, `app cache`, `state DB`, `log`, or server/account limit | Read one TOML value and claim runtime behavior changed |
| Review scope | Match the user's requested mode: diff review, re-review, or system audit | Check only `git diff` when the user asked for architecture/data-flow audit |
| Code edits | Touch only files required by the request and local data flow | Opportunistic rename, cleanup, formatting, or abstraction |
| Tests | Run the smallest relevant command and explain any missing coverage | Treat unrelated green build as proof of user-facing behavior |
| External facts | Use official/primary sources and cite exact source | Rely on memory, search snippets, or model recall |
| Large output | Return summary, path, command, and key lines | Paste giant logs into the conversation |
| Defensive code | Trust known APIs and validate only at real boundaries | Add redundant `typeof`, `getattr`, `isinstance`, broad `try/except`, or existence checks |

## Failure Brake

After the same failure or hypothesis appears twice, stop the original loop and switch to `agent-failure-debugging`. Classify the issue as logic, state, environment, tool, policy, context, or runtime drift. Do not attempt a third blind variation.

## Red Flags

These thoughts mean stop and take the required action:

| Thought | Required action |
| --- | --- |
| "This involves implementation, so Lite must apply." | Check `AGENTS.md` section 3.6; simple single-file/single-step work stays on the direct path |
| "The config value changed, so behavior must have changed." | Identify and verify the live consumer |
| "The test/build passed, so the user-facing flow is fine." | Verify the actual user-facing path if behavior depends on UI/runtime |
| "This is probably a cache issue." | Name the cache/state layer and the reload boundary |
| "The repo is familiar enough." | Re-check current files before touching a new subsystem |
| "This review is only a diff." | Confirm the user did not ask for system/audit/data-flow coverage |
| "The tool output is huge, but I can paste it all back." | Persist or summarize; return path/key lines |
| "One more retry should work." | If this is the third similar attempt, stop and debug systematically |
| "I can fill in details later." | Replace placeholders with exact file, command, expected result, or state the gap |

## Before Final Checklist

Run this checklist silently before final response:

- Did I answer the newest user request, not an older thread goal?
- Did I satisfy every explicit requirement or report the missing evidence?
- Did I avoid edits when the user asked for read-only/review/analysis?
- Did I keep changes scoped to requested files/settings?
- Did I verify the real source of truth, or clearly state why verification was not run?
- Did I report restart/reload/cache/push boundaries when they affect whether changes take effect?
- Did I avoid claiming a broad audit from a narrow check?
