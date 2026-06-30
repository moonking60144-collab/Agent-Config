# TypeScript Agent Core Template

This template is a global Codex asset for building a project-owned agent runtime. Do not copy it into a repo unless the user explicitly asks for a runtime implementation there.

## Shape

- `AgentEngine` runs deterministic lifecycle ticks.
- `QueryConfig` is immutable for a session.
- `TickContext` is mutable only through lifecycle transitions.
- `ToolDefinition` declares schema, permissions, safety metadata, timeout, and result normalization.
- `ToolRunner` partitions ordered batches: only consecutive safe read-only tools run in parallel, while mutating tools preserve original sequence.
- `ErrorClassifier` retries only transient failures.
- `ContextCompactor` trims tool output before summary compaction.
- Hook support, if added, must use typed lifecycle events with explicit timeout, blocking, and output-routing semantics.
- Resume support, if added, must persist append-only transcripts with compact boundaries and resume-safe metadata.

## Minimal Files

```text
src/agent-core/
  core.ts
  index.ts
tests/agent-core/
  agentCore.test.ts
```

Split `core.ts` into separate modules only after the target repo has real usage or tests that justify the separation.

## Implementation Notes

- Keep adapters for model providers, shell execution, file IO, and UI outside the core.
- Treat unknown tools as mutating, non-concurrency-safe, and permission-required.
- Preserve ordered transcript integration even when tools execute concurrently.
- Convert unknown tools, input parse failures, and deterministic tool setup failures into standard tool results instead of throwing out of the batch.
- Convert tool timeout, request timeout, and stream idle timeout into explicit timeout errors before retry classification.
- Store oversized outputs outside the prompt and pass model-visible previews.
- After successful compaction, reset caches and tracking state invalidated by compact boundaries while preserving active skill content and the user's current objective.
- Keep compact summaries linked to the full transcript path, and preserve enough message identity metadata for resume reconstruction.
- Stop after 3 consecutive same-class retry or compaction failures.
