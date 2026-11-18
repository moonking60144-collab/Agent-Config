#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(scriptDir);
const casesPath = path.join(repoRoot, "codex", "evals", "workflow-routing.cases.jsonl");
const schemaPath = path.join(repoRoot, "codex", "evals", "workflow-routing.output.schema.json");
const processValues = new Set(["none", "review", "repo-onboarding-audit", "agent-failure-debugging", "agent-core-lite", "agent-core-project", "agent-core-engine", "frontend-ui-designer", "task-handoff"]);

export function parseArgs(argv) {
  const options = { mode: "validate", caseIds: [], all: false, repeat: null, minPass: null, model: null, reasoning: null, timeoutMs: 180000, output: null, codexBin: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--run") options.mode = "run";
    else if (argument === "--validate") options.mode = "validate";
    else if (argument === "--list") options.mode = "list";
    else if (argument === "--all") options.all = true;
    else if (argument === "--case") options.caseIds.push(argv[++index]);
    else if (argument === "--repeat") options.repeat = Number.parseInt(argv[++index], 10);
    else if (argument === "--min-pass") options.minPass = Number.parseInt(argv[++index], 10);
    else if (argument === "--model") options.model = argv[++index];
    else if (argument === "--reasoning") options.reasoning = argv[++index];
    else if (argument === "--timeout-ms") options.timeoutMs = Number.parseInt(argv[++index], 10);
    else if (argument === "--output") options.output = path.resolve(argv[++index]);
    else if (argument === "--codex-bin") {
      const value = argv[++index];
      if (!value?.trim() || value.startsWith("--")) throw new Error("--codex-bin 必須指定可執行檔");
      options.codexBin = value;
    }
    else throw new Error("未知參數：" + argument);
  }
  for (const [name, value] of [["repeat", options.repeat], ["min-pass", options.minPass], ["timeout-ms", options.timeoutMs]]) {
    if (value !== null && (!Number.isInteger(value) || value < 1)) throw new Error("--" + name + " 必須是正整數");
  }
  return options;
}

export async function resolveCodexRuntime(requested = "codex", env = process.env) {
  const direct = path.isAbsolute(requested) || /[\\/]/.test(requested);
  const names = process.platform === "win32" && !path.extname(requested)
    ? [requested + ".exe", requested + ".com", requested] : [requested];
  const candidates = direct ? [path.resolve(requested)] : (env.PATH ?? env.Path ?? "")
    .split(path.delimiter).filter(Boolean)
    .flatMap(directory => names.map(name => path.resolve(directory.replace(/^"|"$/g, ""), name)));
  let executable;
  for (const candidate of candidates) {
    try {
      const target = await realpath(candidate);
      if (!(await stat(target)).isFile()) continue;
      await access(target, constants.X_OK);
      executable = target;
      break;
    } catch (error) {
      if (direct) throw new Error("無法使用 --codex-bin " + requested + ": " + error.message);
    }
  }
  if (!executable) throw new Error("找不到 Codex 可執行檔：" + requested + "；可用 --codex-bin 指定實際路徑");
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(executable)) {
    throw new Error("--codex-bin 需要原生可執行檔，不能使用 .cmd/.bat wrapper");
  }
  const result = spawnSync(executable, ["--version"], { env, encoding: "utf8", shell: false, timeout: 10000 });
  if (result.error || result.status !== 0 || !result.stdout?.trim()) {
    throw new Error("Codex 版本查詢失敗：" + executable + ": " + (result.error?.message || result.stderr?.trim() || "exit=" + result.status));
  }
  return { requested_binary: requested, binary_path: executable, version: result.stdout.trim() };
}

async function exists(target) {
  try { await access(target); return true; } catch { return false; }
}

async function loadCases() {
  const lines = (await readFile(casesPath, "utf8")).split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) throw new Error("workflow routing cases 不可為空");
  return lines.map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error("cases 第 " + (index + 1) + " 行 JSON 無效：" + error.message); }
  });
}

function validateStringArray(item, key) {
  if (item[key] && (!Array.isArray(item[key]) || item[key].some((value) => typeof value !== "string"))) {
    throw new Error(item.id + " " + key + " 必須是 string array");
  }
}

export function validateCases(cases) {
  // Required checks are a subset of allowed checks; absent allowlist means an exact set.
  const knownChecks = new Set(['branch', 'remote', 'uncommitted_diff', 'rollback']);
  for (const item of cases) {
    for (const key of ['expected_preflight_checks', 'allowed_preflight_checks']) {
      const values = item[key];
      if (values === undefined && key === 'allowed_preflight_checks') continue;
      if (!Array.isArray(values) || values.some(value => !knownChecks.has(value)) || new Set(values).size !== values.length) {
        throw new Error(item.id + ': invalid ' + key);
      }
    }
    const allowed = new Set(item.allowed_preflight_checks ?? item.expected_preflight_checks);
    if (item.expected_preflight_checks.some(value => !allowed.has(value))) {
      throw new Error(item.id + ': required preflight checks must be allowed');
    }
  }
  const ids = new Set();
  for (const item of cases) {
    if (!item || typeof item !== "object") throw new Error("case 必須是 object");
    if (typeof item.id !== "string" || !/^[a-z0-9_]+$/.test(item.id)) throw new Error("case id 無效：" + String(item.id));
    if (ids.has(item.id)) throw new Error("case id 重複：" + item.id);
    ids.add(item.id);
    if (!["smoke", "regression"].includes(item.tier)) throw new Error(item.id + " tier 無效");
    if (typeof item.prompt !== "string" || !item.prompt.trim()) throw new Error(item.id + " prompt 不可為空");
    if (!processValues.has(item.expected_process)) throw new Error(item.id + " expected_process 無效");
    for (const key of ["expected_would_write", "expected_confirmation"]) {
      if (typeof item[key] !== "boolean") throw new Error(item.id + " " + key + " 必須是 boolean");
    }
    if (!Number.isInteger(item.repeat) || item.repeat < 1) throw new Error(item.id + " repeat 無效");
    if (!Number.isInteger(item.min_pass) || item.min_pass < 1 || item.min_pass > item.repeat) throw new Error(item.id + " min_pass 無效");
    validateStringArray(item, "must_include");
    validateStringArray(item, "must_not_include");
    validateStringArray(item, "expected_preflight_checks");
  }
  return ids;
}

async function collectRelativeFiles(root, current = root, output = []) {
  const entries = (await readdir(current, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) await collectRelativeFiles(root, absolute, output);
    else if (entry.isFile()) output.push(path.relative(root, absolute));
  }
  return output;
}

async function digestManagedSkills(root, managedNames) {
  if (!(await exists(root))) return null;
  const hash = createHash("sha256");
  for (const name of managedNames) {
    const directory = path.join(root, name);
    if (!(await exists(directory))) {
      hash.update(name + ":missing");
      continue;
    }
    for (const relative of await collectRelativeFiles(directory)) {
      hash.update(name + "/" + relative);
      hash.update(await readFile(path.join(directory, relative)));
    }
  }
  return hash.digest("hex");
}

async function digestFile(target) {
  if (!(await exists(target))) return null;
  return createHash("sha256").update(await readFile(target)).digest("hex");
}

function buildPrompt(item) {
  return [
    "這是 routing classifier eval，不是 native skill activation proof。禁止呼叫任何 tool、MCP、shell 或修改任何狀態。",
    "依目前載入的 AGENTS 與 skill descriptions，分類下列請求的第一個 process skill。",
    "若不需要 process skill、但有明確 domain skill，回傳該 domain skill；都不需要則回傳 none。",
    "would_write 表示目前是否應進入寫入；需要額外確認時必須是 false。",
    "requires_confirmation 表示進一步動作前是否需要使用者確認。",
    "preflight_checks 只列實際需要先盤點的 branch、remote、uncommitted_diff、rollback；不需要時回傳空陣列。",
    "first_action 必須符合 read-only／confirmation 狀態，不得先做受禁止的動作。",
    "只回傳 output schema 指定的 JSON。",
    "",
    "待分類請求：",
    item.prompt,
  ].join("\n");
}

function collectValuesByKey(value, key, output = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectValuesByKey(item, key, output);
  } else if (value && typeof value === "object") {
    for (const [nestedKey, nested] of Object.entries(value)) {
      if (nestedKey === key && typeof nested === "string") output.push(nested);
      collectValuesByKey(nested, key, output);
    }
  }
  return output;
}

function terminateTree(child, force) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    const args = ["/pid", String(child.pid), "/t"];
    if (force) args.push("/f");
    spawnSync("taskkill", args, { shell: false, stdio: "ignore" });
    return;
  }
  try { process.kill(-child.pid, force ? "SIGKILL" : "SIGTERM"); }
  catch { try { child.kill(force ? "SIGKILL" : "SIGTERM"); } catch {} }
}

async function runProcess(command, args, options) {
  return await new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: process.env,
      shell: false,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let terminationStage = "none";
    let settled = false;
    let hardTimer = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (hardTimer) clearTimeout(hardTimer);
      resolve({ ...result, stdout, stderr, timedOut, terminationStage });
    };
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => {
      timedOut = true;
      terminationStage = "sigterm";
      terminateTree(child, false);
      hardTimer = setTimeout(() => {
        terminationStage = "hard-kill";
        terminateTree(child, true);
      }, 5000);
    }, options.timeoutMs);
    child.on("error", (error) => finish({ code: null, error: error.message }));
    child.on("close", (code) => finish({ code, error: null }));
  });
}

export function evaluateResult(item, result, forbiddenToolTypes) {
  const failures = forbiddenToolTypes.length ? ["tool_calls=" + forbiddenToolTypes.join(",")] : [];
  if (!result || typeof result !== "object" || Array.isArray(result)) return [...failures, "invalid_result_object"];
  const keys = ["selected_process", "would_write", "requires_confirmation", "preflight_checks", "first_action", "rationale"];
  if (Object.keys(result).some((key) => !keys.includes(key))) failures.push("unexpected_result_property");
  for (const key of ["first_action", "rationale"]) {
    if (typeof result[key] !== "string" || !result[key].trim()) failures.push("invalid_" + key);
  }
  if (result.selected_process !== item.expected_process) failures.push("process=" + result.selected_process + " expected=" + item.expected_process);
  if (result.would_write !== item.expected_would_write) failures.push("would_write=" + result.would_write);
  if (result.requires_confirmation !== item.expected_confirmation) failures.push("requires_confirmation=" + result.requires_confirmation);
  if (result.requires_confirmation && result.would_write) failures.push("confirmation/write inconsistency");
  if (!Array.isArray(result.preflight_checks)) failures.push('invalid_preflight_checks');
  const rawChecks = Array.isArray(result.preflight_checks) ? result.preflight_checks : [];
  const actualChecks = new Set(rawChecks);
  if (actualChecks.size !== rawChecks.length) failures.push("duplicate_preflight_checks");
  for (const check of item.expected_preflight_checks || []) {
    if (!actualChecks.has(check)) failures.push("missing_preflight=" + check);
  }
  const allowedChecks = new Set(item.allowed_preflight_checks ?? item.expected_preflight_checks ?? []);
  for (const check of actualChecks) {
    if (!allowedChecks.has(check)) failures.push('unexpected_preflight=' + check);
  }
  const searchable = ([result.first_action, result.rationale].filter((s) => typeof s === "string").join("\n")).toLowerCase();
  for (const term of item.must_include || []) if (!searchable.includes(term.toLowerCase())) failures.push("missing=" + term);
  for (const term of item.must_not_include || []) if (searchable.includes(term.toLowerCase())) failures.push("forbidden=" + term);
  return failures;
}

// Codex CLI 0.151.0 exec_events.rs exposes no model identity in JSONL events.
// Requested aliases and arbitrary tool/message payloads are not model observations.
export function modelProvenanceForExec(requestedModel) {
  return {
    requested_model: requestedModel ?? null,
    resolved_model: 'unknown',
    model_observation_source: 'exec_jsonl_model_not_exposed',
  };
}

export async function runCase(item, runIndex, options, runtime) {
  const temp = await mkdtemp(path.join(os.tmpdir(), "codex-routing-eval-"));
  try {
    const finalPath = path.join(temp, "final.json");
    const args = ["exec", "--ephemeral", "--json", "--color", "never", "--sandbox", "read-only", "--ignore-rules", "--output-schema", schemaPath, "-C", repoRoot, "-o", finalPath];
    if (options.model) args.push("--model", options.model);
    if (options.reasoning) args.push("-c", "model_reasoning_effort=\"" + options.reasoning + "\"");
    args.push(buildPrompt(item));

    const processResult = await runProcess(runtime.binary_path, args, options);
    const events = [];
    for (const line of processResult.stdout.split(/\r?\n/).filter((value) => value.trim())) {
      try { events.push(JSON.parse(line)); }
      catch { events.push({ type: "unparsed_stdout", text: line }); }
    }
    const types = collectValuesByKey(events, "type");
    const forbiddenSet = new Set(["command_execution", "mcp_tool_call", "file_change", "web_search", "computer_tool_call"]);
    const forbiddenToolTypes = [...new Set(types.filter((type) => forbiddenSet.has(type)))];
    const eventErrors = collectValuesByKey(events, "message");
    const modelEvidence = modelProvenanceForExec(options.model);

    let parsed = null;
    let parseError = null;
    if (await exists(finalPath)) {
      try { parsed = JSON.parse(await readFile(finalPath, "utf8")); }
      catch (error) { parseError = error.message; }
    } else parseError = "missing final output";

    const failures = [];
    if (processResult.error) failures.push("spawn=" + processResult.error);
    if (processResult.timedOut) failures.push("timeout");
    if (processResult.code !== 0) failures.push("exit=" + processResult.code);
    if (parseError) failures.push("parse=" + parseError);
    failures.push(...evaluateResult(item, parsed, forbiddenToolTypes));

    return {
      id: item.id,
      run: runIndex,
      pass: failures.length === 0,
      failures,
      output: parsed,
      exit_code: processResult.code,
      timed_out: processResult.timedOut,
      termination_stage: processResult.terminationStage,
      stderr: processResult.stderr.trim(),
      event_types: [...new Set(types)],
      event_errors: [...new Set(eventErrors)],
      ...modelEvidence,
      codex_version: runtime.version,
      codex_binary: runtime.binary_path,
    };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

async function validateEnvironment(activeRoot) {
  const validation = spawnSync(
    process.execPath,
    [path.join(scriptDir, "validate-codex.mjs"), "--codex-home", activeRoot],
    { cwd: repoRoot, encoding: "utf8", shell: false }
  );
  if (validation.error || validation.status !== 0) throw new Error("active/repo validation failed:\n" + (validation.stderr || validation.stdout || validation.error?.message));
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const cases = await loadCases();
  const ids = validateCases(cases);
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  for (const required of ["selected_process", "would_write", "requires_confirmation", "preflight_checks", "first_action", "rationale"]) {
    if (!schema.required?.includes(required)) throw new Error("output schema 缺少 required：" + required);
  }

  if (options.mode === "validate") {
    console.log("routing classifier contract valid: " + cases.length + " cases");
    return;
  }
  if (options.mode === "list") {
    for (const item of cases) console.log(item.id + "\t" + item.tier + "\t" + item.expected_process);
    return;
  }

  for (const id of options.caseIds) if (!ids.has(id)) throw new Error("找不到 case：" + id);
  const selected = cases.filter((item) => options.caseIds.length > 0 ? options.caseIds.includes(item.id) : (options.all || item.tier === "smoke"));
  for (const item of selected) {
    const repeats = options.repeat ?? item.repeat;
    const minimum = options.minPass ?? Math.min(item.min_pass, repeats);
    if (minimum > repeats) throw new Error(item.id + " minimum passes 不可大於 repeats");
  }
  const activeRoot = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  const runtime = await resolveCodexRuntime(options.codexBin ?? "codex");
  await validateEnvironment(activeRoot);

  const managedNames = (await readdir(path.join(repoRoot, "codex", "skills"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const provenance = {
    timestamp: new Date().toISOString(),
    evidence_level: "routing_classifier_only",
    native_skill_activation_observed: false,
    limitations: ["No native skill activation event was observed or asserted.", "Body/reference usage requires a separate integration tier."],
    requested_codex_binary: runtime.requested_binary,
    codex_binary: runtime.binary_path,
    codex_version: runtime.version,
    model_override: options.model,
    reasoning_override: options.reasoning,
    repo_agents_sha256: await digestFile(path.join(repoRoot, "codex", "AGENTS.md")),
    repo_managed_skills_sha256: await digestManagedSkills(path.join(repoRoot, "codex", "skills"), managedNames),
    active_agents_sha256: await digestFile(path.join(activeRoot, "AGENTS.md")),
    active_managed_skills_sha256: await digestManagedSkills(path.join(activeRoot, "skills"), managedNames),
    active_config_sha256: await digestFile(path.join(activeRoot, "config.toml")),
  };

  const results = [];
  for (const item of selected) {
    const repeats = options.repeat ?? item.repeat;
    const minimum = options.minPass ?? Math.min(item.min_pass, repeats);
    let passes = 0;
    for (let runIndex = 1; runIndex <= repeats; runIndex += 1) {
      const result = await runCase(item, runIndex, options, runtime);
      results.push(result);
      if (result.pass) passes += 1;
      console.log(item.id + " " + runIndex + "/" + repeats + " " + (result.pass ? "PASS" : "FAIL") + (result.failures.length ? " " + result.failures.join("; ") : ""));
    }
    item.resolved_minimum_passes = minimum;
    item.resolved_passes = passes;
  }

  const summary = selected.map((item) => ({ id: item.id, passes: item.resolved_passes, runs: options.repeat ?? item.repeat, minimum_passes: item.resolved_minimum_passes, pass: item.resolved_passes >= item.resolved_minimum_passes }));
  const actualModels = [...new Set(results.map((item) => item.resolved_model))];
  provenance.actual_models = actualModels;
  provenance.model_observation_sources = [...new Set(results.map(item => item.model_observation_source))];
  if (actualModels.includes('unknown')) {
    provenance.limitations.push('The supported exec JSONL schema does not expose model identity; model_override records only the request.');
  }
  provenance.reproducible = actualModels.length === 1 && actualModels[0] !== "unknown" && Boolean(options.reasoning);
  const artifact = { provenance, summary, results };
  const output = options.output || path.join(activeRoot, "eval-results", "config-workflow", timestamp() + ".json");
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(artifact, null, 2) + "\n", "utf8");
  console.log("result_artifact=" + output);
  if (summary.some((item) => !item.pass)) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("routing classifier eval failed：" + error.message);
    process.exitCode = 1;
  });
}
