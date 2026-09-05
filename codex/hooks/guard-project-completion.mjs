import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  findMatchingLedgers,
  projectDirectoryFor,
  readBoundedRegularFile,
  readHookInput,
} from "./project-ledger-lib.mjs";
import { evaluateLedgerCompletion } from "./validate-project-ledger.mjs";

function continueTurn(systemMessage = null) {
  process.stdout.write(JSON.stringify({
    continue: true,
    ...(systemMessage ? { systemMessage } : {}),
  }));
}

async function digestFile(filePath) {
  if (!filePath) return null;
  try {
    return createHash("sha256").update(await readBoundedRegularFile(filePath)).digest("hex");
  } catch {
    return null;
  }
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
  const boundLedger = boundLedgerPath
    ? ledgers.find((candidate) => path.resolve(candidate.filePath) === path.resolve(boundLedgerPath))
    : null;
  const missingBoundLedgerMessage = boundLedgerPath && !boundLedger
    ? `Project completion guard could not resolve the session-bound ledger: ${boundLedgerPath}`
    : null;
  const baseline = new Map(
    (Array.isArray(provenance.baselineLedgers) ? provenance.baselineLedgers : [])
      .filter((item) => item?.filePath)
      .map((item) => [path.resolve(item.filePath), item]),
  );
  const changedCompleteLedgers = (await Promise.all(ledgers.map(async (candidate) => {
    if (candidate.status !== "complete") return false;
    const previous = baseline.get(path.resolve(candidate.filePath));
    if (!previous || previous.status !== "complete" || previous.updatedAt !== candidate.updatedAt) {
      return candidate;
    }
    const contentSha256 = createHash("sha256").update(candidate.content).digest("hex");
    if (previous.contentSha256 !== contentSha256) return candidate;
    const completionContractSha256 = await digestFile(candidate.completionContract);
    return previous.completionContractSha256 !== completionContractSha256 ? candidate : null;
  }))).filter(Boolean);
  const ledgersToEvaluate = [
    ...new Map(
      [boundLedger, ...changedCompleteLedgers]
        .filter(Boolean)
        .map((candidate) => [path.resolve(candidate.filePath), candidate]),
    ).values(),
  ];
  if (ledgersToEvaluate.length === 0) {
    continueTurn(missingBoundLedgerMessage);
    return;
  }

  const invalidLedgers = [];
  for (const ledger of ledgersToEvaluate) {
    if (ledger.status !== "complete") continue;
    const result = await evaluateLedgerCompletion(ledger.filePath, scopeRoot, { requireEvidencePolicy: true, requireVerification: true });
    if (result.errors.length === 0 && result.blockers.length === 0) continue;

    const details = [...result.errors, ...result.blockers].slice(0, 6).join("; ");
    invalidLedgers.push({ filePath: ledger.filePath, details });
  }

  if (invalidLedgers.length > 0) {
    const summary = invalidLedgers
      .map(({ filePath, details }) => `${filePath}: ${details}`)
      .join(" | ");
    process.stdout.write(JSON.stringify({
      decision: "block",
      reason: `${invalidLedgers.length} project ledger(s) were marked complete without satisfying their structured completion contracts: ${summary}. Restore project_status to active or resolve/waive the recorded items with evidence.`,
    }));
    return;
  }

  continueTurn(missingBoundLedgerMessage);
}

main().catch((error) => {
  continueTurn(
    `Project completion guard failed open: ${error instanceof Error ? error.message : String(error)}`,
  );
});
