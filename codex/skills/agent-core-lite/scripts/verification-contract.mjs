import { createHash } from "node:crypto";
import path from "node:path";

export const PROTOCOL_VERSION = 1;
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
export const digest = (value) => createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const text = (value) => typeof value === "string" && value.trim().length > 0;
const sha = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const strings = (value) => Array.isArray(value) && value.every(text);
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const sourceKey = (value) => {
  const normalized = path.posix.normalize(value.replaceAll("\\", "/"));
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
};
export function observationFrom(stdout) {
  for (const line of stdout.trim().split(/\r?\n/).reverse()) { try { return JSON.parse(line); } catch {} }
  return null;
}

export function validatePlan(plan) {
  try { return validatePlanShape(plan); } catch (error) { return [`malformed verification plan: ${error.message}`]; }
}
function validatePlanShape(plan) {
  const errors = [];
  if (!object(plan) || plan.version !== PROTOCOL_VERSION) return ["unsupported verification plan"];
  if (!object(plan.discovery) || !sha(plan.discovery.snapshot?.digest) || !Array.isArray(plan.discovery.candidates)) return ["machine discovery snapshot is required"];
  if (plan.discovery.snapshot.digest !== digest({ head: plan.discovery.snapshot.head, files: plan.discovery.snapshot.files })) errors.push("discovery snapshot digest mismatch");
  if (!Array.isArray(plan.checks) || plan.checks.length === 0 || plan.checks.length > 64) return ["checks must contain 1..64 entries"];
  const ids = new Set();
  for (const check of plan.checks) {
    if (!object(check) || !text(check.id) || ids.has(check.id)) { errors.push("check ids must be unique"); continue; }
    ids.add(check.id);
    if (!["static", "example", "property", "stateful", "integration", "performance"].includes(check.kind)) errors.push(`${check.id}: invalid kind`);
    if (!strings(check.command) || !check.command.length) errors.push(`${check.id}: command must be argv`);
    if (check.trace !== undefined && !["node-v8", "probe"].includes(check.trace)) errors.push(`${check.id}: unsupported trace adapter`);
    if (!strings(check.invariants) || !check.invariants.length) errors.push(`${check.id}: invariants are required`);
    if (!object(check.oracle) || !["spec", "reference", "metamorphic", "differential"].includes(check.oracle.basis) || !text(check.oracle.source) || !text(check.oracle.reason)) errors.push(`${check.id}: oracle provenance is required`);
    if (!plan.discovery.snapshot?.files?.some((file) => file.path === check.oracle?.source && sha(file.sha256))) errors.push(`${check.id}: oracle source is outside the captured snapshot`);
    if (check.timeoutMs !== undefined && (!Number.isInteger(check.timeoutMs) || check.timeoutMs < 100 || check.timeoutMs > 300000)) errors.push(`${check.id}: invalid timeout`);
    if (["property", "stateful"].includes(check.kind)) {
      if (!Array.isArray(check.seeds) || !check.seeds.length || check.seeds.some((seed) => !Number.isSafeInteger(seed))) errors.push(`${check.id}: replayable seeds are required`);
      if (!Number.isInteger(check.iterations) || check.iterations < 1) errors.push(`${check.id}: positive iterations required`);
    }
    if (!["static", "performance"].includes(check.kind)) {
      if (!Array.isArray(check.challenges) || !check.challenges.length) errors.push(`${check.id}: behavioral checks require a sensitivity challenge`);
    }
    if (check.challenges !== undefined && !Array.isArray(check.challenges)) errors.push(`${check.id}: challenges must be an array`);
    for (const challenge of check.challenges || []) {
      if (!object(challenge) || !text(challenge.id) || !text(challenge.file) || !text(challenge.find) || typeof challenge.replace !== "string" || challenge.find === challenge.replace || !text(challenge.assertion)) errors.push(`${check.id}: invalid challenge`);
      if (!plan.discovery.snapshot.files.some((file) => file.path === challenge.file && sha(file.sha256))) errors.push(`${check.id}: challenge target must be a canonical snapshot file`);
      if (text(challenge.file) && text(check.oracle?.source) && sourceKey(challenge.file) === sourceKey(check.oracle.source)) errors.push(`${check.id}: challenge cannot rewrite the oracle`);
    }
    if (check.kind === "performance") {
      const p = check.performance;
      if (!object(p) || !strings(p.baselineCommand) || !p.baselineCommand.length || !text(p.metric) || !text(p.unit) || !text(p.workload) || !Number.isInteger(p.repeats) || p.repeats < 3 || !Number.isFinite(p.maxValue) || p.maxValue <= 0 || !Number.isFinite(p.maxRatio) || p.maxRatio <= 0) errors.push(`${check.id}: controlled measurement and absolute/relative budgets required`);
      if (JSON.stringify(p?.baselineCommand) === JSON.stringify(check.command)) errors.push(`${check.id}: baseline and candidate must identify distinct probes or versions`);
    }
  }
  if (!Array.isArray(plan.coverage)) return [...errors, "consumer coverage decisions are required"];
  const covered = new Set();
  for (const item of plan.coverage) {
    if (!object(item) || !text(item.path) || covered.has(item.path)) { errors.push("coverage paths must be unique"); continue; }
    covered.add(item.path);
    if (!strings(item.checks) || item.checks.some((id) => !ids.has(id))) errors.push(`${item.path}: invalid coverage check ids`);
    if (!item.checks?.length && !text(item.reason)) errors.push(`${item.path}: uncovered candidate needs a specific exclusion reason`);
  }
  for (const candidate of plan.discovery.candidates) if (!covered.has(candidate)) errors.push(`unaccounted discovered candidate: ${candidate}`);
  for (const kind of new Set((plan.discovery.riskHints || []).map((hint) => hint.kind))) {
    const decision = plan.riskDecisions?.find((item) => item.kind === kind);
    if (!decision || !strings(decision.checks) || (!decision.checks.length && !text(decision.reason))) { errors.push(`unresolved discovered risk hint: ${kind}`); continue; }
    for (const id of decision.checks) {
      const check = plan.checks.find((item) => item.id === id);
      if (!check || (kind === "performance" ? check.kind !== "performance" : !["stateful", "integration"].includes(check.kind))) errors.push(`${kind}: selected check does not verify the hinted risk`);
    }
  }
  if (!strings(plan.limitations)) errors.push("discovery limitations must be explicit");
  return errors;
}

function validRun(run) {
  return object(run) && Number.isInteger(run.exitCode) && run.timedOut === false && run.error === null && typeof run.stdout === "string" && typeof run.stderr === "string" && run.stdoutSha256 === digest(run.stdout) && run.stderrSha256 === digest(run.stderr) && JSON.stringify(run.observation) === JSON.stringify(observationFrom(run.stdout));
}
function passedRun(run) {
  return validRun(run) && run.exitCode === 0;
}

export function isBehavioralFailure(run, assertion) {
  if (!validRun(run) || run.exitCode === 0) return false;
  const output = run.stdout + run.stderr;
  return output.includes(assertion) && !/SyntaxError|ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|Cannot find module|ModuleNotFoundError|ImportError|ERR_UNKNOWN_FILE_EXTENSION/.test(output);
}

export function evaluateReceipt(receipt) {
  try { return evaluateReceiptShape(receipt); } catch (error) { return [`malformed verification receipt: ${error.message}`]; }
}
function evaluateReceiptShape(receipt) {
  if (!object(receipt) || receipt.version !== PROTOCOL_VERSION) return ["unsupported verification receipt"];
  const errors = validatePlan(receipt.plan);
  if (errors.length) return errors;
  if (receipt.planSha256 !== digest(receipt.plan)) errors.push("plan digest mismatch");
  if (receipt.sourceBefore !== receipt.plan.discovery.snapshot.digest || receipt.sourceAfter !== receipt.sourceBefore) errors.push("source snapshot changed or mismatched");
  if (!Array.isArray(receipt.checks) || receipt.checks.length !== receipt.plan.checks.length) return [...errors, "check receipt set mismatch"];
  for (const planCheck of receipt.plan.checks) {
    const matches = receipt.checks.filter((check) => check.id === planCheck.id);
    if (matches.length !== 1) { errors.push(`${planCheck.id}: missing or duplicate receipt`); continue; }
    const result = matches[0];
    if (!Array.isArray(result.runs) || !result.runs.length || !result.runs.every(passedRun)) errors.push(`${planCheck.id}: baseline/candidate did not pass`);
    if (planCheck.kind !== "static") {
      const observed = new Set((result.runs || []).flatMap((run) => planCheck.trace === "probe" ? run.observation?.observedConsumers || [] : run.observedFiles || []));
      for (const item of receipt.plan.coverage.filter((item) => item.checks.includes(planCheck.id))) {
        if (!observed.has(item.path)) errors.push(`${planCheck.id}: consumer was not observed by trace: ${item.path}`);
      }
    }
    if (["property", "stateful"].includes(planCheck.kind)) {
      if (result.runs?.length !== planCheck.seeds.length) errors.push(`${planCheck.id}: seed runs missing`);
      for (const [i, run] of (result.runs || []).entries()) {
        if (run.observation?.seed !== planCheck.seeds[i] || run.observation?.kind !== planCheck.kind || !Number.isInteger(run.observation?.cases) || run.observation.cases < planCheck.iterations) errors.push(`${planCheck.id}: generated cases/seed receipt missing`);
      }
    }
    for (const challenge of planCheck.challenges || []) {
      const proof = result.challenges?.find((item) => item.id === challenge.id);
      if (!passedRun(proof?.controlRun)) errors.push(`${planCheck.id}/${challenge.id}: pristine isolation baseline failed or missing`);
      if (!proof || !proof.applied || proof.beforeSha256 === proof.afterSha256 || !sha(proof.beforeSha256) || !sha(proof.afterSha256)) { errors.push(`${planCheck.id}/${challenge.id}: mutation was not applied`); continue; }
      if (!proof.assertionObserved || !isBehavioralFailure(proof.run, challenge.assertion)) errors.push(`${planCheck.id}/${challenge.id}: survived, invalid, or unrelated failure`);
    }
    if (planCheck.kind === "performance") {
      const measurements = result.measurements || [];
      const p = planCheck.performance;
      if (measurements.length !== p.repeats) errors.push(`${planCheck.id}: repeated measurements missing`);
      const baseline = [], candidate = [];
      let environment = null;
      for (const pair of measurements) {
        if (!passedRun(pair.baselineRun) || !passedRun(pair.candidateRun)) errors.push(`${planCheck.id}: measurement probe failed`);
        for (const side of ["baseline", "candidate"]) {
          const m = pair[side];
          if (JSON.stringify(m) !== JSON.stringify(pair[`${side}Run`]?.observation)) errors.push(`${planCheck.id}: measurement disagrees with captured probe output`);
          if (!object(m) || m.metric !== p.metric || m.unit !== p.unit || m.workload !== p.workload || !text(m.environment) || !Array.isArray(m.samples) || !m.samples.length || m.samples.some((n) => !Number.isFinite(n) || n < 0)) { errors.push(`${planCheck.id}: invalid measurement payload`); continue; }
          if (environment !== null && environment !== m.environment) errors.push(`${planCheck.id}: measurement environment mismatch`);
          environment = m.environment;
          (side === "baseline" ? baseline : candidate).push(...m.samples);
        }
      }
      if (baseline.length && candidate.length) {
        const p95 = (samples) => [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * 0.95) - 1];
        if (p95(candidate) > p.maxValue || p95(baseline) <= 0 || p95(candidate) / p95(baseline) > p.maxRatio) errors.push(`${planCheck.id}: performance budget exceeded`);
      }
    }
  }
  if (receipt.status !== (errors.length ? "failed" : "passed")) errors.push("receipt status disagrees with evidence");
  return errors;
}

export function validateEvidenceLinks(evidence, receipt) {
  const errors = [];
  for (const item of evidence) {
    if (!["local", "cross-boundary"].includes(item.claimScope) || item.status !== "present") continue;
    if (!strings(item.verificationChecks) || !item.verificationChecks.length) { errors.push(`${item.id}: behavioral evidence must reference verificationChecks`); continue; }
    const checks = item.verificationChecks.map((id) => receipt.plan.checks.find((check) => check.id === id));
    if (checks.some((check) => !check)) { errors.push(`${item.id}: unknown verification check`); continue; }
    const kinds = item.claimScope === "cross-boundary" ? ["integration", "stateful", "performance"] : ["example", "property", "stateful", "integration", "performance"];
    if (!checks.some((check) => kinds.includes(check.kind))) errors.push(`${item.id}: receipt check cannot support ${item.claimScope} behavioral evidence`);
  }
  return errors;
}
