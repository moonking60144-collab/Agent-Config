import test from "node:test";
import assert from "node:assert/strict";
import { register } from "../claude/plugins/claim-check/hooks/register.ts";
import { summarize } from "../scripts/claim-check-stats.mjs";

function engine(complete, checker = "auto", files = new Map()) {
  const handlers = new Map(), calls = [], forwarded = [];
  const on = (event, filter, method) => { handlers.set(event, method ?? filter); return { catch() {} }; };
  register(on, { checker });
  const host = { env: { get: async () => "/mock" }, session: { id: async () => "test", append: async m => forwarded.push(m) },
    fs: { exists: async f => files.has(f), read: async f => files.get(f), write: async (f,s) => files.set(f,s) },
    model: { complete: async req => { calls.push(req); return complete(calls.length); } },
    tool: { register: async ({ name }) => ({ tool: "mcp__claim-check__" + name }) } };
  const invoke = (event, data) => handlers.get(event)(host, data, async () => ({ text: "answer" }));
  const turn = () => invoke("turn.complete", { answer: "a".repeat(201), reason: "answer", turnId: "t", usage: { model: "claude-fable" } });
  const rows = () => [...files.values()].flatMap(s => s.trim().split("\n").map(x => JSON.parse(x)));
  return { calls, turn, rows, forwarded, invoke };
}
const ok = { isAnswered:true, text:"OK", usage:{ input_tokens:3 } };
const api = (error, status) => ({ isAnswered:false, reason:"api-error", error, status, usage:{input_tokens:1} });

test("timeouts, account quota, generic provider errors and abort do not try another checker", async () => {
  for (const failure of [Object.assign(new Error("connection timed out"), {code:"ETIMEDOUT"}), api("rate_limit",429),
    api("invalid_request",400), api("authentication_error",401), { isAnswered:false, reason:"aborted", usage:{} }]) {
    const e = engine(() => { if (failure instanceof Error) throw failure; return failure; });
    await e.turn();
    assert.equal(e.calls.length,1,"SHARED_ERROR_MUST_STOP");
    assert.equal(e.rows()[0].kind,"skipped");
    assert.ok(e.rows()[0].code);
  }
});

test("a pending correction survives reload and only consumes the next main answer", async () => {
  const longQuote = "x".repeat(1501) + " final characters";
  for (const [answer, hit] of [["Corrected result", true], ["another answer", false], [longQuote, true]]) {
    const files = new Map();
    const load = () => engine(() => ({ ...ok, text: "- [矛盾] wrong result" }), "auto", files);
    const quote = answer === longQuote ? longQuote : "Corrected result";
    const first = load();
    await first.turn();
    const [id] = first.rows()[0].forwardedIds;
    const verdict = await first.invoke("tool.run", { id, verdict: "confirmed", evidence: "report line 2", correction: quote });
    assert.ok(!verdict.deny);
    const resumed = load();
    const respond = (e, text, extra) => e.invoke("turn.complete", { reason: "answer", turnId: "next", answer: text, ...extra });
    await respond(resumed, "unrelated", { agentId: "child" });
    await respond(resumed, "unrelated", { reason: "tool_use" });
    await respond(resumed, answer);
    const again = load();
    await respond(again, quote, { turnId: "later" });
    const events = again.rows().filter(row => row.id === id && row.event.startsWith("correction_"));
    assert.deepEqual(events.map(row => [row.event, row.turnId]), [[hit ? "correction_in_answer" : "correction_not_in_answer", "next"]], "RELOAD_MUST_CONSUME_ONCE");
    const stats = summarize([again.rows()]);
    assert.equal(stats.mainReportedCorrections, 1);
    assert.equal(stats.correctionExcerptObserved, Number(hit));
  }
});

test("only a successful observed main tool call can be cited as a correction operation", async () => {
  const e = engine(()=>({...ok,text:"- [矛盾] release was wrong"}));
  await e.turn();
  const [id] = e.rows()[0].forwardedIds;
  const verdict = {id,verdict:"confirmed",evidence:"independent release check",correction:"Updated release",operation_ref:"op-1"};
  assert.ok((await e.invoke("tool.run",verdict)).deny);
  await e.invoke("tool.call",{tool:"Edit",tool_use_id:"op-1"});
  assert.ok(!(await e.invoke("tool.run",verdict)).deny);
  const stats = summarize([e.rows()]);
  assert.equal(stats.correctionToolCallObserved,1); assert.equal(stats.correctionExcerptObserved,0);
});

test("a restart never reopens old ambiguous reviews, tool corrections or completed comparisons", async () => {
  const rows = [
    { event: "check", kind: "flagged", fed: 4, forwardedIds: ["old", "tool", "hit", "miss"] },
    ...["old", "tool", "hit", "miss"].map(id => ({ event: "main_review", id, verdict: "confirmed", correction: "same quote",
      ...(id === "tool" ? { observedToolRef: "tool-1" } : {}), ...(["hit", "miss"].includes(id) ? { quotePending: true } : {}) })),
    { event: "correction_in_answer", id: "hit", turnId: "first" },
    { event: "correction_not_in_answer", id: "miss", turnId: "first" },
  ];
  const text = rows.map(row => JSON.stringify(row)).join("\n") + "\n";
  const files = new Map([["/mock/.claude/workflow/claim-check/test.jsonl", text]]);
  const e = engine(() => ok, "auto", files);
  await e.invoke("turn.complete", { reason: "answer", answer: "same quote", turnId: "later" });
  assert.deepEqual(e.rows(), rows);
  const stats = summarize([e.rows()]);
  assert.equal(stats.correctionToolCallObserved, 1);
  assert.equal(stats.correctionExcerptObserved, 1);
});

test("retrying a failed log write keeps the outcome of the original answer", async () => {
  const files = new Map();
  const e = engine(() => ({ ...ok, text: "- [矛盾] wrong result" }), "auto", files);
  await e.turn();
  const [id] = e.rows()[0].forwardedIds;
  await e.invoke("tool.run", { id, verdict: "confirmed", evidence: "test.log", correction: "corrected" });
  files.set = () => { throw new Error("disk full"); };
  const failed = await e.invoke("turn.complete", { reason: "answer", answer: "no match", turnId: "first" });
  assert.match(failed.text, /disk full/);
  delete files.set;
  await e.invoke("turn.complete", { reason: "answer", answer: "corrected", turnId: "later" });
  const outcomes = e.rows().filter(row => row.event.startsWith("correction_"));
  assert.deepEqual(outcomes.map(row => [row.event, row.turnId]), [["correction_not_in_answer", "first"]]);
});
test("model-specific denials share one remaining budget; fixed checker never cascades", async t => {
  t.mock.timers.enable({apis:["Date"], now:100000});
  for (const failure of [api("model_not_found",404), new Error("model not allowed for this account")]) {
    const e = engine(n => { if (n === 1) { t.mock.timers.tick(71000); if (failure instanceof Error) throw failure; return failure; } return ok; });
    await e.turn();
    assert.deepEqual(e.calls.map(r=>[r.model,r.timeoutMs]),[["opus",90000],["sonnet",19000]]);
    assert.ok(e.rows()[0].attempts.length === 2);
  }
  const expired = engine(() => { t.mock.timers.tick(90001); return api("model_not_found",404); });
  await expired.turn(); assert.equal(expired.calls.length,1); assert.equal(expired.rows()[0].code,"deadline");
  const fixed = engine(()=>api("model_not_found",404),"opus");
  await fixed.turn(); assert.equal(fixed.calls.length,1);
});
test("forwarded claims remain pending until the main agent supplies its own assessment", async () => {
  const e = engine(()=>({...ok,text:"- [矛盾] first\n- [超出證據] second\n- [無法確認] third"}));
  await e.invoke("session.start",{}); await e.turn();
  assert.equal(e.forwarded.length,1);
  const [id,other] = e.rows()[0].forwardedIds;
  assert.equal(summarize([e.rows()]).pending,2);
  const review = (data) => e.invoke("tool.run",data);
  assert.ok((await review({id:"another",verdict:"confirmed",evidence:"check.json"})).deny);
  assert.ok((await review({id,agentId:"sub",verdict:"confirmed",evidence:"check.json"})).deny);
  await review({id,verdict:"confirmed",evidence:"actual check.json line 7"});
  assert.equal(summarize([e.rows()]).mainReportedCorrections,0);
  await review({id,verdict:"confirmed",evidence:"actual check.json line 7",correction:"Published corrected test count."});
  assert.ok((await review({id,verdict:"confirmed",evidence:"repeat"})).deny);
  await review({id:other,verdict:"inconclusive",evidence:"awaiting trace"});
  await review({id:other,verdict:"dismissed",evidence:"full trace matches original"});
  assert.equal(summarize([e.rows()]).correctionExcerptObserved,0);
  await e.invoke("turn.complete",{answer:"Published corrected test count.",reason:"answer",turnId:"t2"});
  const stats = summarize([e.rows(),[{kind:"ok",ms:7,fed:1}]]);
  assert.equal(stats.mainReportedConfirmed,1); assert.equal(stats.mainReportedDismissed,1);
  assert.equal(stats.correctionExcerptObserved,1); assert.equal(stats.mainReportedCorrections,1); assert.equal(stats.pending,0); assert.equal(stats.legacyForwardedWithoutIds,1);
  assert.deepEqual(stats.reportedUsage,{input_tokens:3});
});
