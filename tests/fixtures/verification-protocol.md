# Verification protocol acceptance and retirement

This is the independent acceptance contract for the verification integration, not a second implementation checklist.

## Failure lineage

The previous completion contract could prove artifact presence/hash and evidence labels but not that tests exercised discovered callers or could reject wrong behavior. The preceding v3 repair also demonstrated why common evidence rules must be shared rather than copied between versions. These are incident-lineage cases, not evidence of autonomous discovery of arbitrary business bugs.

## Executable acceptance

- Hidden sibling consumers and callers of removed exports/files are discovered from source history/references; an unexplained omission fails.
- Actual subprocess tracing distinguishes helper-only execution from a production consumer path.
- Ancestry is checked against independent descendant closure, including generated trees, unrelated-node invariance and mutable add/move operation sequences with replayable seeds.
- Healthy originals and pristine isolated controls pass; a behaviorally wrong implementation fails the intended assertion. Equivalent mutants, syntax/import errors, unapplied patches and control-created cache failures cannot count as killed regressions.
- Captured command status/output hashes, generated-case observations, measurement samples and current source must agree with the receipt. Missing, stale or relabeled data fails.
- Performance probes take repeated serial measurements and enforce predeclared absolute/relative budgets. A deliberately slower candidate fails; an explicitly generous budget passes. No business-application performance claim follows from this fixture.
- Both v2 and v3 actual Stop entrypoints accept real current receipts and reject missing, fabricated, static-only or stale receipts for behavioral claims.
- Reporter parse/import failures on stdout cannot be mutation kills, even when the expected marker is printed; valid assertion failures remain accepted. Mutation targets must be canonical snapshot files, not aliases of the oracle.
- Both v2/v3 complete with ignored/untracked repo-local controls through the real runner CLI; tracked control outputs are rejected before writing. Normal source changes still invalidate evidence.
- Non-Git and unborn Git workspaces use actual current-file inventory and the same checks/receipt/Stop contract. Added source files invalidate proof; no-HEAD scopes do not get a missing-receipt exemption.

`tests/verification-pipeline.test.mjs` owns runner/contract acceptance. `tests/project-ledger-hooks.test.mjs` owns real CLI/Stop composition. Their expectations are not calculated by the implementation being tested.

## False-positive boundaries and limits

- Simple prose/formatting changes do not require property or mutation campaigns; Lite does not need a Project ledger.
- Pure Review has no new write/deploy authorization.
- Legacy non-strict completion inspection remains available; newly completed Project work requires current proof.
- Text search is not complete semantic discovery. Node executed-file coverage is not branch or effect coverage. Native adapters, representative business fixtures and independent oracle review remain necessary.
- Isolated copies omit ignored dependencies and are not OS sandboxes. Environment failures remain unverified, not successful detection.
- Native current-file snapshots do not claim historical caller discovery. Non-Git control artifacts remain external; symlink/large-file bounds are not bypassed by native tests.
- A structured receipt is reproducible evidence, not a signed execution attestation. Semantic adequacy cannot be established solely by check labels or another model's approval.

## Consolidation and retirement

| Prior owner / duplicate | Current single owner | Preserved responsibility |
|---|---|---|
| Lite Gates, Quality Gates, Before Final lists | verification reference + executable contract | Lite execution and authority |
| Project duplicated verification inventory | same plan/receipt; ledger references it | durable progress, completion, remote policy |
| Review duplicated evidence method | same verification method | read-only mode, severity and findings |
| async evidence-class/replay checklist | shared verification; repo-local incident governance | outcome taxonomy, recovery ordering, failure timeline and fresh state-machine reviewer |
| performance generic measurement checklist | shared verification | UI geometry, contention and acceptance targets |
| frontend duplicated Phase 0.75/4.5 criteria | product-design-integration reference | design brief, fidelity and visual QA |

Do not restore removed prompts as fallback duplicates. When a repo-native checker provides stronger verified evidence for a target, adapt the existing receipt boundary rather than introduce another gate. Retire this runner's adapters when an existing maintained native pipeline fully replaces their observable behavior; retain the positive/negative acceptance cases at that boundary.
