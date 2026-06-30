---
name: agent-core-engine
description: Design, implement, review, or extend a production-ready custom agent runtime, deterministic agentic loop, tool runner, retry policy, context compactor, or typed tick context.
---

# Agent Core Engine

Use this skill when the user asks to build, integrate, optimize, or review an agent runtime, tool loop, compactor, retry engine, or production-grade autonomous coding agent core.

This is a global Codex skill. Do not write `src/agent-core` into the current business repo unless the user explicitly names that repo as the target runtime implementation. If the user asks to improve "Codex settings", update global AGENTS/skills/templates instead of project source.

## Required Workflow

1. Read the target repo's governing instructions and package/test tooling first.
2. Keep user preferences and global runtime rules separate from project-specific implementation details.
3. Implement the engine as a deterministic lifecycle, not a loose model/tool loop.
4. Add focused tests for lifecycle transitions, tool validation, retry classification, context compaction, and stop conditions.
5. Run the target package's typecheck/build/test command that covers the new engine.

If no target repo is specified, stop at the global layer:

1. Update `~/.codex/AGENTS.md` for behavior rules.
2. Update this skill for reusable workflow.
3. Update `templates/` for copyable implementation skeletons.
4. Report any project-level files that look like prior mistaken placement, but do not delete them without explicit user approval.

## Reference Extraction

When learning from terminal agent mirrors such as Claude Code source mirrors, extract only the reusable engineering shape:

- immutable query/session config separated from mutable tick state
- lifecycle transition reasons and transcript reconstruction
- tool contract with schema validation, permission checks, read-only/concurrency/destructive metadata, interrupt behavior, timeout, and result normalization
- orchestration that runs read-only concurrency-safe tools in bounded parallel and serializes writes, shell mutations, and external side effects
- streaming tool execution with ordered transcript integration
- lifecycle hook contracts with typed JSON payloads, bounded timeout, explicit blocking semantics, and clear stdout/stderr routing
- retry classification that handles transient errors below the model layer, turns explicit timeout reasons into retryable errors, and returns deterministic errors as tool output
- multi-stage context compaction before summary compaction
- post-compaction cleanup for caches and tracking state invalidated by compact boundaries
- append-only transcript persistence with compact boundaries, preserved segment relinks, and resume-safe metadata re-append
- bash safety based on parsing and conservative fallback, not string intuition
- large tool output storage with model-visible previews

Ignore UI rendering, product telemetry, brand-specific behavior, statusline/voice features, and copied internal naming.

## Architecture Contract

The default engine shape is:

```text
Observe -> Plan -> Act -> AwaitTool -> Integrate -> CheckStop -> Compact/Retry -> Next
```

Each tick context must track:

- `iterationId` and `maxIterations`
- `timeBudget.startTime` and absolute `timeBudget.deadline`
- `tokenBudget.maxContextTokens`, `currentUsage`, and compaction threshold
- `lastProgressMarker.workspaceHash` and `consecutiveFailures`
- `scratchpad`
- transcript messages
- pending tool calls and tool results
- current lifecycle state and transition log

## Tool Contract

Tools must be registered through a typed registry. A tool definition should include:

- stable `name`
- `schema.parse(input)` or equivalent validation
- `checkPermissions(input, context)` or equivalent permission gate
- `isReadOnly(input)`
- `isConcurrencySafe(input)`
- `isDestructive(input)`
- `interruptBehavior`
- `timeoutMs`
- `maxResultSizeChars`
- `execute(input, context, signal)`
- result normalization to a standard tool message

Defaults must fail closed:

- not concurrency-safe unless explicitly declared
- not read-only unless explicitly declared
- destructive operations require explicit permission interception

## Retry Contract

Classify errors before retrying:

- Transient: 429, rate limit, explicit timeout errors, stream idle timeout, temporary 5xx, `ECONNRESET`, `EPIPE`, `ETIMEDOUT`, `EAI_AGAIN`.
- Deterministic: schema errors, missing path, permission denied, syntax errors, explicit non-zero command failures.
- User action required: permission prompt, missing credential/login, destructive confirmation.

Only transient errors may be retried internally. Default retry limit is 2, using exponential backoff with jitter and abort-signal support.

Do not rely on ambiguous `AbortError` strings alone. Tool timeouts, API request timeouts, and stream idle timeouts should become explicit error classes or abort reasons before classification.

## Hook Contract

If the runtime supports hooks, define them as typed lifecycle events instead of arbitrary shell callbacks:

- `PreToolUse`: runs before tool execution; may block only through explicit contract.
- `PostToolUse`: runs after successful tool execution; observability by default.
- `PostToolUseFailure`: runs after tool failure with `tool_name`, `tool_input`, `tool_use_id`, `error`, `error_type`, `is_interrupt`, and `is_timeout`.
- `PermissionDenied` / `PermissionRequest`: permission-specific hooks with explicit retry or allow/deny semantics.
- `SessionStart` / `SessionEnd`: session lifecycle hooks with source or reason payloads.
- `Stop` / `StopFailure`: turn-end hooks; API-error paths must not be misreported as normal stop.
- `PreCompact` / `PostCompact`: compaction hooks; `PreCompact` may append custom compact instructions or block only if the contract says so.

Every hook must declare payload schema, timeout, whether it is blocking, stdout/stderr routing, and exit-code behavior. Observability hooks should fail open. Permission and safety hooks should fail closed or ask the user.

## Context Compaction Contract

When context exceeds the configured threshold:

1. Preserve system/global/project instructions.
2. Preserve the last 3 full conversation/tool rounds.
3. Trim tool outputs over 50 lines to head/tail snippets with an audit marker.
4. Store oversized tool results outside the prompt and pass back preview plus path.
5. Drop superseded read snapshots when a later edit/write covers the same file.
6. Apply micro/snip compaction before summary compaction.
7. Only after the above, summarize older conversation state.

Compaction and retry loops must have a circuit breaker. After 3 consecutive same-class failures, stop and report the known facts plus the next verification hypothesis.

After a successful compaction, run cleanup for state invalidated by the compact boundary: microcompact trackers, session/message caches, permission/classifier approvals, speculative checks, context-collapse state, and memory-file caches. Preserve skill content and the user's active objective unless the implementation has an explicit replacement.

## Transcript Persistence Contract

For runtimes that support resume, transcript persistence is part of the agent core:

- Write transcript entries append-only with stable message IDs and parent links.
- Represent compaction with an explicit compact-boundary message rather than silently replacing history.
- Preserve recent messages verbatim when possible, and record preserved-segment metadata when compacted history needs relinking.
- Keep a full transcript path in compact summaries so the agent can recover exact old snippets or error output when needed.
- Re-append session metadata after compaction and on session exit so tail-window readers still see current title, tag, mode, worktree, PR, and last prompt.
- Avoid letting deduped preserved messages advance parent pointers past the compact boundary during resume reconstruction.

## Template Use

The TypeScript skeleton in `templates/typescript-agent-core/` is a starting point, not a file that should be automatically installed into every repo.

Use it only when the user explicitly wants a runtime implementation in a target project. Copy the smallest required files, adapt to the repo's local test runner and module style, then add focused tests before expanding adapters.

## Preferred Files In TypeScript Repos

Use this layout unless the repo has a stronger local convention:

```text
src/agent-core/
  AgentEngine.ts
  contextCompactor.ts
  errorClassifier.ts
  lifecycle.ts
  retryPolicy.ts
  tickContext.ts
  toolRegistry.ts
  toolRunner.ts
  transcript.ts
  workspaceObserver.ts
  index.ts
tests/agent-core/
  *.test.ts
```

Keep the first implementation small and testable. Add adapters for real model providers and shell tools outside the core engine.
