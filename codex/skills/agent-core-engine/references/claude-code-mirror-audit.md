# Claude Code Mirror Audit

Last audited: 2026-06-30.

## Source Scope

- `tanbiralam/claude-code` at `6f6f12b37f529488b10e53928dd5508bb93535c7`.
- `starkdcc/claude-code-original-src` at `cd17021a7ebdf403a67df707ac02f6bf27b6c993`.
- `nirholas/claude-code` at `0252b1cc4381ea33ceb8d567c01cb8922a0229ef`.
- `tanbiralam` and `starkdcc` share `1902` `src/` paths; a 300-file hash sample from the shared set matched exactly.
- `tanbiralam` has `92` A-only `src/` files. Relevant additions include SDK/control generated types, deferred tool/runtime types, task/monitor tools, bundled Claude API docs skills, verification skill docs, and several internal tool types.
- `nirholas` currently contains only `README.md` with `# Fresh Start`; do not use it as implementation evidence.

## Integration Matrix

| Area | Source paths | Reusable point | Integrated status |
| --- | --- | --- | --- |
| Query lifecycle | `src/QueryEngine.ts`, `src/query/config.ts`, `src/query/deps.ts`, `src/query/stopHooks.ts`, `src/Task.ts` | Snapshot immutable query config, inject narrow deps for testability, preserve stop-hook prevent-continuation state, keep abort/orphaned permission handling explicit. | Added to `SKILL.md` as query lifecycle and control/event guidance. |
| Tool contract | `src/Tool.ts`, `src/tools.ts`, concrete tools under `src/tools/` | Tool is a typed object with schema, permission, read-only/concurrency/destructive metadata, interrupt behavior, max result size, observable-input backfill, strict mode, and fail-closed defaults. | Already covered; expanded with classifier and API-input immutability notes. |
| Deferred tool schema | `src/tools/ToolSearchTool/prompt.ts`, `src/tools/ToolSearchTool/ToolSearchTool.ts`, `src/Tool.ts` | Large registries can defer full schemas. Discovery tool supports exact `select:` and bounded keyword search, while `alwaysLoad` keeps critical tools visible on turn 1. | Added `Deferred Tool Schema Contract`. |
| Hook contract | `src/schemas/hooks.ts`, `src/utils/hooks.ts`, `src/utils/settings/types.ts` | Hooks need schema, timeout, async/background mode, blocking decision, stdout/stderr/exit handling, matcher normalization, and distinct stop/failure/compact/session events. | Already covered; no new patch beyond source matrix. |
| Bash permission safety | `src/tools/BashTool/bashPermissions.ts`, `src/tools/BashTool/readOnlyValidation.ts`, `src/tools/BashTool/pathValidation.ts`, `src/tools/BashTool/bashSecurity.ts` | Permission matching strips wrappers/env vars through parser-aware paths, handles deny/ask stricter than allow, validates path/redirection/git edge cases, and fails closed on parse ambiguity. | Added `Shell Permission Contract`. |
| PowerShell permission safety | `src/tools/PowerShellTool/PowerShellTool.tsx`, `src/tools/PowerShellTool/readOnlyValidation.ts`, `src/tools/PowerShellTool/pathValidation.ts`, `src/tools/PowerShellTool/powershellPermissions.ts`, `src/tools/PowerShellTool/gitSafety.ts` | PowerShell requires its own AST/security flags. Reject script blocks, subexpressions, splatting, member/static invocation, assignments, stop-parsing, UNC, providers, cwd-changing compounds, unsafe pipeline args. | Added `Shell Permission Contract`; corrected earlier Bash-only framing. |
| Tool result storage | `src/utils/toolResultStorage.ts`, shell tools' `mapToolResultToToolResultBlockParam` usage | Per-tool persistence is not enough. Aggregate user-message budgeting must group normalized tool results, persist exact replacement strings, freeze decisions by tool_use_id, and reconstruct on resume. | Added `Tool Result Budget Contract`. |
| Compaction pipeline | `src/commands/compact/compact.ts`, `src/services/compact/compact.ts`, `src/services/compact/microCompact.ts`, `src/services/compact/sessionMemoryCompact.ts`, `src/services/compact/postCompactCleanup.ts`, `src/services/compact/autoCompact.ts` | Manual compact tries session memory first, then microcompact before summary; PTL retry truncates oldest context; post-compact restores files/skills/plan and cleans invalidated caches. | Mostly covered; source list corrected. |
| Reactive compact caveat | `src/commands/compact/compact.ts`, `src/services/compact/autoCompact.ts` | Call sites reference a feature-gated reactive compact path, but `src/services/compact/reactiveCompact.ts` is absent in this checkout. | Do not cite missing file as implementation evidence. |
| Transcript/resume | `src/utils/sessionStorage.ts`, `src/cli/transports/ccrClient.ts`, `src/cli/print.ts`, `src/bootstrap/state.ts`, `src/entrypoints/sdk/coreSchemas.ts` | Resume relies on append-only records, compact boundaries, preserved segment relinks, parent links, content replacement entries, metadata re-append, and efficient tail/boundary scans. | Already covered; expanded with control/event schema. |
| Control/SDK schema | `src/entrypoints/sdk/coreSchemas.ts`, `src/entrypoints/sdk/controlSchemas.ts`, generated SDK type files | Wire events should be typed: user/assistant/system/result/status/rate-limit/compact boundary, `parent_tool_use_id`, `session_id`, `uuid`, permission denials, init metadata. | Added `Control/Event Schema Contract`. |
| Multi-agent coordination | `src/tools/AgentTool/*`, `src/utils/swarm/*`, `src/utils/teammateMailbox.ts`, `src/utils/swarm/permissionSync.ts` | Workers need separate identity/cwd/tool pool/permission context; permission prompts can route through leader UI or mailbox; mailbox messages must be typed and concurrency-safe; resume needs isolation metadata. | Added `Multi-Agent Coordination Contract`. |
| A-only bundled docs skills | `src/skills/bundled/claude-api/*`, `src/skills/bundled/verify/*` | Useful as examples of product documentation packaging, not as Codex global behavior. | Not integrated; would need separate skill/content decision. |
| A-only UI/tools | `src/components/*`, `src/ink/*`, `src/tools/WebBrowserTool/*`, `src/tools/MonitorTool/*`, `src/tools/WorkflowTool/*` | Mostly product UI, runtime-specific tools, or internal feature surfaces. | Intentionally excluded unless a future Codex feature asks for that exact tool surface. |

## Remaining Deep-Dive Candidates

These are not blockers for the current global Codex configuration, but they are not "fully exhausted":

- `src/services/compact/apiMicrocompact.ts`, `src/services/compact/grouping.ts`, and `src/services/compact/timeBasedMCConfig.ts`: may refine compaction grouping thresholds.
- `src/utils/sessionStorage.ts`: very large file; targeted resume/compaction bugs could yield more exact rules if Codex starts implementing its own transcript loader.
- `src/tools/AgentTool/loadAgentsDir.ts` and agent frontmatter parsing: relevant only if Codex wants a richer custom-agent file format.
- A-only bundled `claude-api` docs skill: integrate only if the goal is a local API reference skill, not agent-core behavior.
