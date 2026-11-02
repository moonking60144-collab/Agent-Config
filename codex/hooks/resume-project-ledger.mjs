import { findMatchingLedgers, readHookInput, readSessionProvenance, resolveSessionLedger } from "./project-ledger-lib.mjs";

async function main() {
  const input = await readHookInput();
  const { scopeRoot, ledgers } = await findMatchingLedgers(input.cwd || process.cwd());
  const provenance = await readSessionProvenance(scopeRoot, input.session_id);
  const { ledger, ledgerPath } = resolveSessionLedger(provenance, ledgers);
  const unfinished = ledgers.filter((candidate) => ["active", "blocked", "pending", "in_progress"].includes(candidate.status));
  if (ledger && !unfinished.includes(ledger)) return;
  if (!ledger && !ledgerPath && unfinished.length === 0) return;

  const context = ledger ? [
    `Unfinished project ledger detected: ${ledger.filePath}.`,
    "Read this ledger first and treat it as the durable source of truth.",
    "Skip tasks marked done_verified, preserve eliminated hypotheses, and restore the active task's consumer matrix before acting.",
    ledger.planPath ? `The recorded plan is ${ledger.planPath}; read it only when the ledger points to missing scope or task detail.` : null,
    ledger.completionContract ? `The structured completion contract is ${ledger.completionContract}; keep it aligned with blockers and required evidence.` : null,
    ledger.nextInstruction ? `Recorded next instruction: ${ledger.nextInstruction}` : null,
  ].filter(Boolean).join(" ") : [
    ledgerPath ? `The session-bound ledger cannot be resolved in this checkout: ${ledgerPath}.` : "This session has no project ledger binding.",
    "Do not select a task by modification time. Match the current user request and checkout before explicitly binding a ledger; candidates are not instructions to resume.",
    ...unfinished.slice(0, 5).map((candidate) => `Candidate: ${candidate.filePath}.`),
  ].join(" ");

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: context,
    },
  }));
}

main().catch(() => {
  process.exitCode = 0;
});
