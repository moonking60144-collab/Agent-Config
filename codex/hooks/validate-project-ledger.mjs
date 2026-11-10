import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { constants as fsConstants, createReadStream, promises as fs, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateReceipt, validateEvidenceLinks, digest, MAX_RECEIPT_BYTES } from "../skills/agent-core-lite/scripts/verification-contract.mjs";
import { snapshot, validateControlArtifact, gitEnvForRepo } from "../skills/agent-core-lite/scripts/verify-change.mjs";
import {
  canonicalPath,
  expandHome,
  MAX_COMPLETION_CONTRACT_BYTES,
  parseLedger,
  readBoundedRegularFile,
  readField,
} from "./project-ledger-lib.mjs";

const EXCEPTION_STATUSES = new Set(["accepted_risk", "deferred", "out_of_scope", "blocked_external"]);
const MAX_EVIDENCE_ARTIFACT_BYTES = 5 * 1024 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const GIT_REVISION_PATTERN = /^[a-f0-9]{40,64}$/;
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
    if (Number.isInteger(schema.maxItems) && value.length > schema.maxItems) {
      errors.push(`${prefix} must contain no more than ${schema.maxItems} items`);
    }
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

function inspectGitContext(scopeRoot) {
  const head = spawnSync("git", ["-C", scopeRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    env: gitEnvForRepo(),
  });
  if (head.error || head.status !== 0) return { hasRemote: false, currentRevision: null, error: null };

  const remotes = spawnSync("git", ["-C", scopeRoot, "remote"], {
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    env: gitEnvForRepo(),
  });
  if (remotes.error || remotes.status !== 0) {
    return {
      hasRemote: true,
      currentRevision: head.stdout.trim().toLowerCase(),
      error: `cannot inspect git remotes: ${(remotes.stderr || remotes.error?.message || "unknown error").trim()}`,
    };
  }

  return {
    hasRemote: remotes.stdout.split(/\r?\n/).some((value) => value.trim()),
    currentRevision: head.stdout.trim().toLowerCase(),
    error: null,
  };
}

function deriveRemoteCheckStatus(checks) {
  const required = checks.filter((item) => item.required === true);
  if (required.length === 0) return "unknown";
  if (required.some((item) => item.status === "failed")) return "failed";
  if (required.some((item) => item.status === "unknown")) return "unknown";
  if (required.some((item) => item.status === "pending")) return "pending";
  return required.every((item) => item.status === "passed") ? "passed" : "unknown";
}

function validateRemoteChecks(contract, errors, blockers, options) {
  const remote = contract.remoteChecks;
  const requiredByPolicy = options.requireRemoteChecks === true || contract.schemaVersion >= 3;
  if (requiredByPolicy && contract.schemaVersion < 3) {
    errors.push("remote validation completion requires schemaVersion 3");
  }
  if (!remote) {
    if (requiredByPolicy) errors.push("remoteChecks is required for current completion policy");
    return;
  }
  if (contract.schemaVersion < 3) {
    errors.push("remoteChecks requires schemaVersion 3");
    return;
  }

  if (remote.applicable === false) {
    if (remote.status !== "not_applicable") errors.push("remoteChecks.status must be not_applicable when applicable is false");
    if (!hasText(remote.reason)) errors.push("remoteChecks.reason is required when remote validation is not applicable");
    if (remote.checks.length > 0) errors.push("remoteChecks.checks must be empty when remote validation is not applicable");
    return;
  }

  if (remote.applicable !== true) return;
  for (const field of ["provider", "repository", "ref", "revision", "policySource", "checkedAt"]) {
    if (!hasText(remote[field])) errors.push(`remoteChecks.${field} is required when remote validation applies`);
  }
  if (hasText(remote.revision) && !GIT_REVISION_PATTERN.test(remote.revision)) {
    errors.push("remoteChecks.revision must be a lowercase full Git SHA");
  }
  if (hasText(remote.policyFingerprint) && !SHA256_PATTERN.test(remote.policyFingerprint)) {
    errors.push("remoteChecks.policyFingerprint must be a lowercase SHA-256 digest");
  }
  if (hasText(remote.checkedAt) && Number.isNaN(Date.parse(remote.checkedAt))) {
    errors.push("remoteChecks.checkedAt must be an ISO-8601 timestamp");
  }
  if (remote.status === "not_applicable") {
    errors.push("remoteChecks.status cannot be not_applicable when remote validation applies");
  }

  const names = new Set();
  remote.checks.forEach((item, index) => {
    if (names.has(item.name)) errors.push(`remoteChecks.checks[${index}].name duplicates ${JSON.stringify(item.name)}`);
    names.add(item.name);
  });
  const requiredChecks = remote.checks.filter((item) => item.required === true);
  if (remote.checks.length > 0) {
    const derived = deriveRemoteCheckStatus(remote.checks);
    if (remote.status !== derived) {
      errors.push(`remoteChecks.status ${remote.status} does not match required-check aggregate ${derived}`);
    }
  }
  if (remote.status === "passed") {
    if (requiredChecks.length === 0) errors.push("remoteChecks passed requires at least one identified required check");
    if (!hasText(remote.evidenceUrl)) errors.push("remoteChecks.evidenceUrl is required when remote checks passed");
  }
  if (remote.status === "failed") {
    if (!requiredChecks.some((item) => item.status === "failed")) {
      errors.push("remoteChecks failed requires an identified failed required check");
    }
    if (!hasText(remote.evidenceUrl)) errors.push("remoteChecks.evidenceUrl is required when remote checks failed");
  }
  if (remote.status === "unknown" && !hasText(remote.reason)) {
    errors.push("remoteChecks.reason is required when remote-check state is unknown");
  }
  if (
    hasText(options.currentRevision) &&
    hasText(remote.revision) &&
    remote.revision !== options.currentRevision.toLowerCase()
  ) {
    blockers.push(`remote checks revision ${remote.revision} is stale; current revision is ${options.currentRevision.toLowerCase()}`);
  }
  if (["pending", "failed", "unknown"].includes(remote.status)) {
    blockers.push(`remote checks for revision ${remote.revision || "unknown"} are ${remote.status}`);
  }
}

function validateEvidencePolicy(contract, errors, { requireEvidencePolicy = false } = {}) {
  const usesEvidencePolicyFields = contract.requiredEvidence.some((item) =>
    ["claim", "claimScope", "evidenceClass", "artifactBase", "artifactSha256"].some((field) => Object.hasOwn(item, field))
  );
  if (requireEvidencePolicy && contract.schemaVersion < 2) {
    errors.push("current Stop completion requires schemaVersion 2 or newer evidence contract");
    return;
  }
  const policyApplies = contract.schemaVersion >= 2 || contract.evidencePolicyVersion === 1 || usesEvidencePolicyFields;
  if (!policyApplies) return;
  if (contract.evidencePolicyVersion !== 1) {
    errors.push("evidencePolicyVersion must be 1 when evidence policy fields are present");
  }

  const crossBoundaryClaims = contract.requiredEvidence.filter((item) => item.claimScope === "cross-boundary");
  for (const [index, item] of contract.requiredEvidence.entries()) {
    const prefix = `requiredEvidence[${index}]`;
    if (!hasText(item.claim)) errors.push(`${prefix}.claim is required by evidence policy v1`);
    if (!hasText(item.claimScope)) errors.push(`${prefix}.claimScope is required by evidence policy v1`);
    if (!hasText(item.evidenceClass)) errors.push(`${prefix}.evidenceClass is required by evidence policy v1`);
    if (item.claimScope === "static" || item.evidenceClass === "static") {
      if (contract.schemaVersion !== 4 || item.claimScope !== "static" || item.evidenceClass !== "static") {
        errors.push(`${prefix} static evidence requires schemaVersion 4 and matching static scope/class`);
      }
      if (item.status === "waived") errors.push(`${prefix} required static evidence cannot be waived`);
    }
    if (
      item.claimScope === "cross-boundary" &&
      !["composed", "runtime", "production"].includes(item.evidenceClass)
    ) {
      errors.push(`${prefix} cross-boundary claim requires composed, runtime, or production evidence`);
    }
    if (["local", "cross-boundary"].includes(item.claimScope) && item.status === "waived") {
      errors.push(`${prefix} behavioral evidence cannot be waived`);
    }
    if (
      item.claimScope === "review" &&
      item.evidenceClass !== "independent-review"
    ) {
      errors.push(`${prefix} review claim requires independent-review evidence`);
    }
    if (item.evidenceClass === "independent-review" && item.claimScope !== "review") {
      errors.push(`${prefix} independent-review evidence can only satisfy a review claim`);
    }
    if (contract.schemaVersion >= 2 && item.status === "present") {
      if (!hasText(item.artifactBase)) errors.push(`${prefix}.artifactBase is required by schemaVersion 2 or newer`);
      if (!hasText(item.artifactSha256)) {
        errors.push(`${prefix}.artifactSha256 is required by schemaVersion 2 or newer`);
      } else if (!SHA256_PATTERN.test(item.artifactSha256)) {
        errors.push(`${prefix}.artifactSha256 must be a lowercase SHA-256 digest`);
      }
    }
  }

  const native = contract.schemaVersion === 4 && contract.verificationPolicy?.mode === "native";
  if (!contract.requiredEvidence.some((item) => item.status === "present" &&
    (native ? ["local", "cross-boundary", "static"] : ["local", "cross-boundary"]).includes(item.claimScope))) {
    errors.push("evidence policy v1 requires at least one present behavioral claim");
  }
  if (
    crossBoundaryClaims.length > 0 && !contract.requiredEvidence.some(
      (item) =>
        item.status === "present" &&
        item.claimScope === "cross-boundary" &&
        ["composed", "runtime", "production"].includes(item.evidenceClass)
    )
  ) {
    errors.push(
      "evidence policy v1 requires present composed, runtime, or production evidence for a cross-boundary claim"
    );
  }
  if (
    crossBoundaryClaims.length > 0 && !contract.requiredEvidence.some(
      (item) =>
        item.claimScope === "review" &&
        item.evidenceClass === "independent-review" &&
        (item.status === "present" || item.status === "waived")
    )
  ) {
    errors.push("evidence policy v1 requires independent review evidence or an explicit waiver");
  }
  if (
    contract.preflights.some((item) => item.scope === "cross-boundary" && item.status !== "not_applicable") &&
    crossBoundaryClaims.length === 0
  ) {
    errors.push("cross-boundary preflight requires at least one cross-boundary evidence claim");
  }
}

export function validateCompletionContract(contract, expectedLedgerPath, options = {}) {
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
  validateEvidencePolicy(contract, errors, options);
  validateVerificationPolicy(contract, errors, options);
  validateRemoteChecks(contract, errors, blockers, options);

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
      if (contract.schemaVersion >= 2 && !hasText(item?.scope)) errors.push(`${prefix}.scope is required by schemaVersion 2 or newer`);
      if (!["open", "resolved", "not_applicable", "waived"].includes(item?.status)) errors.push(`${prefix}.status is invalid`);
      if (item?.status === "waived") validateExceptionMetadata(item, prefix, errors);
      if (item?.status === "open") blockers.push(`preflight ${item.id || index} is open`);
    });
  }

  return { errors, blockers };
}

function escapesDeclaredBase(basePath, candidatePath) {
  const relativePath = path.relative(basePath, candidatePath);
  return !relativePath || relativePath === ".." || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath);
}

function validateVerificationPolicy(contract, errors, options) {
  const policy = contract.verificationPolicy;
  if (contract.schemaVersion !== 4) {
    if (policy || contract.nativeVerification) errors.push("verificationPolicy/nativeVerification requires schemaVersion 4");
    return;
  }
  if (!policy) { errors.push("schemaVersion 4 requires verificationPolicy"); return; }
  if (!hasText(policy.reason)) errors.push("verificationPolicy.reason must explain the selected risk tier");
  if (policy.mode === "strict") {
    if (contract.nativeVerification) errors.push("strict completion must use the shared receipt, not nativeVerification");
    return;
  }
  if (options.requireVerification || policy.strictTriggers.length > 0) errors.push("native verification conflicts with a required strict contract");
  if (contract.verification) errors.push("native completion must not relabel a shared receipt");
  if (!contract.nativeVerification) { errors.push("native completion requires nativeVerification"); return; }
  const { sourceInputs, checks } = contract.nativeVerification;
  if (!sourceInputs.length || !checks.length) errors.push("nativeVerification requires sourceInputs and executed checks");
  const paths = new Set();
  for (const item of sourceInputs) {
    if (!hasText(item.path) || path.isAbsolute(item.path) || item.path.includes("\\") ||
      item.path !== path.posix.normalize(item.path) || [".", ".."].includes(item.path) || item.path.startsWith("../") || item.path.includes(":")) {
      errors.push("native sourceInputs require canonical repo-relative paths");
    }
    const key = process.platform === "win32" ? item.path.toLowerCase() : item.path;
    if (paths.has(key)) errors.push(`duplicate native source input: ${item.path}`);
    paths.add(key);
    if (item.state === "present" && !SHA256_PATTERN.test(item.sha256 || "")) errors.push(`native source input requires SHA-256: ${item.path}`);
    if (item.state === "absent" && item.sha256 !== undefined) errors.push(`absent native input must not have a digest: ${item.path}`);
  }
  const checked = new Set();
  for (const check of checks) {
    if (!hasText(check.evidenceId) || checked.has(check.evidenceId)) errors.push("native checks require unique evidenceId values");
    checked.add(check.evidenceId);
    const evidence = contract.requiredEvidence.find((item) => item.id === check.evidenceId);
    if (!evidence || evidence.status !== "present" || evidence.claimScope === "review") errors.push("native check must link present non-review evidence");
    if (!check.command.length || check.command.some((arg) => !hasText(arg))) errors.push("native check command must not be blank");
    if (!hasText(check.cwd) || path.isAbsolute(check.cwd) || check.cwd.includes("\\") || check.cwd.includes(":") ||
      check.cwd !== path.posix.normalize(check.cwd) || check.cwd === ".." || check.cwd.startsWith("../")) errors.push("native check cwd must be repo-relative");
    if (!hasText(check.checkedAt) || Number.isNaN(Date.parse(check.checkedAt))) errors.push("native check checkedAt must be a timestamp");
  }
  for (const item of contract.requiredEvidence) {
    if (item.status === "present" && item.claimScope !== "review" && !checked.has(item.id)) errors.push(`native evidence lacks an executed check: ${item.id}`);
  }
}

async function verifyNativeInputs(contract, scopeRoot) {
  const errors = [];
  const base = await fs.realpath(scopeRoot);
  for (const input of contract.nativeVerification.sourceInputs) {
    const target = path.resolve(base, input.path);
    try {
      // Validate existing ancestors as well, so an absent leaf cannot escape through a symlink.
      let ancestor = target;
      while (true) {
        try {
          const real = await fs.realpath(ancestor);
          if (real !== base && escapesDeclaredBase(base, real)) throw new Error("resolves outside source scope");
          break;
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
          ancestor = path.dirname(ancestor);
        }
      }
      let stat;
      try { stat = await fs.lstat(target); } catch (error) { if (error.code !== "ENOENT") throw error; }
      if (input.state === "absent") {
        if (stat) errors.push(`native source input is stale (expected absent): ${input.path}`);
        continue;
      }
      if (!stat?.isFile() || stat.isSymbolicLink()) throw new Error("must be a present regular file");
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(target)) hash.update(chunk);
      if (hash.digest("hex") !== input.sha256) errors.push(`native source input is stale: ${input.path}`);
    } catch (error) { errors.push(`native source input ${input.path}: ${error.message}`); }
  }
  for (const check of contract.nativeVerification.checks) {
    try {
      const cwd = await fs.realpath(path.resolve(base, check.cwd));
      if (cwd !== base && escapesDeclaredBase(base, cwd)) throw new Error("outside source scope");
      if (!(await fs.stat(cwd)).isDirectory()) throw new Error("not a directory");
    } catch (error) { errors.push(`native check cwd ${check.cwd}: ${error.message}`); }
  }
  return errors;
}

const MAX_EVIDENCE_MANIFEST_ITEMS = 128;
const MAX_EVIDENCE_MANIFEST_BYTES = 16 * 1024 * 1024;

async function verifyEvidenceArtifacts(contract, contractPath, scopeRoot) {
  if (contract.schemaVersion < 2) return [];
  const errors = [];
  if (contract.requiredEvidence.length > MAX_EVIDENCE_MANIFEST_ITEMS) {
    return [`requiredEvidence exceeds the ${MAX_EVIDENCE_MANIFEST_ITEMS}-item manifest limit`];
  }
  const digestCache = new Map();
  let verifiedArtifactBytes = 0;
  for (const [index, item] of contract.requiredEvidence.entries()) {
    if (item.status !== "present") continue;
    const prefix = `requiredEvidence[${index}]`;
    if (!hasText(item.artifact) || !hasText(item.artifactBase) || !SHA256_PATTERN.test(item.artifactSha256 || "")) continue;
    if (path.isAbsolute(item.artifact) || /^~(?:[\\/]|$)/.test(item.artifact)) {
      errors.push(`${prefix}.artifact must be relative to its declared base`);
      continue;
    }
    const basePath = item.artifactBase === "contract" ? path.dirname(contractPath) : scopeRoot;
    const artifactPath = path.resolve(basePath, item.artifact);
    if (escapesDeclaredBase(basePath, artifactPath)) {
      errors.push(`${prefix}.artifact escapes or does not name a file below its declared base`);
      continue;
    }
    try {
      const [realBase, realArtifact] = await Promise.all([fs.realpath(basePath), fs.realpath(artifactPath)]);
      if (escapesDeclaredBase(realBase, realArtifact)) {
        errors.push(`${prefix}.artifact resolves outside its declared base`);
        continue;
      }
      const cachedDigest = digestCache.get(realArtifact);
      if (cachedDigest) {
        if (cachedDigest !== item.artifactSha256) {
          errors.push(`${prefix}.artifactSha256 does not match ${item.artifact}`);
        }
        continue;
      }
      const handle = await fs.open(realArtifact, fsConstants.O_RDONLY | fsConstants.O_NONBLOCK);
      try {
        const artifactStat = await handle.stat();
        if (!artifactStat.isFile()) {
          errors.push(`${prefix}.artifact must resolve to a regular file`);
          continue;
        }
        if (artifactStat.size > MAX_EVIDENCE_ARTIFACT_BYTES) {
          errors.push(`${prefix}.artifact exceeds the ${MAX_EVIDENCE_ARTIFACT_BYTES}-byte limit`);
          continue;
        }
        if (verifiedArtifactBytes + artifactStat.size > MAX_EVIDENCE_MANIFEST_BYTES) {
          errors.push(`requiredEvidence artifacts exceed the ${MAX_EVIDENCE_MANIFEST_BYTES}-byte manifest limit`);
          break;
        }
        verifiedArtifactBytes += artifactStat.size;
        const content = await handle.readFile();
        const digest = createHash("sha256").update(content).digest("hex");
        digestCache.set(realArtifact, digest);
        if (digest !== item.artifactSha256) errors.push(`${prefix}.artifactSha256 does not match ${item.artifact}`);
      } finally {
        await handle.close();
      }
    } catch (error) {
      errors.push(`${prefix}.artifact cannot be verified: ${error.message}`);
    }
  }
  return errors;
}

export async function evaluateLedgerCompletion(ledgerPath, scopeRoot = null, options = {}) {
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

  const extension = path.extname(ledger.filePath);
  const expectedContractPath = path.join(
    path.dirname(ledger.filePath),
    `${path.basename(ledger.filePath, extension)}.completion.json`,
  );
  const actualContractPath = path.resolve(ledger.completionContract);
  // Resolve directory aliases without letting a file symlink redefine the owning sidecar.
  const comparableContractPath = path.join(await canonicalPath(path.dirname(actualContractPath)), path.basename(actualContractPath));
  const expectedResolvedPath = path.join(await canonicalPath(path.dirname(expectedContractPath)), path.basename(expectedContractPath));
  const isExpectedSibling = process.platform === "win32"
    ? comparableContractPath.toLowerCase() === expectedResolvedPath.toLowerCase()
    : comparableContractPath === expectedResolvedPath;
  if (options.requireEvidencePolicy && !isExpectedSibling) {
    return {
      errors: [`current Stop completion_contract must be the sibling sidecar ${expectedContractPath}`],
      blockers: [],
      ledger,
    };
  }

  let contract;
  try {
    const content = await readBoundedRegularFile(actualContractPath, {
      maxBytes: MAX_COMPLETION_CONTRACT_BYTES,
      label: "completion_contract",
    });
    contract = JSON.parse(content.toString("utf8"));
  } catch (error) {
    return { errors: [`cannot read completion contract: ${error.message}`], blockers: [], ledger };
  }
  const rootErrors = [];
  validateSchemaNode(contract, COMPLETION_SCHEMA, "completion contract", rootErrors);
  if (rootErrors.length > 0) return { errors: rootErrors, blockers: [], ledger, contract };
  if (contract.schemaVersion >= 2) {
    if (!isExpectedSibling) {
      return {
        errors: [`schemaVersion 2 completion_contract must be the sibling sidecar ${expectedContractPath}`],
        blockers: [],
        ledger,
        contract,
      };
    }
  }
  const gitContext = inspectGitContext(resolvedScopeRoot);
  const requireVerification = options.requireVerification === true || ledger.verificationMode === "strict"
    || contract.verificationPolicy?.mode === "strict"
    || (options.requireCompletionPolicy === true && contract.schemaVersion < 4);
  const result = validateCompletionContract({ ...contract, ledgerPath: await canonicalPath(contract.ledgerPath) }, await canonicalPath(ledger.filePath), {
    ...options,
    requireVerification,
    requireRemoteChecks: options.requireEvidencePolicy === true && gitContext.hasRemote,
    currentRevision: gitContext.currentRevision,
  });
  if (gitContext.error) result.errors.push(gitContext.error);
  if (result.errors.length === 0) {
    result.errors.push(...await verifyEvidenceArtifacts(contract, ledger.completionContract, resolvedScopeRoot));
  }
  if (result.errors.length === 0 && result.blockers.length === 0 && contract.verificationPolicy?.mode === "native") {
    result.errors.push(...await verifyNativeInputs(contract, resolvedScopeRoot));
  }
  if (result.errors.length === 0 && result.blockers.length === 0 && (requireVerification || contract.verification)) {
    if (!contract.verification) result.errors.push("current completion requires a shared verification receipt");
    else {
      try {
        const reference = contract.verification;
        await validateControlArtifact(resolvedScopeRoot, ledger.filePath);
        await validateControlArtifact(resolvedScopeRoot, actualContractPath);
        const base = reference.artifactBase === "contract" ? path.dirname(actualContractPath) : resolvedScopeRoot;
        if (path.isAbsolute(reference.artifact)) throw new Error("verification artifact must be relative");
        const target = await fs.realpath(path.resolve(base, reference.artifact));
        if (escapesDeclaredBase(await fs.realpath(base), target)) throw new Error("verification artifact escapes its declared base");
        await validateControlArtifact(resolvedScopeRoot, target);
        const content = await readBoundedRegularFile(target, { maxBytes: MAX_RECEIPT_BYTES, label: "verification receipt" });
        if (digest(content) !== reference.artifactSha256) throw new Error("verification receipt digest mismatch");
        const receipt = JSON.parse(content.toString("utf8"));
        result.errors.push(...evaluateReceipt(receipt).map((error) => `verification: ${error}`));
        if (result.errors.length === 0) result.errors.push(...validateEvidenceLinks(contract.requiredEvidence, receipt));
        if (result.errors.length === 0 && (await snapshot(resolvedScopeRoot)).digest !== receipt.sourceAfter) result.errors.push("verification receipt is stale for the current working tree");
      } catch (error) { result.errors.push(`verification receipt cannot be verified: ${error.message}`); }
    }
  }
  return { ...result, ledger, contract };
}

async function main() {
  const ledgerIndex = process.argv.indexOf("--ledger");
  if (ledgerIndex === -1 || !process.argv[ledgerIndex + 1]) throw new Error("usage: validate-project-ledger.mjs --ledger <path> [--require-evidence-policy] [--require-completion-policy] [--require-verification]");
  const ledgerPath = path.resolve(expandHome(process.argv[ledgerIndex + 1]));
  const repoIndex = process.argv.indexOf("--repo");
  const scopeRoot = repoIndex === -1 || !process.argv[repoIndex + 1]
    ? null
    : await canonicalPath(process.argv[repoIndex + 1]);
  const result = await evaluateLedgerCompletion(ledgerPath, scopeRoot, {
    requireEvidencePolicy: process.argv.includes("--require-evidence-policy"),
    requireVerification: process.argv.includes("--require-verification"),
    requireCompletionPolicy: process.argv.includes("--require-completion-policy"),
  });
  const payload = { ledgerPath, errors: result.errors, blockers: result.blockers, valid: result.errors.length === 0 && result.blockers.length === 0 };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  if (!payload.valid) process.exitCode = 1;
}

if (process.argv[1] && await canonicalPath(fileURLToPath(import.meta.url)) === await canonicalPath(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
