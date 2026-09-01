import { promises as fs } from "node:fs";
import path from "node:path";
import { findMatchingLedgers, projectDirectoryFor, readHookInput } from "./project-ledger-lib.mjs";
import { evaluateLedgerCompletion } from "./validate-project-ledger.mjs";

function continueTurn(systemMessage = null) {
  process.stdout.write(JSON.stringify({
    continue: true,
    ...(systemMessage ? { systemMessage } : {}),
  }));
}

async function main() {
  const input = await readHookInput();
  if (input.stop_hook_active === true) {
    continueTurn();
    return;
  }

  const { scopeRoot, ledgers } = await findMatchingLedgers(input.cwd || process.cwd());
  const sessionId = String(input.session_id || "").replace(/[^A-Za-z0-9._-]+/g, "-");
  if (!sessionId) {
    continueTurn();
    return;
  }

  const provenancePath = path.join(projectDirectoryFor(scopeRoot), "sessions", `${sessionId}.json`);
  let provenance;
  try {
    provenance = JSON.parse(await fs.readFile(provenancePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      continueTurn();
      return;
    }
    throw new Error(`cannot read session provenance ${provenancePath}: ${error.message}`);
  }

  const boundLedgerPath = provenance.ledgerPath
    || [...(Array.isArray(provenance.events) ? provenance.events : [])]
      .reverse()
      .find((event) => event?.ledgerPath)?.ledgerPath;
  const ledger = boundLedgerPath
    ? ledgers.find((candidate) => path.resolve(candidate.filePath) === path.resolve(boundLedgerPath))
    : null;
  if (boundLedgerPath && !ledger) {
    continueTurn(`Project completion guard could not resolve the session-bound ledger: ${boundLedgerPath}`);
    return;
  }
  if (!ledger || ledger.status !== "complete" || !ledger.completionContract) {
    continueTurn();
    return;
  }

  const result = await evaluateLedgerCompletion(ledger.filePath, scopeRoot);
  if (result.errors.length === 0 && result.blockers.length === 0) {
    continueTurn();
    return;
  }

  const details = [...result.errors, ...result.blockers].slice(0, 6).join("; ");
  process.stdout.write(JSON.stringify({
    decision: "block",
    reason: `Project ledger ${ledger.filePath} was marked complete but its structured completion contract is not satisfied: ${details}. Restore project_status to active or resolve/waive the recorded items with evidence.`,
  }));
}

main().catch((error) => {
  continueTurn(
    `Project completion guard failed open: ${error instanceof Error ? error.message : String(error)}`,
  );
});
