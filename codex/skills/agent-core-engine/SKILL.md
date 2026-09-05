---
name: agent-core-engine
description: "Use only to design, implement, review, or extend a custom agent runtime, typed tick loop, tool runner, retry engine, compactor, transcript, memory, or resume implementation. Do not use for ordinary business workflows, Config routing rules, or application-level async mutations."
---

# Agent Core Engine

Use this skill when the user asks to build, integrate, optimize, or review an agent runtime, tool loop, compactor, retry engine, or production-grade autonomous coding agent core.

For ordinary Codex tasks, do not invoke the full runtime template by default. The day-to-day integration lives in the `agent-core-lite` skill for scoped multi-step work, config/runtime drift, context pressure, and commit/push tasks; repeated failures route to `agent-failure-debugging`. Use this full skill only when the task is about agent/runtime architecture itself.

This is a global Codex skill. Do not write `src/agent-core` into the current business repo unless the user explicitly names that repo as the target runtime implementation. If the user asks to improve "Codex settings", update global AGENTS/skills/templates instead of project source.

## Required Workflow

When Review, Lite, or Project owns the task, this skill supplies runtime-specific design and evidence requirements without replacing that process. Preserve read-only review mode and return findings to Review; return implementation evidence to the owning Lite plan or Project ledger. Domain expertise does not remove durable handoff requirements or authorize writes.

1. Read the target repo's governing instructions and package/test tooling first.
2. Keep user preferences and global runtime rules separate from project-specific implementation details.
3. Implement the engine as a deterministic lifecycle, not a loose model/tool loop.
4. Add focused tests for lifecycle transitions, tool validation, retry classification, context compaction, and stop conditions.
5. Run the target package's typecheck/build/test command that covers the new engine.

Verification method, independent oracle, generated sequences, sensitivity and receipt requirements use [Lite's shared contract](../agent-core-lite/references/verification.md). This skill supplies runtime invariants and transition boundaries; it does not own a parallel evidence protocol.

If no target repo is specified, stop at the global layer:

1. Update `~/.codex/AGENTS.md` for behavior rules.
2. Update this skill for reusable workflow.
3. Update `templates/` for copyable implementation skeletons.
4. Report any project-level files that look like prior mistaken placement, but do not delete them without explicit user approval.

When integrating agent-core into normal Codex behavior rather than implementing a runtime, keep the change at the global layer:

1. Add or adjust the `agent-core-lite` skill description/body so Codex can trigger the workflow through skill discovery.
2. Keep `AGENTS.md` as short routing and non-negotiable global policy, not the whole architecture contract.
3. Update `config.toml` only with short skill routing instructions.
4. Keep this skill focused on full agent/runtime work.
5. Do not copy `templates/typescript-agent-core/` into a project unless the user explicitly asks for a runtime implementation there.

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
- API-round grouping and cache-hot/cache-cold distinctions for microcompaction
- post-compaction cleanup for caches and tracking state invalidated by compact boundaries
- append-only transcript persistence with compact boundaries, preserved segment relinks, and resume-safe metadata re-append
- resume reconstruction that handles snipped ranges, stale usage, and parallel tool-result siblings
- shell safety based on parsing and conservative fallback, not string intuition; treat Bash and PowerShell as separate languages
- deferred tool schema discovery for large registries, with exact-select and keyword lookup paths
- large tool output storage with model-visible previews and replay-stable replacement records
- permission-rule parsing, canonical tool-name aliases, and shadowed-rule detection
- skill package loading, conditional activation, permission review, and inline/fork invocation
- persistent memory taxonomy, relevance retrieval, and drift checks
- current-session task lists with ownership, dependencies, and verification gates
- multi-agent worker/leader coordination with mailbox-backed permission routing

Ignore UI rendering, product telemetry, brand-specific behavior, statusline/voice features, and copied internal naming.

When doing another source-mirror pass, read `references/claude-code-mirror-audit.md` first and update it with any new source-path evidence before changing this skill.

## Claude Code Mirror Audit

Last audited: 2026-06-30.

Reference mirrors:

- `tanbiralam/claude-code` at `6f6f12b37f529488b10e53928dd5508bb93535c7`.
- `starkdcc/claude-code-original-src` at `cd17021a7ebdf403a67df707ac02f6bf27b6c993`.
- `nirholas/claude-code` at `0252b1cc4381ea33ceb8d567c01cb8922a0229ef`; current tree contains only `README.md`, so it is not usable as implementation evidence unless that repo later adds source files.

Coverage notes:

- `tanbiralam` and `starkdcc` are substantially the same TypeScript snapshot: `1902` shared `src/` paths; a 300-file hash sample from the shared set matched exactly. Prefer `tanbiralam` for newer A-only files and `starkdcc` for the research README/source map.
- `tanbiralam` adds relevant A-only SDK/control files such as `src/entrypoints/sdk/controlSchemas.ts`, `src/entrypoints/sdk/coreSchemas.ts`, and stubbed `src/query/transitions.ts`.
- Query lifecycle guidance comes from `src/QueryEngine.ts`, `src/query/config.ts`, `src/query/deps.ts`, and `src/query/stopHooks.ts`.
- Tool contract guidance comes from `src/Tool.ts`, `src/tools.ts`, and concrete tools under `src/tools/`, especially `BashTool`, `PowerShellTool`, `FileReadTool`, `FileEditTool`, `AgentTool`, `Task*Tool`, and `ToolSearchTool`.
- Hook contract guidance comes from `src/schemas/hooks.ts`, `src/utils/hooks.ts`, and settings schema expansion in `src/utils/settings/types.ts`.
- Permission and shell safety guidance comes from `src/utils/permissions/*`, `src/tools/BashTool/*`, `src/tools/PowerShellTool/*`, `src/tools/BashTool/readOnlyValidation.ts`, and `src/tools/PowerShellTool/readOnlyValidation.ts`.
- Context compaction guidance comes from `src/commands/compact/compact.ts`, `src/services/compact/compact.ts`, `src/services/compact/microCompact.ts`, `src/services/compact/sessionMemoryCompact.ts`, `src/services/compact/postCompactCleanup.ts`, and `src/services/compact/autoCompact.ts`. `src/commands/compact/compact.ts` references a feature-gated `reactiveCompact` path, but `src/services/compact/reactiveCompact.ts` is not present in the audited checkout, so do not cite that missing file as implementation evidence.
- Transcript/resume guidance comes from `src/bootstrap/state.ts`, `src/utils/sessionStorage.ts`, `src/utils/toolResultStorage.ts`, `src/cli/transports/ccrClient.ts`, `src/cli/print.ts`, and `src/entrypoints/sdk/coreSchemas.ts`.
- Multi-agent permission and mailbox guidance comes from `src/utils/swarm/*`, `src/tools/AgentTool/*`, `src/utils/teammateMailbox.ts`, and `src/utils/swarm/permissionSync.ts`.
- Skill packaging guidance comes from `src/skills/bundledSkills.ts`, `src/skills/loadSkillsDir.ts`, `src/tools/SkillTool/*`, and `src/skills/mcpSkillBuilders.ts`.
- Persistent memory guidance comes from `src/memdir/*`, `src/services/extractMemories/*`, and `src/services/autoDream/*`.
- Session task guidance comes from `src/tools/TodoWriteTool/*`, `src/tools/TaskCreateTool/*`, `src/tools/TaskUpdateTool/prompt.ts`, and `src/utils/todo/types.ts`.
- Streaming execution guidance comes from `src/services/tools/StreamingToolExecutor.ts`, `src/services/tools/toolExecution.ts`, and `src/services/toolUseSummary/toolUseSummaryGenerator.ts`.

When extending this skill from those mirrors, keep a source-path note in the edit or commit message. Do not claim the `nirholas` mirror proves an implementation detail while it remains README-only.

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
- security-relevant tools must override classifier input; default is classifier-hidden
- model-facing input may be backfilled for observers, but the API-bound input must not be mutated after cache-sensitive serialization

## Streaming Tool Execution Contract

If tool calls can start while the model response is still streaming, execution must still preserve deterministic transcript order:

- Parse and validate tool input before asking whether a tool is concurrency-safe. If parsing or safety classification throws, treat the call as not concurrency-safe.
- Concurrency-safe tools may run together only with other concurrency-safe tools. A non-safe tool must execute exclusively.
- Progress messages may be yielded immediately, but final tool results must be integrated in the original tool_use order.
- Unknown tools, interrupted tools, and sibling-cancelled tools must still produce model-visible `tool_result` error blocks tied to the original assistant message/tool_use ID.
- Shell mutation failures may cancel sibling subprocesses, but read/search/fetch failures should not cancel unrelated siblings.
- Respect per-tool `interruptBehavior`: user interruption cancels cancellable tools and blocks until non-cancellable tools finish.
- Context modifiers are a non-concurrent feature unless the runtime explicitly designs merge semantics for concurrent modifiers.
- Non-critical summaries or labels for tool output must fail soft; a failed summarizer must not turn successful tool execution into a failed turn.

## Deferred Tool Schema Contract

For large or dynamic tool registries, the initial prompt should not always carry every full schema. A deferred tool system should include:

- a small always-loaded discovery tool that is both read-only and concurrency-safe
- `shouldDefer` / `alwaysLoad` metadata on every tool
- exact selection by stable tool name for deterministic recovery
- keyword search with bounded `max_results`
- a result format that returns callable schema references, not prose instructions
- pending-provider visibility, so a no-match result can distinguish "missing" from "still connecting"

Never invoke a deferred tool from its name alone. The full schema must be fetched and validated first.

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

## Shell Permission Contract

Shell permission logic must be parser-driven per shell family:

- Bash and PowerShell need separate parsers, allowlists, path validation, wrapper stripping, and command-injection checks.
- Do not treat a command as read-only if parsing fails, if a script block/subexpression/nested command is present, or if redirection writes to a file.
- Strip safe wrappers such as `timeout`, `time`, `nice`, `nohup`, and safe env prefixes only through a validated parser/argv path.
- Deny and ask rules must be harder to bypass than allow rules. For deny/ask matching, normalize all leading env prefixes and wrappers to a fixed point.
- PowerShell read-only validation must reject script blocks, subexpressions, expandable strings, splatting, member/static invocations, assignments, stop-parsing, UNC paths, non-filesystem providers, cwd-changing compounds, and unsafe pipeline arguments.
- Bash validation must reject shell metacharacter ambiguity, command substitution, unsafe wrapper values, redirection/path escapes, compound `cd` plus relative path confusion, and git-operation path bypasses.
- A synchronous `isReadOnly()` can be a fast conservative prefilter, but the load-bearing permission path must re-parse and re-check before execution.
- Permission rule strings need a parser, not ad hoc splitting. Support canonical aliases for renamed tools and escape/unescape parentheses in rule content.
- Detect unreachable allow rules caused by broader ask/deny rules. Deny shadowing is more severe than ask shadowing and should be reported first.
- Treat shared settings more conservatively than personal session rules; a rule that is safe with one user's sandbox may still be unsafe or confusing for teammates.

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

Detailed compaction invariants:

- Group message history by API round or assistant response ID, not by the user's apparent turn. Streaming assistant chunks with the same response ID must stay together.
- When keeping a tail segment, walk backward to include matching tool_use blocks for kept tool_results and prior assistant chunks with the same message ID.
- Distinguish cache-hot and cache-cold compaction. Cache-hot paths may issue API cache edits without mutating local transcript; cache-cold/time-based paths mutate prompt content because the cache has already expired.
- Time-based microcompact should trigger on a real idle/cache-TTL gap, run only for main-thread sources, and keep at least one recent round. Avoid `slice(-0)` style bugs that accidentally keep everything.
- Session-memory compaction should run only when positive thresholds and enough source material exist. Fall back if memory extraction has not completed, no useful memory exists, the template is empty, the summarized ID is missing, or the post-compact estimate is still above threshold.
- Summary prompts that run without tools must explicitly say tool calls are rejected and waste the turn; otherwise the summary model may spend its only response trying to call tools.
- After session-memory or cache-cold compaction, reset cache-break baselines so expected token drops are not reported as prompt-cache regressions.
- Post-compact cleanup must be scoped by query source. Subagent compaction must not reset main-thread module-level state that shares a process with it.
- Do not reset invoked skill content during cleanup; compaction attachments may need to preserve the full text of a skill across multiple compactions.

## Tool Result Budget Contract

Large tool outputs need two layers of protection:

- Per-tool output limits: individual tools should persist oversized output and return a model-visible preview plus path.
- Aggregate message limits: multiple parallel tool results can merge into one model-facing user message, so the runner must budget the normalized wire message, not only each raw result.

Replacement decisions must be stable across turns:

- Track seen tool result IDs and frozen replacement choices in per-thread state.
- Persist replacement records into the transcript so resume reconstructs the same model-visible preview bytes.
- Re-apply cached replacements by ID without file I/O when possible.
- Never later replace a result that the model already saw unreplaced; that breaks prompt-cache and resume consistency.
- Group candidates the same way the API serializer groups user/tool-result messages, including parallel tool result edge cases.
- Tools whose output is already self-bounded, such as full file reads, may opt out through an explicit infinite or no-persist limit.

## Transcript Persistence Contract

For runtimes that support resume, transcript persistence is part of the agent core:

- Write transcript entries append-only with stable message IDs and parent links.
- Represent compaction with an explicit compact-boundary message rather than silently replacing history.
- Preserve recent messages verbatim when possible, and record preserved-segment metadata when compacted history needs relinking.
- Keep a full transcript path in compact summaries so the agent can recover exact old snippets or error output when needed.
- Re-append session metadata after compaction and on session exit so tail-window readers still see current title, tag, mode, worktree, PR, and last prompt.
- Avoid letting deduped preserved messages advance parent pointers past the compact boundary during resume reconstruction.
- Refresh SDK- or UI-mutable metadata from a tail scan before re-appending cached metadata, so old cache values do not overwrite fresher external writer values.
- Relink preserved segments only after validating the tail-to-head chain. If the chain is broken or the preserved segment is stale, no-op and log rather than mutating transcript pointers.
- Zero stale usage on preserved assistant messages after compaction so resume does not immediately trigger another autocompact from old usage numbers.
- Snip compaction must replay removed UUIDs and relink dangling `parentUuid` pointers through removed ranges; otherwise resume can reconstruct unsnipped history.
- Parallel tool_use/tool_result streaming forms a DAG even if parentUuid storage is a linked list. Recovery should group assistant chunks by provider message ID and splice off-chain siblings back after the last on-chain member.
- Add a consistency checkpoint that compares expected message count or latest checkpoint position against the reconstructed chain, and log drift before the mismatch becomes a silent resume bug.

## Control/Event Schema Contract

If the runtime exposes SDK, structured output, replay, or remote-control events, define schemas for the wire format instead of streaming untyped blobs:

- user, assistant, system, result, error, status, rate-limit, and compact-boundary messages
- `parent_tool_use_id` on every user/assistant/stream event that can belong to a tool subtree
- stable `uuid` and `session_id`
- compact-boundary metadata with trigger, pre-token count, and preserved-segment relink fields
- permission-denial records with tool name, tool use ID, and original input
- `transcript_path`, `permission_mode`, `cwd`, active tools, MCP/plugin/skill lists, and model in init/session messages

Compact boundaries and status changes must be first-class events; do not infer them from prose summaries.

## Agent Definition Contract

If a runtime supports file-defined custom agents, treat the agent registry as configuration parsing, not prompt text concatenation:

- Validate each field independently and keep loading after one invalid custom agent; a bad agent file should not break the whole registry.
- Markdown agent files should require explicit `name` and `description`. Files that lack `name` may be colocated docs and should be skipped safely.
- Normalize model inheritance such as `inherit`, trim strings, and validate effort, permission mode, max turns, memory scope, background mode, isolation mode, hooks, and MCP server requirements.
- Parse allowed and disallowed tools through the same permission-rule parser used by runtime permissions. Disallowed rules should match canonical base tool names.
- Tool allowlists should support `undefined` or `*` for all tools, then subtract disallowed tools. MCP tools may need a separate allow policy because they are dynamically discovered.
- Source precedence must be explicit: built-in, plugin, user settings, project settings, flags, and policy should not accidentally merge in nondeterministic order.
- If an agent declares durable memory and the runtime requires file access to manage it, inject the minimal required file tools only when the agent already has an explicit allowlist.
- Agent prompts should make context boundaries obvious: a new agent starts without ambient context unless forked; foreground agents are for required results, background agents are for independent work.

## Skill Packaging Contract

Skills are runtime capabilities with permission and context semantics, not just markdown snippets:

- Use a small frontmatter schema: `name`, `description`, `allowed-tools`, `argument-hint`, `when_to_use`, `model`, `disable-model-invocation`, `user-invocable`, `hooks`, `context`, `agent`, `effort`, `shell`, and optional conditional `paths`.
- Prefer `skill-name/SKILL.md` for user/project skills. Legacy single-file command formats should be compatibility paths, not the primary authoring style.
- Conditional path skills should stay hidden until touched files match. Normalize patterns carefully; catch-all patterns are effectively unconditional and should not pretend to be selective.
- Load managed, user, project, additional, and legacy skill roots in a deterministic order; deduplicate by realpath so symlinked or overlapping roots do not register the same skill twice.
- Dynamic discovery should walk relevant file ancestors and respect ignore rules, especially for nested dependency folders.
- Bundled reference files should be extracted lazily on first invocation into a deterministic per-skill directory, reject absolute paths or `..`, avoid symlink-following writes, and memoize concurrent extraction.
- Initial skill listings must have a strict context budget. Show enough description to route invocation, then load full skill content only when the skill is invoked.
- New prompt-command properties should default to requiring permission review. Maintain a safe-property allowlist so new fields are not silently trusted.
- Invocation mode must be explicit. Inline skills add model-visible instructions to the current turn; forked skills run isolated work and return summarized result text.
- Remote/canonical skills must be discovered before invocation, cached with their base directory, substitute declared session/skill-dir variables only in the skill content, and register invoked content so compaction can preserve it.

## Persistent Memory Contract

Durable memory is for user/project facts that outlive the turn. It is not a substitute for reading the current repo:

- Keep a closed memory taxonomy such as `user`, `feedback`, `project`, and `reference`.
- Do not save code patterns, architecture, file paths, project structure, git history, recent changes, debugging solutions, or anything already governed by repo instructions.
- Feedback memory should include both corrections and validated non-obvious successes, with `Why:` and `How to apply:` so the next agent can judge edge cases.
- Project memory should convert relative dates to absolute dates and lead with the durable fact or decision before rationale.
- Treat memory as historical claims. Before acting on file names, function names, flags, commands, or repo state from memory, verify against the current filesystem or git state.
- If the user says to ignore or not use memory, proceed as if memory is empty and do not cite it.
- Keep the memory index short. The index should route to topic files; it should not become a full transcript or dump of every fact.
- Background memory extraction should be read-mostly and tightly sandboxed to the memory directory for writes. It should not get shell write, remove, MCP, or nested agent powers by default.
- Memory consolidation needs gates: elapsed time, session count, current-session exclusion, and a lock so two consolidators do not rewrite the same files.

## Session Task Contract

Task lists represent current-session control state. They are not durable memory and they are not a final answer:

- Use a task list for 3+ distinct steps, non-trivial multi-operation work, explicit user request, multiple requested tasks, or newly received requirements.
- Skip task state for a single straightforward or purely conversational request.
- At most one task should be `in_progress` at a time unless the runtime has explicit multi-owner task semantics.
- Mark a task `in_progress` before starting it and `completed` only after the work is genuinely finished, including required tests or verification.
- Do not mark partial work completed when tests fail, dependencies are missing, files are absent, or errors are unresolved. Keep it in progress or create a blocker task.
- For 3+ tasks, include a verification/checkpoint task rather than ending with only implementation tasks.
- In team runtimes, tasks need owner, dependencies, and enough description for another agent to execute without hidden context.
- Queued commands should preserve isolation: slash commands and shell-mode commands run one at a time; normal prompts may batch only when mode and target context match.

## Multi-Agent Coordination Contract

For worker, teammate, fork, or swarm runtimes:

- Worker contexts must have their own identity, abort controller, cwd/worktree metadata, permission mode, and tool pool.
- Background workers that cannot show UI should avoid direct permission prompts; route permission requests to the leader or fail closed.
- Worker-to-leader permission requests need typed payloads: request ID, worker ID/name, tool name, tool use ID, input, suggestions, decision, updated input, permission updates, and timestamp.
- Mailbox or queue writes must be atomic enough for concurrent workers; lock or use an append-only protocol when filesystem-backed.
- Permission updates approved by the leader must be applied to the shared context deliberately without letting a worker silently change the leader's mode.
- Prefer one active team per leader unless the runtime has a robust namespace story for task lists, inboxes, permissions, and cleanup.
- Team creation should initialize the corresponding task list and persist leader session/model/cwd metadata so external workers can discover the coordination surface.
- Agent names used for messaging and task ownership must be stable human-facing names, not opaque generated IDs.
- Prevent recursive team topologies unless the runtime explicitly supports them; flat rosters are easier to reason about and debug.
- Worktree or remote isolation must persist enough metadata for resume and cleanup.
- A worker resume path must reconstruct inherited tool-result replacements and permission context before continuing.

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
