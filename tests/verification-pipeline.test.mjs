import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { discover, runPlan } from "../codex/skills/agent-core-lite/scripts/verify-change.mjs";
import { evaluateReceipt, validatePlan } from "../codex/skills/agent-core-lite/scripts/verification-contract.mjs";
import { validateEvidenceLinks } from "../codex/skills/agent-core-lite/scripts/verification-contract.mjs";

const cli = fileURLToPath(new URL("../codex/skills/agent-core-lite/scripts/verify-change.mjs", import.meta.url));
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "verification-pipeline-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const repo = path.join(root, "repo");
  await fs.mkdir(path.join(repo, "routes"), { recursive: true });
  await fs.writeFile(path.join(repo, "contract.md"), "An ancestor is a node reachable by following child edges from the candidate ancestor; adding unrelated nodes cannot change the result.\n");
  await fs.writeFile(path.join(repo, "owner.mjs"), 'export function isAncestor(parents, node, ancestor) { let current = node; while (current !== null) { if (current === ancestor) return true; current = parents[current]; } return false; }\n');
  await fs.writeFile(path.join(repo, "routes", "admin.mjs"), 'import { isAncestor } from "../owner.mjs"; export const adminOwns = isAncestor;\n');
  await fs.writeFile(path.join(repo, "page.mjs"), 'import { isAncestor } from "./owner.mjs"; export const pageOwns = isAncestor;\n');
  await fs.writeFile(path.join(repo, "probe.mjs"), [
    'import assert from "node:assert/strict";',
    'import { pageOwns } from "./page.mjs"; import { adminOwns } from "./routes/admin.mjs";',
    'const seed = Number(process.env.VERIFICATION_SEED); let random = seed >>> 0;',
    'const next = n => { random = (Math.imul(random,1664525)+1013904223)>>>0; return random % n; };',
    'const cases = Number(process.env.VERIFICATION_ITERATIONS);',
    'for(let i=0;i<cases;i++){ const parents=[null]; for(let j=1;j<16;j++) parents.push(next(j)); const a=next(16),n=next(16);',
    ' const descendants=new Set([a]); for(let changed=true;changed;){changed=false; for(let j=0;j<parents.length;j++)if(descendants.has(parents[j])&&!descendants.has(j)){descendants.add(j);changed=true;}}',
    ' for(const consumer of [pageOwns,adminOwns]) { assert.equal(consumer(parents,n,a),descendants.has(n),"ANCESTOR_INVARIANT"); assert.equal(consumer([...parents,null],n,a),descendants.has(n),"UNRELATED_NODE_INVARIANT"); }}',
    'console.log(JSON.stringify({kind:"property",seed,cases}));',
  ].join("\n"));
  const git = (args) => {
    const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  };
  git(["init", "-q"]); git(["add", "."]);
  git(["-c", "user.name=fixture", "-c", "user.email=fixture@example.test", "-c", "commit.gpgsign=false", "commit", "-qm", "fixture"]);
  await fs.appendFile(path.join(repo, "owner.mjs"), "\n");
  const discovery = await discover(repo);
  const plan = {
    version: 1, discovery, limitations: discovery.limitations,
    coverage: discovery.candidates.map((name) => ({ path: name, checks: ["ancestry"] })),
    checks: [{ id: "ancestry", kind: "property", command: [process.execPath, "probe.mjs"], invariants: ["ancestry agrees with independent descendant closure", "unrelated node does not change ownership"], oracle: { basis: "reference", source: "contract.md", reason: "The probe computes forward descendant closure instead of calling the implementation for its expected result." }, seeds: [1, 17, 99], iterations: 200,
      challenges: [{ id: "invert-ancestor", file: "owner.mjs", find: "if (current === ancestor) return true;", replace: "if (current === ancestor) return false;", assertion: "ANCESTOR_INVARIANT" }],
    }],
  };
  return { root, repo, plan };
}

test("discovery finds an unlisted sibling consumer and refuses unexplained omissions", async (t) => {
  const { repo, plan } = await fixture(t);
  assert.ok(plan.discovery.candidates.includes("routes/admin.mjs"));
  plan.coverage = plan.coverage.filter((item) => item.path !== "routes/admin.mjs");
  await assert.rejects(runPlan(plan, repo), /unaccounted discovered candidate: routes\/admin.mjs/);
});

test("deleted exports and deleted files retain their caller discovery", async (t) => {
  const { repo } = await fixture(t);
  await fs.writeFile(path.join(repo, "owner.mjs"), "// export removed\n");
  const removedExport = await discover(repo);
  assert.ok(removedExport.candidates.includes("routes/admin.mjs"));
  await fs.rm(path.join(repo, "owner.mjs"));
  const removedFile = await discover(repo);
  assert.ok(removedFile.candidates.includes("routes/admin.mjs"));
});

test("oracle path aliases cannot be mutation targets", async (t) => {
  const { repo, plan } = await fixture(t);
  assert.deepEqual(validatePlan(plan), []);
  for (const kind of ["property", "static", "performance"]) {
    plan.checks[0].kind = kind;
    if (kind === "performance") plan.checks[0].performance = { baselineCommand: [process.execPath, "probe.mjs", "baseline"], metric: "latency", unit: "ms", workload: "fixture", repeats: 3, maxValue: 100, maxRatio: 2 };
    plan.checks[0].challenges[0].file = "owner.mjs";
    assert.deepEqual(validatePlan(plan), [], kind);
    for (const target of ["contract.md", "./contract.md", "routes/../contract.md", "routes\\..\\contract.md", ...(process.platform === "win32" ? ["CONTRACT.MD"] : [])]) {
      plan.checks[0].challenges[0].file = target;
      assert.match(validatePlan(plan).join("\n"), /cannot rewrite the oracle/, `${kind}/${target}`);
      await assert.rejects(runPlan(plan, repo), /cannot rewrite the oracle/);
    }
  }
  plan.checks[0].challenges[0].file = "./owner.mjs";
  assert.match(validatePlan(plan).join("\n"), /canonical snapshot file/);
});

test("reporter stdout parse and module failures do not count as behavioral detection", async (t) => {
  const { repo, plan } = await fixture(t);
  await fs.writeFile(path.join(repo, "reporter.mjs"), 'import test from "node:test";import assert from "node:assert/strict";test("REPORTER_TARGET_ASSERT",async()=>{const {isAncestor}=await import("./owner.mjs");assert.equal(isAncestor([null],0,0),true,"REPORTER_TARGET_ASSERT");});');
  plan.discovery = await discover(repo);
  plan.coverage = plan.discovery.candidates.map((name) => ({ path: name, checks: ["owner.mjs", "reporter.mjs"].includes(name) ? ["ancestry"] : [], reason: "This isolated reporter check tests failure classification, not the other ancestry consumers." }));
  plan.checks[0].kind = "example";
  delete plan.checks[0].seeds;
  // The outer node:test harness must not make the independent reporter skip its tests.
  plan.checks[0].command = [process.execPath, "-e", 'delete process.env.NODE_TEST_CONTEXT; import("./reporter.mjs");'];
  const challenge = plan.checks[0].challenges[0];
  challenge.assertion = "REPORTER_TARGET_ASSERT";
  const behavioral = await runPlan(plan, repo);
  assert.equal(behavioral.status, "passed", behavioral.errors.join("\n"));
  for (const replacement of ["return @bad;", 'return import("./does-not-exist.mjs");']) {
    challenge.replace = "if (current === ancestor) " + replacement;
    const failed = await runPlan(plan, repo);
    const proof = failed.checks[0].challenges[0];
    assert.equal(proof.controlRun.exitCode, 0);
    assert.match(proof.run.stdout, /SyntaxError|ERR_MODULE_NOT_FOUND/);
    assert.equal(proof.assertionObserved, false);
    assert.equal(failed.status, "failed");
    proof.assertionObserved = true;
    failed.status = "passed";
    assert.match(evaluateReceipt(failed).join("\n"), /survived, invalid, or unrelated failure/);
  }
});

test("generated ancestry probes kill a behavioral mutation without changing the working tree", async (t) => {
  const { repo, plan } = await fixture(t);
  const before = await fs.readFile(path.join(repo, "owner.mjs"));
  const result = await runPlan(plan, repo);
  assert.equal(result.status, "passed", result.errors.join("\n"));
  assert.deepEqual(evaluateReceipt(result), []);
  assert.equal(result.checks[0].runs.length, 3);
  assert.equal(result.checks[0].runs[0].observation.cases, 200);
  assert.ok(result.checks[0].runs[0].observedFiles.includes("routes/admin.mjs"));
  assert.equal(result.checks[0].challenges[0].assertionObserved, true);
  assert.deepEqual(await fs.readFile(path.join(repo, "owner.mjs")), before);
  for (const mutate of [
    (r) => { delete r.checks[0].challenges[0].run.exitCode; },
    (r) => { delete r.checks[0].challenges[0].run.stdoutSha256; },
    (r) => { r.checks[0].challenges[0].run.stdout += "forged"; },
  ]) {
    const broken = structuredClone(result);
    mutate(broken);
    assert.match(evaluateReceipt(broken).join("\n"), /invalid/);
  }
});

test("isolation failure before mutation cannot count as a killed challenge", async (t) => {
  const { repo, plan } = await fixture(t);
  await fs.writeFile(path.join(repo, "context-probe.mjs"), 'import fs from "node:fs"; import assert from "node:assert/strict"; assert.equal(fs.existsSync(".git"),true,"CONTEXT_ASSERT");');
  plan.discovery = await discover(repo);
  plan.coverage = plan.discovery.candidates.map((name) => ({ path: name, checks: [], reason: "This fixture isolates pristine-environment failure, not ancestry behavior." }));
  plan.checks[0].kind = "example";
  delete plan.checks[0].seeds;
  plan.checks[0].command = [process.execPath, "context-probe.mjs"];
  plan.checks[0].challenges[0].assertion = "CONTEXT_ASSERT";
  const result = await runPlan(plan, repo);
  assert.equal(result.status, "failed");
  assert.match(result.errors.join("\n"), /pristine isolation baseline failed/);
  assert.equal(result.checks[0].challenges[0].applied, false);
});

test("static receipts cannot support behavioral claims and check links must resolve", async (t) => {
  const { plan } = await fixture(t);
  const evidence = [{ id: "runtime", status: "present", claimScope: "local", verificationChecks: ["ancestry"] }];
  assert.deepEqual(validateEvidenceLinks(evidence, { plan }), []);
  plan.checks[0].kind = "static";
  assert.match(validateEvidenceLinks(evidence, { plan }).join("\n"), /cannot support/);
  evidence[0].verificationChecks = ["missing"];
  assert.match(validateEvidenceLinks(evidence, { plan }).join("\n"), /unknown verification check/);
});

test("stateful generated ownership sequences agree with an independently updated child model", async (t) => {
  const { repo, plan } = await fixture(t);
  await fs.writeFile(path.join(repo, "stateful.mjs"), [
    'import assert from "node:assert/strict"; import {pageOwns} from "./page.mjs"; import {adminOwns} from "./routes/admin.mjs";',
    'const seed=Number(process.env.VERIFICATION_SEED), cases=Number(process.env.VERIFICATION_ITERATIONS); let random=seed>>>0;',
    'const next=n=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random%n;};',
    'const parents=[null], children=[new Set()], sequence=[];',
    'for(let i=0;i<cases;i++){',
    ' if(parents.length<3||next(2)===0){const parent=next(parents.length), node=parents.length; parents.push(parent);children.push(new Set());children[parent].add(node);sequence.push(["add",node,parent]);}',
    ' else {const leaf=parents.length-1,parent=next(leaf);children[parents[leaf]].delete(leaf);children[parent].add(leaf);parents[leaf]=parent;sequence.push(["move",leaf,parent]);}',
    ' const ancestor=next(parents.length), descendants=new Set(), pending=[ancestor];while(pending.length){const node=pending.pop();descendants.add(node);pending.push(...children[node]);}',
    ' for(let node=0;node<parents.length;node++)for(const consumer of [pageOwns,adminOwns])assert.equal(consumer(parents,node,ancestor),descendants.has(node),"STATEFUL_OWNERSHIP "+JSON.stringify({seed,sequence,node,ancestor}));',
    '} console.log(JSON.stringify({kind:"stateful",seed,cases}));',
  ].join("\n"));
  plan.discovery = await discover(repo);
  plan.coverage = plan.discovery.candidates.map((name) => ({ path: name, checks: name === "probe.mjs" ? [] : ["ancestry"], reason: "The separate stateless probe is not part of this operation-sequence check." }));
  plan.checks[0].kind = "stateful";
  plan.checks[0].command = [process.execPath, "stateful.mjs"];
  plan.checks[0].challenges[0].assertion = "STATEFUL_OWNERSHIP";
  const result = await runPlan(plan, repo);
  assert.equal(result.status, "passed", result.errors.join("\n"));
  assert.equal(result.checks[0].runs[2].observation.cases, 200);
  assert.match(result.checks[0].challenges[0].run.stderr, /sequence/);
});

test("pristine control state cannot make an equivalent mutant look killed", async (t) => {
  const { repo, plan } = await fixture(t);
  await fs.writeFile(path.join(repo, ".gitignore"), ".cache\n");
  await fs.writeFile(path.join(repo, "number.txt"), "1");
  await fs.writeFile(path.join(repo, "cache-probe.mjs"), 'import fs from "node:fs"; import assert from "node:assert/strict"; assert.equal(fs.existsSync(".cache"),false,"CACHE_ASSERT");fs.writeFileSync(".cache","created");assert.equal(Number(fs.readFileSync("number.txt","utf8")),1,"CACHE_ASSERT");');
  plan.discovery = await discover(repo);
  plan.coverage = plan.discovery.candidates.map((name) => ({ path: name, checks: name === "cache-probe.mjs" ? ["ancestry"] : [], reason: "This check isolates control/mutant filesystem independence, not ancestry." }));
  plan.checks[0].kind = "example";
  delete plan.checks[0].seeds;
  plan.checks[0].command = [process.execPath, "cache-probe.mjs"];
  plan.checks[0].challenges = [{ id: "equivalent-number", file: "number.txt", find: "1", replace: "01", assertion: "CACHE_ASSERT" }];
  const result = await runPlan(plan, repo);
  assert.equal(result.checks[0].challenges[0].controlRun.exitCode, 0);
  assert.equal(result.checks[0].challenges[0].run.exitCode, 0);
  assert.equal(result.status, "failed");
  assert.match(result.errors.join("\n"), /survived/);
});

test("surviving and syntactically invalid mutations cannot be reported as sensitive tests", async (t) => {
  const { repo, plan } = await fixture(t);
  plan.checks[0].seeds = [1];
  const challenge = plan.checks[0].challenges[0];
  challenge.find = "return false; }";
  challenge.replace = "return Boolean(0); }";
  const survived = await runPlan(plan, repo);
  assert.equal(survived.status, "failed");
  assert.match(survived.errors.join("\n"), /survived, invalid, or unrelated failure/);
  challenge.replace = "return @bad; }";
  const invalid = await runPlan(plan, repo);
  assert.equal(invalid.status, "failed");
  assert.match(invalid.errors.join("\n"), /survived, invalid, or unrelated failure/);
});

test("helper-only execution cannot cover a declared integration consumer", async (t) => {
  const { repo, plan } = await fixture(t);
  plan.checks[0].kind = "integration";
  delete plan.checks[0].seeds;
  plan.checks[0].command = [process.execPath, "-e", 'import("./owner.mjs").then(m=>{if(!m.isAncestor([null],0,0))throw Error("ANCESTOR_INVARIANT")})'];
  const result = await runPlan(plan, repo);
  assert.equal(result.status, "failed", "CONSUMER_TRACE_REQUIRED");
  assert.match(result.errors.join("\n"), /consumer was not observed by trace: routes\/admin.mjs/);
});

test("CLI receipt validation rejects a green result after the source changes", async (t) => {
  const { root, repo, plan } = await fixture(t);
  const reportPath = path.join(root, "receipt.json");
  await fs.writeFile(reportPath, JSON.stringify(await runPlan(plan, repo)));
  const before = spawnSync(process.execPath, [cli, "validate", "--repo", repo, "--result", reportPath], { encoding: "utf8" });
  assert.equal(before.status, 0, before.stderr || before.stdout);
  await fs.appendFile(path.join(repo, "routes", "admin.mjs"), "// changed\n");
  const after = spawnSync(process.execPath, [cli, "validate", "--repo", repo, "--result", reportPath], { encoding: "utf8" });
  assert.equal(after.status, 1);
  assert.match(after.stdout, /stale/);
});

test("performance requires real repeated probe data and fails a measured regression", async (t) => {
  const { repo, plan } = await fixture(t);
  const performanceFile = path.join(repo, "perf.mjs");
  await fs.writeFile(performanceFile, 'import {performance} from "node:perf_hooks"; const start=performance.now(); await new Promise(r=>setTimeout(r,process.argv[2]==="baseline"?20:80)); console.log(JSON.stringify({metric:"operation",unit:"ms",workload:"one delayed operation",environment:"isolated-fixture",samples:[performance.now()-start]}));');
  plan.discovery = await discover(repo);
  plan.coverage = plan.discovery.candidates.map((name) => ({ path: name, checks: name === "perf.mjs" ? ["latency"] : [], reason: "Ancestry behavior is unchanged in this measurement-only slice; separately verified above." }));
  plan.checks = [{ id: "latency", kind: "performance", command: [process.execPath, "perf.mjs", "candidate"], invariants: ["operation stays within budget"], oracle: { basis: "differential", source: "contract.md", reason: "Compare an instrumented baseline operation and slower candidate using the same probe." }, performance: { baselineCommand: [process.execPath, "perf.mjs", "baseline"], metric: "operation", unit: "ms", workload: "one delayed operation", repeats: 3, maxValue: 60, maxRatio: 2 } }];
  const failed = await runPlan(plan, repo);
  assert.equal(failed.status, "failed");
  assert.match(failed.errors.join("\n"), /performance budget exceeded/);
  plan.checks[0].performance.maxValue = 1000;
  plan.checks[0].performance.maxRatio = 20;
  const passed = await runPlan(plan, repo);
  assert.equal(passed.status, "passed", passed.errors.join("\n"));
  const noMeasurements = structuredClone(passed);
  noMeasurements.checks[0].measurements = [];
  assert.match(evaluateReceipt(noMeasurements).join("\n"), /measurements missing/);
  const relabeled = structuredClone(passed);
  relabeled.checks[0].measurements[0].candidate = { ...relabeled.checks[0].measurements[0].candidate, samples: [0.01] };
  assert.match(evaluateReceipt(relabeled).join("\n"), /measurement disagrees with captured probe output/);
});
