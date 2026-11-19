// Opt-in acceptance check for installed user hooks. The model endpoint is local and deterministic.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import * as zlib from "node:zlib";

const bin = process.env.CODEX_HOST_CLI || "codex";
const installed = path.resolve(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"));
const tempParent = await fs.realpath(os.tmpdir());
const temp = await fs.mkdtemp(path.join(tempParent, "workflow-host-"));
const home = path.join(temp, "home");
const env = { ...process.env, HOME: home, USERPROFILE: home, CODEX_HOME: installed };
for (const name of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY"]) {
  env[name] = name === "NO_PROXY" ? "localhost,127.0.0.1,::1" : "http://127.0.0.1:1";
  env[name.toLowerCase()] = env[name];
}
for (const name of ["OPENAI_API_KEY", "OPENAI_BASE_URL", "CODEX_API_KEY"]) delete env[name];
const common = ["-c", "analytics.enabled=false", "-c", "feedback.enabled=false"];
const sha = input => createHash("sha256").update(input).digest("hex");
const cfg = spawnSync(process.platform === "win32" ? "python" : "python3", ["-c",
  'import json,sys,tomllib; c=tomllib.loads(open(sys.argv[1],encoding="utf-8-sig").read()); print(json.dumps({k:list(c.get(k,{})) for k in ("mcp_servers","plugins")}))',
  path.join(installed, "config.toml")], { encoding: "utf8" });
function start(args, cwd) {
  const child = spawn(bin, [...common, ...args], { env, cwd, stdio: ["pipe", "pipe", "pipe"] });
  let errors = "";
  child.stderr.on("data", chunk => { errors = (errors + chunk).slice(-3000); });
  const limit = setTimeout(() => child.kill(), 60000);
  const closed = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", code => { clearTimeout(limit); resolve({ code, errors }); });
  });
  // Attach a listener before stream iteration so a missing executable is reported cleanly.
  closed.catch(() => {});
  return { child, closed, lines: readline.createInterface({ input: child.stdout }) };
}

async function checkTrust(cwd) {
  const { child, closed, lines } = start(["app-server", "--stdio"], cwd);
  const send = msg => child.stdin.write(JSON.stringify(msg) + "\n");
  send({ id: 1, method: "initialize", params: { clientInfo: { name: "config-host-check", version: "1" }, capabilities: { experimentalApi: true } } });
  try {
    for await (const line of lines) {
      const msg = JSON.parse(line);
      if (msg.error) throw Error(JSON.stringify(msg.error));
      if (msg.id === 1) {
        send({ method: "initialized" });
        send({ id: 2, method: "hooks/list", params: { cwds: [cwd] } });
      }
      if (msg.id !== 2) continue;
      const entry = msg.result.data[0];
      assert.deepEqual(entry.errors || [], []);
      const source = await fs.realpath(path.join(installed, "hooks.json"));
      for (const [event, file] of [["sessionStart","record-session-provenance.mjs"], ["sessionStart","resume-project-ledger.mjs"], ["stop","guard-project-completion.mjs"]]) {
        const hook = entry.hooks.find(h => h.eventName === event && h.source === "user" && h.command?.includes(file));
        assert.ok(hook && hook.enabled && hook.trustStatus === "trusted" && hook.currentHash, "Review the installed hook in /hooks: " + file);
        assert.equal(await fs.realpath(hook.sourcePath), source);
      }
      return;
    }
    throw Error("hooks/list closed without a result: " + (await closed).errors);
  } finally { child.stdin.end(); child.kill(); await closed; }
}

function answer(res, n) {
  const text = "host-smoke-" + n;
  const item = { type: "message", role: "assistant", id: "msg_" + n, status: "completed", content: [{ type: "output_text", text, annotations: [] }] };
  const response = { id: "resp_" + n, object: "response", model: "gpt-5", created_at: Math.floor(Date.now()/1000), status: "completed", output: [item],
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } };
  res.writeHead(200, { "content-type": "text/event-stream" });
  let sequence = 0;
  const emit = (type, fields) => res.write("event: " + type + "\ndata: " + JSON.stringify({ type, sequence_number: sequence++, ...fields }) + "\n\n");
  emit("response.created", { response: { ...response, status: "in_progress", output: [] } });
  emit("response.output_item.added", { output_index: 0, item: { ...item, status: "in_progress", content: [] } });
  emit("response.output_text.delta", { output_index: 0, content_index: 0, item_id: item.id, delta: text });
  emit("response.output_item.done", { output_index: 0, item });
  emit("response.completed", { response });
  res.end();
}

async function exercise(stale) {
  const cwd = await fs.mkdtemp(path.join(temp, stale ? "stale-" : "valid-"));
  const dir = path.join(cwd, ".codex", "ledgers"), ledger = path.join(dir, "task.md");
  await fs.mkdir(dir, { recursive: true });
  const source = "export const result = 1;\n", file = path.join(cwd,"example.mjs");
  const contract = path.join(dir, "task.completion.json");
  const setStatus = status => fs.writeFile(ledger, "project_status: " + status + "\nrepo_path: " + cwd + "\ncompletion_contract: " + contract + "\n");
  await fs.writeFile(file, source);
  const run = spawnSync(process.execPath, ["--check", "example.mjs"], { cwd, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const evidence = JSON.stringify({ stdout: run.stdout, stderr: run.stderr, exitCode: run.status });
  await fs.writeFile(path.join(dir,"check.json"), evidence);
  await fs.writeFile(contract, JSON.stringify({ schemaVersion: 4, evidencePolicyVersion: 1, ledgerPath: ledger, findings: [], preflights: [],
    verificationPolicy: { mode:"native", reason:"Syntax check on an isolated local file.", strictTriggers:[] },
    requiredEvidence:[{ id:"syntax", status:"present", claim:"Source parses.", claimScope:"static", evidenceClass:"static", artifactBase:"contract", artifact:"check.json", artifactSha256:sha(evidence) }],
    nativeVerification: { sourceInputs:[{ path:"example.mjs", state:"present", sha256:sha(source) }],
      checks:[{evidenceId:"syntax", command:[process.execPath,"--check","example.mjs"], cwd:".", exitCode:0, checkedAt:new Date().toISOString()}] },
    remoteChecks: { applicable:false, status:"not_applicable", reason:"Temporary local fixture.", checks:[] } }));
  await setStatus("active");
  let thread, calls = 0, failure;
  const server = http.createServer(async (req,res) => {
    try {
      if (req.method !== "POST" || req.url !== "/v1/responses") { res.writeHead(404); res.end(); return; }
      const bytes = []; for await (const chunk of req) bytes.push(chunk);
      const encoding = req.headers["content-encoding"];
      const decoders = { gzip:zlib.gunzipSync, br:zlib.brotliDecompressSync, deflate:zlib.inflateSync, zstd:zlib.zstdDecompressSync };
      const raw = Buffer.concat(bytes);
      const input = JSON.parse((encoding && encoding !== "identity" ? decoders[encoding](raw) : raw).toString()).input;
      if (++calls === 1) {
        let provenance;
        const until = Date.now()+12000;
        while (!provenance && Date.now()<until) {
          if (thread) {
            const record = path.join(home, ".codex", "projects", path.basename(cwd), "sessions", thread+".json");
            try { provenance = JSON.parse(await fs.readFile(record,"utf8")); } catch (e) { if (e.code !== "ENOENT") throw e; }
          }
          if (!provenance) await delay(40);
        }
        assert.ok(provenance?.sessionId === thread && provenance.events.some(e => e.source === "startup"), "Native SessionStart provenance missing");
        const bind = spawnSync(process.execPath, [path.join(installed,"hooks","record-session-provenance.mjs")],
          { cwd, env, encoding:"utf8", timeout:15000, input:JSON.stringify({ session_id:thread, cwd, ledger_path:ledger }) });
        assert.equal(bind.status, 0, bind.stderr);
        if (stale) await fs.appendFile(file, "// later change\n");
        await setStatus("complete");
      } else {
        assert.ok(stale && calls === 2 && JSON.stringify(input).includes("Session-bound project ledger") &&
          JSON.stringify(input).includes("native source input is stale: example.mjs"), "Missing native Stop rejection in continuation");
      }
      answer(res, calls);
    } catch (error) { failure = error; res.writeHead(500); res.end("fixture failed"); }
  });
  await new Promise((ok, fail) => { server.once("error", fail); server.listen(0,"127.0.0.1",ok); });
  try {
    const port = server.address().port;
    const overrides = ['model_provider="hostcheck"', 'model_providers.hostcheck.name="Local acceptance test"',
      'model_providers.hostcheck.base_url="http://127.0.0.1:' + port + '/v1"', 'model_providers.hostcheck.wire_api="responses"',
      'model_providers.hostcheck.requires_openai_auth=false','model_providers.hostcheck.supports_websockets=false',
      'model_providers.hostcheck.request_max_retries=0','model_providers.hostcheck.stream_max_retries=0','web_search="disabled"'];
    const { child, closed, lines } = start([...overrides.flatMap(x=>["-c",x]), "-a","never","exec","--ephemeral","--json","--ignore-rules",
      "--skip-git-repo-check","-s","read-only","-m","gpt-5","-C",cwd,"Reply with the test marker. Use no tools."], cwd);
    child.stdin.end();
    const messages=[];
    for await (const line of lines) {
      const event = JSON.parse(line);
      if (event.type === "thread.started") thread = event.thread_id;
      if (event.type === "item.completed" && event.item?.type === "agent_message") messages.push(event.item.text);
    }
    const status = await closed;
    if (failure) throw failure;
    assert.equal(status.code,0,status.errors);
    assert.deepEqual(messages,stale ? ["host-smoke-1","host-smoke-2"] : ["host-smoke-1"], "HOST_MUST_ENFORCE_EVIDENCE");
    assert.equal(calls,messages.length);
    console.log(JSON.stringify({ fixture:stale?"stale":"valid", trust:"trusted", nativeSessionStart:true, requests:calls, stop:stale?"blocked-and-continued":"accepted" }));
  } finally { server.closeAllConnections(); await new Promise(ok=>server.close(ok)); }
}
try {
  assert.equal(cfg.status,0,"Cannot read local MCP and plugin names");
  for (const [section, names] of Object.entries(JSON.parse(cfg.stdout))) {
    for (const name of names) common.push("-c", section+"."+name+".enabled=false");
  }
  await fs.mkdir(home);
  await checkTrust(temp);
  await exercise(false);
  await exercise(true);
} finally {
  assert.equal(path.dirname(await fs.realpath(temp)),tempParent);
  await fs.rm(temp,{recursive:true,force:true});
}
