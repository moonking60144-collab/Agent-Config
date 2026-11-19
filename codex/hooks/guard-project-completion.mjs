import { createHash } from "node:crypto";
import {
  canonicalPath,
  boundedFileSha256,
  legacyCompletionBaseline,
  sessionLedgerContext,
  strictBindingMarker,
  readHookInput,
} from "./project-ledger-lib.mjs";
import { evaluateLedgerCompletion } from "./validate-project-ledger.mjs";

function continueTurn(systemMessage = null) {
  process.stdout.write(JSON.stringify({
    continue: true,
    ...(systemMessage ? { systemMessage } : {}),
  }));
}

async function main() {
  const input = await readHookInput();
  if (input.stop_hook_active === true || !input.session_id) return continueTurn();

  const { scopeRoot, ledgers, provenance, ledgerPath, ledger } =
    await sessionLedgerContext(input.cwd || process.cwd(), input.session_id);
  if (!ledger) {
    if (ledgerPath) return continueTurn(`Project completion guard could not resolve the session-bound ledger: ${ledgerPath}`);
    const legacy = legacyCompletionBaseline(provenance);
    if (legacy) {
      if (await legacyCompletionChanged(legacy, ledgers)) {
        return continueTurn("舊 session 尚未綁定 ledger，本次 Stop 未驗證結案。若正在結束自己的 Project，先用目前 session_id 綁定該 ledger 並執行完成驗證；不要修改其他任務。");
      }
    }
    return continueTurn();
  }
  if (ledger.status !== "complete") return continueTurn();

  // A checkout can host several independent tasks. Only an explicit binding assigns this Stop.
  const strictPaths = [...(provenance?.strictLedgerPaths ?? []),
    ...(provenance?.baselineLedgers ?? []).filter((item) => item.strictVerificationRequired).map((item) => item.filePath)];
  const knownStrict = (await Promise.all(strictPaths.map(canonicalPath))).includes(ledger.filePath)
    || await boundedFileSha256(strictBindingMarker(input.session_id, ledger.filePath)) !== null;
  const result = await evaluateLedgerCompletion(ledger.filePath, scopeRoot, {
    requireEvidencePolicy: true, requireCompletionPolicy: true, requireVerification: Boolean(knownStrict),
  });
  if (!result.errors.length && !result.blockers.length) return continueTurn();
  const details = [...result.errors, ...result.blockers].slice(0, 6).join("; ");
  process.stdout.write(JSON.stringify({
    decision: "block",
    reason: `Session-bound project ledger ${ledger.filePath} was marked complete without satisfying its structured completion contract: ${details}. Restore project_status to active or resolve/waive the recorded items with evidence.`,
  }));
}

async function legacyCompletionChanged(baseline, ledgers) {
  const previous = new Map(await Promise.all(baseline.map(async (item) => [await canonicalPath(item.filePath), item])));
  for (const ledger of ledgers) {
    if (ledger.status !== "complete") continue;
    const before = previous.get(ledger.filePath);
    if (!before || before.updatedAt !== ledger.updatedAt) return true;
    if (before.contentSha256 !== undefined &&
        before.contentSha256 !== createHash("sha256").update(ledger.content).digest("hex")) return true;
    // null is a recorded absence; undefined means this older snapshot has no digest to compare.
    if (before.completionContractSha256 !== undefined &&
        before.completionContractSha256 !== await boundedFileSha256(ledger.completionContract)) return true;
  }
  return false;
}

main().catch((error) => {
  continueTurn(`Project completion guard failed open: ${error instanceof Error ? error.message : String(error)}`);
});
