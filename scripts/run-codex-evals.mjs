#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(scriptDir);
const casesPath = path.join(repoRoot, "codex", "evals", "workflow-routing.cases.jsonl");
const schemaPath = path.join(repoRoot, "codex", "evals", "workflow-routing.output.schema.json");
const processValues = new Set(["none", "review", "repo-onboarding-audit", "agent-failure-debugging", "agent-core-lite", "agent-core-project", "agent-core-engine", "frontend-ui-designer", "task-handoff"]);

function parseArgs(argv) {
  const options = { mode: "validate", caseIds: [], all: false, repeat: null, minPass: null, model: null, reasoning: null, timeoutMs: 180000, output: null };
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
    else throw new Error("未知參數：" + argument);
  }
  for (const [name, value] of [["repeat", options.repeat], ["min-pass", options.minPass], ["timeout-ms", options.timeoutMs]]) {
    if (value !== null && (!Number.isInteger(value) || value < 1)) throw new Error("--" + name + " 必須是正整數");
  }
  return options;
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

function validateCases(cases) {
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

function evaluateResult(item, result, forbiddenToolTypes) {
  const failures = [];
  if (result.selected_process !== item.expected_process) failures.push("process=" + result.selected_process + " expected=" + item.expected_process);
  if (result.would_write !== item.expected_would_write) failures.push("would_write=" + result.would_write);
  if (result.requires_confirmation !== item.expected_confirmation) failures.push("requires_confirmation=" + result.requires_confirmation);
  if (result.requires_confirmation && result.would_write) failures.push("confirmation/write inconsistency");
const rawChecks = result.preflight_checks || [];
const actualChecks = new Set(rawChecks);
if (actualChecks.size !== rawChecks.length) failures.push("duplicate_preflight_checks");
for (const check of item.expected_preflight_checks || []) {
  if (!actualChecks.has(check)) failures.push("missing_preflight=" + check);
}
  const searchable = (result.first_action + "\n" + result.rationale).toLowerCase();
  for (const term of item.must_include || []) if (!searchable.includes(term.toLowerCase())) failures.push("missing=" + term);
  for (const term of item.must_not_include || []) if (searchable.includes(term.toLowerCase())) failures.push("forbidden=" + term);
  if (forbiddenToolTypes.length > 0) failures.push("tool_calls=" + forbiddenToolTypes.join(","));
  return failures;
}

async function runCase(item, runIndex, options, codexVersion) {
  const temp = await mkdtemp(path.join(os.tmpdir(), "codex-routing-eval-"));
  try {
    const finalPath = path.join(temp, "final.json");
    const args = ["exec", "--ephemeral", "--json", "--color", "never", "--sandbox", "read-only", "--ignore-rules", "--output-schema", schemaPath, "-C", repoRoot, "-o", finalPath];
    if (options.model) args.push("--model", options.model);
    if (options.reasoning) args.push("-c", "model_reasoning_effort=\"" + options.reasoning + "\"");
    args.push(buildPrompt(item));

    const processResult = await runProcess("codex", args, options);
    const events = [];
    for (const line of processResult.stdout.split(/\r?\n/).filter((value) => value.trim())) {
      try { events.push(JSON.parse(line)); }
      catch { events.push({ type: "unparsed_stdout", text: line }); }
    }
    const types = collectValuesByKey(events, "type");
    const forbiddenSet = new Set(["command_execution", "mcp_tool_call", "file_change", "web_search", "computer_tool_call"]);
    const forbiddenToolTypes = [...new Set(types.filter((type) => forbiddenSet.has(type)))];
    const eventErrors = collectValuesByKey(events, "message");
    const eventModels = collectValuesByKey(events, "model");
    const resolvedModel = options.model || eventModels[0] || "unknown";

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
    if (parsed) failures.push(...evaluateResult(item, parsed, forbiddenToolTypes));

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
      resolved_model: resolvedModel,
      codex_version: codexVersion,
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
  await validateEnvironment(activeRoot);

  const versionResult = spawnSync("codex", ["--version"], { encoding: "utf8", shell: false });
  const codexVersion = versionResult.status === 0 ? versionResult.stdout.trim() : "unknown";
  const managedNames = (await readdir(path.join(repoRoot, "codex", "skills"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const provenance = {
    timestamp: new Date().toISOString(),
    evidence_level: "routing_classifier_only",
    native_skill_activation_observed: false,
    limitations: ["No native skill activation event was observed or asserted.", "Body/reference usage requires a separate integration tier."],
    codex_version: codexVersion,
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
      const result = await runCase(item, runIndex, options, codexVersion);
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
  provenance.reproducible = actualModels.length === 1 && actualModels[0] !== "unknown" && Boolean(options.reasoning);
  const artifact = { provenance, summary, results };
  const output = options.output || path.join(activeRoot, "eval-results", "config-workflow", timestamp() + ".json");
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(artifact, null, 2) + "\n", "utf8");
  console.log("result_artifact=" + output);
  if (summary.some((item) => !item.pass)) process.exitCode = 1;
}

main().catch((error) => {
  console.error("routing classifier eval failed：" + error.message);
  process.exitCode = 1;
});
