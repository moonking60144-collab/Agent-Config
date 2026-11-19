#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { digest, snapshotDigest, validatePlan, evaluateReceipt, observationFrom, isBehavioralFailure, PROTOCOL_VERSION, MAX_RECEIPT_BYTES } from "./verification-contract.mjs";
import { spawnRipgrep } from "./ripgrep.mjs";

let repositoryVariables;
// Hooks export the caller's repository; Git commands aimed at an explicit -C target must not inherit it.
export function gitEnvForRepo(base = process.env) {
  if (!repositoryVariables) {
    const listed = spawnSync("git", ["rev-parse", "--local-env-vars"], { encoding: "utf8", shell: false });
    if (listed.error?.code === "ENOENT") repositoryVariables = [];
    else if (listed.error || listed.status !== 0) throw new Error(listed.stderr || listed.error?.message || "cannot list Git repository variables");
    else repositoryVariables = listed.stdout.split(/\r?\n/).filter(Boolean);
  }
  const env = { ...base };
  for (const name of repositoryVariables) delete env[name];
  return env;
}

function git(repo, args) {
  const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8", shell: false, maxBuffer: 16 * 1024 * 1024, env: gitEnvForRepo() });
  if (result.error || result.status !== 0) throw new Error(result.stderr || result.error?.message || "git failed");
  return result.stdout;
}
function inside(repo, relative) {
  const target = path.resolve(repo, relative);
  const delta = path.relative(repo, target);
  if (!delta || delta === ".." || delta.startsWith(`..${path.sep}`) || path.isAbsolute(delta)) throw new Error(`path outside repository: ${relative}`);
  return target;
}
async function inventory(repo) {
  const root = spawnSync("git", ["-C", repo, "rev-parse", "--show-toplevel"], { encoding: "utf8", shell: false, env: gitEnvForRepo() });
  if (root.status === 0) {
    if (await fs.realpath(root.stdout.trim()) !== await fs.realpath(repo)) throw new Error("verification scope must be the Git root");
    const revision = spawnSync("git", ["-C", repo, "rev-parse", "--verify", "HEAD"], { encoding: "utf8", shell: false, env: gitEnvForRepo() });
    if (revision.error) throw revision.error;
    const indexModes = new Map();
    for (const record of git(repo, ["ls-files", "--stage", "-z"]).split("\0").filter(Boolean)) {
      const tab = record.indexOf("\t");
      const [mode, , stage] = record.slice(0, tab).split(" ");
      if (stage === "0") indexModes.set(record.slice(tab + 1), mode === "100755");
    }
    return { indexModes, head: revision.status === 0 ? revision.stdout.trim() : null, names: [...new Set(git(repo, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]).split("\0").filter(Boolean))].sort() };
  }
  if (root.error && root.error.code !== "ENOENT") throw root.error;
  if (!root.error && !/not a git repository/i.test(root.stderr)) throw new Error(root.stderr || "cannot inspect Git scope");
  const names = [];
  async function walk(directory, prefix = "") {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (entry.name === ".git") continue;
      const relative = prefix + entry.name;
      if (entry.isDirectory()) await walk(path.join(directory, entry.name), relative + "/");
      else names.push(relative);
    }
  }
  await walk(repo);
  return { head: null, names: names.sort() };
}
export async function snapshot(repo) {
  const { head, names, indexModes } = await inventory(repo);
  const files = [];
  for (const name of names) {
    const target = inside(repo, name);
    let entry;
    try { entry = await fs.lstat(target); } catch (error) {
      if (error.code !== "ENOENT") throw error;
      files.push({ path: name, sha256: null, executeBits: null, indexExecutable: indexModes?.get(name) ?? null });
      continue;
    }
    if (!entry.isFile() || entry.isSymbolicLink()) throw new Error(`snapshot requires regular files: ${name}`);
    if (entry.size > 32 * 1024 * 1024) throw new Error(`snapshot file exceeds 32 MiB: ${name}`);
    files.push({ path: name, sha256: digest(await fs.readFile(target)),
      executeBits: process.platform === "win32" ? null : entry.mode & 0o111,
      indexExecutable: indexModes?.get(name) ?? null });
  }
  const captured = { formatVersion: 2, head, files };
  return { ...captured, digest: snapshotDigest(captured) };
}
export async function validateControlArtifact(repo, target) {
  repo = await fs.realpath(repo);
  let existing = path.resolve(target), suffix = [];
  while (true) {
    try { existing = await fs.realpath(existing); break; }
    catch (error) { if (error.code !== "ENOENT") throw error; const parent = path.dirname(existing); if (parent === existing) throw error; suffix.unshift(path.basename(existing)); existing = parent; }
  }
  const relative = path.relative(repo, path.join(existing, ...suffix));
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return;
  const tracked = spawnSync("git", ["-C", repo, "ls-files", "--error-unmatch", "--", relative], { encoding: "utf8", shell: false, env: gitEnvForRepo() });
  const ignored = spawnSync("git", ["-C", repo, "check-ignore", "--quiet", "--", relative], { encoding: "utf8", shell: false, env: gitEnvForRepo() });
  if (!relative || tracked.status !== 1 || ignored.status !== 0) throw new Error("repo-local control artifacts must be untracked and Git-ignored before discovery; use external artifacts otherwise");
}
const symbolSource = /\.(?:[cm]?[jt]sx?|py)$/;
export async function discover(repo, extraSymbols = []) {
  const captured = await snapshot(repo);
  // A rename contributes its old exports as well as the declarations at its destination.
  const changed = captured.head ? [...new Set([...git(repo, ["diff", "--no-renames", "--name-only", "-z", "HEAD"]).split("\0"), ...git(repo, ["ls-files", "--others", "--exclude-standard", "-z"]).split("\0")].filter(Boolean))].sort() : captured.files.map((file) => file.path);
  const symbols = new Set(extraSymbols);
  const riskHints = [];
  const previousFiles = new Set(captured.head ? git(repo, ["ls-tree", "-r", "--name-only", "-z", captured.head]).split("\0").filter(Boolean) : []);
  for (const name of changed) {
    const current = await fs.readFile(inside(repo, name), "utf8").catch(() => "");
    const previous = previousFiles.has(name) ? git(repo, ["show", `${captured.head}:${name}`]) : "";
    const content = previous + "\n" + current;
    if (symbolSource.test(name)) {
      for (const match of content.matchAll(/(?:export\s+(?:async\s+)?(?:function|class|const|type|interface)|(?:async\s+)?def|class)\s+([A-Za-z_$][\w$]*)/g)) symbols.add(match[1]);
      if (/pointermove|mousemove|scroll|wheel|requestAnimationFrame|virtualiz|overscan/.test(content)) riskHints.push({ kind: "performance", path: name });
      if (/retry|rollback|resume|transaction|idempotenc/.test(content)) riskHints.push({ kind: "stateful", path: name });
    }
  }
  let references = [];
  if (symbols.size) {
    const args = ["-l", "-F", "--hidden", "--glob", "!.git/**"];
    for (const symbol of symbols) args.push("-e", symbol);
    args.push(".");
    const result = spawnRipgrep( args, { cwd: repo, encoding: "utf8", shell: false, maxBuffer: 8 * 1024 * 1024 });
    if (result.error || ![0, 1].includes(result.status)) throw new Error(result.stderr || result.error?.message || "reference discovery failed");
    references = result.stdout.split(/\r?\n/).filter(Boolean).map((name) => path.relative(repo, path.resolve(repo, name)).split(path.sep).join("/"));
  }
  const candidates = [...new Set([...changed, ...references])].sort();
  // Without HEAD every file is already a candidate; only Git discovery can silently miss callers of these files.
  const unextracted = captured.head ? changed.filter((name) => !symbolSource.test(name)) : [];
  return { version: PROTOCOL_VERSION, repo, snapshot: captured, changed, symbols: [...symbols].sort(), candidates, riskHints, method: captured.head ? "git-files+text-references" : "current-files+text-references", limitations: ["Textual candidates and risk hints are not semantic proof. Inspect registrations, reflection and dynamic consumers with compiler references or runtime traces when material.", ...(!captured.head ? ["No Git HEAD: all current scope files are candidates; there is no historical caller discovery."] : []), ...(unextracted.length ? [`No symbol extraction for ${unextracted.join(", ")}: their callers are discovered only through --symbols names. Pass the changed identifiers with --symbols or use compiler references.`] : [])] };
}
async function copySnapshot(repo, captured, target) {
  for (const file of captured.files) {
    if (file.sha256 === null) continue;
    const destination = inside(target, file.path);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    const source = await fs.readFile(inside(repo, file.path));
    if (digest(source) !== file.sha256) throw new Error(`source changed while copying: ${file.path}`);
    await fs.writeFile(destination, source);
    if (file.executeBits !== null) {
      const mode = (await fs.stat(destination)).mode;
      await fs.chmod(destination, (mode & 0o666) | file.executeBits);
    }
  }
}
function terminate(child) {
  if (!child.pid) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore", shell: false });
  else { try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } }
}
async function execute(argv, cwd, timeoutMs, env = {}, trace = true) {
  const traceDirectory = trace ? await fs.mkdtemp(path.join(os.tmpdir(), "verify-trace-")) : null;
  return new Promise((resolve) => {
    const command = argv.map((part) => part.replaceAll("${REPO}", cwd));
    const childEnv = { ...process.env, ...env };
    if (traceDirectory) childEnv.NODE_V8_COVERAGE = traceDirectory;
    else delete childEnv.NODE_V8_COVERAGE;
    const child = spawn(command[0], command.slice(1), { cwd, shell: false, detached: process.platform !== "win32", env: childEnv, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", error = null, timedOut = false;
    const started = Date.now();
    const timer = setTimeout(() => { timedOut = true; terminate(child); }, timeoutMs);
    const append = (side, chunk) => {
      if (side === "stdout") stdout += chunk; else stderr += chunk;
      if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > 512 * 1024) { error = "command output exceeded limit"; terminate(child); }
    };
    child.stdout.on("data", (chunk) => append("stdout", chunk));
    child.stderr.on("data", (chunk) => append("stderr", chunk));
    child.on("error", (value) => { error = value.message; });
    child.on("close", async (exitCode) => {
      clearTimeout(timer);
      const observed = new Set();
      try {
        const root = traceDirectory ? await fs.realpath(cwd) : cwd;
        for (const name of traceDirectory ? await fs.readdir(traceDirectory) : []) {
          const trace = JSON.parse(await fs.readFile(path.join(traceDirectory, name), "utf8"));
          for (const script of trace.result || []) {
            if (!script.url.startsWith("file:") || !script.functions?.some((fn) => fn.ranges.some((range) => range.count > 0))) continue;
            const relative = path.relative(root, fileURLToPath(script.url));
            if (relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) observed.add(relative.split(path.sep).join("/"));
          }
        }
      } catch (value) { error ||= `cannot read execution coverage: ${value.message}`; }
      if (traceDirectory) {
        try { await fs.rm(traceDirectory, { recursive: true, force: true }); }
        catch (value) { error ||= `cannot clean execution coverage: ${value.message}`; }
      }
      resolve({ exitCode, timedOut, error, elapsedMs: Date.now() - started, stdoutSha256: digest(stdout), stderrSha256: digest(stderr), stdout, stderr, observation: observationFrom(stdout), observedFiles: [...observed].sort() });
    });
  });
}
export async function runPlan(plan, repo) {
  const errors = validatePlan(plan);
  if (errors.length) throw new Error(errors.join("\n"));
  if (plan.discovery.snapshot.formatVersion !== 2) throw new Error("content-only snapshot: rerun discover before verification");
  const found = await discover(repo, plan.discovery.symbols);
  if (found.snapshot.digest !== plan.discovery.snapshot.digest || JSON.stringify(found.candidates) !== JSON.stringify(plan.discovery.candidates) || JSON.stringify(found.riskHints) !== JSON.stringify(plan.discovery.riskHints)) throw new Error("discovery is stale or incomplete; regenerate it");
  const receipt = { version: PROTOCOL_VERSION, plan, planSha256: digest(plan), sourceBefore: found.snapshot.digest, sourceAfter: null, environment: { platform: process.platform, arch: process.arch, node: process.version }, checks: [], status: "failed" };
  for (const check of plan.checks) {
    const result = { id: check.id, runs: [], challenges: [], measurements: [] };
    const timeout = check.timeoutMs || 60000;
    for (const seed of check.seeds || [null]) result.runs.push(await execute(check.command, repo, timeout, seed === null ? {} : { VERIFICATION_SEED: String(seed), VERIFICATION_ITERATIONS: String(check.iterations) }));
    if (result.runs.every((run) => run.exitCode === 0 && !run.error && !run.timedOut)) {
      for (const challenge of check.challenges || []) {
        const isolated = await fs.mkdtemp(path.join(os.tmpdir(), "verify-challenge-"));
        try {
          const controlRoot = path.join(isolated, "control");
          const mutantRoot = path.join(isolated, "mutant");
          await copySnapshot(repo, found.snapshot, controlRoot);
          const challengeEnv = check.seeds ? { VERIFICATION_SEED: String(check.seeds[0]), VERIFICATION_ITERATIONS: String(check.iterations) } : {};
          const controlRun = await execute(check.command, controlRoot, timeout, challengeEnv);
          if (controlRun.exitCode !== 0 || controlRun.error || controlRun.timedOut) {
            result.challenges.push({ id: challenge.id, applied: false, controlRun, error: "pristine isolation baseline failed" });
            continue;
          }
          await copySnapshot(repo, found.snapshot, mutantRoot);
          const target = inside(mutantRoot, challenge.file);
          const before = await fs.readFile(target, "utf8");
          if (before.split(challenge.find).length !== 2) throw new Error(`${challenge.id}: challenge target must match exactly once`);
          const after = before.replace(challenge.find, challenge.replace);
          await fs.writeFile(target, after);
          const run = await execute(check.command, mutantRoot, timeout, challengeEnv);
          result.challenges.push({ id: challenge.id, applied: true, controlRun, beforeSha256: digest(before), afterSha256: digest(after), assertionObserved: isBehavioralFailure(run, challenge.assertion), run });
        } catch (error) {
          result.challenges.push({ id: challenge.id, applied: false, error: error.message });
        } finally { await fs.rm(isolated, { recursive: true, force: true }); }
      }
      if (check.kind === "performance") {
        for (let i = 0; i < check.performance.repeats; i += 1) {
          const baselineRun = await execute(check.performance.baselineCommand, repo, timeout, {}, false);
          const candidateRun = await execute(check.command, repo, timeout, {}, false);
          result.measurements.push({ baselineRun, candidateRun, baseline: baselineRun.observation, candidate: candidateRun.observation });
        }
      }
    }
    receipt.checks.push(result);
  }
  receipt.sourceAfter = (await snapshot(repo)).digest;
  receipt.status = "passed";
  receipt.errors = evaluateReceipt(receipt);
  if (receipt.errors.length) receipt.status = "failed";
  return receipt;
}
export async function receiptFreshnessError(repo, receipt) {
  if (receipt?.plan?.discovery?.snapshot?.formatVersion !== 2) return "content-only receipt: rerun discover and run to verify executable modes";
  return (await snapshot(repo)).digest === receipt.sourceAfter ? null : "verification receipt is stale for this working tree";
}

async function main() {
  const [mode, ...args] = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i += 2) { if (!args[i].startsWith("--") || !args[i + 1]) throw new Error("arguments must be --key value pairs"); options[args[i].slice(2)] = args[i + 1]; }
  const repo = path.resolve(options.repo || process.cwd());
  if (options.output) await validateControlArtifact(repo, path.resolve(options.output));
  let result;
  if (mode === "discover") result = await discover(repo, options.symbols ? options.symbols.split(",") : []);
  else if (mode === "run") result = await runPlan(JSON.parse(await fs.readFile(options.plan, "utf8")), repo);
  else if (mode === "validate") {
    const value = await fs.readFile(options.result);
    if (value.length > MAX_RECEIPT_BYTES) throw new Error("receipt exceeds size limit");
    const receipt = JSON.parse(value);
    const errors = evaluateReceipt(receipt);
    const stale = await receiptFreshnessError(repo, receipt);
    if (stale) errors.push(stale);
    result = { valid: errors.length === 0, errors };
  } else throw new Error("usage: verify-change.mjs discover|run|validate --repo <repo> [--plan <plan>] [--result <receipt>] [--output <outside-repo path>]");
  if (options.output) {
    const target = path.resolve(options.output);
    await validateControlArtifact(repo, target);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, JSON.stringify(result, null, 2) + "\n");
    console.log(options.output);
  } else console.log(JSON.stringify(result, null, 2));
  if (result.status === "failed" || result.valid === false) process.exitCode = 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
