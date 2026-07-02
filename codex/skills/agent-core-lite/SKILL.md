---
name: agent-core-lite
description: Superpowers-style entry workflow for everyday Codex engineering quality. Use before file exploration, code edits, config diagnosis, or tool actions when a task touches a large repo, cross-file change, 3+ steps, repeated failure, config/runtime mismatch, token/context/compact abnormality, external side effect, destructive/permission-sensitive action, commit/push, implementation, refactor, architecture, data flow, production, sync, deploy, or verification work.
---

# Agent Core Lite

## Non-Negotiable Trigger Rule

Invoke this skill before doing anything else when the description may apply, including before asking clarifying questions, searching files, reading git state, or running tools. If it later proves unnecessary, state that and continue with the lighter path.

Do not rationalize skipping the skill because the first step looks small. Large-project drift usually starts with one quick unchecked action.

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

### Act

Parallelize independent read-only checks. Keep writes, shell mutations, git, MCP side effects, and external calls sequential. Treat unknown tools as write-capable until proven otherwise. Avoid broad file dumps; keep large outputs as paths, summaries, or reproducible commands.

### Verify

Verify the real source of truth for the task, not the easiest proxy. Code changes normally need the relevant lint/build/test or a stated reason if not run. Config changes need the active consumer or a clear reload/restart boundary. Review findings need a reachable trigger chain. Do not mark work complete with missing files, failed tests, stale state, or indirect evidence.

### Report

Report changed files/settings, verification evidence, residual risk, and required reload/restart/push steps. Keep it concise. If no edit was made, say what was inspected and what conclusion follows.

## Gates

These gates are blocking. If a gate is not satisfied, do not proceed as if it is.

| Gate | Must be true before proceeding |
| --- | --- |
| Scope gate | Target files/settings/surfaces are named before edits |
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
| "I will just inspect one file first." | Trigger skill routing and scope the read |
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
