# Verification contract

Use this method for code-changing slices and reviews of their evidence. Lite owns execution; Project persists the same plan/receipt; Review remains read-only. Domain references define which invariants matter. This file defines how to test them. Simple prose or formatting changes use a direct check and do not require a generated/mutation campaign.

## One evidence flow

1. Discover from the actual diff, static references/registrations and runtime observations. Do not start and end with an agent-authored consumer list. Reassess affected consumers and verification scope whenever the implementation changes shared elements, state, resources or lifecycle ownership; the task name and edit location do not bound the impact. For temporary behavior, verify that exiting, cancelling or handing back control preserves the existing consumers' contracts. Keep verification local when the actual change remains local.
2. Define the oracle independently of the implementation: requirement, authoritative contract, simple reference model, differential behavior, or metamorphic relation. A second agent is not itself an oracle. Describe why the expected result is not calculated by the code under test.
3. Select checks that cross the claimed boundary. Generated data/stateful sequences explore an invariant; preserve seed, sequence and minimized failure. Cross-layer claims need a real entrypoint through producer and consumers, not a collection of separate unit fixtures.
4. Challenge the checks: a healthy baseline passes, a deliberate behavioral mutation/fault reaches the target assertion and fails. Surviving or unapplied changes, syntax errors, missing dependencies and unrelated timeouts do not prove sensitivity. Equivalent mutations require analysis and replacement with a meaningful challenge, not an inflated score.
5. For performance claims, run controlled baseline/candidate probes serially with the same workload, metric, unit and environment. Keep raw repeated samples and predeclared absolute/relative budgets. Ordinary test duration, a screenshot, `runtime` labels and best-of-N results are insufficient.
6. Validate the receipt against the current source snapshot, then report the proven scope and limitations. A source/test change invalidates the prior receipt.

## Entrypoint shared by Lite and Project

The deployed scripts are under `~/.codex/skills/agent-core-lite/scripts/`:

```text
node verify-change.mjs discover --repo <scope-root> --output <external-control-dir>/discovery.json
node verify-change.mjs run --repo <scope-root> --plan <external-control-dir>/plan.json --output <external-control-dir>/receipt.json
node verify-change.mjs validate --repo <scope-root> --result <external-control-dir>/receipt.json
```

The canonical executable contract is `scripts/verification-contract.mjs`; the runner and completion evaluator import the same implementation. Do not reproduce its validation rules in another skill, schema adapter or version-specific validator.

Plan shape:

```json
{
  "version": 1,
  "discovery": "replace this string with the complete machine-generated discovery object",
  "coverage": [{"path":"src/consumer.mjs","checks":["ownership"]}],
  "checks": [{
    "id":"ownership", "kind":"property",
    "command":["node","tests/ownership-probe.mjs"],
    "invariants":["unrelated nodes cannot change ownership"],
    "oracle":{"basis":"reference","source":"docs/ownership-contract.md","reason":"Expected descendants are computed by an independent forward model."},
    "seeds":[1,17,99], "iterations":200,
    "challenges":[{"id":"wrong-owner","file":"src/owner.mjs","find":"an exact unique source fragment","replace":"a valid but behaviorally wrong fragment","assertion":"OWNERSHIP_INVARIANT"}]
  }],
  "limitations":["Record unresolved dynamic discovery and environment boundaries here."]
}
```

Adapt the example to the actual repo; placeholders are rejected. Command arrays use `shell:false`, so a shell pipeline must be an explicitly reviewed script/command. `${REPO}` in arguments resolves to the working root, including challenge copies. Commands must not embed absolute paths back to the live source under test. The runner is execution orchestration, not a permissions sandbox; tools and the user's existing authorization still govern side effects.

For a Git repository, scope-root must be its root; discovery records tracked/untracked non-ignored files and combines HEAD/current symbols so removed exports/files retain their callers. Without HEAD, the same runner captures all current candidates: Git's file inventory for an unborn repository, or the actual filesystem tree excluding Git metadata for a non-Git folder. The receipt has `head:null` and no historical-discovery claim; commands, traces, challenges and current-file integrity still use the same contract. No Git initialization or skip-verification flag is needed.

Keep ledger, sidecar, plan and receipt outside the source scope by default. Repo-local control artifacts are supported only when untracked and Git-ignored before discovery; the CLI permits outputs there, and completion applies the same placement check. Tracked controls must move outside the scope rather than be silently excluded from source hashes. Non-Git folders use external controls. Updating completion state then cannot invalidate its own snapshot.

Every discovered candidate must map to checks or a concrete exclusion reason. Textual performance/stateful hints require `riskDecisions:[{kind,checks,reason}]`; use an applicable check or concrete non-applicability reason. Text hints are not complete semantic discovery: use compiler/LSP references, registrations and runtime traces when material. Snapshot currently rejects symlinks, non-regular files and files above 32 MiB. Native tests can supplement evidence but cannot bypass these bounds or strict completion; such a scope stays unverified until a suitable supported adapter exists. Do not silently narrow the task's scope to obtain a pass.

The default trace adapter collects Node V8 executed-file coverage from the actual subprocess tree. A listed consumer that was not observed blocks the receipt. Executed-file coverage proves the module ran, not every branch or required side effect. Other languages may use `trace:"probe"` with a native coverage/trace adapter emitting `observedConsumers`; that is probe-reported evidence and must be reviewed against the actual producer. A hand-written array is not trace evidence.

Property/stateful probes read `VERIFICATION_SEED` and `VERIFICATION_ITERATIONS`, assert their invariants, and end with JSON containing `kind`, `seed`, `cases`. The runner checks these receipts; the test implementation must genuinely generate the cases. For Python use existing Hypothesis/native coverage; for JS/TS use existing generators or fast-check. Do not install a new framework when existing tests can express the property.

Sensitivity challenges run in separate copies of the captured source; they never patch the live source. The pristine control must first pass the same command/seed; the mutant starts from another clean copy so control artifacts cannot cause a false kill. Targets must use exact canonical snapshot paths and cannot alias the oracle. Each replacement must match exactly once. Shared failure classification rejects parse/import failures in either stdout or stderr. Copy isolation is not OS sandboxing. Ignored dependencies/build outputs are not copied: use a self-contained probe or a repo-native isolated test environment, and report unavailable prerequisites as unverified.

Performance checks use `kind:"performance"` and `performance:{baselineCommand,metric,unit,workload,repeats,maxValue,maxRatio}`. At least three serial baseline/candidate pairs must emit JSON `{metric,unit,workload,environment,samples}`. Samples are measurements in the named unit, not process startup time unless that is explicitly the target. The runner recomputes p95 and budget results and rejects missing or mismatched payloads. Record hardware, browser/process version, worker/queue state and contention controls in the probe's environment evidence. A matching environment string cannot prove there was no unrelated load; independently control and inspect it.

## Completion and review

Project completion references a passed receipt through `verification:{artifactBase,artifact,artifactSha256}` in the existing shared completion contract. Each behavioral requiredEvidence item links to real check IDs through `verificationChecks`; static-only checks cannot close behavioral evidence, and cross-boundary evidence needs integration/stateful/performance checks. Use a repo- or contract-relative path. Strict completion validates contents, links, aggregation and current source, not only the outer hash. CLI:

```text
node ~/.codex/hooks/validate-project-ledger.mjs --ledger <ledger> --require-evidence-policy --require-verification
```

The Stop hook applies the same check. Legacy completion records remain readable through non-strict CLI/resume; a newly completed slice must produce current evidence. Lite uses the same verification runner without creating a Project ledger merely to hold a receipt. Pure Review can run read-only checks and examine receipts but never starts mutation/deployment commands without implementation authorization.

When the same agent designs and implements a state machine covered by the async reference, a fresh reviewer must reconstruct at least one producer-to-consumer failure timeline before completion; this applies to Lite as well as Project. Independent review evaluates omitted consumers, oracle independence, mutation relevance, trace boundaries and representative load. It supplements real measurements and composed tests. Receipts are reproducible evidence, not cryptographic attestations of model honesty or proofs of arbitrary program semantics; a model can still choose an inadequate invariant or probe. Preserve that limit rather than adding a boolean claiming universal completeness.

Only relevant existing checks run. For a local predicate use a focused invariant and meaningful mutation; for ownership use generated graphs/permutations/non-interference; for recovery use operation sequences and fault boundaries; for UI cost use representative runtime probes. Quality is determined by the claim's evidence, not by checklist length or test count.
