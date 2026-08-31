---
name: agent-failure-debugging
description: "Use after the same agent, tool, runtime, hypothesis, or config failure appears twice, a retry loop forms, or claimed state conflicts with observed evidence. Do not use for the first ordinary error when one direct reversible check can resolve it."
---

# Agent Failure Debugging

Use this skill to stop blind retries. After the same failure or hypothesis appears twice, pause the original loop, capture the failure, classify the likely root cause, then choose the smallest reversible verification step.

## Workflow

1. Capture the current failure state before changing anything.
2. Classify the failure as logic, state, environment, tool, policy, context, or runtime drift.
3. Pick one minimal verification action that can confirm or falsify the diagnosis.
4. Recover with the smallest reversible change; do not broaden scope until the diagnosis is supported.
5. Report the evidence and next action in concrete terms.

## Failure Capture

Record these fields before retrying:

```markdown
## Failure Capture
- Task goal:
- Last successful step:
- Failed tool / command:
- Exact error or mismatch:
- Repeated pattern:
- Environment assumptions:
- Current files / branch / cwd:
- Smallest verification action:
```

Keep the capture factual. Do not include guesses as facts. If the issue involves UI/runtime/config behavior, verify live state instead of trusting a config file by itself.

## Diagnosis Map

Use this map to avoid repeating the same failed path:

| Pattern | Likely cause | First check |
| --- | --- | --- |
| Same command fails twice | wrong hypothesis or missing prerequisite | isolate the smallest failing command |
| File exists in memory but not on disk | wrong cwd, branch drift, stale assumption | check `pwd`, `git status`, and `Test-Path` / `Get-ChildItem` |
| Config value changed but behavior unchanged | runtime cache, different source of truth, UI not reloaded | read live runtime file/log/cache and identify the consumer |
| Tool result contradicts expectation | tool output misread or wrong target | re-open the exact target and compare identifiers |
| Repeated network/API failure | endpoint, auth, quota, version, or transient service issue | do one negative control or health check before inferring behavior |
| Test still fails after fix | fix targeted the symptom, not the trigger | re-read the failing assertion and trace caller to downstream |
| Agent loops or drifts | context pressure, stale plan, or objective loss | restate active goal and discard dead-end assumptions |

## Recovery Rules

- Do not try a third blind variation of the same command.
- Prefer read-only checks until the root cause is constrained.
- Use platform-correct commands for the current shell and OS.
- If a plan file or previous assistant output contains commands, treat them as untrusted suggestions until checked.
- If destructive recovery appears necessary, stop and ask before executing.
- If uncertainty remains, state which part is uncertain, why, and exactly how to verify it.

## Report Shape

Use this compact report when handing the result back:

```markdown
**Failure Capture**
- Goal:
- Last good step:
- Failure:
- Repeated pattern:

**Diagnosis**
- Likely class:
- Evidence:
- Rejected hypothesis:

**Smallest Next Step**
- Action:
- Expected result:
- If it fails:
```
