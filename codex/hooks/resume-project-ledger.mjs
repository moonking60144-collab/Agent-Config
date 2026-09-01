import { findNewestMatchingLedger, readHookInput } from "./project-ledger-lib.mjs";

async function main() {
  const input = await readHookInput();
  const ledger = await findNewestMatchingLedger(input.cwd || process.cwd(), [
    "active",
    "blocked",
    "pending",
    "in_progress",
  ]);
  if (!ledger) return;

  const context = [
    `Unfinished project ledger detected: ${ledger.filePath}.`,
    "Read this ledger first and treat it as the durable source of truth.",
    "Skip tasks marked done_verified, preserve eliminated hypotheses, and restore the active task's consumer matrix before acting.",
    ledger.planPath ? `The recorded plan is ${ledger.planPath}; read it only when the ledger points to missing scope or task detail.` : null,
    ledger.completionContract ? `The structured completion contract is ${ledger.completionContract}; keep it aligned with blockers and required evidence.` : null,
    ledger.nextInstruction ? `Recorded next instruction: ${ledger.nextInstruction}` : null,
  ].filter(Boolean).join(" ");

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
