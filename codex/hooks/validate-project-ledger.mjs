import { promises as fs, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalPath, expandHome, parseLedger, readField } from "./project-ledger-lib.mjs";

const EXCEPTION_STATUSES = new Set(["accepted_risk", "deferred", "out_of_scope", "blocked_external"]);
const COMPLETION_SCHEMA = JSON.parse(
  readFileSync(new URL("./project-ledger-completion.schema.json", import.meta.url), "utf8"),
);

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateExceptionMetadata(item, prefix, errors) {
  if (!hasText(item.owner)) errors.push(`${prefix}.owner is required for an exception`);
  if (!hasText(item.reason)) errors.push(`${prefix}.reason is required for an exception`);
  if (!Array.isArray(item.evidence) || item.evidence.length === 0 || item.evidence.some((value) => !hasText(value))) {
    errors.push(`${prefix}.evidence must contain at least one evidence reference for an exception`);
  }
}

function schemaTypeMatches(value, type) {
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  return typeof value === type;
}

function validateSchemaNode(value, schema, prefix, errors) {
  if (Object.hasOwn(schema, "const") && value !== schema.const) {
    errors.push(`${prefix} must equal ${JSON.stringify(schema.const)}`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${prefix} is invalid`);
  }
  if (schema.type && !schemaTypeMatches(value, schema.type)) {
    errors.push(`${prefix} must be ${schema.type}`);
    return;
  }
  if (schema.type === "string" && schema.minLength && value.length < schema.minLength) {
    errors.push(`${prefix} must not be empty`);
  }
  if (schema.type === "array" && schema.items) {
    value.forEach((item, index) => validateSchemaNode(item, schema.items, `${prefix}[${index}]`, errors));
  }
  if (schema.type === "object") {
    const properties = schema.properties || {};
    for (const required of schema.required || []) {
      if (!Object.hasOwn(value, required)) errors.push(`${prefix}.${required} is required`);
    }
    for (const [key, child] of Object.entries(value)) {
      if (Object.hasOwn(properties, key)) {
        validateSchemaNode(child, properties[key], `${prefix}.${key}`, errors);
      } else if (schema.additionalProperties === false) {
        errors.push(`${prefix}.${key} is not allowed`);
      }
    }
  }
}

function validateUniqueIds(items, prefix, errors) {
  const seen = new Set();
  items.forEach((item, index) => {
    if (seen.has(item.id)) errors.push(`${prefix}[${index}].id duplicates ${JSON.stringify(item.id)}`);
    seen.add(item.id);
  });
}

export function validateCompletionContract(contract, expectedLedgerPath) {
  const errors = [];
  const blockers = [];
  validateSchemaNode(contract, COMPLETION_SCHEMA, "completion contract", errors);
  if (errors.length > 0) return { errors, blockers };

  if (path.resolve(contract.ledgerPath) !== path.resolve(expectedLedgerPath)) {
    errors.push("ledgerPath does not match the owning ledger");
  }

  validateUniqueIds(contract.findings, "findings", errors);
  validateUniqueIds(contract.requiredEvidence, "requiredEvidence", errors);
  validateUniqueIds(contract.preflights, "preflights", errors);

  if (Array.isArray(contract.findings)) {
    contract.findings.forEach((finding, index) => {
      const prefix = `findings[${index}]`;
      if (!hasText(finding?.id)) errors.push(`${prefix}.id is required`);
      if (!["P0", "P1", "P2", "P3"].includes(finding?.severity)) errors.push(`${prefix}.severity is invalid`);
      const validStatus = ["open", "resolved", ...EXCEPTION_STATUSES].includes(finding?.status);
      if (!validStatus) errors.push(`${prefix}.status is invalid`);
      if (typeof finding?.blockingCompletion !== "boolean") errors.push(`${prefix}.blockingCompletion must be boolean`);
      if (!Array.isArray(finding?.evidence)) errors.push(`${prefix}.evidence must be an array`);
      if (EXCEPTION_STATUSES.has(finding?.status)) validateExceptionMetadata(finding, prefix, errors);
      if (finding?.blockingCompletion === true && finding?.status !== "resolved") {
        blockers.push(`finding ${finding.id || index} is ${finding.status || "invalid"}`);
      }
    });
  }

  if (Array.isArray(contract.requiredEvidence)) {
    contract.requiredEvidence.forEach((item, index) => {
      const prefix = `requiredEvidence[${index}]`;
      if (!hasText(item?.id)) errors.push(`${prefix}.id is required`);
      if (!["missing", "present", "waived"].includes(item?.status)) errors.push(`${prefix}.status is invalid`);
      if (item?.status === "present" && !hasText(item?.artifact)) errors.push(`${prefix}.artifact is required when present`);
      if (item?.status === "waived") validateExceptionMetadata(item, prefix, errors);
      if (item?.status === "missing") blockers.push(`required evidence ${item.id || index} is missing`);
    });
  }

  if (Array.isArray(contract.preflights)) {
    contract.preflights.forEach((item, index) => {
      const prefix = `preflights[${index}]`;
      if (!hasText(item?.id)) errors.push(`${prefix}.id is required`);
      if (!["open", "resolved", "not_applicable", "waived"].includes(item?.status)) errors.push(`${prefix}.status is invalid`);
      if (item?.status === "waived") validateExceptionMetadata(item, prefix, errors);
      if (item?.status === "open") blockers.push(`preflight ${item.id || index} is open`);
    });
  }

  return { errors, blockers };
}

export async function evaluateLedgerCompletion(ledgerPath, scopeRoot = null) {
  let resolvedScopeRoot = scopeRoot;
  if (!resolvedScopeRoot) {
    const content = await fs.readFile(ledgerPath, "utf8");
    const repoPath = readField(content, "repo_path");
    if (!repoPath) return { errors: ["repo_path is missing from the ledger header"], blockers: [], ledger: null };
    resolvedScopeRoot = await canonicalPath(repoPath);
  }

  const ledger = await parseLedger(ledgerPath, resolvedScopeRoot);
  if (!ledger) return { errors: ["ledger header is invalid or belongs to another repository"], blockers: [], ledger: null };
  if (!ledger.completionContract) return { errors: ["completion_contract is missing from the ledger header"], blockers: [], ledger };

  let contract;
  try {
    contract = JSON.parse(await fs.readFile(ledger.completionContract, "utf8"));
  } catch (error) {
    return { errors: [`cannot read completion contract: ${error.message}`], blockers: [], ledger };
  }
  const result = validateCompletionContract(contract, ledger.filePath);
  return { ...result, ledger, contract };
}

async function main() {
  const ledgerIndex = process.argv.indexOf("--ledger");
  if (ledgerIndex === -1 || !process.argv[ledgerIndex + 1]) throw new Error("usage: validate-project-ledger.mjs --ledger <path>");
  const ledgerPath = path.resolve(expandHome(process.argv[ledgerIndex + 1]));
  const repoIndex = process.argv.indexOf("--repo");
  const scopeRoot = repoIndex === -1 || !process.argv[repoIndex + 1]
    ? null
    : await canonicalPath(process.argv[repoIndex + 1]);
  const result = await evaluateLedgerCompletion(ledgerPath, scopeRoot);
  const payload = { ledgerPath, errors: result.errors, blockers: result.blockers, valid: result.errors.length === 0 && result.blockers.length === 0 };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  if (!payload.valid) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
